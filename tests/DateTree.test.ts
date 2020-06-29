import { IGunChainReference } from "gun/types/chain";
import { TEST_GUN_OPTIONS } from "../src/const";
import { delay } from "../src/wait";
import Gun from "gun";
import DateTree, { DateComponents } from "../src/DateTree";
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

    let treeRoot: IGunChainReference; 
    let tree: DateTree<string>;

    beforeAll(async () => {
        gun = Gun(TEST_GUN_OPTIONS);
    });

    beforeEach(() => {
        // Use a clean node on every run
        runId = uuidv4();
        treeRoot = gun.get(runId);
        tree = new DateTree<string>(treeRoot, 'day');
    });

    afterAll(() => {
        (gun as any) = undefined;
    });

    describe('get', () => {

        it('should return the correct node with a moment', async () => {
            tree.get(moment.utc('2020-05-01')).put('test1' as never);
            tree.get(moment.utc('2021-01-03')).put('test2' as never);
            let val1 = await treeRoot.get('2020').get('05').get('01').then!();
            expect(val1).toBe('test1');
            let val2 = await treeRoot.get('2021').get('01').get('03').then!();
            expect(val2).toBe('test2');
        });

        it('should return the correct node with an ISO date string', async () => {
            tree.get('2020-05-06').put('test3' as never);
            let val1 = await treeRoot.get('2020').get('05').get('06').then!();
            expect(val1).toBe('test3');
        });
    });

    describe('getDate', () => {

        it('should return the correct date', () => {
            let ref = treeRoot.get('2020').get('05').get('01');
            ref.put({ label: 'foo' } as never);
            let date = tree.getDate(ref);
            expect(date.toISOString()).toEqual(moment.utc('2020-05-01').toISOString());
        });

        it('should match get', () => {
            let ref1 = tree.get(moment.utc('2020-05-07'));
            let date = tree.getDate(ref1);
            let ref2 = tree.get(date);
            expect(ref2).toStrictEqual(ref1);
        });
    });

    describe('on', () => {

        describe('no filter', () => {

            it('should callback with all the data', done => {
                tree.get('2020-01-03').put('foo');
                tree.get('2020-01-06').put('bar');
                tree.get('2020-01-10').put('gaz');

                let dateFormat = 'YYYY-MM-DD';
                let cbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (Object.keys(cbTable).length === 3) {
                        expect(cbTable).toMatchObject({
                            '2020-01-03': 'foo',
                            '2020-01-06': 'bar',
                            '2020-01-10': 'gaz',
                        });
                        done();
                    }
                });
            });

            it('should not callback after off', async (done) => {
                let dateFormat = 'YYYY-MM-DD';

                let cbTable: any = {};
                tree.on((data, date, at, sub) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (key === '2020-01-03') {
                        sub.off();
                    }
                });

                let allCbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    allCbTable[key] = data;
                    if (Object.keys(allCbTable).length === 3) {
                        expect(cbTable).toMatchObject({
                            '2020-01-03': 'foo',
                        });
                        done();
                    }
                });

                tree.get('2020-01-03').put('foo');
                await delay(100);
                tree.get('2020-01-06').put('bar');
                await delay(100);
                tree.get('2020-01-10').put('gaz');
            }, 40000);
        });

        describe('with filter', () => {

            it('should callback with all the data with super set range', done => {
                tree.get('2020-01-03').put('foo');
                tree.get('2020-01-06').put('bar');
                tree.get('2020-01-10').put('gaz');

                let dateFormat = 'YYYY-MM-DD';
                let cbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (Object.keys(cbTable).length === 3) {
                        expect(cbTable).toMatchObject({
                            '2020-01-03': 'foo',
                            '2020-01-06': 'bar',
                            '2020-01-10': 'gaz',
                        });
                        done();
                    }
                }, { gte: '2020-01-03' });
            });

            it('should not callback after off', async (done) => {
                let dateFormat = 'YYYY-MM-DD';

                let cbTable: any = {};
                tree.on((data, date, at, sub) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (key === '2020-01-03') {
                        sub.off();
                    }
                }, { gte: '2020-01-03' });

                let allCbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    allCbTable[key] = data;
                    if (Object.keys(allCbTable).length === 3) {
                        expect(cbTable).toMatchObject({
                            '2020-01-03': 'foo',
                        });
                        done();
                    }
                }, { gte: '2020-01-03' });

                tree.get('2020-01-03').put('foo');
                await delay(100);
                tree.get('2020-01-06').put('bar');
                await delay(100);
                tree.get('2020-01-10').put('gaz');
            }, 40000);

            it('should callback with filtered data', done => {
                tree.get('2020-01-03').put('foo');
                tree.get('2020-02-04').put('bar1');
                tree.get('2020-02-09').put('bar2');
                tree.get('2020-03-10').put('gaz');

                let dateFormat = 'YYYY-MM-DD';
                let cbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (Object.keys(cbTable).length === 2) {
                        expect(cbTable).toMatchObject({
                            '2020-02-04': 'bar1',
                            '2020-02-09': 'bar2',
                        });
                        done();
                    }
                }, { gt: '2020-01-03', lt: '2020-03-10' });
            });
        });
    });

    describe('changesAbout', () => {

        it('should callback with changes', async () => {
            let compsStack: DateComponents[] = [];
            tree.changesAbout(
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
            let promises = dates.map(d => tree.get(moment.utc(d)).put('a' as never).then!())
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

        it('should not callback after unsubscribe', async (done) => {
            let keys = new Set<string>();
            let sub = tree.changesAbout('2020-01-04', comps => {
                let key = DateTree.dateComponentsToString(comps);
                expect(key).toMatch(/2020-01.*/);
                keys.add(key);
            });

            let queue = [
                '2020-01-05',
                '2020-01-06',
                '2020-02-01',
                '2020-02-03',
            ];
            tree.changesAbout('2020-01-04', comps => {
                if (queue.length !== 0) {
                    let date = queue.shift()!;
                    if (date === '2020-01-06') {
                        sub.off();
                    }
                    tree.get(date).put('a');
                } else {
                    expect(Array.from(keys).sort()).toEqual([
                        '2020-01-05',
                        '2020-01-06'
                    ]);
                    done();
                }
            });

            tree.get(queue.shift()!).put('a');
        }, 40000);
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
                let ref = tree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should iterate over refs in date range without order', async () => {
            let it = tree.iterate({
                gte: moment.utc('2010-11-30'),
                lt: moment.utc('2011-01-04'),
            });
            let refs: any[] = [];
            let dates: any[] = [];
            for await (let [ref, date] of it) {
                refs.push(ref);
                dates.push(date.format('YYYY-MM-DD'));
            }

            // Check dates in ascending order
            let expectedData = _.omit(data, [
                '2010-10-20',
                '2011-01-04',
            ]);
            expect([...dates].sort()).toEqual(Object.keys(expectedData).sort());

            // Check refs
            for (let [ref, date] of _.zip(refs, dates)) {
                let value = await ref.then!();
                expect(value).toBe(data[date]);
            }
        });

        it('should iterate over refs in date range in order', async () => {
            let it = tree.iterate({
                gte: moment.utc('2010-11-30'),
                lt: moment.utc('2011-01-04'),
                order: 1,
            });
            let refs: any[] = [];
            let dates: any[] = [];
            for await (let [ref, date] of it) {
                refs.push(ref);
                dates.push(date.format('YYYY-MM-DD'));
            }

            // Check dates in ascending order
            let expectedData = _.omit(data, [
                '2010-10-20',
                '2011-01-04',
            ]);
            expect(dates).toEqual(Object.keys(expectedData).sort());

            // Check refs
            for (let [ref, date] of _.zip(refs, dates)) {
                let value = await ref.then!();
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
                let ref = tree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the first ref without a date', async () => {
            let [next, nextDate] = await tree.next();
            expect(next).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return the first ref with a date lower than the first date', async () => {
            let date = moment.utc('2010-10-19');
            let [next, nextDate] = await tree.next(date);
            expect(next).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return the next ref with a date', async () => {
            let date = moment.utc('2012-10-20');
            let [next, nextDate] = await tree.next(date);
            expect(next).toBeTruthy();
            expect(nextDate?.format('YYYY-MM-DD')).toBe('2012-11-30');
        });

        it('should return nothing at the end date', async () => {
            let date = moment.utc('2012-12-07');
            let [next, nextDate] = await tree.next(date);
            expect(next).toBeFalsy();
            expect(nextDate).toBeFalsy();
        });

        it('should return nothing after the end date', async () => {
            let date = moment.utc('2012-12-08');
            let [next, nextDate] = await tree.next(date);
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
                let ref = tree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the last ref without a date', async () => {
            let [previous, previousDate] = await tree.previous();
            expect(previous).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2012-12-07');
        });

        it('should return the last ref with a date higher than the last date', async () => {
            let date = moment.utc('2012-12-08');
            let [previous, previousDate] = await tree.previous(date);
            expect(previous).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2012-12-07');
        });

        it('should return the previous ref with a date', async () => {
            let date = moment.utc('2012-10-20');
            let [previous, previousDate] = await tree.previous(date);
            expect(previous).toBeTruthy();
            expect(previousDate?.format('YYYY-MM-DD')).toBe('2010-10-20');
        });

        it('should return nothing at the start date', async () => {
            let date = moment.utc('2010-10-20');
            let [previous, previousDate] = await tree.previous(date);
            expect(previous).toBeFalsy();
            expect(previousDate).toBeFalsy();
        });

        it('should return nothing before the start date', async () => {
            let date = moment.utc('2010-10-19');
            let [previous, previousDate] = await tree.previous(date);
            expect(previous).toBeFalsy();
            expect(previousDate).toBeFalsy();
        });
    });

    describe('latest', () => {

        let data = {
            '2012-11-30': 'a',
            '2012-12-05': 'b',
        }

        beforeEach(async () => {
            // Add data to graph
            let promises: any[] = [];
            _.forIn(data, (value, dateStr) => {
                let date = moment.utc(dateStr);
                let ref = tree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the latest date', async () => {
            let [latest, latestDate] = await tree.latest();
            expect(latest).toBeTruthy();
            expect(latestDate?.format('YYYY-MM-DD')).toBe('2012-12-05');
        });
    });

    describe('latest with native date', () => {

        let now = new Date();
        let nowMoment = moment(now);

        beforeEach(async () => {
            // Add data to graph
            await Promise.all([
                tree.get('2012-11-30').put('a' as never).then!(),
                tree.get(now).put('b' as never).then!()
            ]);
        });

        it('should return the latest date', async () => {
            let [latest, latestDate] = await tree.latest();
            expect(latest).toBeTruthy();
            expect(latestDate?.format('YYYY-MM-DD')).toBe(nowMoment.utc().format('YYYY-MM-DD'));
        });
    });

    describe('earliest', () => {

        let data = {
            '2012-11-30': 'a',
            '2012-12-05': 'b',
        }

        beforeEach(async () => {
            // Add data to graph
            let promises: any[] = [];
            _.forIn(data, (value, dateStr) => {
                let date = moment.utc(dateStr);
                let ref = tree.get(date).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should return the earliest date', async () => {
            let [earliest, earliestDate] = await tree.earliest();
            expect(earliest).toBeTruthy();
            expect(earliestDate?.format('YYYY-MM-DD')).toBe('2012-11-30');
        });
    });
});
