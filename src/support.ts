import { IGunChainReference } from "gun/types/chain"

export const isPlatformWeb = () => {
    return typeof window !== 'undefined';
}

export const isGunAuthPairSupported = (gun: IGunChainReference) => {
    // Since PR [#964](https://github.com/amark/gun/commit/3e678b8568a4a8a825b84b26759d4dd4f3b0988e),
    // auth and create support pair instead of just alias and pass.
    return gun.user().auth.length === 0;
}
