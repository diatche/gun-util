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
let puts = []

while (date.isBefore(end)) {
    let put = tree.get(date).put({
        data: Math.random().toString(36).substring(7)
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

    let it, it0, itN;
    for await (it of tree.iterate({ order: -1 })) {
        if (!it0) it0 = it;
    }
    itN = it;

    let endTimestamp = moment();
    let time = endTimestamp.unix() - startTimestamp.unix();
    let rate = count / time;

    for (let [ref, date] of [it0, itN]) {
        let data = await ref.get('data').then();
        console.log(`${date}: ${data}`);
    }

    console.log(`Fetched ${count} records in ${time} s at ${rate} records/s`);

    // Output:
    // Tue Dec 31 2019 00:00:00 GMT+0000: vn6tt
    // Fri Jan 01 2010 00:00:00 GMT+0000: 30mwuq
    // Fetched 3652 records in 15 s at 243.47 records/s
})().then(() => process.exit(0));

// Delete your radata folder (Gun's local storage) if you see unexpected logs
