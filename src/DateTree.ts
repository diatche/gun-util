import { IGunChainReference } from "gun/types/chain";
import _ from 'lodash';
import moment, { Moment } from 'moment';
import { IterateOptions, iterateRefs } from "./iterate";
import { rangeWithFilter, filterWithRange, Filter, ValueRange, filterKey, mapValueRange } from "./filter";

export type DateUnit = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond';

export const ALL_DATE_UNITS: DateUnit[] = [
    'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond',
];

export const DATE_UNIT_SET = new Set(ALL_DATE_UNITS);

export type DateParsable = Moment | Date | string | number;

const ZERO_DATE = moment.utc().startOf('year').set('year', 1);

type DateComponentsUnsafe = { [res: string]: number };

/**
 * Provides a way of managing a subscription.
 */
export interface Subscription {
    /** Unsubscribe from events. */
    off: () => void;
}

interface BaseEventOptions {
    /** If true, subscribe to updates only. */
    // updates?: boolean;
}

export type DateEventOptions = Filter<DateParsable> & BaseEventOptions;

export type DateEventCallback<T> = (
    data: T,
    date: Moment,
    at: any,
    sub: Subscription
) => void;

/**
 * All date components are natural.
 * For the avoidance of doubt, month 1 is
 * January.
 */
export type DateComponents = {
    [K in DateUnit]?: number;
}

export interface DateIterateOptions extends IterateOptions<DateParsable> {}

/**
 * Efficiently distributes and stores data in a tree with nodes using date
 * components as keys up to a specified resolution.
 * The root of the tree is specified as a Gun node reference.
 * 
 * **Why not just use a hash table?**
 * 
 * Having large nodes is discouraged in a graph database like Gun.
 * If you need to store large lists or tables of data, you need to break
 * them up into smaller nodes to ease synchronization between peers.
 */
export default class DateTree<T = any> {
    root: IGunChainReference;
    resolution: DateUnit;

    constructor(root: IGunChainReference<any>, resolution: DateUnit) {
        if (!DateTree.isResolution(resolution)) {
            throw new Error('Invalid graph date resolution: ' + resolution);
        }
        this.root = root;
        this.resolution = resolution;
    }

    nextDate(date: DateParsable): Moment {
        let m = parseDate(date);
        let floor = m.startOf(this.resolution);
        let next = floor.add(1, this.resolution);
        return next;
    }

    previousDate(date: DateParsable): Moment {
        let m = parseDate(date);
        let floor = m.startOf(this.resolution);
        if (floor.isSame(m)) {
            floor = floor.subtract(1, this.resolution);
        }
        return floor;
    }

    /**
     * Subscribes to data and canges on nodes in a date range.
     * The data is not ordered.
     * If no date range is given, subscribes to changes
     * on any date (not recommended).
     * @param cb 
     * @param opts 
     * @returns A {@link Subscription} object.
     */
    on(cb: DateEventCallback<T>, opts: DateEventOptions = {}): Subscription {
        // TODO: add updates support
        let range = mapValueRange(
            rangeWithFilter(opts),
            parseDate
        );
        let {
            start,
            end,
            startClosed,
            endClosed,
        } = range;

        if (!start && !end) {
            return this._onAny(cb);
        }

        let startComps = (start && DateTree.getDateComponents(start, this.resolution) || {}) as Partial<DateComponentsUnsafe>;
        let endComps = (end && DateTree.getDateComponents(end, this.resolution) || {}) as Partial<DateComponentsUnsafe>;
        let commonUnit = DateTree.largestCommonUnit(startComps, endComps);
        let commonComps = commonUnit
            ? DateTree.downsampleDateComponents(startComps, commonUnit)
            : {};
        let mapTable: any = {};
        let subTable: { [key: string]: Subscription } = {};
        let didUnsub = false;

        let commonSub: Subscription = {
            off: () => {
                if (didUnsub) {
                    return;
                }
                didUnsub = true;
                for (let sub of Object.values(subTable)) {
                    sub.off();
                }
                subTable = {};
            }
        };

        const beginSub = (comps: DateComponents, unit: DateUnit | undefined) => {
            if (didUnsub) {
                return;
            }
            let compKey = DateTree.dateComponentsToString(comps, unit);
            if (compKey in mapTable) {
                // Already subscribed
                return;
            }
            let innerRef: any = this._getRef(comps);
            let innerUnit = unit ? DateTree.getSmallerUnit(unit) : 'year';

            // Filter inner keys if needed
            let innerRange = DateTree.getDateComponentKeyRange(
                comps,
                {
                    start: startComps,
                    end: endComps,
                    startClosed,
                    endClosed
                },
                innerUnit!,
                this.resolution
            );
            let {
                start: innerStart,
                end: innerEnd
            } = innerRange;
            if (typeof innerStart !== 'undefined' || typeof innerEnd !== 'undefined') {
                // Filter inner keys
                let lexRange: any = {};
                if (typeof innerStart !== 'undefined') {
                    lexRange['>'] = innerStart;
                }
                if (typeof innerEnd !== 'undefined') {
                    lexRange['<'] = innerEnd;
                }
                innerRef = innerRef.get({ '.': lexRange });
            }

            let map = innerRef.map();
            mapTable[compKey] = map;
            subTable[compKey] = map;
            map.on((data: any, key: string, at: any, innerSub: Subscription) => {
                if (didUnsub) {
                    return;
                }
                let value = DateTree.decodeDateComponent(key);
                let innerComps = { ...comps, [innerUnit!]: value };
                if (innerUnit === this.resolution) {
                    // Got data
                    let date = DateTree.getDateWithComponents(innerComps);
                    // Filter boundaries
                    if (filterKey(date, range)) {
                        cb(data, date, at, commonSub);
                    }
                } else {
                    // Map deeper
                    beginSub(innerComps, innerUnit);
                }
            });
        };

        // Begin subscribing
        beginSub(commonComps, commonUnit);

        return commonSub;
    }

