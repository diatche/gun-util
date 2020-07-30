import Gun from 'gun';
import { iterateItems } from '../dist/index.mjs';

let gun = Gun();
let list = gun.get('test-list');

list.put({ a: 'foo' });
list.put({ b: 'bar' });
list.put({ c: 'gun' });

(async () => {
    for await (let [key, value] of iterateItems(list)) {
        console.log(key + ': ' + value);
    }
})().then(() => process.exit(0));

// Output:
// foo: a
// bar: b
// gun: c

// Delete your radata folder (Gun's local storage) if you see unexpected logs
