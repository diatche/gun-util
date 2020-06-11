import { IGunChainReference } from "gun/types/chain";
import _ from 'lodash';
import moment, { Moment } from 'moment';
import { iterateRefs } from "./iterate";

export type DateResolution = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond';

const ALL_RES: DateResolution[] = [
    'year',  'month',  'day',  'hour',  'minute',  'second', 'millisecond',
];

const ZERO_DATE = moment.utc().startOf('year').set('year', 1);

type DateComponentsUnsafe = { [res: string]: number };

/**
 * All date components are natural.
 * For the avoidance of doubt, month 1 is
 * January.
 */
export type DateComponents = {
    [K in DateResolution]?: number;
}

export default class DateGraph<T = any> {
    root: IGunChainReference;
    resolution: DateResolution;

    constructor(root: IGunChainReference, resolution: DateResolution) {
        if (!DateGraph.isResolution(resolution)) {
            throw new Error('Invalid graph date resolution: ' + resolution);
        }
        this.root = root;
        this.resolution = resolution;
    }

    nextDate(date: Moment): Moment {
        let m = moment(date);
        let floor = m.startOf(this.resolution);
        let next = floor.add(1, this.resolution);
        return next;
    }

    previousDate(date: Moment): Moment {
        let m = moment(date);
        let floor = m.startOf(this.resolution);
        if (floor.isSame(m)) {
            floor = floor.subtract(1, this.resolution);
        }
        return floor;
    }