    private _onAny(cb: DateEventCallback<T>): Subscription {
        // TODO: opts.updates = true not working as intended
        let units = this._allUnits();
        let ref = this.root.map();

        for (let i = 0; i < units.length - 1; i++) {
            ref = ref.map();
        }

        return (ref as any).on((data: T, key: string, at: any, event: any) => {
            let date = this.getDate(at);
            cb(data, date, at, event);
        });
    }

    /**
     * Listens to changes about the specified date.
     * 
     * Let's say we want to listen to changes to a blog described
     * by a date tree.
     * How would we handle a case where we are close to the end
     * of the nodes for the current time period?
     * 
     * For example, we are at 2019-12-31 23:54, which is the end
     * of the hour, day, month and year. We may get a message this
     * next minute, hour, day, month or year.
     * Subscribing to all nodes would be impractical.
     * Listen to a single path of the tree instead with `changesAbout()`.
     * 
     * **Proposed strategy:**
     * 
     * At each date in the future, we can call `latest()`
     * and `iterate()` to get the latest data.
     * 
     * When the date gets too far away, we can call `unsub()`
     * and resubscribe to a later date.
     * 
     * @param date 
     * @param callback
     * 
     * Whenever a node changes next to the direct path between the root and the
     * tree's maximum resolution, the callback is called with the date components
     * identifying the node. Note that the date components are partial unless the
     * change occured at the maximum resolution.
     * 
     * @returns An unsubscribe function
     */
    changesAbout(date: DateParsable, callback: (comps: DateComponents, sub: Subscription) => void): Subscription {
        let m = parseDate(date);
        let comps = DateTree.getDateComponents(m, this.resolution);
        let units = Object.keys(comps);
        let refs = this._getRefChain(comps);
        let refTable = _.zipObject(units, refs);
        let subTable: { [unit: string]: Subscription } = {};
        let didUnsub = false;

        let commonSub: Subscription = {
            off: () => {
                if (didUnsub) {
                    return;
                }
                didUnsub = true;
                for (let sub of Object.values(subTable)) {
                    sub.off();
                }
                subTable = {};
            }
        };

        _.forIn(refTable, (ref: any, unit: string) => {
            ref.on((changes: any, outerKey: string, at: any, sub: Subscription) => {
                // Received changes
                if (didUnsub) {
                    // Already unsubscribed
                    return;
                }
                // Get data
                _.forIn(changes, (val, key) => {
                    if (key === '_') {
                        // Meta
                        return;
                    }
                    let changedUnit = unit as DateUnit;
                    let changeComps = DateTree.downsampleDateComponents(
                        comps,
                        changedUnit
                    );
                    let compVal = DateTree.decodeDateComponent(key);
                    if (compVal !== changeComps[changedUnit]) {
                        changeComps[changedUnit] = compVal;
                    } else {
                        // Filter changes to the current ref chain
                        return;
                    }

                    try {
                        callback(changeComps, commonSub);
                    } catch (error) {
                        console.error(`Uncaught error in DateTree: ${error}`);
                    }
                });
            }, { change: true });
            subTable[unit] = ref;
        });
        return commonSub;
    }

