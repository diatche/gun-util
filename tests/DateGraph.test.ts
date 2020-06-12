import { IGunChainReference } from "gun/types/chain";
import { TEST_GUN_OPTIONS } from "../src/gun";
import Gun from "gun";
import { DateTree, DateComponents, iterateKeys, ALL_DATE_UNITS } from "../src";
import { gunLogOnceFix } from "../src/temp";
import moment from "moment";
import _ from "lodash";
import { v4 as uuidv4 } from 'uuid';

let gun: IGunChainReference;
let runId: string;

describe('DateTree', () => {

    describe('getDateComponents', () => {

        it('should return date components', () => {
            let date = moment.utc('1995-12-17T03:24:02.456');
            let comps = DateTree.getDateComponents(date, 'millisecond');
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
            let date = DateTree.getDateWithComponents(comps);
            expect(date.toISOString()).toBe('1995-12-17T03:24:02.456Z');
        });
    });

    describe('encodeDateComponent', () => {

        it('should pad with zeroes', () => {
            expect(DateTree.encodeDateComponent(1, 'year')).toBe('0001');
            expect(DateTree.encodeDateComponent(1, 'month')).toBe('01');
            expect(DateTree.encodeDateComponent(1, 'day')).toBe('01');
            expect(DateTree.encodeDateComponent(1, 'hour')).toBe('01');
            expect(DateTree.encodeDateComponent(1, 'minute')).toBe('01');
            expect(DateTree.encodeDateComponent(1, 'second')).toBe('01');
            expect(DateTree.encodeDateComponent(1, 'millisecond')).toBe('001');
        });
    });
});

describe('DateTree #', () => {
    jest.setTimeout(20000);

    let DateTreeRoot: IGunChainReference; 
    let DateTree: DateTree;

    beforeAll(async () => {
        gun = Gun(TEST_GUN_OPTIONS);
    });

    beforeEach(() => {
        // Use a clean node on every run
        runId = uuidv4();
        DateTreeRoot = gun.get(runId);
        DateTree = new DateTree(DateTreeRoot, 'day');
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('changesAbout', () => {

        it('should callback with changes', async () => {
            let compsStack: DateComponents[] = [];
            DateTree.changesAbout(
                moment.utc('2020-01-04'),
                comps => compsStack.push(comps),
            )
            let dates = [
                '2020-01-03',
                '2020-01-04',
                '2020-01-05',
                '2020-01-06',
                '2020-02-01',
                '2020-02-02',
                '2021-01-01',
                '2021-01-02',
            ];
            let promises = dates.map(d => DateTree.put(moment.utc(d), 'a').then!())
            await Promise.all(promises);
            let receivedDates = compsStack
                .map(c => DateTree.getDateWithComponents(c).format('YYYY-MM-DD'))
                .sort();
            receivedDates = _.uniq(receivedDates);
            expect(receivedDates).toEqual([
                '2020-01-03',
                '2020-01-05',
                '2020-01-06',
                '2020-02-01',
                '2021-01-01',
            ]);
        });

        it('should not callback after unsubscribe', async () => {
            let compsStack: DateComponents[] = [];
            let off = DateTree.changesAbout(
                moment.utc('2020-01-04'),
                comps => compsStack.push(comps),
            )
            let dates = [
                '2020-01-05',
                '2020-01-06',
                '2020-02-01',
            ];
            for (let date of dates) {
                await DateTree.put(moment.utc(date), 'a').then!()
                if (date === '2020-01-06') {
                    off();
                }
            }
            let receivedDates = compsStack
                .map(c => DateTree.getDateWithComponents(c).format('YYYY-MM-DD'))
                .sort();
            receivedDates = _.uniq(receivedDates);
            expect(receivedDates).toEqual([
                '2020-01-05',
                '2020-01-06',
            ]);
        });
    });

    describe('get', () => {

        it('should return the correct node', async () => {
            DateTree.get(moment('2020-05-01')).put('test1' as never);
            DateTree.get(moment('2021-01-03')).put('test2' as never);
            gunLogOnceFix();
            let val1 = await DateTreeRoot.get('2020').get('05').get('01').then!();
            expect(val1).toBe('test1');
            let val2 = await DateTreeRoot.get('2021').get('01').get('03').then!();
            expect(val2).toBe('test2');
        });
    });

    describe('iterate', () => {

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
                let ref = DateTree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should iterate over refs in date range', async () => {
            let refTable: any = {};
            let it = DateTree.iterate({
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

    describe('next', () => {

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
                let ref = DateTree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the first ref without a date', async () => {
            let [next, nextDate] = await DateTree.next();
            expect(next).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return the first ref with a date lower than the first date', async () => {
            let date = moment.utc('2010-10-19');
            let [next, nextDate] = await DateTree.next(date);
            expect(next).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return the next ref with a date', async () => {
            let date = moment.utc('2012-10-20');
            let [next, nextDate] = await DateTree.next(date);
            expect(next).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2012-11-30');
        });

        it('should return nothing at the end date', async () => {
            let date = moment.utc('2012-12-07');
            let [next, nextDate] = await DateTree.next(date);
            expect(next).toBeFalsy();
            expect(nextDate).toBeFalsy();
        });

        it('should return nothing after the end date', async () => {
            let date = moment.utc('2012-12-08');
            let [next, nextDate] = await DateTree.next(date);
            expect(next).toBeFalsy();
            expect(nextDate).toBeFalsy();
        });
    });

    describe('previous', () => {

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
                let ref = DateTree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the last ref without a date', async () => {
            let [previous, previousDate] = await DateTree.previous();
            expect(previous).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2012-12-07');
        });

        it('should return the last ref with a date higher than the last date', async () => {
            let date = moment.utc('2012-12-08');
            let [previous, previousDate] = await DateTree.previous(date);
            expect(previous).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2012-12-07');
        });

        it('should return the previous ref with a date', async () => {
            let date = moment.utc('2012-10-20');
            let [previous, previousDate] = await DateTree.previous(date);
            expect(previous).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return nothing at the start date', async () => {
            let date = moment.utc('2010-10-20');
            let [previous, previousDate] = await DateTree.previous(date);
            expect(previous).toBeFalsy();
            expect(previousDate).toBeFalsy();
        });

        it('should return nothing before the start date', async () => {
            let date = moment.utc('2010-10-19');
            let [previous, previousDate] = await DateTree.previous(date);
            expect(previous).toBeFalsy();
            expect(previousDate).toBeFalsy();
        });
    });
});
