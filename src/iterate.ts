import { IGunChainReference } from "gun/types/chain";
import _ from "lodash";

export interface IterateOptions {
    start?: string;
    end?: string;
    /** True by default. */
    startInclusive?: boolean;
    /** False by default. */
    endInclusive?: boolean;
    reverse?: boolean;
}

/**
 * Iterate over async iterator to the end and return
 * the collected values.
 * @param it An async iterable
 */
export async function iterateAll<T>(it: AsyncIterable<T>): Promise<T[]> {
    let values: T[] = [];
    for await (let value of it) {
        values.push(value);
    }
    return values;
}

/**
 * Iterate over the inner keys of a record at a Gun node reference.
 * 
 * Note that keys are not guaranteed to be in order if there
 * is more than one connected peer.
 * 
 * @param ref Gun node reference
 **/
export async function * iterateRecord<V = any, T = Record<any, V>>(
    ref: IGunChainReference<T>,
    opts: IterateOptions = {},
): AsyncGenerator<[V, string]> {
    let {
        start,
        end,
        startInclusive = true,
        endInclusive = false,
        reverse = false,
    } = opts;

    if (typeof start !== 'undefined' && typeof end !== 'undefined') {
        if (start === end && !(startInclusive && endInclusive)) {
            return;
        } else if (start > end) {
            throw new Error('Start value must be less than end value');
        }
    }

    // TODO: To avoid fetching too much data at once,
    // use GUN's lexical wire spec to filter and or batch: https://gun.eco/docs/RAD

    // Get list of keys:
    let obj: any = await ref.then!();
    if (typeof obj === 'undefined' || obj === null) {
        return;
    }
    if (typeof obj !== 'object') {
        throw new Error(`Cannot iterate keys of non-object record "${obj}" at key "${(ref as any)._?.get}"`);
    }
    // Remove meta
    obj = _.omit(obj, '_');
    
    let keys = Object.keys(obj).sort();
    let len = keys.length;
    if (len === 0) {
        return;
    }

    // Find iteration bounds
    let iStart = 0;
    if (typeof start !== 'undefined') {
        iStart = _.sortedIndex(keys, start);
        let key = keys[iStart];
        if (key <= start && !startInclusive) {
            iStart += 1;
        }
    }
    let iEnd = len - 1;
    if (typeof end !== 'undefined') {
        iEnd = _.sortedIndex(keys, end);
        let key = keys[iEnd];
        if (key >= end && !endInclusive) {
            iEnd -= 1;
        }
        iEnd = Math.min(iEnd, len - 1);
    }
    if (iStart > iEnd) {
        return;
    }

    // Iterate
    let key: string;
    if (!reverse) {
        // Natural direction
        for (let i = iStart; i <= iEnd; i++) {
            key = keys[i];
            yield [obj[key], key];
        }
    } else {
        // Reverse direction
        for (let i = iEnd; i >= iStart; i--) {
            key = keys[i];
            yield [obj[key], key];
        }
    }
}

/**
 * Iterate over inner references at a Gun node reference, yielding
 * the inner reference and its key.
 * 
 * Note that keys are not guaranteed to be in order if there
 * is more than one connected peer.
 * 
 * @param ref Gun node reference
 **/
export async function * iterateRefs<T = any>(
    ref: IGunChainReference<T[] | Record<any, T>>,
    opts?: IterateOptions,
): AsyncGenerator<[IGunChainReference<T>, string]> {
    let innerRef: IGunChainReference<T>;
    for await (let [val, key] of iterateRecord(ref, opts)) {
        innerRef = ref.get(key as any);
        yield [innerRef, key];
    }
}

/**
 * Iterate over inner records at a Gun node reference, yielding
 * the inner record and its key.
 * 
 * Note that keys are not guaranteed to be in order if there
 * is more than one connected peer.
 * 
 * @param ref Gun node reference
 **/
export async function * iterateItems<T = any>(
    ref: IGunChainReference<T[] | Record<any, T>>,
    opts?: IterateOptions,
): AsyncGenerator<[T, string]> {
    // TODO: batch and resolve in parallel
    for await (let [val, key] of iterateRecord(ref, opts)) {
        if (typeof val === 'object') {
            val = await ref.get(key as any).then!();
        }
        yield [val, key];
    }
}

/**
 * Iterate over inner records at a Gun node reference, yielding
 * the inner record.
 * 
 * Note that keys are not guaranteed to be in order if there
 * is more than one connected peer.
 * 
 * @param ref Gun node reference
 **/
export async function * iterateValues<T = any>(
    ref: IGunChainReference<T[] | Record<any, T>>,
    opts?: IterateOptions,
): AsyncGenerator<T> {
    for await (let [v] of iterateItems(ref, opts)) {
        yield v;
    }
}

/**
 * Iterate over inner records at a Gun node reference, yielding
 * the inner record.
 * 
 * Note that keys are not guaranteed to be in order if there
 * is more than one connected peer.
 * 
 * @param ref Gun node reference
 **/
export async function * iterateKeys(
    ref: IGunChainReference,
    opts?: IterateOptions,
): AsyncGenerator<string> {
    for await (let [v, k] of iterateRecord(ref, opts)) {
        yield k;
    }
}
