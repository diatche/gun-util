import { IGunChainReference } from "gun/types/chain";
import { IGunRootRef, IGunPeer } from "./types";

/** Returns all the peers which are currently connected. */
export function getConnectedPeers<T>(gun: IGunChainReference<T>): IGunPeer[] {
    let peers = (gun as IGunRootRef<T>)._.opt.peers;
    let peerKeys = Object.keys(peers);
    let connectedPeers: IGunPeer[] = [];
    for (let i = 0; i < peerKeys.length; i++) {
        let peer = peers[peerKeys[i]];
        if (peer.wire.readyState === 1) {
            connectedPeers.push(peer);
        }
    }
    return connectedPeers;
};
