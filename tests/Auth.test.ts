import Auth, { UserCredentials } from '../src/Auth';
import { IGunChainReference } from 'gun/types/chain';
import { TEST_GUN_OPTIONS } from '../src/const';
import { InvalidCredentials, UserExists, AuthError, TimeoutError } from '../src/errors';
import Gun from 'gun';
import { v4 as uuidv4 } from 'uuid';
import { IGunCryptoKeyPair } from 'gun/types/types';
import { isGunAuthPairSupported } from '../src/support';

let gun: IGunChainReference;
let auth: Auth;
let creds: UserCredentials;

Auth.defaultTimeout = 20000;

const newCreds = () => {
    return {
        alias: 'test-' + uuidv4(),
        pass: uuidv4()
    };
};

describe('Auth', () => {
    jest.setTimeout(20000);

    beforeAll(() => {
        gun = Gun(TEST_GUN_OPTIONS);
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('static', () => {

        describe('default', () => {

            afterEach(() => {
                Auth.resetDefault();
            });

            it('should return same instance', () => {
                Auth.defaultGun = gun;
                expect(Auth.default()).toStrictEqual(Auth.default());
            });

            it('should use set default gun automatically', () => {
                expect(Auth.default(gun)).toStrictEqual(Auth.default());
                expect(Auth.defaultGun).toStrictEqual(gun);
            });

            it('should set default instance to first instance', () => {
                let auth = new Auth(gun);
                expect(Auth.default()).toStrictEqual(auth);
                expect(Auth.default()).toStrictEqual(auth);
            });

            it('should throw without default gun', () => {
                expect(() => Auth.default()).toThrowError();
            });
        });
    });

    describe('#', () => {

        beforeAll(() => {
            auth = new Auth(gun);
        });

        beforeEach(async () => {
            await auth.join();
            // New credentials on each run
            creds = newCreds();
        });

        afterEach(async () => {
            await auth.join();
            auth.logout();
        });

        describe('create', () => {

            it('should create a user', async () => {
                let pub = await auth.create(creds);
                expect(pub).toBeTruthy();
            });

            it('should not create a duplicate user', async () => {
                let user: string | undefined;
                let createError: Error | undefined;
                await auth.create(creds);
                auth.logout();
                try {
                    user = await auth.create(creds);
                } catch (error) {
                    createError = error;
                }
                expect(user).toBeFalsy();
                expect(createError).toBeInstanceOf(UserExists);
            });

            it('should not create users in parallel', async () => {
                let errors: Error[] = [];
                let usersAndErrors = await Promise.all([
                    auth.create(newCreds())
                        .catch(error => errors.push(error)),
                    auth.create(newCreds())
                        .catch(error => errors.push(error)),
                ]);
                let users = usersAndErrors.filter(u => typeof u === 'string');
                console.log('errors: ' + JSON.stringify(errors.map(e => e + ''), null, 2));
                expect(users.length).toBe(1);
                expect(errors.length).toBe(1);
                expect(errors[0]).toBeInstanceOf(AuthError);
            });

            it('should timeout when creating a user', async () => {
                let caughtError: Error | undefined;
                try {
                    await auth.create(creds, { timeout: 1 });
                } catch (error) {
                    caughtError = error;
                }
                expect(caughtError).toBeInstanceOf(TimeoutError);
            });
        });

        describe('login', () => {

            let pair: IGunCryptoKeyPair;

            beforeEach(async () => {
                await auth.create(creds);
                pair = auth.pair()!;
                expect(pair).toBeTruthy();
                auth.logout();
            });

            it('should log in an existing user with correct credentials', async () => {
                let user = await auth.login(creds);
                expect(user).toBeTruthy();
            });

            it('should log in an existing user with pair', async () => {
                if (isGunAuthPairSupported(gun)) {
                    let user = await auth.login(pair);
                    expect(user).toBeTruthy();
                    expect(auth.pair()).toMatchObject(pair);
                } else {
                    console.warn('Gun.auth with pair is not supported');
                }
            });

            it('should not log in an existing user with incorrect alias', async () => {
                let user: string | undefined;
                let loginError: Error | undefined;
                try {
                    user = await auth.login({ ...creds, pass: 'foo' });
                } catch (error) {
                    loginError = error;
                }
                expect(user).toBeFalsy();
                expect(loginError).toBeInstanceOf(InvalidCredentials);
            });

            it.skip('should not log in an existing user with incorrect pair', async () => {
                let user: string | undefined;
                let loginError: Error | undefined;
                try {
                    user = await auth.login({
                        pub: 'foo',
                        priv: 'bar',
                        epub: 'gaz',
                        epriv: 'roo'
                    });
                } catch (error) {
                    loginError = error;
                }
                expect(user).toBeFalsy();
                expect(loginError).toBeInstanceOf(InvalidCredentials);
            });

            it('should timeout when logging in a user', async () => {
                let caughtError: Error | undefined;
                try {
                    await auth.login(creds, { timeout: 1 });
                } catch (error) {
                    caughtError = error;
                }
                expect(caughtError).toBeInstanceOf(TimeoutError);
            });
        });

        describe('on', () => {

            beforeEach(async () => {
                await auth.create(creds);
                auth.logout();
            });

            it('should resolve all listeneres when user created', async () => {
                let didCb1 = false;
                let didCb2 = false;

                let [pub1, pub2, user] = await Promise.all([
                    auth.on(() => { didCb1 = true; }),
                    auth.on(() => { didCb2 = true; }),
                    auth.create(newCreds())
                ]);

                expect(pub1).toEqual(user);
                expect(pub2).toEqual(user);
                expect(didCb1).toBeTruthy();
                expect(didCb2).toBeTruthy();
            });

            it('should resolve all listeneres when logged in', async () => {
                let didCb1 = false;
                let didCb2 = false;

                let [pub1, pub2, user] = await Promise.all([
                    auth.on(() => { didCb1 = true; }),
                    auth.on(() => { didCb2 = true; }),
                    auth.login(creds)
                ]);

                expect(pub1).toEqual(user);
                expect(pub2).toEqual(user);
                expect(didCb1).toBeTruthy();
                expect(didCb2).toBeTruthy();
            });

            it('should resolve when logged in after a failed attempt', async () => {
                // Subscribe to auth
                let didCb = false;
                let on = auth.on(() => { didCb = true; });
                let error: any;
                try {
                    await auth.login({ ...creds, pass: 'x' });
                } catch (e) {
                    error = e;
                }
                expect(error).toBeTruthy();
                expect(didCb).toBeFalsy();
                let [pub1, user] = await Promise.all([
                    on,
                    auth.login(creds)
                ]);
                expect(pub1).toEqual(user);
                expect(didCb).toBeTruthy();
            });

            it('should resolve when logged in with different user', async () => {
                let creds2 = newCreds();
                await auth.create(creds2);
                auth.logout();

                let user1 = await auth.login(creds);
                auth.logout();

                let didCb = false;
                let [pub2, user2] = await Promise.all([
                    auth.on(() => { didCb = true; }),
                    auth.login(creds2)
                ]);
                expect(pub2).toEqual(user2);
                expect(user2).not.toEqual(user1);
                expect(didCb).toBeTruthy();
            });

            it('should resolve when logged in with Gun methods', done => {
                let pub = '';
                let didCb = false;
                auth.on(() => { didCb = true; }).then(pub1 => {
                    expect(pub1).toEqual(pub);
                    expect(didCb).toBeTruthy();
                    done();
                });
                gun.user().auth(creds.alias, creds.pass, ack => {
                    pub = (ack as any).sea.pub;
                    expect(pub).toBeTruthy();
                });
            });
        });

        describe('getPub', () => {

            it('should not return a public for a non existing user', async () => {
                let pub = await auth.getPub(creds, { timeout: 1000 });
                expect(pub).toBeFalsy();
            });

            it ('should return a public key for an existing user', async () => {
                let pub1 = await auth.create(creds);
                auth.logout();
                let pub2 = await auth.getPub(creds, { timeout: 1000 });
                expect(pub2).toBe(pub1);
            });
        });

        describe('exists', () => {

            it('should return false for a non existing user', async () => {
                let exists = await auth.exists(creds, { timeout: 1000 });
                expect(exists).toBeFalsy();
            });

            it ('should return true for an existing user', async () => {
                await auth.create(creds);
                auth.logout();
                let exists = await auth.exists(creds, { timeout: 1000 });
                expect(exists).toBeTruthy();
            });
        });

        describe('recall', () => {

            beforeAll(() => {
                let storedPair: any;
                auth.delegate = {
                    storePair: async (pair, _auth) => {
                        storedPair = pair;
                        expect(pair).toBeTruthy();
                        expect(_auth).toStrictEqual(auth);
                    },
                    recallPair: (_auth) => {
                        expect(_auth).toStrictEqual(auth);
                        return storedPair;
                    },
                }
            });

            afterAll(() => {
                auth.delegate = undefined;
            });

            it('should login the last user', async () => {
                let pub = await auth.create(creds);
                auth.logout();
                let pub2 = await auth.recall();
                expect(pub2).toEqual(pub);
            });
        });

        describe('changePass', () => {

            beforeEach(async () => {
                await auth.create(creds);
            });

            it.skip('should change credentials and login', async () => {
                // Re-enable when fixed in Gun
                let pub = await auth.login(creds);
                let newPub = await auth.changePass({ ...creds, newPass: 'roo' });

                // Check user props
                expect(newPub).not.toEqual(pub);

                // Check new login
                auth.logout();
                let againPub = await auth.login({ ...creds, pass: 'roo' });
                expect(againPub).toEqual(newPub);
            });
        });

        describe('delete', () => {

            let pair: IGunCryptoKeyPair;

            beforeEach(async () => {
                await auth.create(creds);
                pair = auth.pair()!;
                expect(pair).toBeTruthy();
            });

            it.skip('should delete in an existing user with correct credentials', async () => {
                // Re-enable when fixed in Gun
                await auth.delete(creds);
                expect(auth.pair()).toBeFalsy();
                let user = '';
                let caughtError: Error | undefined;
                try {
                    user = await auth.login(creds);
                } catch(error) {
                    caughtError = error;
                }
                expect(user).toBeFalsy();
                expect(caughtError).toBeInstanceOf(InvalidCredentials);
            });
        });

        describe('user', () => {

            it('should return a writable reference', async () => {
                await auth.create(creds);
                let user = auth.user()!;
                await user.get('label').put('test' as never).then!();
                let label = await user.get('label').then!();
                expect(label).toBe('test');
            });
        });
    });
});