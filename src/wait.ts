import { IGunChainReference } from "gun/types/chain";
import { TimeoutError } from "./errors";

/**
 * Subscribes to a Gun node reference and return
 * that value when the filter returns a truthy value.
 * 
 * If no `filter` is specified, returns on the
 * first non-undefined value.
 * 
 * If a `timeout` (in milliseconds) is given, and no 
 * matching data arrives in that time, `timeoutError`
 * is thrown (or a `TimeoutError` if none given).
 * 
 * @param ref
 * @param filter 
 */
export async function waitForData<T = any>(
    ref: IGunChainReference<Record<any, T>>,
    options: {
        filter?: (data: T) => boolean;
        timeout?: number;
        timeoutError?: Error;
    } = {},
): Promise<T> {
    if (!ref) {
        throw new Error('Invalid Gun node reference');
    }
    let {
        filter,
        timeout,
        timeoutError,
    } = options;
    if (typeof filter !== 'undefined' && (typeof filter !== 'function' || filter.length === 0)) {
        throw new Error('Invalid filter');
    }
    let listener = new Promise<T>((resolve, reject) => {
        if (!filter) {
            filter = (data: T) => typeof data !== 'undefined';
        }
        (ref as any).on((data: T, key: string, at: any, ev: any) => {
            if (filter!(data)) {
                ev?.off?.();
                resolve(data);
            }
        });
    });
    if (timeout && timeout > 0) {
        return await timeoutAfter(listener, timeout, timeoutError);
    } else {
        return await listener;
    }
}

/**
 * Resolve after `ms` interval.
 * @param ms 
 * @param passthrough 
 */
export function delay<T = any>(ms: number, passthrough?: T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        setTimeout(() => resolve(passthrough), ms);
    });
}

/**
 * Throw error after `ms` interval.
 * @param ms 
 * @param error 
 */
export async function errorAfter<T = void>(ms: number, error: Error): Promise<T> {
    await delay(ms);
    throw error;
}

/**
 * If the promise does not resolve (or error) within `ms` interval,
 * throws a the specified `error`. If no error is specified, uses
 * a `TimeoutError` instead.
 * @param ms 
 * @param error 
 */
export async function timeoutAfter<T = any>(promise: Promise<T>, ms: number, error?: Error): Promise<T> {
    return Promise.race([
        promise,
        errorAfter<T>(ms, error || new TimeoutError()),
    ]);
}
