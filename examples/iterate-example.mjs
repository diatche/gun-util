import Gun from 'gun';
import { 
    gunLogOnceFix,
    iterateItems
} from '../dist/index.mjs';

// In case Gun.log.once is undefined
gunLogOnceFix(Gun);

let gun = Gun();
let list = gun.get('list');

list.put({ a: 'foo' });
list.put({ b: 'bar' });
list.put({ c: 'gun' });

(async () => {
    for await (let [key, value] of iterateItems(list)) {
        console.log(key + ': ' + value);
    }
})();

// Output:
// foo: a
// bar: b
// gun: c

// Delete your radata folder (Gun's local storage) if you see unexpected logs
