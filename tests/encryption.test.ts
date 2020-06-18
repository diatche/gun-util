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

        it('should encrypt/decrypt a value', async () => {
            await GunUser.create({ alias: runId, pass: 'bar' }, gun);
            let enc = await encrypt('a@a.com', { pair: GunUser.pair(gun) });
            expect(enc).toMatch(/SEA\{.*/g);
            let dec = await decrypt(enc, { pair: GunUser.pair(gun) });
            expect(dec).toEqual('a@a.com');
        });

        it('should encrypt/decrypt an object', async () => {
            let pub = await GunUser.create({ alias: runId, pass: 'bar' }, gun);
            userRef = gun.user(pub) as any;
            let orig = Gun.node.ify({ a: 'a1', b: 'b1' });
            let enc = await encrypt(orig, { pair: GunUser.pair(gun) });
            expect(Object.keys(enc).length).toBe(3);
            expect(enc.a).toMatch(/SEA\{.*/g);
            expect(enc.b).toMatch(/SEA\{.*/g);
            expect(await decrypt(enc, { pair: GunUser.pair(gun) })).toMatchObject(orig);
        });

        it('should encrypt/decrypt a value for another user', async () => {
            // Create all users and get epubs
            let creds = ['1', '2', '3'].map(x => ({ alias: runId + x, pass: 'bar' }));
            let pubs: string[] = [];
            for (let cred of creds) {
                let pub = await GunUser.create(cred, gun)
                GunUser.logout(gun);
                pubs.push(pub);
            }
            let epubs: string[] = await Promise.all(
                pubs.map(pub => gun.user(pub).get('epub').then!())
            ) as any;

            // [0] encrypts email for [1]
            await GunUser.login(creds[0], gun);
            let encFor1 = await encrypt('a@a.com', {
                pair: GunUser.pair(gun),
                recipient: { epub: epubs[1] }
            });
            expect(encFor1).toMatch(/SEA\{.*/g);
            GunUser.logout(gun);

            // [1] decrypts
            await GunUser.login(creds[1], gun);
            let dec1 = await decrypt(encFor1, {
                pair: GunUser.pair(gun),
                sender: { epub: epubs[0] }
            });
            expect(dec1).toBe('a@a.com');
            GunUser.logout(gun);

            // [2] fails to decrypt
            await GunUser.login(creds[2], gun);
            let error: any;
            try {
                await decrypt(encFor1, {
                    pair: GunUser.pair(gun),
                    sender: { epub: epubs[0] }
                });
            } catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(Error);
        }, 40000);
    });
});
