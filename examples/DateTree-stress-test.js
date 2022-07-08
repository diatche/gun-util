const Gun = require('gun');
const { v4: uuidv4 } = require('uuid');
const {
  DateTree,
} = require('../dist'); /* Replace with 'gun-util' in your own project or run `yarn build` first. */
const moment = require('moment');

let gun = Gun();
let treeRoot = gun.get('test-tree-stress');
let resolution = 'day';
let tree = new DateTree(treeRoot, resolution);

let start = moment.utc('2010-01-01');
let end = moment.utc('2020-01-01');
let date = start.clone();
let count = 0;
let puts = [];

while (date.isBefore(end)) {
  let put = tree.get(date).put({
    data: uuidv4(),
  });
  date.add(1, resolution);
  puts.push(put.then());
  count += 1;
}

(async () => {
  console.log(`Wait for save...`);
  await Promise.all(puts);

  console.log(`Fetching ${count} records...`);
  let startTimestamp = moment();
  let counter = 0;

  let it, it0, itN;
  for await (it of tree.iterate({ order: -1 })) {
    if (!it0) it0 = it;
    counter += 1;
  }
  itN = it;

  let endTimestamp = moment();
  let time = endTimestamp.unix() - startTimestamp.unix();
  let rate = count / time;

  for (let [ref, date] of [it0, itN]) {
    let data = await ref.get('data').then();
    console.log(`${date}: ${data}`);
  }

  console.log(`Fetched ${counter} records in ${time} s at ${rate} records/s`);

  // Output:
  // Fri Jan 01 2010 00:00:00 GMT+0000: 621158bc-aa17-4e86-833f-e624754b90f4
  // Tue Dec 31 2019 00:00:00 GMT+0000: beedaeeb-4e8b-4cbc-b669-0d3f7468a6f8
  // Fetched 3652 records in 14 s at 260.85714285714283 records/s
})()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e + '');
    process.exit(1);
  });

// Delete your radata folder (Gun's local storage) if you see unexpected logs
