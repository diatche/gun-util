import Auth from '../src/Auth';
import { IGunChainReference } from 'gun/types/chain';
import { TEST_GUN_OPTIONS } from '../src/const';
import { InvalidCredentials, UserExists, AuthError } from '../src/errors';
import Gun from 'gun';
import { v4 as uuidv4 } from 'uuid';

let gun: IGunChainReference;
let auth: Auth;
const creds = { alias: 'foo', pass: 'bar' };

describe('AuthManager', () => {
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
                    auth.create({ alias: uuidv4(), pass: 'bar' })
                        .catch(error => errors.push(error)),
                    auth.create({ alias: uuidv4(), pass: 'bar' })
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
                try {
                    await auth.create(creds);
                    auth.logout();
                } catch (error) { }
            });

            it('should log in an existing user with correct credentials', async () => {
                let user = await auth.login(creds);
                expect(user).toBeTruthy();
            });

            it('should not log in an existing user with incorrect alias', async () => {
                let user: string | undefined;
                let loginError: Error | undefined;
                try {
                    user = await auth.login({ ...creds, alias: creds.alias + '1' });
                } catch (error) {
                    loginError = error;
                }
                expect(user).toBeFalsy();
                expect(loginError).toBeInstanceOf(InvalidCredentials);
            });
        });

        describe('onAuth', () => {

            beforeEach(async () => {
                try {
                    await auth.create(creds);
                    auth.logout();
                } catch (error) { }
            });

            it('should resolve all listeneres when logged in', async () => {
                let pub1 = '';
                let pub2 = '';
                auth.onAuth().then(pub => {
                    pub1 = pub;
                });
                auth.onAuth().then(pub => {
                    pub2 = pub;
                });
                let user = await auth.login(creds);
                expect(pub1).toEqual(user);
                expect(pub2).toEqual(user);
            });

            it('should resolve when logged in after a failed attempt', async () => {
                let pub1 = '';
                auth.onAuth().then(pub => {
                    pub1 = pub;
                });
                try {
                    let user = await auth.login({ ...creds, pass: 'x' });
                } catch (e) { }
                let user = await auth.login(creds);
                expect(pub1).toEqual(user);
            });

            it('should resolve when logged in with different user', async () => {
                let pub1 = '';
                let pub2 = '';
                auth.onAuth().then(pub => {
                    pub1 = pub;
                });
                let user1 = await auth.login(creds);
                expect(pub1).toEqual(user1);
                auth.logout();

                let creds2 = { ...creds, pass: 'x' };
                try {
                    let user = await auth.login(creds2);
                    auth.logout();
                } catch (e) { }
                let user2 = await auth.login(creds2);
                expect(pub2).toEqual(user2);
            });
        });

        describe('changePass', () => {

            beforeEach(async () => {
                try {
                    await auth.create(creds);
                } catch (error) { }
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