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
-----
anyone got a better way to remove peers than gun.back('opt.peers')[peerurl].wire.close(); gun.opt({peers: []}); gun.opt({peers: newpeers})

I think you can pass the peer to `gun.on('bye', {peer})`, ... I think?

thanks mark for your reply, unfortunately  gun still reconnects to the peer after gun.on('bye', {peer})
------

------
How can I programmatically check if the current gun peer connection is "connected"?
Where does Gun keep its reference to the active WebSocket object?

@Joncom gun._.opt.peers[‘peerurl’].wire.connectionStatus
------
*/