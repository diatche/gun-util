import { IGunChainReference } from "gun/types/chain";
import _ from 'lodash';
import moment, { Moment } from 'moment';
import { IterateOptions, iterateKeys } from "./iterate";
import { AckCallback } from "gun/types/types";

export type DateUnit = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond';

export const ALL_DATE_UNITS: DateUnit[] = [
    'year',  'month',  'day',  'hour',  'minute',  'second', 'millisecond',
];

export type DateParsable = Moment | Date | string | number;

const ZERO_DATE = moment.utc().startOf('year').set('year', 1);

type DateComponentsUnsafe = { [res: string]: number };

/**
 * All date components are natural.
 * For the avoidance of doubt, month 1 is
 * January.
 */
export type DateComponents = {
    [K in DateUnit]?: number;
}

export type DateIterateOptions = Omit<IterateOptions, 'start' | 'end'> & {
    start?: DateParsable;
    end?: DateParsable;
};

/**
 * 
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
        let m = moment(date);
        let floor = m.startOf(this.resolution);
        let next = floor.add(1, this.resolution);
        return next;
    }

    previousDate(date: DateParsable): Moment {
        let m = moment(date);
        let floor = m.startOf(this.resolution);
        if (floor.isSame(m)) {
            floor = floor.subtract(1, this.resolution);
        }
        return floor;
    }

    /**
     * Puts the value at the date and returns
     * it's reference.
     */
    put(date: DateParsable, value: T, callback?: AckCallback): IGunChainReference<T> {
        let ref = this.get(date);
        ref.put(value, callback);
        return ref;
    }

    /**
     * Listens to changes about the specified date.
     * @param date 
     * @returns An unsubscribe function
     */
    changesAbout(date: DateParsable, callback: (comps: DateComponents) => void): () => void {
        let m = moment(date);
        let comps = DateTree.getDateComponents(m, this.resolution);
        let units = Object.keys(comps);
        let refs = this._getRefChain(m);
        let refTable = _.zipObject(units, refs);
        let eventsTable: { [unit: string]: IGunChainReference } = {};

        let off = () => {
            if (_.isEmpty(eventsTable)) {
                return;
            }
            _.forIn(eventsTable, (events, unit) => {
                events.off();
            });
            eventsTable = {};
        };

        _.forIn(refTable, (ref, unit) => {
            let events = ref.on(changes => {
                // Received changes
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
                        callback(changeComps);
                    } catch (error) {
                        console.error(`Uncaught error in DateTree: ${error}`);
                    }
                });
            }, { change: true });
            eventsTable[unit] = events;
        });
        return off;
    }

    /**
     * Gets the Gun node reference for a particular date
     * up to the receiver's maximum resolution. If none
     * exists, it is created.
     * @param date
     * @returns A Gun node reference
     */
    get(date: DateParsable): IGunChainReference<T> {
        let chain = this._getRefChain(moment(date));
        return chain[chain.length - 1] as any;
    }

    private _getRefChain(date: Moment): IGunChainReference[] {
        let comps = DateTree.getDateComponents(date, this.resolution);
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
     * Gets the next Gun node reference for a particular date
     * if one exists. If no date is specified, returns the
     * first node reference.
     * @param date
     * @returns A Gun node reference
     */
    async next(date?: DateParsable): Promise<[IGunChainReference<T> | undefined, Moment | undefined]> {
        let it = this.iterate({
            start: date && moment(date) || undefined,
            startInclusive: false,
            endInclusive: true,
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
     * @returns A Gun node reference
     */
    async previous(date?: Moment): Promise<[IGunChainReference<T> | undefined, Moment | undefined]> {
        let it = this.iterate({
            end: date && moment(date) || undefined,
            startInclusive: true,
            endInclusive: false,
            reverse: true,
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
        let {
            start,
            end,
            startInclusive = true,
            endInclusive = false,
            ...otherOpts
        } = opts;
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
            let [startVal, endVal] = DateTree.getDateComponentRange(
                comps,
                startComps,
                endComps,
                unit
            );
            let atLeaf = unitIndex === unitsLen - 1;
            let unitStartInclusive = startInclusive || !atLeaf;
            let unitEndInclusive = endInclusive || !atLeaf;
            if (ref) {
                // Queue another node for iteration
                it = this._iterateRef(ref, {
                    ...otherOpts,
                    start: DateTree.encodeDateComponent(startVal, unit), 
                    end: DateTree.encodeDateComponent(endVal, unit),
                    startInclusive: unitStartInclusive,
                    endInclusive: unitEndInclusive,
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
        for await (let key of iterateKeys(ref, opts)) {
            let innerRef = ref.get(key);
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
        let m = moment(date);
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
        let m = moment(date);
        let val = m.get(nativeDateUnit(unit));
        return graphDateValue(val, unit);
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

    /**
     * Iterates through all dates between the `start`
     * and `end` dates at the receiver's resolution.
     * @param start Start date (inclusive)
     * @param end End date (exclusive)
     */
    static * iterateDates(start: DateParsable, end: DateParsable, resolution: DateUnit): Generator<Moment> {
        let mStart = moment(start).startOf(resolution);
        let mEnd = moment(end).startOf(resolution);
        let date = mStart;
        while (date.isBefore(mEnd)) {
            yield date;
            date = date.add(resolution);
        }
    }

    static isResolution(resolution: any): resolution is DateUnit {
        if (typeof resolution !== 'string') return false;
        return ALL_DATE_UNITS.indexOf(resolution as DateUnit) >= 0;
    }
}

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

const MAX_DATE_COMPS: DateComponentsUnsafe = (() => {
    let maxDate = moment.utc().endOf('year');
    let units = _.without(ALL_DATE_UNITS, 'year');
    return _.zipObject(units, units.map(r => graphDateValue(maxDate.get(nativeDateUnit(r)), r) + 1));
})();

const DATE_COMP_PADS = (() => {
    let pads: { [unit: string]: number } = {
        year: 4
    };
    for (let unit of ALL_DATE_UNITS) {
        if (unit in MAX_DATE_COMPS) {
            let max = MAX_DATE_COMPS[unit] - 1;
            pads[unit] = max.toString().length;
        }
    }
    return pads;
})();
