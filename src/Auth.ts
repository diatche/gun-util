import Gun from "gun";
import { IGunChainReference } from "gun/types/chain";
import { InvalidCredentials, GunError, AuthError, UserExists, TimeoutError } from "./errors";
import { IGunCryptoKeyPair } from "gun/types/types";
import { isGunAuthPairSupported, isPlatformWeb } from "./support";

const LOGIN_CHECK_DELAY = 500;

export interface UserCredentials {
    alias: string,
    pass: string
}

export interface AuthDelegate {

    /** The receiver should securely store the pair. */
    storePair?: (pair: IGunCryptoKeyPair, auth: Auth) => Promise<void> | void;

    /** The receiver should recover the store pair if available. */
    recallPair?: (auth: Auth) => Promise<IGunCryptoKeyPair | undefined> | IGunCryptoKeyPair | undefined;
}

/**
 * Convenience methods for creating an authenticating a Gun user.
 */
export default class Auth {
    readonly gun: IGunChainReference;
    delegate?: AuthDelegate;

    static defaultGun: IGunChainReference | undefined;

    constructor(gun: IGunChainReference) {
        if (!(gun instanceof Gun)) {
            throw new Error('Must specify a valid gun instance');
        }
        this.gun = gun;

        if (!Auth._default) {
            if (!Auth.defaultGun || gun === Auth.defaultGun) {
                Auth.defaultGun = gun;
                Auth._default = this;
            }
        }
    }

    static default(gun?: IGunChainReference) {
        if (!this._default) {
            if (!this.defaultGun) {
                this.defaultGun = gun;
            }
            gun = gun || this.defaultGun;
            if (!gun) {
                throw new Error('Must specify a valid gun instance or set a default');
            }
            this._default = new Auth(gun);
        }
        return this._default;
    }

    logout() {
        if (!this.pub()) {
            return;
        }
        let userRef = this.gun.user();
        userRef.leave();
        if (!this.pub()) {
        } else {
            throw new AuthError('Failed to log out');
        }
    }

    user(): IGunChainReference | undefined {
        let pub = this.pub();
        return !!pub ? this.gun.user(pub) : undefined;
    }

    /**
     * The current user's public key.
     * @param gun 
     */
    pub(): string | undefined {
        return this.pair()?.pub;
    }

    /**
     * The current user's key pair.
     * @param gun 
     */
    pair(): IGunCryptoKeyPair | undefined {
        let userRef = this.gun.user() as any;
        return userRef._.sea;
    }

    /**
     * Login an existing user.
     * @param creds
     */
    async login(creds: UserCredentials | IGunCryptoKeyPair): Promise<string> {
        this.logout();
        return this._authBlock(async () => {
            return await this._login(creds);
        });
    }

    /**
     * Create a user and automatically login.
     * @param creds 
     */
    async create(creds: UserCredentials): Promise<string> {
        this.logout();
        return this._authBlock(async () => {
            return await this._create(creds);
        });
    }

    /**
     * Login a previously saved user.
     */
    async recall(): Promise<string | undefined> {
        return this._authBlock(async () => {
            if (this.delegate?.recallPair) {
                let pair = await this.delegate?.recallPair(this);
                if (pair) {
                    // Auth with pair
                    return await this._login(pair);
                }
            } else if (isPlatformWeb()) {
                return await this._recallSessionStorage();
            } else {
                return undefined;
            }
        });
    }

    /**
     * Resolves when a user has been authenticated.
     * If a user is already authenticated, resolves
     * immediately.
     */
    async onAuth(): Promise<string> {
        // Allow multiple subscriptions to onAuth,
        // so share the promise.
        let pub = this.pub();
        if (pub) {
            return Promise.resolve(pub);
        }
        if (!this._onAuth$) {
            this._onAuth$ = this._onAuth();
        }
        return this._onAuth$;
    }

    async changePass(
        creds: UserCredentials & { newPass: string }
    ): Promise<string> {
        this.logout();
        return this._authBlock(async () => {
            return await this._create(creds);
        });
    }

    async delete({ alias, pass }: UserCredentials): Promise<void> {
        return this._authBlock(async () => {
            return new Promise((resolve, reject) => {
                this.gun.user().delete(alias, pass, ack => {
                    if (!this.pub()) {
                        resolve();
                    } else {
                        reject(new GunError('Failed to delete user'));
                    }
                });
            });
        });
    }

    // Private

    private _authOp = false;
    private _onAuth$: Promise<string> | undefined;
    private _onAuthResolver: ((pub: string) => void) | undefined;
    private _subscribedToAuth = false;

    private static _default: Auth | undefined;

