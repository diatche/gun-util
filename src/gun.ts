import Gun from 'gun';
import { IGunConstructorOptions } from 'gun/types/options';

require('gun/lib/then');

const DEFAULT_PORT = 8765;

const localPort = process.env.GUN_PORT || DEFAULT_PORT;
const localIP = process.env.IP || 'localhost';

export const DEFAULT_GUN_OPTIONS: IGunConstructorOptions = {
    peers: [
        `http://${localIP}:${localPort}/gun`,
    ]
}

export const TEST_GUN_OPTIONS: IGunConstructorOptions = {
    web: undefined,
    peers: [],
    radisk: false,
    localStorage: false,
    multicast: false,
    axe: false,
};

export function createGun<T>(
    options?: string | string[] | IGunConstructorOptions
) {
    return Gun<T>(options);
};
