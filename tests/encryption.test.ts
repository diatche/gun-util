import { encrypt, decrypt } from '../src/encryption';
import { TEST_GUN_OPTIONS } from '../src/const';
import { IGunChainReference } from 'gun/types/chain';
import _ from 'lodash';
import Gun from 'gun';
import { v4 as uuidv4 } from 'uuid';
import Auth from '../src/Auth';

interface State {
    [key: string]: UserState;
}

interface UserState {
    [key: string]: string
}

let gun: IGunChainReference<State>;
let auth: Auth;
let userRef: IGunChainReference<UserState>;
let runId: string;

const newCreds = () => {
    return {
        alias: 'test-' + uuidv4(),
        pass: uuidv4()
    };
};

describe('encryption', () => {
    jest.setTimeout(20000);

    beforeAll(() => {
        gun = Gun<State>(TEST_GUN_OPTIONS);
        auth = new Auth(gun);
    });

    beforeEach(async () => {
        // Use a clean node on every run
        runId = 'test-' + uuidv4();
    });

    afterEach(() => {
        auth.logout();
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('encrypt/decrypt', () => {

        it('should encrypt/decrypt a value', async () => {
            await auth.create(newCreds());
            let enc = await encrypt('a@a.com', { pair: auth.pair()! });
            expect(enc).toMatch(/^SEA\{.*\}$/g);
            let dec = await decrypt(enc, { pair: auth.pair()! });
            expect(dec).toEqual('a@a.com');
        });

        it('should encrypt/decrypt an object', async () => {
            let pub = await auth.create(newCreds());
            userRef = gun.user(pub) as any;
            let orig = Gun.node.ify({ a: 'a1', b: 'b1' });
            let enc = await encrypt(orig, { pair: auth.pair()! });
            expect(Object.keys(enc).length).toBe(3);
            expect(enc.a).toMatch(/^SEA\{.*\}$/g);
            expect(enc.b).toMatch(/^SEA\{.*\}$/g);
            expect(await decrypt(enc, { pair: auth.pair()! })).toMatchObject(orig);
        });

        it('should encrypt/decrypt a value for another user', async () => {
            // Create all users and get epubs
            let creds = ['1', '2', '3'].map(x => ({ alias: runId + x, pass: 'bar' }));
            let pubs: string[] = [];
            for (let cred of creds) {
                let pub = await auth.create(cred)
                auth.logout();
                pubs.push(pub);
            }
            let epubs: string[] = await Promise.all(
                pubs.map(pub => gun.user(pub).get('epub').then!())
            ) as any;

            // [0] encrypts email for [1]
            await auth.login(creds[0]);
            let encFor1 = await encrypt('a@a.com', {
                pair: auth.pair()!,
                recipient: { epub: epubs[1] }
            });
            expect(encFor1).toMatch(/^SEA\{.*\}$/g);
            auth.logout();

            // [1] decrypts
            await auth.login(creds[1]);
            let dec1 = await decrypt(encFor1, {
                pair: auth.pair()!,
                sender: { epub: epubs[0] }
            });
            expect(dec1).toBe('a@a.com');
            auth.logout();

            // [2] fails to decrypt
            await auth.login(creds[2]);
            let error: any;
            try {
                await decrypt(encFor1, {
                    pair: auth.pair()!,
                    sender: { epub: epubs[0] }
                });
            } catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(Error);
        }, 60000);
    });
});
