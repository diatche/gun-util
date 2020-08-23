import { IGunChainReference } from "./gun/types/chain";

export const getGunKey = (ref: any): string => {
    return ref._?.get || ref.get || ref.$?.get || ref.$?._?.get;
}

export const getGunPath = (
    ref: any,
    options?: {
        relativeTo: any,
    }
): string[] => {
    let currentRef: any = ref;
    let keys: string[] = [];
    let ok = true;
    const relativeKey = options?.relativeTo
        ? getGunKey(options.relativeTo)
        : undefined;
    while (currentRef && keys.length < units.length) {
        let key = getGunKey(currentRef);
        if (!key || key === relativeKey) {
            ok = false;
            break;
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
    if (getGunKey(currentRef) !== relativeKey) {
        ok = false;
    }
    if (!ok) {
        throw new Error('Invalid Gun node reference. Expected a leaf on the date tree.');
    }
    let values = keys.map(k => DateTree.decodeDateComponent(k));
    let comps: DateComponentsUnsafe = _.zipObject(units, values);
    return DateTree.getDateWithComponents(comps);
}