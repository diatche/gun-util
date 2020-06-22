import {
    iterateRecord,
    iterateValues,
    iterateKeys,
    IterateOptions,
    iterateAll,
} from '../src/iterate';
import { TEST_GUN_OPTIONS } from '../src/const';
import { IGunChainReference } from 'gun/types/chain';
import _ from 'lodash';
import Gun from 'gun';
import { v4 as uuidv4 } from 'uuid';

interface Item {
    name: string;
}

interface State {
    [key: string]: RunState;
}

interface RunState {
    items: {
        [key: string]: Item
    };
    strings: {
        [key: string]: string
    };
    empty: any;
}

let gun: IGunChainReference<State>;
let runRef: IGunChainReference<RunState>;
let runId: string;

describe('iterate *', () => {
    jest.setTimeout(20000);

    beforeAll(() => {
        gun = Gun<State>(TEST_GUN_OPTIONS);
    });

    beforeEach(() => {
        // Use a clean node on every run
        runId = uuidv4();
        runRef = gun.get(runId) as any;
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('iterateRecord without order', () => {

        let scanRef: any;
        let data = {
            bar: 'bar1',
            foo: 'foo1',
            gaz: 'gaz1',
        };

        beforeAll(async () => {
            // Use a clean node on every run
            scanRef = gun.get(uuidv4());
            let promises: any[] = [];
            _.forIn(data, (v, k) => {
                let promise = scanRef.get('strings').get(k).put(v).then!();
                promises.push(promise);
            });
            await Promise.all(promises);
        });

        it('should scan all items', async () => {
            let stringsRef = scanRef.get('strings');
            let expectedItems = _.toPairs(data).map(x => x.reverse());
            expectedItems = _.sortBy(expectedItems, [0]);
            let its = await iterateAll(iterateRecord(stringsRef, { order: 0 }));
            its = _.sortBy(its, [0]);
            expect(its).toEqual(expectedItems);
        });

        it('should support lexical filtering', async () => {
            let stringsRef = scanRef.get('strings');
            let filteredStringsRef = stringsRef.get({
                '.': {
                    '*': 'f'
                }
            } as any);
            let its = await iterateAll(iterateRecord(filteredStringsRef, { order: 0 }));
            its = _.sortBy(its, [0]);
            expect(its).toEqual([['foo1', 'foo']]);
        });
    });

    describe('iterateKeys with order', () => {

        it('should iterate all keys once in natural direction', async () => {
            let stringsRef = runRef.get('strings');

            let names = ['bar', 'foo', 'gaz'];
            for (let name of names) {
                stringsRef.get(name).put(name + '1');
            }

            let its = await iterateAll(iterateKeys(stringsRef, { order: 1 }));
            expect(its).toEqual(names);
        });

        it('should iterate and filter in natural direction', async () => {
            let opts: IterateOptions = {
                gte: 'foo',
                lte: 'gaz',
                order: 1,
            }
            let stringsRef = runRef.get('strings');

            let names = ['bar', 'foo', 'fooB', 'gaz', 'gazB'];
            let expectedItems: string[] = [];
            for (let name of names) {
                expectedItems.push(name);
                stringsRef.get(name).put(name + '1');
            }

            let itsIncInc = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsIncInc).toEqual(_.without(expectedItems, 'bar', 'gazB'));

            // Check start exclusive, end inclusive
            opts = {
                gt: 'foo',
                lte: 'gaz',
                order: 1,
            }
            let itsExInc = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExInc).toEqual(_.without(expectedItems, 'bar', 'foo', 'gazB'));

            // Check start exclusive, end exclusive
            opts = {
                gt: 'foo',
                lt: 'gaz',
                order: 1,
            }
            let itsExEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExEx).toEqual(_.without(expectedItems, 'bar', 'foo', 'gaz', 'gazB'));

            // Check start inclusive, end exclusive
            opts = {
                gte: 'foo',
                lt: 'gaz',
                order: 1,
            }
            let itsIncEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsIncEx).toEqual(_.without(expectedItems, 'bar', 'gaz', 'gazB'));
        });

        it('should iterate all keys once in reverse direction', async () => {
            let opts: IterateOptions = {
                order: -1,
            }
            let stringsRef = runRef.get('strings');

            let names = ['bar', 'foo', 'gaz'];
            let expectedItems: string[] = [];
            for (let name of names) {
                expectedItems.unshift(name);
                stringsRef.get(name).put(name + '1');
            }

            let its = await iterateAll(iterateKeys(stringsRef, opts));
            expect(its).toEqual(expectedItems);
        });

        it('should iterate and filter in reverse direction', async () => {
            let opts: IterateOptions = {
                gte: 'foo',
                lte: 'gaz',
                order: -1,
            }
            let stringsRef = runRef.get('strings');

            let names = ['bar', 'foo', 'fooB', 'gaz', 'gazB'];
            let expectedItems: string[] = [];
            for (let name of names) {
                expectedItems.unshift(name);
                stringsRef.get(name).put(name + '1');
            }

            let itsIncInc = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsIncInc).toEqual(_.without(expectedItems, 'bar', 'gazB'));

            // Check start exclusive, end inclusive
            opts = {
                gt: 'foo',
                lte: 'gaz',
                order: -1,
            }
            let itsExInc = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExInc).toEqual(_.without(expectedItems, 'bar', 'foo', 'gazB'));

            // Check start exclusive, end exclusive
            opts = {
                gt: 'foo',
                lt: 'gaz',
                order: -1,
            }
            let itsExEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExEx).toEqual(_.without(expectedItems, 'bar', 'foo', 'gaz', 'gazB'));

            // Check start inclusive, end exclusive
            opts = {
                gte: 'foo',
                lt: 'gaz',
                order: -1,
            }
            let itsIncEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsIncEx).toEqual(_.without(expectedItems, 'bar', 'gaz', 'gazB'));
        });

        it('should yield nothing on an empty node', async () => {
            let ref = runRef.get('empty');
            let vals = await iterateAll(iterateKeys(ref, { order: 1 }));
            expect(vals).toEqual([]);
        });

        it('should yield nothing on a nulled node', async () => {
            let ref = runRef.get('empty');
            await ref.put(null as never).then!();
            let vals = await iterateAll(iterateKeys(ref, { order: 1 }));
            expect(vals).toEqual([]);
        });

        it('should not work with lexical filtering', async () => {
            let stringsRef = runRef.get('strings');

            let names = ['bar', 'foo', 'gaz'];
            for (let name of names) {
                stringsRef.get(name).put(name + '1');
            }

            // The filter should do nothing as its
            // not supported
            let filteredRef = stringsRef.get({
                '.': {
                    '*': 'f'
                }
            } as any);
            let its = await iterateAll(iterateKeys(filteredRef as any, { order: 1 }));
            expect(its).toEqual(names);
        });
    });

    describe('iterateValues with order', () => {

        it('should iterate all primitives once', async () => {
            let stringsRef = runRef.get('strings');

            let names = ['bar', 'foo', 'gaz'];
            let expectedItems: string[] = [];
            for (let name of names) {
                let item = name + '1';
                expectedItems.push(item);
                stringsRef.get(name).put(item);
            }

            let its = await iterateAll(iterateValues(stringsRef, { order: 1 }));
            expect(its).toEqual(expectedItems);
        });

        it('should iterate all records once', async () => {
            let itemsRef = runRef.get('items');

            let names = ['bar', 'foo', 'gaz'];
            let expectedItems: Item[] = [];
            for (let name of names) {
                let item = { name };
                itemsRef.get(name).put(item as never);
                expectedItems.push(item);
            }

            let its = await iterateAll(iterateValues(itemsRef, { order: 1 }));
            expect(its.map(x => _.omit(x, '_'))).toEqual(expectedItems);
        });
    });
});
