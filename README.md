# gun-util
Convenience and utility methods for [GunDB](https://github.com/amark/gun).

## Installation

Install using yarn with `yarn add gun-util` or npm `npm install gun-util`.

## Documentation

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

**Iterating through date references:**

You can store data and iterate through only populated nodes without
traversing all the nodes.

```javascript
tree.get('2020-01-01').put('a');
tree.get('2020-06-12').put('b');
tree.get('2020-10-25').put('c');

let it = tree.iterate({
    start: '2020-01-01',
    end: '2020-12-31',
})

for await (let [valueRef, date] of it) {
    let value = await valueRef.then();
    console.log(date.format('YYYY-MM-DD') + ': ' + value);
}

// Output:
// 2020-01-01: a
// 2020-06-12: b
// 2020-10-25: c
```
