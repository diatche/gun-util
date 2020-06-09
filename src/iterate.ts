import { IGunChainReference } from "gun/types/chain";
import { GunError } from "./errors";

/** Iterate over records once. */
export async function * iterate<T = any>(ref: IGunChainReference<T[]>): AsyncGenerator<T> {
    let isDone = false;
    let error: any;
    let batch: T[] = [];
    let resolver: (() => void) | undefined;
    let nextBatchReady: Promise<void> | undefined;

    let _resolve = () => {
        let resolve = resolver;
        resolver = undefined;
        resolve && resolve();
        nextBatchReady = undefined;
    }

    let stream = ref.map().once((value, id) => {
        batch.push(value as any);
        _resolve();
    });

    if (!stream.then) {
        throw new GunError('gun.then() method missing');
    }
    stream.then?.().then(value => {
        isDone = true;
        _resolve();
    });

    try {
        while (!isDone) {
            // How does the generator break out of the loop early?
            // Explanation: https://stackoverflow.com/a/43424286/328356
            while (batch.length !== 0) {
                yield batch.shift() as T;
            }
            if (!nextBatchReady) {
                nextBatchReady = new Promise<void>((resolve, reject) => {
                    if (isDone) {
                        resolve();
                    } else {
                        resolver = resolve;
                    }
                });
            }
            // Wait for next value promise
            await nextBatchReady;
            while (batch.length !== 0) {
                yield batch.shift() as T;
            }
        }
    } finally {
        stream.off();
    }

    if (error) {
        throw error;
    } else {
        while (batch.length !== 0) {
            yield batch.shift() as T;
        }
    }
}
