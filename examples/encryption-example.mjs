import Gun from 'gun';
import {
    encrypt,
    decrypt,
    GunUser,
} from '../dist/index.mjs';

let gun = Gun();

(async () => {
    await GunUser.create({
        alias: Math.random().toString(36).substring(8),
        pass: 'bar'
    }, gun);
    let pair = GunUser.pair(gun);
    
    let enc = await encrypt('a@a.com', { pair });
    console.log('enc: ' + enc);
    
    let dec = await decrypt(enc, { pair });
    console.log('dec: ' + dec);
})().then(() => process.exit(0));

// Output:
// enc: SEA{"m":{"ct":"+GEOlkaNJ1d8sjHuNdhR+/oqvBJ0MKo=","iv":"A34YhiFn5NCqpksaPy6P","s":"6mKx/7DhLXHt"},"s":"HC8lPQDJZvrEx/UTMiv25hPWaKIs0/sn1qEKLc5MHTu938YYypfBhjKGNSP5g0SL2YpYKPmFipyl3+eZD7UBYA=="}
// dec: a@a.com
