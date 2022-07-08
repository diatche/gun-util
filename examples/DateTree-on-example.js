const Gun = require('gun');
const {
  DateTree,
} = require('../dist'); /* Replace with 'gun-util' in your own project or run `yarn build` first. */
const moment = require('moment');

let gun = Gun();
let treeRoot = gun.get('test-tree-on-' + moment().toISOString());
let tree = new DateTree(treeRoot, 'millisecond');
let now = moment();

// Subscribe to tree data with a filter
tree.on(
  (data, date) => {
    console.log(`${date.toISOString()}: ${JSON.stringify(data)}`);
  },
  { gte: '2009-02-01' }
);

// Modify tree data
tree.get('1995-10-04T10:23:54.345Z').put('distant past');
tree.get('2010-04-05T15:34:17.234Z').put('past');
tree.get(now).put('now');
tree.get(now.clone().add(1, 'year')).put('future');

// Output:
// 2010-04-05T15:34:17.234Z: "past"
// 2020-06-29T21:28:59.229Z: "now"
// 2021-06-29T21:28:59.229Z: "future"
