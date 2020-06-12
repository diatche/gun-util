import { IGunChainReference } from "gun/types/chain";
import { TEST_GUN_OPTIONS } from "../src/gun";
import Gun from "gun";
import { DateGraph, DateComponents, iterateKeys, ALL_DATE_UNITS } from "../src";
import { gunLogOnceFix } from "../src/temp";
import moment from "moment";
import _ from "lodash";
import { v4 as uuidv4 } from 'uuid';

let gun: IGunChainReference;
let runId: string;

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

    describe('encodeDateComponent', () => {

        it('should pad with zeroes', () => {
            expect(DateGraph.encodeDateComponent(1, 'year')).toBe('0001');
            expect(DateGraph.encodeDateComponent(1, 'month')).toBe('01');
            expect(DateGraph.encodeDateComponent(1, 'day')).toBe('01');
            expect(DateGraph.encodeDateComponent(1, 'hour')).toBe('01');
            expect(DateGraph.encodeDateComponent(1, 'minute')).toBe('01');
            expect(DateGraph.encodeDateComponent(1, 'second')).toBe('01');
            expect(DateGraph.encodeDateComponent(1, 'millisecond')).toBe('001');
        });
    });
});

describe('DateGraph #', () => {
    jest.setTimeout(20000);

    let dateGraphRoot: IGunChainReference; 
    let dateGraph: DateGraph;

    beforeAll(async () => {
        gun = Gun(TEST_GUN_OPTIONS);
    });

    beforeEach(() => {
        // Use a clean node on every run
        runId = uuidv4();
        dateGraphRoot = gun.get(runId);
        dateGraph = new DateGraph(dateGraphRoot, 'day');
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('getRef', () => {

        it('should return the correct node', async () => {
            dateGraph.getRef(moment('2020-05-01')).put('test1' as never);
            dateGraph.getRef(moment('2021-01-03')).put('test2' as never);
            gunLogOnceFix();
            let val1 = await dateGraphRoot.get('2020').get('05').get('01').then!();
            expect(val1).toBe('test1');
            let val2 = await dateGraphRoot.get('2021').get('01').get('03').then!();
            expect(val2).toBe('test2');
        });
    });

    describe('iterateRefs', () => {

        // The data is in descending order intentionally
        let data: { [date: string]: string } = {
            '2011-01-04': '-',
            '2011-01-03': 'd',
            '2010-12-07': 'c',
            '2010-12-05': 'b',
            '2010-11-30': 'a',
            '2010-10-20': '-',
        }

        beforeEach(async () => {
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
            let refTable: any = {};
            let it = dateGraph.iterateRefs({
                start: moment.utc('2010-11-30'),
                end: moment.utc('2011-01-04'),
                startInclusive: true,
                endInclusive: false,
            });
            for await (let [ref, date] of it) {
                refTable[date.format('YYYY-MM-DD')] = ref;
            }

            // Check dates in ascending order
            let dates = Object.keys(refTable);
            let expectedData = _.omit(data, [
                '2010-10-20',
                '2011-01-04',
            ]);
            expect(dates).toEqual(Object.keys(expectedData).sort());

            // Check refs
            for (let date of dates) {
                let value = await refTable[date].then!();
                expect(value).toBe(data[date]);
            }
        });
    });

    describe('nextRef', () => {

        let data = {
            '2010-10-20': '-',
            '2012-10-20': '+',
            '2012-11-30': 'a',
            '2012-12-05': 'b',
            '2012-12-07': 'c',
        }

        beforeEach(async () => {
            // Add data to graph
            let promises: any[] = [];
            _.forIn(data, (value, dateStr) => {
                let date = moment.utc(dateStr);
                let ref = dateGraph.getRef(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the first ref without a date', async () => {
            let [nextRef, nextDate] = await dateGraph.nextRef();
            expect(nextRef).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return the first ref with a date lower than the first date', async () => {
            let date = moment.utc('2010-10-19');
            let [nextRef, nextDate] = await dateGraph.nextRef(date);
            expect(nextRef).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return the next ref with a date', async () => {
            let date = moment.utc('2012-10-20');
            let [nextRef, nextDate] = await dateGraph.nextRef(date);
            expect(nextRef).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2012-11-30');
        });

        it('should return nothing at the end date', async () => {
            let date = moment.utc('2012-12-07');
            let [nextRef, nextDate] = await dateGraph.nextRef(date);
            expect(nextRef).toBeFalsy();
            expect(nextDate).toBeFalsy();
        });

        it('should return nothing after the end date', async () => {
            let date = moment.utc('2012-12-08');
            let [nextRef, nextDate] = await dateGraph.nextRef(date);
            expect(nextRef).toBeFalsy();
            expect(nextDate).toBeFalsy();
        });
    });

    describe('previousRef', () => {

        let data = {
            '2010-10-20': '-',
            '2012-10-20': '+',
            '2012-11-30': 'a',
            '2012-12-05': 'b',
            '2012-12-07': 'c',
        }

        beforeEach(async () => {
            // Add data to graph
            let promises: any[] = [];
            _.forIn(data, (value, dateStr) => {
                let date = moment.utc(dateStr);
                let ref = dateGraph.getRef(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the last ref without a date', async () => {
            let [previousRef, previousDate] = await dateGraph.previousRef();
            expect(previousRef).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2012-12-07');
        });

        it('should return the last ref with a date higher than the last date', async () => {
            let date = moment.utc('2012-12-08');
            let [previousRef, previousDate] = await dateGraph.previousRef(date);
            expect(previousRef).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2012-12-07');
        });

        it('should return the previous ref with a date', async () => {
            let date = moment.utc('2012-10-20');
            let [previousRef, previousDate] = await dateGraph.previousRef(date);
            expect(previousRef).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return nothing at the start date', async () => {
            let date = moment.utc('2010-10-20');
            let [previousRef, previousDate] = await dateGraph.previousRef(date);
            expect(previousRef).toBeFalsy();
            expect(previousDate).toBeFalsy();
        });

        it('should return nothing before the start date', async () => {
            let date = moment.utc('2010-10-19');
            let [previousRef, previousDate] = await dateGraph.previousRef(date);
            expect(previousRef).toBeFalsy();
            expect(previousDate).toBeFalsy();
        });
    });
});
