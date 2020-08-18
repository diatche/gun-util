import './testSetup';
import {
    subscribe,
} from '../src/subscription';
import { TEST_GUN_OPTIONS } from '../src/const';
import { IGunChainReference, Gun } from '../src/gun/types';
import { v4 as uuidv4 } from 'uuid';

let gun: IGunChainReference;
let runRef: IGunChainReference;
let runId: string;

describe('subscription', () => {
    jest.setTimeout(20000);

    beforeAll(() => {
        gun = Gun(TEST_GUN_OPTIONS);
    });

    beforeEach(() => {
        // Use a clean node on every run
        runId = 'test-' + uuidv4();
        runRef = gun.get(runId);
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('subscribe', () => {

        it('should unsubscribe only one listener', done => {
            expect.assertions(2);

            let ref = runRef.get('x');

            let data1 = new Set<string>();
            let sub1 = subscribe(ref, data => {
                data1.add(data);
            });

            let data2 = new Set<string>();
            let sub2 = subscribe(ref, data => {
                data2.add(data);
                if (data2.size === 3) {
                    expect([...data1]).toEqual(['a']);
                    expect([...data2].sort()).toEqual(['a', 'b', 'c']);
                    done();
                }
            });

            ref.put('a' as never);
            sub1.off();
            ref.put('b' as never);
            ref.put('c' as never);
        });
    });
});
