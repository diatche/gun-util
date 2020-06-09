import Gun from 'gun';
import { IGunConstructorOptions } from 'gun/types/options';

require('gun/lib/then');

export const TEST_GUN_OPTIONS: IGunConstructorOptions = {
    web: undefined,
    peers: [],
    radisk: false,
    localStorage: false,
    multicast: false,
    axe: false,
};
