import Gun from 'gun';
import { DateTree } from '../dist/index.mjs';

let gun = Gun();
let treeRoot = gun.get('tree-it');
let tree = new DateTree(treeRoot, 'minute');

tree.get('1995-01-21 14:02').put({ event: 'good times' });
tree.get('2015-08-23 23:45').put({ event: 'ultimate' });
tree.get('2020-01-16 05:45').put({ event: 'earlybird' });

(async () => {
    // A naive implementation would have close to a billion
    // nodes and would take forever to iterate.
    // This takes only a second and is non blocking:
    for await (let [ref, date] of tree.iterate()) {
        let event = await ref.get('event').then();
        console.log(`${date} event: ${event}`);
    }
    // Output:
    // Sat Jan 21 1995 14:02:00 GMT+0000 event: good times
    // Sun Aug 23 2015 23:45:00 GMT+0000 event: ultimate
    // Thu Jan 16 2020 05:45:00 GMT+0000 event: earlybird
})().then(() => process.exit(0));

// See also ./DateTree-stress-test.mjs

// Delete your radata folder (Gun's local storage) if you see unexpected logs
