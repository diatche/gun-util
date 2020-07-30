import { IGunChainReference } from "gun/types/chain";
import { TEST_GUN_OPTIONS } from "../src/const";
import { delay } from "../src/wait";
import Gun from "gun";
import DateTree, { DateComponents } from "../src/DateTree";
import moment from "moment";
import _ from "lodash";
import { v4 as uuidv4 } from 'uuid';
import { iterateAll } from "../src/iterate";

let gun: IGunChainReference;
let runId: string;

describe('DateTree', () => {

    describe('parseDate', () => {

        it('should parse a moment with time zone', () => {
            let date = moment('2020-06-03T15:01:02.003+10:00');
            expect(DateTree.parseDate(date).toISOString()).toEqual('2020-06-03T05:01:02.003Z');
        });

        it('should parse a partial string in the current time zone', () => {
            let date = moment('2020-06-03');
            let dateStr = date.format('YYYY-MM-DD');
            let utcStr = date.utc().toISOString();
            expect(DateTree.parseDate(dateStr).toISOString()).toEqual(utcStr);
        });
    });

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

        it('should shift date components by time zone', () => {
            let date = moment('1995-12-17T15:01:02.003+10:00');
            let comps = DateTree.getDateComponents(date, 'millisecond');
            expect(comps).toMatchObject({
                'year': 1995,
                'month': 12,
                'day': 17,
                'hour': 5,
                'minute': 1,
                'second': 2,
                'millisecond': 3,
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

    let root: IGunChainReference;
    let treeRoot: IGunChainReference;
    let tree: DateTree<string>;

    beforeAll(async () => {
        gun = Gun(TEST_GUN_OPTIONS);
    });

    beforeEach(() => {
        // Use a clean node on every run
        runId = 'test-' + uuidv4();
        root = gun.get(runId);
        treeRoot = gun.get(runId).get('tree');
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
            tree.get('2020-05-06T00:00:00Z').put('test3' as never);
            let val1 = await treeRoot.get('2020').get('05').get('06').then!();
            expect(val1).toBe('test3');
        });

        it('should return the correct node with a time zone', async () => {
            tree.get('2020-05-08T00:00:00+12:00').put('test4' as never);
            let val1 = await treeRoot.get('2020').get('05').get('07').then!();
            expect(val1).toBe('test4');
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

            it('should callback with primitive data', done => {
                tree.get(moment.utc('2020-01-03')).put('foo');
                tree.get(moment.utc('2020-01-06')).put('bar');
                tree.get(moment.utc('2020-01-10')).put('gaz');

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

            it('should callback with object data', done => {
                expect.assertions(1);
                tree.get(moment.utc('2020-01-03')).get('foo' as never).put({ label: 'foo1' } as never);
                tree.get(moment.utc('2020-01-03')).get('bar' as never).put({ label: 'bar1' } as never);
                tree.get(moment.utc('2020-01-03')).get('gaz' as never).put({ label: 'gaz1' } as never);

                tree.on((data, date) => {
                    let keys = Object.keys(_.omit(data as any, '_'));
                    if (keys.length === 3) {
                        expect(keys.sort()).toEqual(['bar', 'foo', 'gaz']);
                        done();
                    }
                });
            });

            it('should callback with references', done => {
                expect.assertions(1);
                let foo = root.get('foo').put({ label: 'foo1' } as never);
                let bar = root.get('bar').put({ label: 'bar1' } as never);
                let gaz = root.get('gaz').put({ label: 'gaz1' } as never);
                tree.get(moment.utc('2020-01-03')).get('foo' as never).put(foo as never);
                tree.get(moment.utc('2020-01-03')).get('bar' as never).put(bar as never);
                tree.get(moment.utc('2020-01-03')).get('gaz' as never).put(gaz as never);

                tree.on((data, date) => {
                    let keys = Object.keys(_.omit(data as any, '_'));
                    if (keys.length === 3) {
                        expect(keys.sort()).toEqual(['bar', 'foo', 'gaz']);
                        done();
                    }
                });
            });

            it('should not callback after off', async (done) => {
                expect.assertions(1);
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

                tree.get(moment.utc('2020-01-03')).put('foo');
                await delay(100);
                tree.get(moment.utc('2020-01-06')).put('bar');
                await delay(100);
                tree.get(moment.utc('2020-01-10')).put('gaz');
            }, 40000);

            it.skip('should callback with updates', async (done) => {
                // TODO: enable when support added
                expect.assertions(2);
                let promises: any = [];
                promises.push(tree.get(moment.utc('2020-01-03')).put('foo').then!());
                promises.push(tree.get(moment.utc('2020-01-06')).put('bar').then!());
                await Promise.all(promises);
                await delay(1000);

                let dateFormat = 'YYYY-MM-DD';
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    expect(data).toBe('gaz');
                    expect(key).toBe('2020-01-10');
                    done();
                }, { updates: true } as any);

                tree.get(moment.utc('2020-01-10')).put('gaz');
            });
        });

        describe('with filter', () => {

            it('should callback with all the data with super set range', done => {
                expect.assertions(1);
                treeRoot = gun.get(runId);
                tree = new DateTree<string>(treeRoot, 'millisecond');

                let d1 = moment('2020-01-03T10:23:56.344Z').toISOString();
                tree.get(d1).put('foo');
                let d2 = moment('2020-01-06T15:34:17.762Z').toISOString();
                tree.get(d2).put('bar');

                let cbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().toISOString();
                    cbTable[key] = data;
                    if (done && Object.keys(cbTable).length === 2) {
                        expect(cbTable).toMatchObject({
                            [d1]: 'foo',
                            [d2]: 'bar',
                        });
                        done();
                        (done as any) = undefined;
                    }
                }, { gte: moment.utc('2020-01-03') });
            });

            it('should not callback after off', async (done) => {
                expect.assertions(1);
                let dateFormat = 'YYYY-MM-DD';

                let cbTable: any = {};
                tree.on((data, date, at, sub) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (key === '2020-01-03') {
                        sub.off();
                    }
                }, { gte: moment.utc('2020-01-03') });

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
                }, { gte: moment.utc('2020-01-03') });

                tree.get(moment.utc('2020-01-03')).put('foo');
                await delay(100);
                tree.get(moment.utc('2020-01-06')).put('bar');
                await delay(100);
                tree.get(moment.utc('2020-01-10')).put('gaz');
            }, 40000);

            it('should callback with data in open set', done => {
                expect.assertions(1);
                tree.get(moment.utc('2020-01-03')).put('foo');
                tree.get(moment.utc('2020-02-04')).put('bar1');
                tree.get(moment.utc('2020-02-09')).put('bar2');
                tree.get(moment.utc('2020-03-10')).put('gaz');

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
                }, { gt: moment.utc('2020-01-03'), lt: moment.utc('2020-03-10') });
            });

            it('should callback with data in closed set with extra precision', done => {
                expect.assertions(1);
                tree.get(moment.utc('2020-03-09')).put('gaz1');
                tree.get(moment.utc('2020-03-10')).put('gaz2');
                tree.get(moment.utc('2020-01-02')).put('foo1');
                tree.get(moment.utc('2020-01-03')).put('foo2');
                tree.get(moment.utc('2020-02-04')).put('bar1');
                tree.get(moment.utc('2020-02-09')).put('bar2');

                let dateFormat = 'YYYY-MM-DD';
                let cbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (done && Object.keys(cbTable).length === 3) {
                        expect(cbTable).toMatchObject({
                            '2020-01-03': 'foo2',
                            '2020-02-04': 'bar1',
                            '2020-02-09': 'bar2',
                        });
                        done();
                        (done as any) = undefined;
                    }
                }, {
                    gte: moment.utc('2020-01-03 01:00'),
                    lte: moment.utc('2020-02-09 23:00')
                });
            }, 40000);

            it('should callback with data in open set with time zone', done => {
                expect.assertions(1);
                tree.get('2020-01-03 00:00:00+10:00').put('foo1');
                tree.get('2020-03-10 00:00:00+10:00').put('gaz2');
                tree.get('2020-01-04 00:00:00+10:00').put('foo2');
                tree.get('2020-02-04 00:00:00+10:00').put('bar1');
                tree.get('2020-02-09 00:00:00+10:00').put('bar2');
                tree.get('2020-03-09 00:00:00+10:00').put('gaz1');

                let dateFormat = 'YYYY-MM-DD';
                let cbTable: any = {};
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    cbTable[key] = data;
                    if (Object.keys(cbTable).length === 4) {
                        expect(cbTable).toMatchObject({
                            '2020-01-03': 'foo2',
                            '2020-02-03': 'bar1',
                            '2020-02-08': 'bar2',
                            '2020-03-08': 'gaz1',
                        });
                        done();
                    }
                }, {
                    gt: '2020-01-03 00:00:00+10:00',
                    lt: '2020-03-10 00:00:00+10:00'
                });
            }, 40000);

            it('should callback with data in closed set', done => {
                expect.assertions(1);
                tree.get(moment.utc('2020-01-03')).put('foo');
                tree.get(moment.utc('2020-02-04')).put('bar1');
                tree.get(moment.utc('2020-02-09')).put('bar2');
                tree.get(moment.utc('2020-03-10')).put('gaz');

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
                }, { gte: moment.utc('2020-02-04'), lte: moment.utc('2020-02-09') });
            });

            it.skip('should callback with updates', async (done) => {
                // TODO: enable when support added
                expect.assertions(2);
                let promises: any = [];
                promises.push(tree.get(moment.utc('2020-01-03')).put('foo').then!());
                promises.push(tree.get(moment.utc('2020-01-06')).put('bar').then!());
                await Promise.all(promises);

                let dateFormat = 'YYYY-MM-DD';
                tree.on((data, date) => {
                    let key = date.utc().format(dateFormat);
                    expect(data).toBe('gaz');
                    expect(key).toBe('2020-01-10');
                    done();
                }, { gte: moment.utc('2020-01-03'), updates: true } as any);

                tree.get(moment.utc('2020-01-10')).put('gaz');
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

        it.skip('should not callback after unsubscribe', async (done) => {
            // TOOD: For some reason, this fails on dev machine, but passes in CI.
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
                    tree.get(moment.utc(date)).put('a');
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

    describe('iterate (primitive)', () => {

        // The data is in descending order intentionally
        let data: { [date: string]: string } = {
            '2011-01-04': '-',
            '2011-01-03': 'd',
            '2010-12-07': 'c',
            '2010-12-05': 'b',
            '2010-11-30': 'a',
            '2010-10-20': '-',
            '2009-12-31': 'x',
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

        it('should iterate over all data in ascending order by default', async () => {
            let data = await iterateAll(tree.iterate());
            let [dates, refs] = _.unzip(data.map(d => {
                let [ref, date] = d;
                return [
                    date.utc().format('YYYY-MM-DD'),
                    ref,
                ];
            })) as [string[], IGunChainReference<string>[]];
            expect(dates).toEqual([
                '2009-12-31',
                '2010-10-20',
                '2010-11-30',
                '2010-12-05',
                '2010-12-07',
                '2011-01-03',
                '2011-01-04',
            ]);
            let values = await Promise.all(refs.map(r => r.then!()))
            expect(values).toEqual([
                'x',
                '-',
                'a',
                'b',
                'c',
                'd',
                '-',
            ]);
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
                dates.push(date.utc().format('YYYY-MM-DD'));
            }

            // Check dates in ascending order
            let expectedData = _.omit(data, [
                '2009-12-31',
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
                dates.push(date.utc().format('YYYY-MM-DD'));
            }

            // Check dates in ascending order
            let expectedData = _.omit(data, [
                '2009-12-31',
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

    describe('iterate (objects)', () => {

        // The data is in descending order intentionally
        let data: { [date: string]: any } = {
            '2019-12-31': {
                foo1: 'f1',
            },
            '2020-01-01': {
                bar1: 'b1',
                bar2: 'b2',
            },
            '2020-01-02': {
                gaz1: 'g1',
            },
        }

        beforeEach(async () => {
            // Add data to graph
            let promises: any[] = [];
            _.forIn(data, (value, dateStr) => {
                let ref = tree.get(moment.utc(dateStr)).put(value as never);
                promises.push(ref.then!());
            });
            await Promise.all(promises);
        });

        it('should iterate over all data in ascending order by default', async () => {
            let data = await iterateAll(tree.iterate());
            let [dates, refs] = _.unzip(data.map(d => {
                let [ref, date] = d;
                return [
                    date.utc().format('YYYY-MM-DD'),
                    ref,
                ];
            })) as [string[], IGunChainReference<any>[]];
            expect(dates).toEqual([
                '2019-12-31',
                '2020-01-01',
                '2020-01-02',
            ]);
            let values = await Promise.all(refs.map(r => r.then!()))
            expect(values).toMatchObject([
                {
                    foo1: 'f1',
                },
                {
                    bar1: 'b1',
                    bar2: 'b2',
                },
                {
                    gaz1: 'g1',
                },
            ]);
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
                tree.get(moment.utc('2012-11-30')).put('a' as never).then!(),
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
