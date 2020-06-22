import GunUser from '../src/GunUser';
import { IGunChainReference } from 'gun/types/chain';
import { TEST_GUN_OPTIONS } from '../src/const';
import { InvalidCredentials, UserExists, AuthError } from '../src/errors';
import Gun from 'gun';
import { v4 as uuidv4 } from 'uuid';

let gun: IGunChainReference;
const creds = { alias: 'foo', pass: 'bar' };

describe('User', () => {
    jest.setTimeout(20000);

    beforeAll(() => {
        gun = Gun(TEST_GUN_OPTIONS);
    });

    afterEach(() => {
        GunUser.logout(gun);
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('create', () => {

        it('should create a user', async () => {
            let pub = await GunUser.create(creds, gun);
            expect(pub).toBeTruthy();
        });

        it('should not create a duplicate user', async () => {
            let user: string | undefined;
            let createError: Error | undefined;
            try {
                user = await GunUser.create(creds, gun);
            } catch (error) {
                createError = error;
            }
            expect(user).toBeFalsy();
            expect(createError).toBeInstanceOf(UserExists);
        });

        it('should not create users in parallel', async () => {
            let errors: Error[] = [];
            let usersAndErrors = await Promise.all([
                GunUser.create({ alias: uuidv4(), pass: 'bar' }, gun)
                    .catch(error => errors.push(error)),
                GunUser.create({ alias: uuidv4(), pass: 'bar' }, gun)
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
                await GunUser.create(creds, gun);
                GunUser.logout(gun);
            } catch (error) {}
        });

        it('should log in an existing user with correct credentials', async () => {
            let user = await GunUser.login(creds, gun);
            expect(user).toBeTruthy();
        });

        it('should not log in an existing user with incorrect alias', async () => {
            let user: string | undefined;
            let loginError: Error | undefined;
            try {
                user = await GunUser.login({ ...creds, alias: creds.alias + '1' }, gun);
            } catch (error) {
                loginError = error;
            }
            expect(user).toBeFalsy();
            expect(loginError).toBeInstanceOf(InvalidCredentials);
        });
    });

    describe('onLogin', () => {

        beforeEach(async () => {
            try {
                await GunUser.create(creds, gun);
                GunUser.logout(gun);
            } catch (error) {}
        });

        it('should resolve all listeneres when logged in', async () => {
            let pub1 = '';
            let pub2 = '';
            GunUser.onLogin(gun).then(pub => {
                pub1 = pub;
            });
            GunUser.onLogin(gun).then(pub => {
                pub2 = pub;
            });
            let user = await GunUser.login(creds, gun);
            expect(pub1).toEqual(user);
            expect(pub2).toEqual(user);
        });

        it('should resolve when logged in after a failed attempt', async () => {
            let pub1 = '';
            GunUser.onLogin(gun).then(pub => {
                pub1 = pub;
            });
            try {
                let user = await GunUser.login({ ...creds, pass: 'x' }, gun);
            } catch (e) {}
            let user = await GunUser.login(creds, gun);
            expect(pub1).toEqual(user);
        });

        it('should resolve when logged in with different user', async () => {
            let pub1 = '';
            let pub2 = '';
            GunUser.onLogin(gun).then(pub => {
                pub1 = pub;
            });
            let user1 = await GunUser.login(creds, gun);
            expect(pub1).toEqual(user1);
            GunUser.logout(gun);
            
            let creds2 = { ...creds, pass: 'x' };
            try {
                let user = await GunUser.login(creds2, gun);
                GunUser.logout(gun);
            } catch (e) {}
            let user2 = await GunUser.login(creds2, gun);
            expect(pub2).toEqual(user2);
        });
    });

    describe('changePass', () => {

        beforeEach(async () => {
            try {
                await GunUser.create(creds, gun);
            } catch (error) {}
        });

        it.skip('should change credentials and login', async () => {
            let pub = await GunUser.login(creds, gun);
            let newPub = await GunUser.changePass({ ...creds, newPass: 'roo' }, gun);

            // Check user props
            expect(newPub).not.toEqual(pub);

            // Check new login
            GunUser.logout(gun);
            let againPub = await GunUser.login({ ...creds, pass: 'roo' }, gun);
            expect(againPub).toEqual(newPub);
        });
    });
});
