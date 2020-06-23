import { IGunChainReference } from "gun/types/chain";

/**
 * Subscribes to a Gun node reference and return
 * that value when the filter returns a truthy value.
 * 
 * If no filter is specified, returns on the
 * first non-undefined value.
 * @param ref
 * @param filter 
 */
export async function waitForData<T = any>(ref: IGunChainReference<Record<any, T>>, filter?: (data: T) => boolean): Promise<T> {
    if (!ref) {
        throw new Error('Invalid Gun node reference');
    }
    if (typeof filter !== 'undefined' && (typeof filter !== 'function' || filter.length === 0)) {
        throw new Error('Invalid filter');
    }
    return new Promise<T>((resolve, reject) => {
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
}

/**
 * Resolve after `ms` interval.
 * @param ms 
 * @param passthrough 
 */
export function delay<T=any>(ms: number, passthrough?: T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        setTimeout(() => resolve(passthrough), ms);
    });
}

