import { IGunChainReference } from "gun/types/chain";
import { TEST_GUN_OPTIONS } from "../src/gun";
import Gun from "gun";
import { DateGraph, DateComponents } from "../src";
import { gunLogOnceFix } from "../src/temp";
import moment from "moment";
import _ from "lodash";

let gun: IGunChainReference;

describe('DateGraph', () => {

    describe('getDateComponents', () => {

        it('should return date components', () => {
            let date = moment.utc('1995-12-17T03:24:02.456');
            let comps = DateGraph.getDateComponents(date, 'millisecond');
            expect(comps).toMatchObject({
                'year': 1995,
                'month': 12,
                'day': 17,
                'hour': 3,
                'minute': 24,
                'second': 2,
                'millisecond': 456,
            } as DateComponents);
        });
    });

    describe('getDateWithComponents', () => {

        it('should return the date', () => {
            let comps = {
                'year': 1995,
                'month': 12,
                'day': 17,
                'hour': 3,
                'minute': 24,
                'second': 2,
                'millisecond': 456,
            };
            let date = DateGraph.getDateWithComponents(comps);
            expect(date.toISOString()).toBe('1995-12-17T03:24:02.456Z');
        });
    });
});

describe('DateGraph #', () => {
    jest.setTimeout(20000);

    let dateGraphRoot: IGunChainReference; 
    let dateGraph: DateGraph;

    beforeAll(async () => {
        gun = Gun(TEST_GUN_OPTIONS);
        dateGraphRoot = gun.get('dg1');
        dateGraph = new DateGraph(dateGraphRoot, 'day');
    });

    // afterEach(async () => {
    //     // Reset graph
    //     await dateGraphRoot.put(null as never).then!();
    // });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('getRef', () => {

        it('should return the correct node', async () => {
            dateGraph.getRef(moment('2020-05-01')).put('test1' as never);
            dateGraph.getRef(moment('2021-01-03')).put('test2' as never);
            gunLogOnceFix();
            let val1 = await dateGraphRoot.get('2020').get('5').get('1').then!();
            expect(val1).toBe('test1');
            let val2 = await dateGraphRoot.get('2021').get('1').get('3').then!();
            expect(val2).toBe('test2');
        });
    });

    describe('iterateRefs', () => {

        let data = {
            '2010-10-20': '-',
            '2010-11-30': 'a',
            '2010-12-05': 'b',
            '2010-12-07': 'c',
            '2011-01-03': 'd',
            '2011-01-04': '-',
        }

        beforeAll(async () => {
            // Add data to graph
            let promises: any[] = [];
            _.forIn(data, (value, dateStr) => {
                let date = moment.utc(dateStr);
                let ref = dateGraph.getRef(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should iterate over refs in date range', async () => {
            let dates: string[] = [];
            let it = dateGraph.iterateRefs({
                start: moment.utc('2010-11-30'),
                end: moment.utc('2011-01-04'),
            });
            for await (let [ref, date] of it) {
                dates.push(date.format('YYYY-MM-DD'));
            }
            dates = dates.sort();
            let expectedData = _.omit(data, [
                '2010-10-20',
                '2011-01-04',
            ]);
            expect(dates).toEqual(Object.keys(expectedData));
        });
    });
});