    /**
     * Returns the date for the specified Gun node reference.
     * @param ref Gun node reference
     * @returns Date
     */
    getDate(ref: IGunChainReference<T>): Moment {
        let currentRef: any = ref;
        let units = this._allUnits();
        let keys: string[] = [];
        let ok = true;
        const getKey = (ref: any) => {
            return ref._?.get || ref.get || ref.$?.get || ref.$?._?.get;
        }
        const rootKey = getKey(this.root);
        while (currentRef && keys.length < units.length) {
            let key = getKey(currentRef);
            if (!key || key === rootKey) {
                ok = false;
                break;
            }
            keys.unshift(key);
            if (typeof currentRef.back === 'function') {
                // Using concrete reference
                currentRef = currentRef.back();
            } else if (typeof currentRef.$?._?.back === 'object') {
                // Using reference from callback
                currentRef = currentRef.$?._?.back;
            } else if (typeof currentRef.$?.back === 'function') {
                // Using reference from callback
                currentRef = currentRef.$?.back();
            } else {
                ok = false;
                break;
            }
        }
        if (getKey(currentRef) !== rootKey) {
            ok = false;
        }
        if (!ok) {
            throw new Error('Invalid Gun node reference. Expected a leaf on the date tree.');
        }
        let values = keys.map(k => DateTree.decodeDateComponent(k));
        let comps: DateComponentsUnsafe = _.zipObject(units, values);
        return DateTree.getDateWithComponents(comps);
    }

    /**
     * Returns the Gun node reference for a particular date
     * up to the receiver's maximum resolution. If none
     * exists, it is created.
     * @param date Date
     * @returns Gun node reference
     */
    get(date: DateParsable): IGunChainReference<T> {
        let comps = DateTree.getDateComponents(parseDate(date), this.resolution);
        let chain = this._getRefChain(comps);
        return chain[chain.length - 1] as any;
    }

    /**
     * Assumes the date components are clean (with no other properties).
     * @param comps 
     */
    private _getRefChain(comps: DateComponents): IGunChainReference[] {
        let ref = this.root;
        let refs = [ref];
        _.forIn(comps, (val, unit) => {
            let key = DateTree.encodeDateComponent(val, unit as DateUnit)!;
            ref = ref.get(key);
            refs.push(ref);
        });
        return refs;
    }

    /**
     * Assumes the date components are clean (with no other properties).
     * @param comps 
     */
    private _getRef(comps: DateComponents): IGunChainReference {
        let chain = this._getRefChain(comps);
        return chain[chain.length - 1];
    }

    /**
     * Gets the latest Gun node reference if one exists.
     * @param date
     * @returns A Gun node reference and its date
     */
    async latest(): Promise<[IGunChainReference<T> | undefined, Moment | undefined]> {
        return this.previous();
    }

    /**
     * Gets the earliest Gun node reference if one exists.
     * @param date
     * @returns A Gun node reference and its date
     */
    async earliest(): Promise<[IGunChainReference<T> | undefined, Moment | undefined]> {
        return this.next();
    }

    /**
     * Gets the next Gun node reference for a particular date
     * if one exists. If no date is specified, returns the
     * first node reference.
     * @param date
     * @returns A Gun node reference and its date
     */
    async next(date?: DateParsable): Promise<[IGunChainReference<T> | undefined, Moment | undefined]> {
        let it = this.iterate({
            gt: date && parseDate(date) || undefined,
            order: 1,
        });
        for await (let [ref, refDate] of it) {
            if (date) {
                if (refDate.isSame(date)) {
                    continue;
                } else if (refDate.isBefore(date)) {
                    throw new Error(`Unexpected date ${refDate} after ${date}`);
                }
            }
            return [ref, refDate];
        }
        return [undefined, undefined];
    }

