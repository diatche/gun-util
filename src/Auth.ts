import { IGunChainReference } from "gun/types/chain";
import { InvalidCredentials, GunError, AuthError, UserExists, TimeoutError, MultipleAuthError } from "./errors";
import { IGunCryptoKeyPair } from "gun/types/types";
import { isGunAuthPairSupported, isPlatformWeb, isGunInstance } from "./support";
import { timeoutAfter, errorAfter } from "./wait";

const LOGIN_CHECK_DELAY = 500;

export interface UserCredentials {
    alias: string,
    pass: string
}

export interface AuthBasicOptions {
    /** Timeout `ms` interval. */
    timeout?: number;
}

export interface AuthDelegate {

    /** The delegate should securely store the pair. */
    storePair?: (pair: IGunCryptoKeyPair, auth: Auth) => Promise<void> | void;

    /**
     * The delegate should recover the store pair if available.
     * If a timeout option is specified, it's up to the delegate to
     * enforce this.
     **/
    recallPair?: (auth: Auth, opts: AuthBasicOptions) => Promise<IGunCryptoKeyPair | undefined> | IGunCryptoKeyPair | undefined;
}

/**
 * Convenience methods for creating an authenticating a Gun user.
 */
export default class Auth {
    readonly gun: IGunChainReference;
    delegate?: AuthDelegate;

    static defaultGun: IGunChainReference | undefined;
    /**
     * Default timeout in milliseconds for user operations.
     * Set to zero to disable (not recommended).
     */
    static defaultTimeout = 10000;

    constructor(gun: IGunChainReference) {
        if (!isGunInstance(gun)) {
            throw new GunError('Must specify a valid gun instance');
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
            if (!isGunInstance(gun)) {
                throw new GunError('Must specify a valid gun instance or set a default');
            }
            this._default = new Auth(gun);
        }
        return this._default;
    }

