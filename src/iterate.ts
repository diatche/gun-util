import { IGunChainReference } from "gun/types/chain";
import _ from "lodash";
import {
    Filter,
    rangeWithFilter,
    isValueRangeEmpty,
    filterKey,
    filteredIndexRange,
} from "./filter";

const WAIT_DEFAULT = 99;

export interface ScanOptions<T=string> extends Filter<T> {
    /**
     * After this time interval (ms), no more
     * data is returned. Defaults to Gun's default
     * of 99 ms.
     **/
    wait?: number;
}

export interface IterateOptions<T=string> extends ScanOptions<T> {
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
 * Iterates over the inner keys of a record at a Gun node reference.
 * 
 * Filtering using [Gun's lexical wire spec](https://gun.eco/docs/RAD#lex)
 * is supported.
 * 
 * This method is faster than {@link iterateRecord}, but it sacrifices
 * guaranteed sorting of data by key. This is the case if there is more
 * than one connected peer.
 * 
 * @param ref Gun node reference
 **/
export async function * scanRecord<V = any, T = Record<any, V>>(
    ref: IGunChainReference<T>,
    opts: ScanOptions = {},
): AsyncGenerator<[V, string]> {
    let isDone = false;
    let keysSeen = new Set<string>();
    let batch: [V, string][] = [];
    let resolver: (() => void) | undefined;
    let nextBatchReady: Promise<void> | undefined;
    let lastDataDate = new Date();
    let { wait = WAIT_DEFAULT } = opts;

    let range = rangeWithFilter(opts);
    if (isValueRangeEmpty(range)) {
        return;
    }

    let _resolve = () => {
        let resolve = resolver;
        resolver = undefined;
        resolve && resolve();
        nextBatchReady = undefined;
    }

    let onComplete = () => {
        isDone = true;
        _resolve();
    };

    // Use `on()` instead of `once()` to customize
    // the waiting interval.
    let sub = ref.map().on((data, key) => {
        if (keysSeen.has(key)) {
            return;
        }
        keysSeen.add(key);
        lastDataDate = new Date();
        if (filterKey(key, range)) {
            batch.push([data as V, key]);
            _resolve();
        }
    });

    if (!sub) {
        // There's nothing at this reference
        // or it has been deleted.
        return;
    }

    let timer = setInterval(() => {
        if (!timer) return;
        let now = new Date();
        if (now.valueOf() - lastDataDate.valueOf() > wait) {
            // It's been to long since any new data, assume completed.
            clearInterval(timer);
            onComplete();
        }
    }, wait);

    while (!isDone || batch.length !== 0) {
        // How does the generator break out of the loop early?
        // Explanation: https://stackoverflow.com/a/43424286/328356
        while (batch.length !== 0) {
            yield batch.shift()!;
        }
        if (isDone) {
            break;
        }
        if (!nextBatchReady) {
            nextBatchReady = new Promise((resolve, reject) => {
                if (isDone) {
                    resolve();
                } else {
                    resolver = resolve;
                }
            });
        }
        // Wait for next value promise
        await nextBatchReady;
    }

    // Clean up
    sub.off();
    (sub as any) = undefined;
    clearInterval(timer);
    (timer as any) = undefined;
}

/**
 * Iterates over the inner keys of a record at a Gun node reference,
 * by loading the whole record.
 * 
 * Note that keys are guaranteed to be in order, but if a peer
 * fails to reply within the `wait` period, the item [value, key] will
 * skipped. A second pass is necessary to get these skipped items.
 * 
 * Filtering using [Gun's lexical wire spec](https://gun.eco/docs/RAD#lex)
 * is **not** supported (as at Gun v0.2020.520). Use {@link scanRecord}
 * instead, if you need to filter in this way.
 * 
 * @param ref Gun node reference
 **/
export async function * iterateRecord<V = any, T = Record<any, V>>(
    ref: IGunChainReference<T>,
    opts: IterateOptions = {},
): AsyncGenerator<[V, string]> {
    let {
        reverse = false,
        wait = WAIT_DEFAULT,
    } = opts;

    let range = rangeWithFilter(opts);
    if (isValueRangeEmpty(range)) {
        return;
    }

    // Get list of keys:
    // Prefer using `once` instead of `then` to allow
    // customizing `wait`.
    let obj: any = await new Promise((resolve, reject) => {
        let res = ref.once((data, key) => {
            resolve(data);
        }, { wait });
        if (!res) {
            resolve(undefined);
        }
    });
    if (typeof obj === 'undefined' || obj === null) {
        return;
    }
    if (typeof obj !== 'object') {
        throw new Error(`Cannot iterate keys of non-object record "${obj}" at key "${(ref as any)._?.get}"`);
    }
    // Remove meta
    obj = _.omit(obj, '_');
    let keys = Object.keys(obj).sort();

    // Find iteration bounds
    let [iStart, iEnd] = filteredIndexRange(keys, range);
    if (iStart >= iEnd) {
        return;
    }

    // Iterate
    let key: string;
    if (!reverse) {
        // Natural direction
        for (let i = iStart; i < iEnd; i++) {
            key = keys[i];
            yield [obj[key], key];
        }
    } else {
        // Reverse direction
        for (let i = iEnd - 1; i >= iStart; i--) {
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
export async function* iterateRefs<T = any>(
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
export async function* iterateItems<T = any>(
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
export async function* iterateValues<T = any>(
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
export async function* iterateKeys(
    ref: IGunChainReference,
    opts?: IterateOptions,
): AsyncGenerator<string> {
    for await (let [v, k] of iterateRecord(ref, opts)) {
        yield k;
    }
}
