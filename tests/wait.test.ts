import {
    waitForData,
    delay
} from '../src/wait';
import { TEST_GUN_OPTIONS } from '../src/const';
import { IGunChainReference } from 'gun/types/chain';
import _ from 'lodash';
import Gun from 'gun';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

let gun: IGunChainReference;
let runRef: IGunChainReference;
let runId: string;

describe('wait', () => {

    describe('delay', () => {

        it('should resolve after delay', async () => {
            let t0 = moment();
            let x = await delay(100, 'foo');
            let t1 = moment();
            let e = t1.valueOf() - t0.valueOf() - 100;
            expect(e).toBeGreaterThanOrEqual(0);
            expect(x).toEqual('foo');
        });
    });
});

describe('wait with Gun', () => {
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

    describe('waitForData', () => {

        it('should return on any data by default', async () => {
            let x = runRef.get('x');
            let promise = waitForData(x);
            let result: any;
            promise.then(data => {
                result = data;
            });
            expect(result).toBeUndefined();
            x.put('' as never);
            await promise;
            expect(result).toStrictEqual('');
        });

        it('should return on filtered data', async () => {
            let x = runRef.get('x');
            let promise = waitForData(x, data => data === 'foo');
            let result: any;
            promise.then(data => {
                result = data;
            });
            expect(result).toBeUndefined();
            x.put('test' as never);
            x.put('foo' as never);
            await promise;
            expect(result).toStrictEqual('foo');
        });
    });
});
