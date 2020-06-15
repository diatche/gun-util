/*

Dletta
@Joncom ACL out of the box only comes with the tools to create-your-own ACL solution
There has been a few different kinds of solutions proposed
(1) handle read permissions by encryption and handle write permissions by 'shared' paths on two user graphs. The UI will then read out both users values and use Gun CRDT to determine what the visible value should be (aka latest edit)
(2) key based read/write permissions, shared keys under which data can be accessed by any user that has the key
(3) public graph solutions that use zrzzt bulletcatcher to inspect every read and write and uses a set of rules to validate whether a write or read should be permitted
(3) is the federated approach or "centralized" approach. Can be distributed, but the rules are controlled by who makes them, aka federated
I think if https://github.com/rollup/plugins/tree/master/packages/commonjs can be used to generate a bundle that will import correctly on things like react etc, @circles then we can just PR the bundle.js

Joncom
(3) is the federated approach or "centralized" approach
@Dletta In what sense is this "centralized"? Couldn't you include the bullet-catcher ACL logic in your DApp when you publish it? And couldn't you instruct users who want to run their own Gun peer nodes to run your custom Gun server (w/ ACL logic included) if they want to contribute to hosting this decentralized app?
Wouldn't that protect your primary peer node from storing ACL restricted content? And additionally protect your browser clients from accepting any ACL-violating content?

Dletta
Yes you could, each node could run the same rules and logic, but it would only work for people within your network and controlled relay peers. Any other peer may not respect your rules. 1 and 2 respect all peer capabilities and is therefore meant for all peers aka truly decentralized
*/