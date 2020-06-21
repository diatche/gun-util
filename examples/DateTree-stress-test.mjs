import Gun from 'gun';
import { DateTree } from '../dist/index.mjs';
import moment from 'moment';

let gun = Gun();
let treeRoot = gun.get('tree-stress');
let resolution = 'day'
let tree = new DateTree(treeRoot, resolution);

let start = moment.utc('2010-01-01');
let end = moment.utc('2020-01-01');
let date = start.clone();
let count = 0;
let lastPut;

while (date.isBefore(end)) {
    lastPut = tree.get(date).put({
        data: Math.random().toString(36).substring(7)
    });
    date.add(1, resolution);
    count += 1;
}

(async () => {
    console.log(`Wait for save...`);
    await lastPut.then();

    console.log(`Fetching ${count} records...`);
    let startTimestamp = moment();
    for await (let [ref, date] of tree.iterate({ reverse: true })) {
        let data = await ref.get('data').then();
        console.log(`${moment().toISOString()}: data on ${date}: ${data}`);
    }
    let endTimestamp = moment();
    let time = endTimestamp.unix() - startTimestamp.unix();
    let rate = count / time;
    console.log(`Fetched ${count} records in ${time} s at ${rate} records/s`);

    // Output:
    // 2020-06-16T05:39:03.448Z: data on Tue Dec 31 2019 00:00:00 GMT+0000: cmf4z9
    // ...
    // 2020-06-16T05:39:23.592Z: data on Fri Jan 01 2010 00:00:00 GMT+0000: gsvka
    // Fetched 3652 records in 20 s at 182.6 records/s
})().then(() => process.exit(0));

// Delete your radata folder (Gun's local storage) if you see unexpected logs