    private async _login(
        creds: UserCredentials | IGunCryptoKeyPair
    ): Promise<string> {
        let loginAction = new Promise<string>((resolve, reject) => {
            let resolveOnce: (typeof resolve) | undefined = resolve;
            let rejectOnce: (typeof reject) | undefined = reject;

            // Check for login ahead of time
            let timer = setTimeout(() => {
                if (!resolveOnce) return;
                let pub = this.pub();
                if (pub) {
                    // Instant login
                    resolveOnce(pub);
                    resolveOnce = undefined;
                    rejectOnce = undefined;
                }
            }, LOGIN_CHECK_DELAY);

            // Begin login
            let cb = (ack: any) => {
                if (!resolveOnce || !rejectOnce) return;

                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub();
                    if (pub) {
                        // Actually logged in.
                        // (This is Gun v0.2020.520 behaviour only)
                        resolveOnce(pub);
                    } else if ((ack as any).lack) {
                        // Timed out
                        rejectOnce(new TimeoutError(ack.err));
                    } else {
                        rejectOnce(new InvalidCredentials(ack.err));
                    }
                } else {
                    resolveOnce(ack.sea.pub);
                }
                resolveOnce = undefined;
                rejectOnce = undefined;
                clearTimeout(timer);
            };

            let user: any = this.gun.user();
            let { alias, pass } = {
                alias: '',
                pass: '',
                ...creds
            };
            if (alias && pass) {
                // Supported with Gun v0.2020.520 and prior.
                user.auth(alias, pass, cb);
            } else {
                // Supported after Gun v0.2020.520.
                if (!isGunAuthPairSupported(this.gun)) {
                    throw new Error('This version of Gun only supports auth with alias and pass');
                }
                user.auth(creds, cb);
            }
        });

        return Promise.race([
            loginAction,
            this.onAuth()
        ]);
    }

    private async _recallSessionStorage(
        { timeout }: { timeout?: number } = {}
    ): Promise<string | undefined> {
        let recallAction = new Promise<string | undefined>((resolve, reject) => {
            let resolveOnce: (typeof resolve) | undefined = resolve;
            let rejectOnce: (typeof reject) | undefined = reject;

            let timer: any;
            if (timeout) {
                timer = setTimeout(() => {
                    if (!resolveOnce) return;
                    let pub = this.pub();
                    // Login or bail
                    resolveOnce(pub);
                    resolveOnce = undefined;
                    rejectOnce = undefined;
                }, timeout);
            }

            // Begin login
            let opts = {
                sessionStorage: true,
            };
            this.gun.user().recall(opts, ack => {
                if (!resolveOnce || !rejectOnce) return;

                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub();
                    if (pub) {
                        // Actually logged in.
                        // (This is Gun v0.2020.520 behaviour only)
                        resolveOnce(pub);
                    } else if ((ack as any).lack) {
                        // Timed out
                        rejectOnce(new TimeoutError(ack.err));
                    } else {
                        rejectOnce(new InvalidCredentials(ack.err));
                    }
                } else {
                    resolveOnce(ack.sea.pub);
                }
                resolveOnce = undefined;
                rejectOnce = undefined;
                clearTimeout(timer);
            });
        });

        return Promise.race([
            recallAction,
            this.onAuth()
        ]);
    }

    private async _create(
        { alias, pass, newPass }: UserCredentials & { newPass?: string }
    ): Promise<string> {
        let createAction = new Promise<string>((resolve, reject) => {
            let options: any = {};
            if (newPass) {
                options.change = newPass;
            }

            if (this.pub()) {
                throw new GunError('Should not be logged in when creating a user');
            }
            
            this.gun.user().create(alias, pass, ack => {
                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub();
                    if (pub) {
                        // Actually created user
                        resolve(pub);
                    } else {
                        reject(new UserExists(ack.err));
                    }
                } else {
                    resolve(ack.pub);
                }
            }, options);
        });

        return Promise.race([
            createAction,
            this.onAuth()
        ]);
    }

    private async _onAuth(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            // Allow resolving immediately in other methods
            this._beginOnAuth(resolve);
            this._subscribeToAuth();
        }).then(pub => {
            this._endOnAuth();
            return pub;
        });
    }

    private _subscribeToAuth() {
        // Note that only one listener can be
        // registered to gun.on('auth')
        if (this._subscribedToAuth) return;
        this._subscribedToAuth = true;
        (this.gun as any).on('auth', () => {
            this._endOnAuth();
        });
    }

    private _beginOnAuth(resolver: (pub: string) => void) {
        this._onAuthResolver = resolver;
    }

    private _endOnAuth(pub?: string) {
        pub = pub || this.pub();
        if (pub && this._onAuthResolver) {
            let resolve = this._onAuthResolver;
            this._onAuthResolver = undefined;
            this._onAuth$ = undefined;
            resolve(pub);
            if (this.delegate?.storePair) {
                let pair = this.pair();
                if (pair) {
                    this.delegate.storePair(pair, this);
                }
            }
        }
        return pub;
    }

    private async _authBlock<T>(block: () => Promise<T>): Promise<T> {
        if (this._authOp) {
            throw new AuthError('Already performing a user operation');
        }
        try {
            this._authOp = true;
            return await block();
        } finally {
            this._authOp = false;
            this._endOnAuth();
        }
    }
}