    static resetDefault() {
        this.defaultGun = undefined;
        this._default = undefined;
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
    async login(
        creds: UserCredentials | IGunCryptoKeyPair,
        options: AuthBasicOptions = {},
    ): Promise<string> {
        this.logout();
        return this._beginAuthBlock(async () => {
            try {
                return await this._login(creds, options);
            } catch (error) {
                if (error instanceof MultipleAuthError) {
                    // Wait for internal work and try again
                    await this._joinInternal();
                    return await this._login(creds, options);
                }
                throw error;
            }
        });
    }

    /**
     * Create a user and automatically login.
     * @param creds 
     */
    async create(
        creds: UserCredentials,
        options: AuthBasicOptions = {},
    ): Promise<string> {
        this.logout();
        return this._beginAuthBlock(async () => {
            try {
                return await this._create(creds, options);
            } catch (error) {
                if (error instanceof MultipleAuthError) {
                    // Wait for internal work and try again
                    await this._joinInternal();
                    return await this._create(creds, options);
                }
                throw error;
            }
        });
    }

    /**
     * Login a previously saved user.
     */
    async recall(options: AuthBasicOptions = {}): Promise<string | undefined> {
        if (this.delegate?.recallPair) {
            let pair = await this.delegate!.recallPair(this, options);
            if (pair) {
                // Auth with pair
                return await this.login(pair, options);
            }
        } else if (isPlatformWeb()) {
            return this._beginAuthBlock(async () => {
                try {
                    return await this._recallSessionStorage(options);
                } catch (error) {
                    if (error instanceof MultipleAuthError) {
                        // Wait for internal work and try again
                        await this._joinInternal();
                        return await this._recallSessionStorage(options);
                    }
                    throw error;
                }
            });
        } else {
            return undefined;
        }
    }

    /**
     * Resolves when a user has been authenticated.
     * If a user is already authenticated, resolves
     * immediately.
     */
    async onAuth(cb?: () => void): Promise<string> {
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

    /**
     * If you use your own `gun.on('auth', cb)` listener,
     * call this method inside it.
     * 
     * Why? It's been observed that multiple `gun.on('auth', cb)`
     * listeners don't work.
     */
    didAuth() {
        this._endOnAuth();
    }

    /**
     * Changes a user's password.
     * 
     * **Does not work with Gun v0.2020.520**
    */
    async changePass(
        creds: UserCredentials & { newPass: string },
        options: AuthBasicOptions = {},
    ): Promise<string> {
        this.logout();
        return this.create(creds, options);
    }

    /**
     * Deletes a user.
     * 
     * **Does not work with Gun v0.2020.520**
    */
    async delete(
        creds: UserCredentials,
        options: AuthBasicOptions = {},
    ): Promise<void> {
        return this._beginAuthBlock(async () => {
            try {
                return await this._delete(creds, options);
            } catch (error) {
                if (error instanceof MultipleAuthError) {
                    // Wait for internal work and try again
                    await this._joinInternal();
                    return await this._delete(creds, options);
                }
                throw error;
            }
        });
    }

    /**
     * Wait for all user operations to finish.
     */
    async join(options: AuthBasicOptions = {}): Promise<void> {
        let { timeout = 0 } = options;
        let stop = false;

        let joins = (async () => {
            await this._joinInternal();
            while (!stop && this._authBlock) {
                try {
                    await this._authBlock;
                } catch (error) {}
            }
            await this._joinInternal();
        })();

        if (timeout) {
            await timeoutAfter(joins, timeout)
                .catch(err => {
                    stop = true;
                    throw err;
                });
        } else {
            await joins;
        }
    }

    // Private

    /** Internal gun user work. */
    private _gunUserAction: Promise<any> | undefined;
    /**
     * Auth user work wrapper. This can finish
     * faster than `_gunUserAction`.
     */
    private _authBlock: Promise<any> | undefined;
    private _onAuth$: Promise<string> | undefined;
    private _onAuthResolver: ((pub: string) => void) | undefined;
    private _subscribedToAuth = false;

    private static _default: Auth | undefined;

    private async _joinInternal(): Promise<void> {
        if (!this._gunUserAction) {
            return;
        }
        try {
            await this._gunUserAction;
        } catch (error) {}
    }

    private async _login(
        creds: UserCredentials | IGunCryptoKeyPair,
        options: AuthBasicOptions,
    ): Promise<string> {
        const {
            timeout = Auth.defaultTimeout,
        } = options;
        const loginCheckDelay = timeout && timeout > 1000
            ? Math.min(LOGIN_CHECK_DELAY, timeout - 100)
            : 0;
        let loginAction = new Promise<string>((resolve, reject) => {
            let resolveOnce: (typeof resolve) | undefined = resolve;
            let rejectOnce: (typeof reject) | undefined = reject;

            // Check for login ahead of time
            let timer = loginCheckDelay && setTimeout(() => {
                if (!resolveOnce) return;
                let pub = this.pub();
                if (pub) {
                    // Instant login
                    resolveOnce(pub);
                    resolveOnce = undefined;
                    rejectOnce = undefined;
                }
            }, loginCheckDelay);

            // Begin login
            let cb = (ack: any) => {
                if (!resolveOnce || !rejectOnce) return;

                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub();
                    if (pub) {
                        // Actually logged in.
                        // (This is Gun v0.2020.520 behaviour only)
                        console.warn('Logged in without login acknowledgement. Your data may not be synced to peers.')
                        resolveOnce(pub);
                    } else if ((ack as any).lack) {
                        // Timed out
                        rejectOnce(new TimeoutError(ack.err));
                    } else {
                        rejectOnce(Auth._parseGunError(ack.err, InvalidCredentials));
                    }
                } else {
                    resolveOnce(ack.sea.pub);
                }
                resolveOnce = undefined;
                rejectOnce = undefined;
                timer && clearTimeout(timer);
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
                    throw new GunError('This version of Gun only supports auth with alias and pass');
                }
                user.auth(creds, cb);
            }
        });

        this._gunUserAction = loginAction;
        let promises = [
            loginAction,
            this.onAuth(),
        ];
        if (timeout && timeout > 0) {
            promises.push(errorAfter(timeout, new TimeoutError()));
        }
        return Promise.race(promises);
    }

