import { iterateValues, iterateKeys, IterateOptions, iterateAll } from '../src/iterate';
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

describe('iterate #', () => {
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
        gun.opt({
            ...TEST_GUN_OPTIONS,
            multicast: false,
        });
        (gun as any) = undefined;
    });

    describe('iterateKeys', () => {

        it('should iterate all keys once in natural direction', async () => {
            let stringsRef = runRef.get('strings');
            
            let names = ['bar', 'foo', 'gaz'];
            for (let name of names) {
                stringsRef.get(name).put(name + '1');
            }
    
            let its = await iterateAll(iterateKeys(stringsRef));
            expect(its).toEqual(names);
        });

        it('should iterate and filter in natural direction', async () => {
            let opts: IterateOptions = {
                start: 'foo',
                end: 'gaz',
                startInclusive: true,
                endInclusive: true,
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
            opts.startInclusive = false;
            opts.endInclusive = true;
            let itsExInc = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExInc).toEqual(_.without(expectedItems, 'bar', 'foo', 'gazB'));

            // Check start exclusive, end exclusive
            opts.startInclusive = false;
            opts.endInclusive = false;
            let itsExEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExEx).toEqual(_.without(expectedItems, 'bar', 'foo', 'gaz', 'gazB'));

            // Check start inclusive, end exclusive
            opts.startInclusive = true;
            opts.endInclusive = false;
            let itsIncEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsIncEx).toEqual(_.without(expectedItems, 'bar', 'gaz', 'gazB'));

            // Check defaults are include start and exclude end
            delete opts.startInclusive;
            delete opts.endInclusive;
            let itsDefault = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsDefault).toEqual(itsIncEx);
        });

        it('should iterate all keys once in reverse direction', async () => {
            let opts: IterateOptions = {
                reverse: true,
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
                start: 'foo',
                end: 'gaz',
                startInclusive: true,
                endInclusive: true,
                reverse: true,
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
            opts.startInclusive = false;
            opts.endInclusive = true;
            let itsExInc = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExInc).toEqual(_.without(expectedItems, 'bar', 'foo', 'gazB'));

            // Check start exclusive, end exclusive
            opts.startInclusive = false;
            opts.endInclusive = false;
            let itsExEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsExEx).toEqual(_.without(expectedItems, 'bar', 'foo', 'gaz', 'gazB'));

            // Check start inclusive, end exclusive
            opts.startInclusive = true;
            opts.endInclusive = false;
            let itsIncEx = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsIncEx).toEqual(_.without(expectedItems, 'bar', 'gaz', 'gazB'));

            // Check defaults are include start and exclude end
            delete opts.startInclusive;
            delete opts.endInclusive;
            let itsDefault = await iterateAll(iterateKeys(stringsRef, opts));
            expect(itsDefault).toEqual(itsIncEx);
        });

        it('should yield nothing on an empty node', async () => {
            let ref = runRef.get('empty');
            let vals = await iterateAll(iterateKeys(ref));
            expect(vals).toEqual([]);
        });

        it('should yield nothing on a nulled node', async () => {
            let ref = runRef.get('empty');
            await ref.put(null as never).then!();
            let vals = await iterateAll(iterateKeys(ref));
            expect(vals).toEqual([]);
        });
    });

    describe('iterateValues', () => {
    
        it('should iterate all primitives once', async () => {
            let stringsRef = runRef.get('strings');
            
            let names = ['bar', 'foo', 'gaz'];
            let expectedItems: string[] = [];
            for (let name of names) {
                let item = name + '1';
                expectedItems.push(item);
                stringsRef.get(name).put(item);
            }
    
            let its = await iterateAll(iterateValues(stringsRef));
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
    
            let its = await iterateAll(iterateValues(itemsRef));
            expect(its.map(x => _.omit(x, '_'))).toEqual(expectedItems);
        });
    });
});
