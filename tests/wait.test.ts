import './testSetup';
import {
    waitForData,
    delay,
    errorAfter,
} from '../src/wait';
import { TEST_GUN_OPTIONS } from '../src/const';
import { IGunChainReference, Gun } from '../src/gun/types';
import _ from 'lodash';
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
            let promise = waitForData(x, {
                filter: data => data === 'foo'
            });
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

    describe('errorAfter', () => {

        it('should throw an error when the interval has passed', async () => {
            let tStart = moment();
            let error: Error | undefined;
            let expectedError = new Error('test');
            try {
                await errorAfter(50, expectedError);
            } catch (err) {
                error = err;
            }
            let tEnd = moment();
            expect(error).toStrictEqual(expectedError);
            expect(tEnd.valueOf() - tStart.valueOf()).toBeGreaterThanOrEqual(50);
        });

        it('should not throw when cancelled', async () => {
            let tStart = moment();
            let val = await Promise.race([
                delay(10, 'a'),
                errorAfter(50, new Error('test')),
            ]);
            expect(val).toBe('a');
            await delay(50);
            let tEnd = moment();
            expect(tEnd.valueOf() - tStart.valueOf()).toBeGreaterThanOrEqual(10);
        });
    });
});
