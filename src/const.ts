import { IGunConstructorOptions } from './gun/types/options';
import { isPlatformWeb } from './support';

export const TEST_GUN_PEERS: string[] = isPlatformWeb()
    ? []
    : (process.env.TEST_GUN_PEERS || '')
        .split(',')
        .map(peer => peer.trim())
        .filter(peer => !!peer);

export const TEST_GUN_OPTIONS: IGunConstructorOptions = {
    peers: TEST_GUN_PEERS,
    radisk: false,
    localStorage: false,
    axe: false,
    multicast: false,
};
