import { IGunChainReference } from "gun/types/chain";
import * as GunTypes from "gun/types/types";

/** { '#': 'id' } */
export interface IGunRef extends GunTypes.IGunRecordNodeRawBase {}

export interface IGunUserRecordMeta<T> extends GunTypes.IGunRecordNodeRawExtra<T> {
    /**
     * Having this property means that the user is
     * logged in.
     **/
    sea?: GunTypes.IGunCryptoKeyPair
}

export interface IGunUserRecord<T=any> extends GunTypes.IGunRecordNodeRaw<T> {
    _: IGunUserRecordMeta<T>;
}

export interface IGunQuery {
    '.': IGunFilter,
    /**
     * To prevent flooding the network, any response to a
     * lexical lookup that does not have an exact match
     * will be limited. You are responsible for asking
     * for more data if you run over the byte limit.
     **/
    '%': number,
}

export interface IGunFilter {
    /** Prefix match */
    '*'?: string;
    '>'?: string;
    '<'?: string;
    /** Exact match */
    '='?: string;
    /** 1: Reverse direction */
    '-'?: 0 | 1;
}
