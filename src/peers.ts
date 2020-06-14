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


/*

anyone got a better way to remove peers than gun.back('opt.peers')[peerurl].wire.close(); gun.opt({peers: []}); gun.opt({peers: newpeers})

<@!721344914297978892> I think you can pass the peer to `gun.on('bye', {peer})`, ... I think?

@marknadal thanks mark for your reply, unfortunately  gun still reconnects to the peer after gun.on('bye', {peer})

*/