    /**
     * Gets the previous Gun node reference for a particular date
     * if one exists. If no date is specified, returns the
     * last node reference.
     * @param date
     * @returns A Gun node reference and its date
     */
    async previous(date?: Moment): Promise<[IGunChainReference<T> | undefined, Moment | undefined]> {
        let it = this.iterate({
            lt: date && parseDate(date) || undefined,
            order: -1,
        });
        for await (let [ref, refDate] of it) {
            if (date) {
                if (refDate.isSame(date)) {
                    continue;
                } else if (refDate.isAfter(date)) {
                    throw new Error(`Unexpected date ${refDate} before ${date}`);
                }
            }
            return [ref, refDate];
        }
        return [undefined, undefined];
    }

    /**
     * Iterates over all node references after and
     * inclusing `start` date and before and excluding
     * `end` date.
     * @param param0 
     */
    async * iterate(opts: DateIterateOptions = {}): AsyncGenerator<[IGunChainReference<T>, Moment]> {
        let range = rangeWithFilter(opts);
        let {
            start,
            end,
            startClosed,
            endClosed,
        } = range;
        let { order } = opts;
        let ref: IGunChainReference | undefined = this.root;
        let startComps = (start && DateTree.getDateComponents(start, this.resolution) || {}) as Partial<DateComponentsUnsafe>;
        let endComps = (end && DateTree.getDateComponents(end, this.resolution) || {}) as Partial<DateComponentsUnsafe>;
        let comps: DateComponentsUnsafe = {};
        let units = this._allUnits();
        let unitIndex = 0;
        let unitsLen = units.length;
        let it: AsyncGenerator<[IGunChainReference<T>, number]> | undefined;
        let itStack: AsyncGenerator<[IGunChainReference<T>, number]>[] = [];

        while (unitIndex >= 0) {
            let goUp = false;
            let unit = units[unitIndex];
            let atLeaf = unitIndex === unitsLen - 1;
            if (ref) {
                // Queue another node for iteration
                let range = DateTree.getDateComponentKeyRange(
                    comps,
                    {
                        start: startComps,
                        end: endComps,
                        startClosed,
                        endClosed
                    },
                    unit,
                    this.resolution
                );
                let filter = filterWithRange(range);
                it = this._iterateRef(ref, {
                    ...filter,
                    order,
                });
                itStack.unshift(it);
                ref = undefined;
            }

            if (it && atLeaf) {
                // Found data
                for await (let [innerRef, compVal] of it) {
                    comps[unit] = compVal;
                    let date = DateTree.getDateWithComponents(
                        comps,
                        this.resolution
                    );
                    yield [innerRef, date];
                }
                // Go up a level
                goUp = true;
            }
            if (!goUp) {
                // Go to sibling
                let next = await itStack[0].next();
                if (next.done) {
                    // Go up a level
                    goUp = true;
                } else {
                    // Go down a level
                    ref = next.value[0];
                    comps[unit] = next.value[1];
                    unitIndex += 1;
                }
            }
            if (goUp) {
                itStack.shift();
                unitIndex -= 1;
                if (unit in comps) {
                    delete comps[unit];
                }
                continue;
            }
        }
    }

    /**
     * Iterates over all refs children.
     * @param ref 
     * @param start inclusive
     * @param end exclusive
     */
    private async * _iterateRef(
        ref: IGunChainReference,
        opts: IterateOptions,
    ): AsyncGenerator<[IGunChainReference<T>, number]> {
        for await (let [innerRef, key] of iterateRefs(ref, opts)) {
            let val = DateTree.decodeDateComponent(key);
            yield [innerRef as any, val];
        }
    }

    private _allUnits(): DateUnit[] {
        let units: DateUnit[] = [];
        for (let res of ALL_DATE_UNITS) {
            units.push(res);
            if (res === this.resolution) {
                break;
            }
        }
        return units;
    }

    static lowerUnit(unit: DateUnit): DateUnit | undefined {
        let i = ALL_DATE_UNITS.indexOf(unit);
        if (i < 0) {
            return undefined;
        }
        return ALL_DATE_UNITS[i - 1];
    }

    static getDateWithComponents(comps: DateComponents, resolution?: DateUnit): Moment {
        let c = comps as DateComponentsUnsafe;
        let m = ZERO_DATE.clone();
        for (let res of ALL_DATE_UNITS) {
            if (res in comps) {
                let val = nativeDateValue(c[res], res);
                m.set(nativeDateUnit(res), val);
            } else {
                break;
            }
            if (res === resolution) {
                break;
            }
        }
        return m;
    }

