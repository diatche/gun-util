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
 * @param ref Gun node reference
 **/
export async function * iterateKeys(
    ref: IGunChainReference,
    opts: IterateOptions = {},
): AsyncGenerator<string> {
    let {
        start,
        end,
        startInclusive = true,
        endInclusive = false,
        reverse = false,
    } = opts;
    let checkStart = typeof start !== 'undefined';
    let checkEnd = typeof end !== 'undefined';
    if (checkStart && checkEnd) {
        if (start === end && !(startInclusive && endInclusive)) {
            return;
        } else if (start! > end!) {
            throw new Error('Start value must be less than end value');
        }
    }

    // TODO: To avoid fetching too much data at once,
    // use GUN's lexical wire spec to filter and or batch: https://gun.eco/docs/RAD

    // Get list of keys
    let obj: any = await ref.then!();
    if (typeof obj !== 'object') {
        throw new Error(`Cannot iterate keys of non-object record "${obj}`);
    }
    // Remove meta
    obj = _.omit(obj, '_');
    
    let keys = Object.keys(obj);
    if (!reverse) {
        // Natural direction
        for (let key of keys) {
            if (checkEnd && (key > end! || (!endInclusive && key === end))) {
                break;
            }
            if (!checkStart || key > start! || (startInclusive && key === start)) {
                yield key;
            }
        }
    } else {
        // Reverse direction
        for (let i = keys.length - 1; i >= 0; i--) {
            let key = keys[i];
            if (checkStart && (key < start! || (!startInclusive && key === start))) {
                break;
            }
            if (!checkEnd || key < end! || (endInclusive && key === end)) {
                yield key;
            }
        }
    }
}

/**
 * Iterate over inner references at a Gun node reference, yielding
 * the inner reference and its key.
 * @param ref Gun node reference
 **/
export async function * iterateRefs<T = any>(
    ref: IGunChainReference<T[] | Record<any, T>>,
    opts?: IterateOptions,
): AsyncGenerator<[IGunChainReference<T>, string]> {
    let innerRef: IGunChainReference<T>;
    for await (let key of iterateKeys(ref as any, opts)) {
        innerRef = ref.get(key as any);
        yield [innerRef, key];
    }
}

/**
 * Iterate over inner records at a Gun node reference, yielding
 * the inner record and its key.
 * @param ref Gun node reference
 **/
export async function * iterateItems<T = any>(
    ref: IGunChainReference<T[] | Record<any, T>>,
    opts?: IterateOptions,
): AsyncGenerator<[T, string]> {
    // TODO: batch and resolve in parallel
    for await (let [innerRef, key] of iterateRefs(ref, opts)) {
        let record: T = await innerRef.then!();
        yield [record, key];
    }
}

/**
 * Iterate over inner records at a Gun node reference, yielding
 * the inner record.
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
