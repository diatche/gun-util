import Auth, { UserCredentials } from '../src/Auth';
import { IGunChainReference } from 'gun/types/chain';
import { TEST_GUN_OPTIONS } from '../src/const';
import { InvalidCredentials, UserExists, AuthError } from '../src/errors';
import Gun from 'gun';
import uuid, { v4 as uuidv4 } from 'uuid';

let gun: IGunChainReference;
let auth: Auth;
let creds: UserCredentials;

const newCreds = () => {
    return {
        alias: uuidv4(),
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
                (Auth as any)._default = undefined;
                Auth.defaultGun = undefined;
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

        beforeEach(() => {
            // New credentials on each run
            creds = newCreds();
        });

        afterEach(() => {
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
        });

        describe('login', () => {

            beforeEach(async () => {
                let pub = await auth.create(creds);
                auth.logout();
            });

            it('should log in an existing user with correct credentials', async () => {
                let user = await auth.login(creds);
                expect(user).toBeTruthy();
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
        });

        describe('onAuth', () => {

            beforeEach(async () => {
                await auth.create(creds);
                auth.logout();
            });

            it('should resolve all listeneres when user created', async done => {
                let user = '';
                let pub1 = '';
                let pub2 = '';
                const maybeDone = () => {
                    if (user && pub1 && pub2) {
                        done();
                    }
                };
                auth.onAuth().then(pub => {
                    pub1 = pub;
                    expect(pub1).toEqual(pub);
                    maybeDone();
                });
                auth.onAuth().then(pub => {
                    pub2 = pub;
                    expect(pub2).toEqual(pub);
                    maybeDone();
                });
                user = await auth.create(newCreds());
            });

            it('should resolve all listeneres when logged in', async done => {
                let user = '';
                let pub1 = '';
                let pub2 = '';
                const maybeDone = () => {
                    if (user && pub1 && pub2) {
                        done();
                    }
                };
                auth.onAuth().then(pub => {
                    pub1 = pub;
                    expect(pub1).toEqual(pub);
                    maybeDone();
                });
                auth.onAuth().then(pub => {
                    pub2 = pub;
                    expect(pub2).toEqual(pub);
                    maybeDone();
                });
                user = await auth.login(creds);
            });

            it('should resolve when logged in after a failed attempt', async done => {
                let user = '';
                auth.onAuth().then(pub1 => {
                    expect(pub1).toEqual(user);
                    done();
                });
                try {
                    let user = await auth.login({ ...creds, pass: 'x' });
                } catch (e) { }
                user = await auth.login(creds);
            });

            it('should resolve when logged in with different user', async done => {
                let creds2 = newCreds();
                await auth.create(creds2);
                auth.logout();

                let user1 = await auth.login(creds);
                auth.logout();

                let user2 = '';
                auth.onAuth().then(pub2 => {
                    expect(pub2).toEqual(user2);
                    done();
                });
                user2 = await auth.login(creds2);
                expect(user2).not.toEqual(user1);
            });

            it('should resolve when logged in with Gun methods', done => {
                let pub = '';
                auth.onAuth().then(pub1 => {
                    expect(pub1).toEqual(pub);
                    done();
                });
                gun.user().auth(creds.alias, creds.pass, ack => {
                    pub = (ack as any).sea.pub;
                    expect(pub).toBeTruthy();
                });
            });
        });

        describe('changePass', () => {

            beforeEach(async () => {
                await auth.create(creds);
            });

            it.skip('should change credentials and login', async () => {
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
    });
});