    static getDateComponents(date: DateParsable, resolution: DateUnit): DateComponents {
        let m = parseDate(date);
        if (!this.isResolution(resolution)) {
            throw new Error('Invalid graph date resolution: ' + resolution);
        }
        let comps: any = {};
        for (let res of ALL_DATE_UNITS) {
            comps[res] = this.getDateComponent(m, res as DateUnit);
            if (res === resolution) {
                break;
            }
        }
        return comps;
    }

    static getDateComponent(date: DateParsable, unit: DateUnit): number {
        let m = parseDate(date);
        let val = m.get(nativeDateUnit(unit));
        return graphDateValue(val, unit);
    }

    /**
     * Returns the largest common unit between two date components.
     * If none is found, returns undefined
     * @param comp1 
     * @param comp2 
     */
    static largestCommonUnit(comp1: DateComponents, comp2: DateComponents): DateUnit | undefined {
        let commonUnit: DateUnit | undefined;
        for (let unit of ALL_DATE_UNITS) {
            if (comp1[unit] === comp2[unit]) {
                commonUnit = unit;
            } else {
                break;
            }
        }
        return commonUnit;
    }

    static encodeDateComponent(value: number | undefined, unit: DateUnit): string | undefined {
        if (typeof value === 'undefined') {
            return undefined;
        }
        // Pad number with zeroes for lexicographical ordering
        let key = value.toString();
        let padLen = DATE_COMP_PADS[unit];
        return key.padStart(padLen, '0');
    }

    static decodeDateComponent(key: string): number {
        // TODO: validate key in case there is unexpected data in the tree
        return Math.round(parseFloat(key));
    }

    static downsampleDateComponents(components: DateComponents, resolution: DateUnit): DateComponents {
        let newComponents: DateComponentsUnsafe = {};
        for (let res of ALL_DATE_UNITS) {
            newComponents[res] = (components as DateComponentsUnsafe)[res];
            if (res === resolution) {
                break;
            }
        }
        return newComponents;
    }

    static getDateComponentKeyRange(
        comps: DateComponents,
        compRange: Required<ValueRange<DateComponents>>,
        unit: DateUnit,
        resolution: DateUnit,
    ): ValueRange<string> {
        let [startVal, endVal] = DateTree.getDateComponentRange(
            comps,
            compRange.start,
            compRange.end,
            unit
        );
        let atLeaf = unit === resolution;
        let unitStartClosed = compRange.startClosed || !atLeaf;
        let unitEndClosed = compRange.endClosed || !atLeaf;
        return {
            start: DateTree.encodeDateComponent(startVal, unit),
            end: DateTree.encodeDateComponent(endVal, unit),
            startClosed: unitStartClosed,
            endClosed: unitEndClosed,
        };
    }

    static getDateComponentRange(
        comps: DateComponents,
        startComps: DateComponents,
        endComps: DateComponents,
        unit: DateUnit,
    ): [number | undefined, number | undefined] {
        let startVal = startComps[unit];
        let endVal = endComps[unit];
        if (typeof startVal === 'undefined' && typeof endVal === 'undefined') {
            return [startVal, endVal];
        }

        let upUnit = this.getBiggerUnit(unit);
        if (!upUnit) {
            return [startVal, endVal];
        }
        let upComps = this.downsampleDateComponents(comps, upUnit);

        if (typeof startVal !== 'undefined') {
            let upStartComps = this.downsampleDateComponents(startComps, upUnit);
            if (!_.isEqual(upStartComps, upComps)) {
                // Expand start
                startVal = undefined;
            }
        }

        if (typeof endVal !== 'undefined') {
            let upEndComps = DateTree.downsampleDateComponents(endComps, upUnit);
            if (!_.isEqual(upEndComps, upComps)) {
                // Expand end
                endVal = undefined;
            }
        }

        return [startVal, endVal]
    }

    static getBiggerUnit(unit: DateUnit): DateUnit | undefined {
        let i = ALL_DATE_UNITS.indexOf(unit);
        if (i < 0) return undefined;
        return ALL_DATE_UNITS[i - 1];
    }

