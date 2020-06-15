import Gun from 'gun';
import { 
    gunLogOnceFix,
    iterate
} from '../dist/index.mjs';

// In case Gun.log.once is undefined
gunLogOnceFix(Gun);

let gun = Gun();
let list = gun.get('list');

list.put({ a: 'foo' });
list.put({ b: 'bar' });
list.put({ c: 'gun' });

(async () => {
    for await (let key of iterate(list)) {
        console.log(key);
    }
})();

// Output:
// foo
// bar
// gun
