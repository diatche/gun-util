import { SEA } from 'gun';
import { IGunChainReference } from 'gun/types/chain';
import _ from 'lodash';
import { IGunCryptoKeyPair } from 'gun/types/types';

interface CryptOptionsBase {
    pair?: IGunCryptoKeyPair,
    secret?: any,
}

interface EncryptOptionsBase extends CryptOptionsBase {
    recipient?: { epub: string; };
}

interface DecryptOptionsBase extends CryptOptionsBase {
    sender?: { epub: string; };
}

type CryptOptions = CryptOptionsBase & (
    Required<Pick<CryptOptionsBase, 'pair'>> | 
    Required<Pick<CryptOptionsBase, 'secret'>>
)

export type EncryptOptions = EncryptOptionsBase & CryptOptions;
export type DecryptOptions = DecryptOptionsBase & CryptOptions;

/**
 * Encrypt (and optionally sign) a value, array or object. The encrypted data
 * retains topology and can only be decrypted by the current user.
 * 
 * Keys are not encrypted.
 * 
 * If the value or nested value is already encrypted, does not re-encrypt
 * that value.
 * 
 * Specifying a recipient's epub key will allow that user to decrypt the value.
 * 
 * @param value 
 * @param opts
 */
export async function encrypt<T>(
    data: T,
    opts: EncryptOptions,
): Promise<T> {
    let epub = opts.recipient?.epub;
    return await _crypt(
        data,
        _encryptValue,
        { ...opts, epub }
    );
}

/**
 * Decrypt (and optionally verify) a value, array or object. The decrypted data
 * retains topology and can only be decrypted by the current user.
 * 
 * Keys are not encrypted.
 * 
 * If the value or nested value is already encrypted, does not re-encrypt
 * that value.
 * 
 * Specifying a sender's epub key will decrypt the value which was encrypted
 * by the sender.
 * 
 * @param value 
 * @param opts 
 */
export async function decrypt<T>(
    data: T,
    opts: DecryptOptions,
): Promise<T> {
    let epub = opts.sender?.epub;
    return await _crypt(
        data,
        _decryptValue,
        { ...opts, epub }
    );
}

export async function _crypt(
    data: any,
    map: any,
    opts: CryptOptions & {
        epub?: string;
    }
): Promise<any> {
    let { pair, secret = '', epub = '' } = opts;
    if (!pair && !secret) {
        throw new Error('Either pair or secret is required');
    }
    if (!secret && epub) {
        secret = await (SEA as any).secret(epub, pair || secret);
        if (typeof secret === 'undefined') {
            throw _getSEAError('Could not create secret');
        }
    }
    if (!secret) {
        secret = pair;
    }
    return await _mapDeep(
        data,
        map,
        { secret, signed: !epub }
    );
}

/**
 * Traverse data and map.
 * @param data 
 * @param map 
 * @param opts 
 */
async function _mapDeep(
    data: any,
    map: any,
    opts: {
        secret: any,
        signed: boolean,
    }
): Promise<any> {
    switch (typeof data) {
        case 'undefined':
            return undefined;
        case 'object':
            if (_.isArrayLike(data)) {
                // Array
                return Promise.all(
                    _.map(data, x => _mapDeep(x, map, opts))
                );
            }
            // Object
            let meta = data._;
            if (meta) {
                // Remove meta
                data = _.omit(data, '_');
            }
            let keys = Object.keys(data);
            let rawValues = Object.values(data);
            let values = await Promise.all(
                rawValues.map(x => _mapDeep(x, map, opts))
            );
            let result = _.zipObject(keys, values);
            if (meta) {
                result = { _: meta, ...result };
            }
            return result;
        default:
            return map(data, opts);
    }
}

const _encryptValue = async (
    value: string,
    { secret, signed }: {
        secret: any,
        signed: boolean,
    }
): Promise<string> => {
    if (value.startsWith('SEA{')) {
        // Already encrypted
        return value;
    }
    let data: string | undefined = await SEA.encrypt(value, secret);
    if (typeof data === 'undefined') {
        throw _getSEAError('Could not encrypt');
    }
    if (signed) {
        data = await SEA.sign(data, secret);
        if (typeof data === 'undefined') {
            throw _getSEAError('Could not sign');
        }
    }
    return data;
};

const _decryptValue = async (
    data: string,
    { secret, signed }: {
        secret: any,
        signed: boolean,
    }
): Promise<string> => {
    if (!data.startsWith('SEA{')) {
        // No decryption necessary
        return data;
    }
    let msg: any = data;
    if (signed) {
        msg = await SEA.verify(data, secret);
        if (typeof msg === 'undefined') {
            throw _getSEAError('Could not verify');
        }
    }
    let value: any = await SEA.decrypt(msg, secret);
    if (typeof value === 'undefined') {
        throw _getSEAError('Could not decrypt');
    }
    return value;
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
