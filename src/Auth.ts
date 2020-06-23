import Gun from "gun";
import { IGunChainReference } from "gun/types/chain";
import { InvalidCredentials, GunError, AuthError, UserExists, TimeoutError } from "./errors";
import { IGunCryptoKeyPair } from "gun/types/types";

const LOGIN_CHECK_DELAY = 500;

export interface UserCredentials {
    alias: string,
    pass: string
}

/**
 * Convenience methods for creating an authenticating a Gun user.
 */
export default class Auth {
    readonly gun: IGunChainReference;

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
    async login(creds: UserCredentials): Promise<string> {
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
        return this._authBlock(async () => {
            return await this._create(creds);
        });
    }

    /**
     * Login a previously saved user.
     */
    async recall(): Promise<string | undefined> {
        return this._authBlock(async () => {
            return await this._recall();
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
        { alias, pass }: UserCredentials
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
            this.gun.user().auth(alias, pass, ack => {
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
            }) as IGunChainReference;
        });

        return Promise.race([
            loginAction,
            this.onAuth()
        ]);
    }

    private async _recall(): Promise<string> {
        let recallAction = new Promise<string>((resolve, reject) => {
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
            let opts = {
                sessionStorage: true,
            }
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
            }) as IGunChainReference;
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

            let previousPub = this.pub();
            if (!newPass && previousPub) {
                throw new GunError('Should not be logged in when creating a user');
            }
            
            this.gun.user().create(alias, pass, ack => {
                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub();
                    if (pub !== previousPub) {
                        // Actually created user
                        resolve(pub);
                    } else {
                        reject(new UserExists(ack.err));
                    }
                } else {
                    resolve(ack.pub);
                }
            }, options) as IGunChainReference;
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
