import { IGunChainReference } from "./gun/types/chain";

export const getGunKey = (ref: any): string => {
    return ref._?.get || ref.get || ref.$?.get || ref.$?._?.get;
}

export const getGunPath = (
    ref: any,
): string[] => {
    let currentRef: any = ref;
    let keys: string[] = [];
    let ok = true;
    while (currentRef) {
        let key = getGunKey(currentRef);
        if (!key) {
            throw new Error('Invalid Gun node reference');
        }
        keys.unshift(key);
        if (typeof currentRef.back === 'function') {
            // Using concrete reference
            currentRef = currentRef.back();
        } else if (typeof currentRef.$?._?.back === 'object') {
            // Using reference from callback
            currentRef = currentRef.$?._?.back;
        } else if (typeof currentRef.$?.back === 'function') {
            // Using reference from callback
            currentRef = currentRef.$?.back();
        } else {
            ok = false;
            break;
        }
    }
    return keys;
}