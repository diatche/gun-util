import { IGunChainReference } from "gun/types/chain";

export interface IterateOptions {
    reverse?: boolean;
}

/**
 * Iterate over the inner keys of a record at a Gun node reference.
 * @param ref Gun node reference
 **/
export async function * iterateKeys<
    K extends string | number | symbol = string
>(
    ref: IGunChainReference<Record<K, any>>,
    opts?: IterateOptions,
): AsyncGenerator<K> {
    // Get list of keys
    // TODO: possibly filter list using GUN's lexical wire spec: https://gun.eco/docs/RAD
    let obj = await ref.once().then!();
    if (typeof obj !== 'object') {
        throw new Error(`Cannot iterate keys of non-object record "${obj}`);
    }
    let keys = Object.keys(obj);
    let find_ = true;
    if (!opts?.reverse) {
        for (let key of keys) {
            if (find_ && key === '_') {
                find_ = false;
                continue;
            }
            yield key as K;
        }
    } else {
        for (let i = keys.length - 1; i >= 0; i--) {
            let key = keys[i];
            if (find_ && key === '_') {
                find_ = false;
                continue;
            }
            yield key as K;
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
    gunLogOnceFix();
    let innerRef: IGunChainReference<T>;
    for await (let key of iterateKeys(ref, opts)) {
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
    gunLogOnceFix();
    let record: T;
    for await (let [innerRef, key] of iterateRefs(ref, opts)) {
        record = await innerRef.then!();
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

/** Iterate over records once. */
export function iterate<T = any>(
    ref: IGunChainReference<T[] | Record<any, T>>,
    opts?: IterateOptions,
): AsyncGenerator<T> {
    return iterateValues(ref, opts);
}
