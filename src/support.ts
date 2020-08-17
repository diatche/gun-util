import { IGunChainReference } from "./gun/types/chain"

export const isPlatformWeb = () => {
    return typeof window !== 'undefined';
};

export const isGunInstance = (gun: any): gun is IGunChainReference => {
    return !!gun?.user && !!gun?.constructor?.SEA;
};