    static getSmallerUnit(unit: DateUnit): DateUnit | undefined {
        let i = ALL_DATE_UNITS.indexOf(unit);
        if (i === ALL_DATE_UNITS.length - 1) return undefined;
        return ALL_DATE_UNITS[i + 1];
    }

    static dateComponentsToString(comp: DateComponents, resolution?: DateUnit): string {
        let str = '';
        for (let unit of ALL_DATE_UNITS) {
            if (!(resolution || unit in comp)) {
                break;
            }
            let val = this.encodeDateComponent(comp[unit], unit);
            switch (unit) {
                case 'year':
                    break;
                case 'month':
                case 'day':
                    str += '-';
                    break;
                case 'hour':
                    str += 'T';
                    break;
                case 'minute':
                case 'second':
                    str += ':';
                    break;
                case 'millisecond':
                    str += '.';
                    break;
            }
            str += val;
            if (unit === 'millisecond') {
                str += 'Z';
            }
            if (unit === resolution) {
                break;
            }
        }
        return str;
    }

    /**
     * Iterates through all dates between the `start`
     * and `end` dates at the receiver's resolution.
     * @param start Start date (inclusive)
     * @param end End date (exclusive)
     */
    static * iterateDates(start: DateParsable, end: DateParsable, resolution: DateUnit): Generator<Moment> {
        let mStart = parseDate(start).startOf(resolution);
        let mEnd = parseDate(end).startOf(resolution);
        let date = mStart;
        while (date.isBefore(mEnd)) {
            yield date;
            date = date.add(resolution);
        }
    }

    static isResolution(resolution: any): resolution is DateUnit {
        if (typeof resolution !== 'string') return false;
        return DATE_UNIT_SET.has(resolution as DateUnit);
    }
}

const parseDate = (date: DateParsable): Moment => {
    return moment.utc(date);
};

const nativeDateUnit = (res: DateUnit): moment.unitOfTime.All => {
    if (res === 'day') {
        return 'date';
    }
    return res;
};

const graphDateValue = (value: number, res: DateUnit): number => {
    if (res === 'month') {
        value += 1;
    }
    return value;
};

const nativeDateValue = (value: number, res: DateUnit): number => {
    if (res === 'month') {
        value -= 1;
    }
    return value;
};

/** The minimum (inclusive) date component values. */
const MIN_DATE_COMPONENTS: Omit<{ readonly [K in DateUnit]: number }, 'year'> = (() => {
    let maxDate = moment.utc().startOf('year');
    let units = ALL_DATE_UNITS.slice(1);
    return _.zipObject(units, units.map(r => graphDateValue(maxDate.get(nativeDateUnit(r)), r))) as any;
})();

/** The maximum (exclusive) date component values. */
const MAX_DATE_COMPONENTS: Omit<{ readonly [K in DateUnit]: number }, 'year'> = (() => {
    let maxDate = moment.utc().endOf('year');
    let units = ALL_DATE_UNITS.slice(1);
    return _.zipObject(units, units.map(r => graphDateValue(maxDate.get(nativeDateUnit(r)), r) + 1)) as any;
})();

const DATE_COMP_PADS: { readonly [K in DateUnit]: number } = (() => {
    let pads: Partial<{ [K in DateUnit]: number }> = {
        year: 4
    };
    for (let unit of ALL_DATE_UNITS) {
        if (unit !== 'year') {
            let max = MAX_DATE_COMPONENTS[unit] - 1;
            pads[unit] = max.toString().length;
        }
    }
    return pads as { [K in DateUnit]: number };
})();

// /** The set of all possible keys of a date component. */
// const DATE_COMPONENT_KEY_SETS: Omit<{ readonly [K in DateUnit]: Set<string> }, 'year'> = (() => {
//     let sets: Partial<Omit<{ [K in DateUnit]: Set<string> }, 'year'>> = {};
//     for (let unit of ALL_DATE_UNITS) {
//         if (unit === 'year') continue;
//         let min = MIN_DATE_COMPONENTS[unit];
//         let max = MIN_DATE_COMPONENTS[unit];
//         let set = new Set<string>();
//         for (let i = min; i < max; i++) {
//             set.add(DateTree.encodeDateComponent(i, unit)!);
//         }
//         sets[unit] = set;
//     }
//     return sets as Omit<{ readonly [K in DateUnit]: Set<string> }, 'year'>;
// })();