    private async _recallSessionStorage(
        options: AuthBasicOptions
    ): Promise<string | undefined> {
        const {
            timeout = Auth.defaultTimeout,
        } = options;
        let recallAction = new Promise<string | undefined>((resolve, reject) => {
            let resolveOnce: (typeof resolve) | undefined = resolve;
            let rejectOnce: (typeof reject) | undefined = reject;

            let timer: any;
            if (timeout && timeout > 0) {
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
            let gunOpts = {
                sessionStorage: true,
            };
            this.gun.user().recall(gunOpts, ack => {
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
                        rejectOnce(Auth._parseGunError(ack.err, InvalidCredentials));
                    }
                } else {
                    resolveOnce(ack.sea.pub);
                }
                resolveOnce = undefined;
                rejectOnce = undefined;
                timer && clearTimeout(timer);
            });
        });

        this._gunUserAction = recallAction;
        return Promise.race([
            recallAction,
            this.onAuth()
        ]);
    }

    private async _create(
        { alias, pass, newPass }: UserCredentials & { newPass?: string },
        options: AuthBasicOptions,
    ): Promise<string> {
        const {
            timeout = Auth.defaultTimeout,
        } = options;
        let createAction = new Promise<string>((resolve, reject) => {
            let options: any = {};
            if (newPass) {
                options.change = newPass;
            }

            if (this.pub()) {
                throw new MultipleAuthError('Should not be logged in when creating a user');
            }
            
            this.gun.user().create(alias, pass, ack => {
                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub();
                    if (pub) {
                        // Actually created user
                        resolve(pub);
                    } else {
                        reject(Auth._parseGunError(ack.err, UserExists));
                    }
                } else {
                    resolve(ack.pub);
                }
            }, options);
        });

        this._gunUserAction = createAction;
        let promises = [
            createAction,
            this.onAuth(),
        ];
        if (timeout && timeout > 0) {
            promises.push(errorAfter(timeout, new TimeoutError()));
        }
        return Promise.race(promises);
    }

    private async _delete(
        { alias, pass }: UserCredentials,
        options: AuthBasicOptions,
    ): Promise<void> {
        const {
            timeout = Auth.defaultTimeout,
        } = options;
        let deleteAction = new Promise<void>((resolve, reject) => {
            this.gun.user().delete(alias, pass, ack => {
                if (!this.pub()) {
                    resolve();
                } else {
                    reject(new GunError('Failed to delete user'));
                }
            });
        });
        this._gunUserAction = deleteAction;
        let promises = [deleteAction];
        if (timeout && timeout > 0) {
            promises.push(errorAfter(timeout, new TimeoutError()));
        }
        return Promise.race(promises);
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
        if (pub) {
            let resolve = this._onAuthResolver;
            this._onAuthResolver = undefined;
            this._onAuth$ = undefined;
            resolve?.(pub);
            if (this.delegate?.storePair) {
                let pair = this.pair();
                if (pair) {
                    this.delegate.storePair(pair, this);
                }
            }
        }
        return pub;
    }

    private async _beginAuthBlock<T>(blockFactory: () => Promise<T>): Promise<T> {
        if (this._authBlock) {
            throw new MultipleAuthError('Already performing a user operation');
        }
        try {
            let block = blockFactory();
            this._authBlock = block;
            return await block;
        } finally {
            this._authBlock = undefined;
            this._endOnAuth();
        }
    }

    private static _parseGunError(error: string, defaultClass = GunError): GunError {
        switch (error) {
            case 'User already created!':
                return new UserExists(error);
            case 'Wrong user or password.':
                return new InvalidCredentials(error);
            case 'User is already being created or authenticated!':
                return new MultipleAuthError(error);
            default:
                return new defaultClass(error);
        }
    }
}
