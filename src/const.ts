import { IGunConstructorOptions } from './gun/types/options';

export const GUN_PEERS: string[] = (process.env.GUN_PEERS || process.env.EXPO_GUN_PEERS || '')
    .split(',')
    .map(peer => peer.trim())
    .filter(peer => !!peer);

export const TEST_GUN_OPTIONS: IGunConstructorOptions = {
    peers: GUN_PEERS,
    radisk: false,
    localStorage: false,
    axe: false,
    multicast: false,
};
