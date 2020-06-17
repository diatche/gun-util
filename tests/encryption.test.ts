import { encrypt, decrypt } from '../src/encryption';
import { TEST_GUN_OPTIONS } from '../src/const';
import { IGunChainReference } from 'gun/types/chain';
import _ from 'lodash';
import Gun from 'gun';
import { v4 as uuidv4 } from 'uuid';
import { GunUserCredentials, GunUser } from '../src';

interface State {
    [key: string]: UserState;
}

interface UserState {
    [key: string]: string
}

let gun: IGunChainReference<State>;
let userRef: IGunChainReference<UserState>;
let runId: string;

describe('encryption', () => {
    jest.setTimeout(20000);

    beforeAll(() => {
        gun = Gun<State>(TEST_GUN_OPTIONS);
    });

    beforeEach(async () => {
        // Use a clean node on every run
        runId = uuidv4();
    });

    afterEach(() => {
        GunUser.logout(gun);
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('encrypt/decrypt', () => {

        it('should encrypt value', async () => {
            let pub = await GunUser.create({ alias: runId, pass: 'bar' }, gun);
            userRef = gun.user(pub) as any;
            userRef.get('email').put(await encrypt('a@a.com', gun));
            let email = await userRef.get('email').then!();
            expect(email).toMatch(/SEA\{.*/g);
            expect(await decrypt(email, gun)).toEqual('a@a.com');
        });

        it('should not be able to read other users data', async () => {
            let otherPub = await GunUser.create({ alias: runId + '1', pass: 'bar' }, gun);
            let otherUserRef = gun.user(otherPub) as any;
            otherUserRef.get('email').put(await encrypt('a@a.com', gun));
            GunUser.logout(gun);

            let pub = await GunUser.create({ alias: runId, pass: 'bar' }, gun);
            userRef = gun.user(pub) as any;
            let otherEmail = await otherUserRef.get('email').then!();
            expect(otherEmail).toMatch(/SEA\{.*/g);
            let error: Error | undefined;
            try {
                await decrypt(otherEmail, gun);
            } catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(Error);
        });
    });
});
