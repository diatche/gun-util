# gun-util

Convenience and utility methods for [GunDB](https://github.com/amark/gun).

![Node.js CI](https://github.com/diatche/gun-util/workflows/Node.js%20CI/badge.svg)

*Note that this package is in early stages of development and there may be breaking changes within semantically compatible versions. See [change log](CHANGELOG.md).*

## Installation

Install using yarn with `yarn add gun-util` or npm `npm install gun-util`.

*If you are using ES modules, you may need to import from `'date-util/dist/index.mjs'` for imports to work.*

## Documentation

**Table of Contents:**

1. [DateTree](#DateTree)
2. [Encryption](#Encryption)
3. [GunUser](#GunUser)

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
import { DateTree } from 'date-util';

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
```

**Getting latest data:**

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
    for await (let [ref, date] of tree.iterate()) {
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
    reverse: true
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

**Other examples**

Have a look at the [examples folder](examples/).

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

### GunUser

Convenience methods for creating an authenticating a Gun user.

Have a look at the [examples folder](examples/).
