import { IGunChainReference } from "gun/types/chain";

require('gun/lib/then');

/** Iterate over records once. */
export async function * iterate<T = any>(ref: IGunChainReference<T[] | Record<any, T>>): AsyncGenerator<T> {
    // Get list of refs
    // TODO: possibly filter list using GUN's lexical wire spec: https://gun.eco/docs/RAD
    let ids = Object.keys(await ref.once().then!());
    let find_ = true;
    let record: T;
    for (let id of ids) {
        if (find_ && id === '_') {
            find_ = false;
            continue;
        }
        record = await ref.get(id as any).then!();
        yield record;
    }
}
