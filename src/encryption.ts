import { SEA } from 'gun';
import { IGunChainReference } from 'gun/types/chain';

/**
 * Encrypt and sign a message, which can only be decrypted
 * by the current user.
 * If the message is already encrypted, does not re-encrypt.
 * @param value 
 * @param gun 
 */
export const encrypt = async (value: string, gun: IGunChainReference, secret?: any): Promise<string> => {
    if (value.startsWith('SEA{')) {
        // Already encrypted
        return value;
    }
    secret = secret || (gun.user() as any)._.sea;
    if (!secret) {
        throw new Error('Must login to encrypt');
    }
    let enc = await SEA.encrypt(value, secret);
    let data = await SEA.sign(enc, secret);
    if (typeof data === 'undefined') {
        throw _getSEAError('Could not encrypt');
    }
    return data;
};

/**
 * Verify and decrypt a message using the current user's keys.
 * If the message is already decrypted, return the message.
 * @param value 
 * @param gun 
 */
export const decrypt = async (data: string, gun: IGunChainReference, secret?: any): Promise<string> => {
    if (!data.startsWith('SEA{')) {
        // No decryption necessary
        return data;
    }
    secret = secret || (gun.user() as any)._.sea;
    if (!secret) {
        throw new Error('Must login to decrypt');
    }
    let msg = await SEA.verify(data, secret);
    let value: any = await SEA.decrypt(msg, secret);
    if (typeof value === 'undefined') {
        throw _getSEAError('Could not decrypt');
    }
    return value;
};

export const encryptFor = async (
    value: string,
    { epub }: { epub: string },
    gun: IGunChainReference
): Promise<string> => {
    let pair = (gun.user() as any)._.sea;
    let secret = await (SEA as any).secret(epub, pair);
    return await encrypt(value, gun, secret);
};

export const encryptManyFor = async (
    values: string[],
    { epub }: { epub: string },
    gun: IGunChainReference
): Promise<string[]> => {
    let pair = (gun.user() as any)._.sea;
    let secret = await (SEA as any).secret(epub, pair);
    return Promise.all(values.map(v => encrypt(v, gun, secret)));
};

export const decryptFrom = async (
    data: string,
    { epub }: { epub: string },
    gun: IGunChainReference
): Promise<string> => {
    let pair = (gun.user() as any)._.sea;
    let secret = await (SEA as any).secret(epub, pair);
    return await decrypt(data, gun, secret);
};

export const decryptManyFrom = async (
    items: string[],
    { epub }: { epub: string },
    gun: IGunChainReference
): Promise<string[]> => {
    let pair = (gun.user() as any)._.sea;
    let secret = await (SEA as any).secret(epub, pair);
    return Promise.all(items.map(x => decrypt(x, gun, secret)));
};

const _getSEAError = (_default?: Error | string): Error | undefined => {
    let err = SEA.err || _default;
    if (!err) {
        return undefined;
    }
    if (typeof err === 'object' && err instanceof Error) {
        return err;
    }
    return new Error(String(err));
};
