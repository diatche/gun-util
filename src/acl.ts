/*

Dletta
@Joncom ACL out of the box only comes with the tools to create-your-own ACL solution
There has been a few different kinds of solutions proposed
(1) handle read permissions by encryption and handle write permissions by 'shared' paths on two user graphs. The UI will then read out both users values and use Gun CRDT to determine what the visible value should be (aka latest edit)
(2) key based read/write permissions, shared keys under which data can be accessed by any user that has the key
(3) public graph solutions that use zrzzt bulletcatcher to inspect every read and write and uses a set of rules to validate whether a write or read should be permitted
(3) is the federated approach or "centralized" approach
I think if https://github.com/rollup/plugins/tree/master/packages/commonjs can be used to generate a bundle that will import correctly on things like react etc, @circles then we can just PR the bundle.js

*/