const Gun = require('gun');
const GunUtil = require('../dist/index.cjs');
const {
    iterate: iterateValues
} = GunUtil;

let gun = Gun();
let list = gun.get('list');

list.put({ a: 'foo' });
list.put({ b: 'bar' });
list.put({ c: 'gun' });

(async () => {
    for await (let key of iterateValues(list)) {
        console.log(key);
    }
})();

// Output:
// foo
// bar
// gun
