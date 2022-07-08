const Gun = require('gun');
const {
  encrypt,
  decrypt,
} = require('../dist'); /* Replace with 'gun-util' in your own project or run `yarn build` first. */

(async () => {
  // You can use SEA pair or you can
  // get it from the user as well.
  let pair = await Gun.SEA.pair();

  let enc = await encrypt('a@a.com', { pair });
  console.log('enc: ' + enc);

  let dec = await decrypt(enc, { pair });
  console.log('dec: ' + dec);
})().then(() => process.exit(0));

// Output:
// enc: SEA{"m":{"ct":"+GEOlkaNJ1d8sjHuNdhR+/oqvBJ0MKo=","iv":"A34YhiFn5NCqpksaPy6P","s":"6mKx/7DhLXHt"},"s":"HC8lPQDJZvrEx/UTMiv25hPWaKIs0/sn1qEKLc5MHTu938YYypfBhjKGNSP5g0SL2YpYKPmFipyl3+eZD7UBYA=="}
// dec: a@a.com