    async * iterateRefs({ start, end }: { start?: Moment; end?: Moment; } = {}): AsyncGenerator<[IGunChainReference, Moment]> {
        let ref: IGunChainReference | undefined = this.root;
        let startComps = (start && DateGraph.getDateComponents(start, this.resolution) || {}) as Partial<DateComponentsUnsafe>;
        let endComps = (end && DateGraph.getDateComponents(end, this.resolution) || {}) as Partial<DateComponentsUnsafe>;
        let comps: DateComponentsUnsafe = {};
        let res: string;
        let ress = this._allResolutions();
        let resIndex = 0;
        let resLen = ress.length;
        let it: AsyncGenerator<[IGunChainReference, number]> | undefined;
        let itStack: AsyncGenerator<[IGunChainReference, number]>[] = [];
        let startVal: number | undefined;
        let endVal: number | undefined;
        let goUp = false;

        while (resIndex >= 0) {
            goUp = false;
            res = ress[resIndex];
            startVal = startComps[res];
            endVal = endComps[res];
            if (typeof endVal !== 'undefined') {
                if (resIndex < resLen - 1) {
                    endVal += 1;
                }
                if (resIndex > 0) {
                    let upRes = ress[resIndex - 1];
                    let upComps = DateGraph.trimDateComponents(comps, upRes);
                    let upStartComps = DateGraph.trimDateComponents(startComps, upRes);
                    if (!_.isEqual(upStartComps, upComps)) {
                        // Expand start
                        startVal = 0;
                    }
                    let upEndComps = DateGraph.trimDateComponents(endComps, upRes);
                    if (!_.isEqual(upEndComps, upComps)) {
                        // Expand end
                        endVal = MAX_DATE_COMPS[res];
                    }
                }
            }
            if (ref) {
                // Queue another node for iteration
                it = this._iterateRef(ref, startVal, endVal);
                itStack.unshift(it);
                ref = undefined;
            }

            if (it && resIndex === resLen - 1) {
                // Found data
                for await (let [innerRef, compVal] of it) {
                    comps[res] = compVal;
                    let date = DateGraph.getDateWithComponents(
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
                    comps[res] = next.value[1];
                    resIndex += 1;
                }
            }
            if (goUp) {
                itStack.shift();
                resIndex -= 1;
                if (res in comps) {
                    delete comps[res];
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
        start?: number,
        end?: number
    ): AsyncGenerator<[IGunChainReference, number]> {
        let checkStart = typeof start !== 'undefined';
        let checkEnd = typeof end !== 'undefined';
        if (checkStart && checkEnd) {
            if (start === end) {
                return;
            } else if (start! > end!) {
                throw new Error('Start value must be less than end value');
            }
        } 
        for await (let [innerRef, key] of iterateRefs(ref)) {
            let compVal = Math.round(parseFloat(key));
            if (checkEnd && compVal >= end!) {
                break;
            }
            if (!checkStart || compVal >= start!) {
                yield [innerRef, compVal];
            }
        }
    }

    /**
     * Puts the value at the date and returns
     * it's reference.
     */
    put(date: Moment, value: T): IGunChainReference<T> {
        let ref = this.getRef(date);
        ref.put(value);
        return ref;
    }

    /**
     * Gets the Gun node reference for a particular date
     * up to the receiver's maximum resolution.
     * @param date
     * @returns A Gun node reference
     */
    getRef(date: Moment): IGunChainReference<T> {
        let comps = DateGraph.getDateComponents(date, this.resolution) as DateComponentsUnsafe;
        let ref = this.root;
        Object.values(comps).forEach(resValue => {
            ref = ref.get(resValue.toString());
        });
        return ref as IGunChainReference<T>;
    }

    private _allResolutions(): DateResolution[] {
        let ress: DateResolution[] = [];
        for (let res of ALL_RES) {
            ress.push(res);
            if (res === this.resolution) {
                break;
            }
        }
        return ress;
    }

    static lowerResolution(resolution: DateResolution): DateResolution | undefined {
        let i = ALL_RES.indexOf(resolution);
        if (i < 0) {
            return undefined;
        }
        return ALL_RES[i - 1];
    }

    static getDateWithComponents(comps: DateComponents, resolution?: DateResolution): Moment {
        let c = comps as DateComponentsUnsafe;
        let m = ZERO_DATE.clone();
        for (let res of ALL_RES) {
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

    static getDateComponents(date: Moment, resolution: DateResolution): DateComponents {
        if (!this.isDate(date)) {
            throw new Error(`Invalid graph date. Expected a Moment, instead got: ${date}`);
        }
        if (!this.isResolution(resolution)) {
            throw new Error('Invalid graph date resolution: ' + resolution);
        }
        let comps: any = {};
        for (let res of ALL_RES) {
            comps[res] = this.getDateComponent(date, res as DateResolution);
            if (res === resolution) {
                break;
            }
        }
        return comps;
    }

    static getDateComponent(date: Moment, resolution: DateResolution): number {
        let val = date.get(nativeDateUnit(resolution));
        return graphDateValue(val, resolution);
        // switch (resolution) {
        //     case 'year': return date.getUTCFullYear();
        //     case 'month': return date.getUTCMonth() + 1;
        //     case 'day': return date.getUTCDate();
        //     case 'hour': return date.getUTCHours();
        //     case 'minute': return date.getUTCMinutes();
        //     case 'second': return date.getUTCSeconds();
        //     case 'millisecond': return date.getUTCMilliseconds();
        // }
        // throw new Error('Unsupported date component: ' + resolution);
    }

    static trimDateComponents(components: DateComponents, resolution: DateResolution): DateComponents {
        let newComponents: DateComponentsUnsafe = {};
        for (let res of ALL_RES) {
            newComponents[res] = (components as DateComponentsUnsafe)[res];
            if (res === resolution) {
                break;
            }
        }
        return newComponents;
    }

    /**
     * Iterates through all dates between the `start`
     * and `end` dates at the receiver's resolution.
     * @param start Start date (inclusive)
     * @param end End date (exclusive)
     */
    static * iterateDates(start: Moment, end: Moment, resolution: DateResolution): Generator<Moment> {
        let mStart = moment(start).startOf(resolution);
        let mEnd = moment(end).startOf(resolution);
        let date = mStart;
        while (date.isBefore(mEnd)) {
            yield date;
            date = date.add(resolution);
        }
    }

    static isDate(date: any): date is Moment {
        return moment.isMoment(date);
    }

    static isResolution(resolution: any): resolution is DateResolution {
        if (typeof resolution !== 'string') return false;
        return ALL_RES.indexOf(resolution as DateResolution) >= 0;
    }
}

const nativeDateUnit = (res: DateResolution): moment.unitOfTime.All => {
    if (res === 'day') {
        return 'date';
    }
    return res;
};

const graphDateValue = (value: number, res: DateResolution): number => {
    if (res === 'month') {
        value += 1;
    }
    return value;
};

const nativeDateValue = (value: number, res: DateResolution): number => {
    if (res === 'month') {
        value -= 1;
    }
    return value;
};

const MAX_DATE_COMPS: DateComponentsUnsafe = (() => {
    let maxDate = moment.utc().endOf('year');
    let ress = _.without(ALL_RES, 'year');
    return _.zipObject(ress, ress.map(r => graphDateValue(maxDate.get(nativeDateUnit(r)), r) + 1));
})();
