import { IGunChainReference } from "gun/types/chain";
import { InvalidCredentials, GunError, AuthError, UserExists, TimeoutError } from "./errors";
import { IGunCryptoKeyPair } from "gun/types/types";

const LOGIN_CHECK_DELAY = 500;

export interface GunUserCredentials {
    alias: string,
    pass: string
}

/**
 * Convenience methods for creating an authenticating a Gun user.
 */
export default class GunUser {
    static _authOp = false;

    static logout(gun: IGunChainReference) {
        if (!this.pub(gun)) {
            return;
        }
        let userRef = gun.user();
        userRef.leave();
        if (!this.pub(gun)) {
        } else {
            throw new AuthError('Failed to log out');
        }
    }

    static current(gun: IGunChainReference): IGunChainReference | undefined {
        let pub = this.pub(gun);
        return !!pub ? gun.user(pub) : undefined;
    }

    /**
     * The current user's public key.
     * @param gun 
     */
    static pub(gun: IGunChainReference): string {
        return (this.pair(gun) as any || {}).pub || '';
    }

    /**
     * The current user's key pair.
     * @param gun 
     */
    static pair(gun: IGunChainReference): IGunCryptoKeyPair {
        let userRef = gun.user() as any;
        return userRef._.sea;
    }

    static async login(
        creds: GunUserCredentials,
        gun: IGunChainReference
    ): Promise<string> {
        this.logout(gun);
        return this._authBlock(async () => {
            return await this._getLoginPub(creds, gun);
        });
    }

    static async create(
        creds: GunUserCredentials,
        gun: IGunChainReference
    ): Promise<string> {
        return this._authBlock(async () => {
            return await this._getCreatePub(creds, gun);
        });
    }

    static async changePass(
        creds: GunUserCredentials & { newPass: string },
        gun: IGunChainReference
    ): Promise<string> {
        return this._authBlock(async () => {
            return await this._getCreatePub(creds, gun);
        });
    }

    static async delete(
        { alias, pass }: GunUserCredentials,
        gun: IGunChainReference
    ): Promise<void> {
        return this._authBlock(async () => {
            return new Promise((resolve, reject) => {
                gun.user().delete(alias, pass, ack => {
                    if (!this.pub(gun)) {
                        resolve();
                    } else {
                        reject(new GunError('Failed to delete user'));
                    }
                });
            });
        });
    }

    private static async _getLoginPub(
        { alias, pass }: GunUserCredentials,
        gun: IGunChainReference
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            let resolveOnce: (typeof resolve) | undefined = resolve;
            let rejectOnce: (typeof reject) | undefined = reject;

            // Check for login ahead of time
            let timer = setTimeout(() => {
                if (!resolveOnce) return;
                let pub = this.pub(gun);
                if (pub) {
                    // Instant login
                    resolveOnce(pub);
                    resolveOnce = undefined;
                    rejectOnce = undefined;
                }
            }, LOGIN_CHECK_DELAY);

            // Begin login
            let ref = gun.user().auth(alias, pass, ack => {
                if (!resolveOnce || !rejectOnce) return;

                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub(gun);
                    if (pub) {
                        // Actually logged in
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
    }

    private static async _getCreatePub(
        { alias, pass, newPass }: GunUserCredentials & { newPass?: string },
        gun: IGunChainReference
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            let resolveOnce: (typeof resolve) | undefined = resolve;
            let rejectOnce: (typeof reject) | undefined = reject;
            let timer: any;
            let options: any = {};
            if (newPass) {
                options.change = newPass;
            }

            let previousPub = this.pub(gun);
            if (!newPass && previousPub) {
                throw new GunError('Should not be logged in when creating a user');
            }
            
            let ref = gun.user().create(alias, pass, ack => {
                if (!resolveOnce || !rejectOnce) return;

                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.pub(gun);
                    if (pub !== previousPub) {
                        // Actually created user
                        resolveOnce(pub);
                    } else {
                        rejectOnce(new UserExists(ack.err));
                    }
                } else {
                    resolveOnce(ack.pub);
                }

                resolveOnce = undefined;
                rejectOnce = undefined;
                clearTimeout(timer);
            }, options) as IGunChainReference;
        });
    }

    private static async _authBlock<T>(block: () => Promise<T>): Promise<T> {
        if (this._authOp) {
            throw new AuthError('Already performing a user operation');
        }
        try {
            this._authOp = true;
            return await block();
        } finally {
            this._authOp = false;
        }
    }
}
