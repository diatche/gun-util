# gun-util

Convenience and utility methods for [GunDB](https://github.com/amark/gun).

![Node.js CI](https://github.com/diatche/gun-util/workflows/Node.js%20CI/badge.svg)

Tested with various Gun versions from `0.2019.930` up to GitHub master commit [5cbd5e3](https://github.com/amark/gun/commit/5cbd5e394325a987c0ef50284e5bd99be66d21b3).

*Note that this package is in early stages of development and there may be breaking changes within semantically compatible versions. See [change log](CHANGELOG.md).*

## Installation

### Node (CommonJS) and React (Native) (ESM)

- Install using yarn with `yarn add gun-util` or npm `npm install gun-util`.
- Install `gun` as a peer dependency. Supported versions:
   - `0.2019.930`.
   - `>0.2020.520`.
   - GitHub master commit [7c45ddb](https://github.com/amark/gun/commit/7c45ddb558a492e53df2832bf2e4ee873f772176) or later.

### Browser (UMD)

Include dependencies and the UMD bundle `dist/index.umd.js`. See an example [here](examples/subscription.html).

## Documentation

**Table of Contents:**

1. [DateTree](#DateTree)
2. [Encryption](#Encryption)
3. [Auth](#Auth)
3. [Other Methods](#Other-Methods)

### DateTree

Efficiently distributes and stores data in a tree with nodes using date components as keys up
to a specified resolution. The root of the tree is specified as a Gun node reference.

Example (up to hours): 

```
         2020 (year)
        /  |  \
      04  ...  11 (month)
     /  \     /  \
    23  ..   ..   04 (day)
   /  \          /  \
  ..  ..        ..  .. (hour)
```

**Why not just use a hash table?**

Having large nodes is discouraged in a graph database like Gun. If you need to store large lists or tables of data, you need to break them up into smaller nodes to ease synchronization between peers.

#### Usage

For the exaples below, we will use the following setup:

```javascript
import { DateTree } from 'gun-util';

let gun = Gun();
let treeRoot = gun.get('tree');
let tree = new DateTree(treeRoot, 'day');
```

**Getting a node at a specific date:**

Easily find a reference to a node using the date.

```javascript
tree.get('2020-08-23').put({ event: 'of a lifetime' });
// The above is equivalent to:
treeRoot.get('2020').get('08').get('23').put({ event: 'of a lifetime' });
// This is assuming that UTC is the default time zone. See notes below.
```
Jump to [Notes](#Notes).

**Subscribing to data:**

```javascript
// Subscribe to tree data with a filter
tree.on((data, date) => {
    console.log(`${date.toISOString()}: ${JSON.stringify(data)}`);
}, { gte: '2009-02-01' });

// Modify tree data
tree.get('1995-10-04T10:23:54.345Z').put('distant past');
tree.get('2010-04-05T15:34:17.234Z').put('past');
tree.get(new Date()).put('now');

// Output:
// 2010-04-05T15:34:17.234Z: "past"
// 2020-06-29T21:28:59.229Z: "now"
```

**Getting latest data once:**

```javascript
await tree.get(new Date()).put({ event: 'insider info' }).then();
let [latestRef, date] = await tree.latest();
console.log(`Fetching latest event on ${date.toISOString()}...`);
console.log('event: ' + (await latestRef.then()).event);

// Output:
// Fetching latest event on 2020-06-18T00:00:00.000Z...
// event: insider info
```

**Iterating through date references:**

You can store data and iterate through only populated nodes without
traversing all the nodes.

```javascript
let tree = new DateTree(treeRoot, 'minute');

tree.get('1995-01-21 14:02').put({ event: 'good times' });
tree.get('2015-08-23 23:45').put({ event: 'ultimate' });
tree.get('2020-01-16 05:45').put({ event: 'earlybird' });

(async () => {
    // A naive implementation would have close to a billion
    // nodes and would take forever to iterate.
    // This takes only a second:
    for await (let [ref, date] of tree.iterate({ order: 1 })) {
        let event = await ref.get('event').then();
        console.log(`${date} event: ${event}`);
    }
    // Output:
    // Sat Jan 21 1995 14:02:00 GMT+0000 event: good times
    // Sun Aug 23 2015 23:45:00 GMT+0000 event: ultimate
    // Thu Jan 16 2020 05:45:00 GMT+0000 event: earlybird
})();
```

Filtering by date range and reverse iteration is possible using options:

```javascript
tree.iterate({
    gte: '2020-01-01',
    lt: '2020-02-01',
    order: -1
})
```

**Watch for changes:**

Let's say we want to listen to changes to a blog described
by a date tree.

How would we handle a case where we are close to the end
of the nodes for the current time period?

For example, we are at `2019-12-31 23:54`, which is the end
of the hour, day, month and year. We may get a message this
minute or next hour or day.

Subscribing to all nodes would be impractical.

Listen to a single path of the tree instead with `changesAbout()`.

```javascript
let tree = new DateTree(treeRoot, 'minute');

tree.get('1995-01-21 14:02').put({ blog: 'good times' });
tree.get('2015-08-23 23:45').put({ blog: 'ultimate' });
tree.get('2019-12-31 23:54').put({ blog: 'almost NY' });

let unsub = tree.changesAbout('2019-12-31 23:54', dateComponents => {
    /*
     * Whenever a node changes next to the direct path between the root and the
     * tree's maximum resolution, the callback is called with the date components
     * identifying the node. Note that the date components are partial unless the
     * change occured at the maximum resolution.
     */

    // Create a date to visualise the data
    let date = DateTree.getDateWithComponents(dateComponents);
    console.log(date.toISOString());
    // Output:
    // 1995-01-01T00:00:00.000Z
    // 2015-01-01T00:00:00.000Z
    // 2019-12-31T23:59:00.000Z
    // 2019-12-31T23:59:00.000Z
    // 2019-12-31T23:59:00.000Z
    // 2019-12-31T23:59:00.000Z
    // 2020-01-01T00:00:00.000Z
});

tree.get('2019-12-31 23:59').put({ blog: '3! 2! 1!' });
tree.get('2020-01-01 00:12').put({ blog: 'Happy NY!' });
```

At each date in the future, we can call `tree.latest()`
and `tree.iterate()` to get the latest data.

When the date gets too far away, for example after `2020-01-01`,
we can call `unsub()` and resubscribe to a later date.

#### Other examples

Have a look at the [examples folder](examples/).

#### Notes

- The dates are stored in UTC time zone, but partial strings (without a time zone) are parsed in the local time zone (to be consistent with the convention). Avoid using partial string dates on trees with a resolution of `day` if this does not suit your use case. Using a resolution of `hour` solves most of the issues, but there are acouple of 30-minute time zones, so if you need perfection, then a resolution of `minute` is the way to go.
- Noting the above, consider the scenario where we have a date tree with resolution `day` and the local time zone offset is +12:00:
   - If you use `tree.get('2020-08-23')`, you will in fact reference the previous date as the partial string parses into `2020-08-22T12:00:00.000Z`.
      - Use `tree.get('2020-08-23T00:00:00Z')` or
      - `tree.get(moment.utc('2020-08-23'))` to avoid this.
   - Filtering with `{ gte: '2009-02-01' }` will match dates after and including `2009-01-31`.
      - Use `{ gte: '2009-02-01T00:00:00Z' }` or
      - `{ gte: moment.utc('2009-02-01') }` to avoid this.

### Encryption

Allows encrypting and decrypting values and objects for the logged in user
or for another user (using their epub key).

**Encrypting private data:**

Only the user can decrypt the value.

```javascript
let pair = gun.user()._.sea;
let enc = await encrypt('a@a.com', { pair });
let dec = await decrypt(enc, { pair });
assert(dec === 'a@a.com');
```

**Encrypting data for someone else:**

Only the specified user can decrypt the value.

```javascript
let frodo = await SEA.pair();
let gandalf = await SEA.pair();

let enc = await encrypt({ whereami: 'shire' }, {
    pair: frodo,
    recipient: gandalf // Or { epub: gandalf.epub }
});

let dec = await decrypt(enc, {
    pair: gandalf,
    sender: frodo // Or { epub: frodo.epub }
});

assert(dec.whereami === 'shire');
```

**Other examples**

Have a look at the [examples folder](examples/).

### Auth

Convenience methods for creating an authenticating a Gun user.

This wrapper provides greater consistency by handling a couple of edge cases, namely:

- In some Gun versions, callbacks are not fired consistently. This wrapper listens to both local and global `auth` and returns in both cases.
- When trying to log in to an existing user on an unsynced gun instance, you may get `User does not exist!` errors. This wrapper syncs the necessary data before attempting to login.
- Another more troublesome pitfall with unsynced gun instances is if you try to create a user with an alias which has already been user on another Gun instance, you will get different key pairs and will not be able to sync the data of that user between those Gun instances. This wrapper takes extra precautions before creating a user (no guarantees though, it all depends on how long you want to wait for the sync to happen).

See also the [Notes](#Notes-1) section below.

**Basics:**

```javascript
let gun = new Gun()
let auth = new Auth(gun);

await auth.create({
    alias: 'alice',
    pass: 'secret'
});

auth.logout();

await auth.login({
    alias: 'alice',
    pass: 'secret'
});
```

**Watching for authentication:**

```javascript
// With callback
auth.on(() => {
    let publicKey = auth.user();
    let pair = auth.pair();
});

// With promise
let publicKey = await auth.on();
```

**Custom authentication recall:**

```javascript
auth.delegate = {
    storePair: async (pair, auth) => {
        await saveSecret(pair);
    },
    recallPair: async (auth, opts) => {
        await loadSecret(pair);
    },
}
```

**Getting a user's public key with an alias:**

```javascript
let publicKey = await auth.getPub({ alias: 'alice' });
```

Have a look at the [examples folder](examples/).

#### Notes

- It's been observed that multiple `gun.on('auth', cb)` do not work. If you use your own `gun.on('auth', cb)` listener, call `Auth#did()` inside of it. Or use `Auth#on()` instead.
- It's been observed that when `Auth#exists()`, `Auth#getPub()` or `gun.get('~@' + alias)` is used, `gun.user().auth()` stops working and fails immediately with an invalid credentials error.
  - `Auth#login()` uses `gun.user().auth()` with `{ wait: <timeout> }` instead.
  - Avoid using `Auth#exists()`, `Auth#getPub()` and `gun.get('~@' + alias)` before logging in if this is an issue with your Gun version.

### Other Methods

- `subscribe(ref, callback, opt?)`
  - Subscribe to a Gun node `ref` and return
    a subscription.

    Unsubscribes automatically on uncaught errors
    inside the callback and rethrows.

    **Why not just use `ref.on()`?**

    Calling `ref.off()` unsubscribes all listeners,
    not just the last one. This method provides a 
    way to unsubscribe only a single listener inline.

    For example:

    ```javascript
    let dataRef = gun.get('data');
    let sub1 = subscribe(dataRef, data => console.log('sub1: ' + data));
    let sub2 = subscribe(dataRef, data => console.log('sub2: ' + data));
    dataRef.put('a');
    sub1.off();
    // sub2 is still active!
    dataRef.put('b');
    // Output:
    // sub1: a
    // sub2: a
    // sub2: b
    ```
- `waitForData(ref, { filter?, timeout? })`
  - Returns a promise, which resolves when data arrives at a node reference.
- `delay(ms, passthrough?)`
  - Promisified `setTimeout()`.
- `errorAfter(ms, error)`
  - Throw error after `ms` interval.
- `timeoutAfter(promise, ms, error?)`
  - If the promise does not resolve (or error) within `ms` interval, throws a the specified `error`. If no error is specified, uses a `TimeoutError` instead.

## Development

For faster unit tests, create an `.env.local` file in the project directory and add a test gun peer:

```sh
GUN_PEERS="https://<your-id>.herokuapp.com/gun"
```

Alternatively, use `export GUN_PEERS="https://<your-id>.herokuapp.com/gun"` before running unit tests.
