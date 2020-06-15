import { IGunChainReference } from "gun/types/chain";
import { InvalidCredentials, GunError, AuthError, UserExists, TimeoutError } from "./errors";

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

    static userRef(gun: IGunChainReference) {
        return gun.user();
    }

    static logout(gun: IGunChainReference) {
        if (!this.publicKey(gun)) {
            return;
        }
        let userRef = this.userRef(gun);
        userRef.leave();
        if (!this.publicKey(gun)) {
        } else {
            throw new AuthError('Failed to log out');
        }
    }

    static current(gun: IGunChainReference): IGunChainReference | undefined {
        let publicKey = this.publicKey(gun);
        if (!publicKey) {
            return undefined;
        }
        return gun.user(publicKey);
    }

    static publicKey(gun: IGunChainReference): string {
        let userRef = this.userRef(gun) as any;
        return userRef._.sea && userRef._.sea.pub || '';
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
                this.userRef(gun).delete(alias, pass, ack => {
                    if (!this.publicKey(gun)) {
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
                let pub = this.publicKey(gun);
                if (pub) {
                    // Instant login
                    resolveOnce(pub);
                    resolveOnce = undefined;
                    rejectOnce = undefined;
                }
            }, LOGIN_CHECK_DELAY);

            // Begin login
            let ref = this.userRef(gun).auth(alias, pass, ack => {
                if (!resolveOnce || !rejectOnce) return;

                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.publicKey(gun);
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

            let previousPub = this.publicKey(gun);
            if (!newPass && previousPub) {
                throw new GunError('Should not be logged in when creating a user');
            }
            
            let ref = this.userRef(gun).create(alias, pass, ack => {
                if (!resolveOnce || !rejectOnce) return;

                if ('err' in ack) {
                    // Check for login anyway
                    let pub = this.publicKey(gun);
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
