import Gun from 'gun';
import {
  encrypt,
  decrypt,
} from '../dist/index.mjs'; /* Replace with 'gun-util' in your own project or run `yarn build` first. */

const SEA = Gun.SEA;

(async () => {
  let frodo = await SEA.pair();
  let gandalf = await SEA.pair();
  let sauron = await SEA.pair();

  let enc = await encrypt(
    { whereami: 'shire' },
    {
      pair: frodo,
      recipient: gandalf, // Or { epub: gandalf.epub }
    }
  );
  console.log('enc: ' + JSON.stringify(enc));

  let dec = await decrypt(enc, {
    pair: gandalf,
    sender: frodo, // Or { epub: frodo.epub }
  });
  console.log('dec: ' + JSON.stringify(dec));

  let eye = '';
  try {
    eye = await decrypt(enc, {
      pair: sauron,
      sender: frodo, // Or { epub: frodo.epub }
    });
    console.log('eye: ' + JSON.stringify(eye));
  } catch (err) {
    console.log('err: ' + err);
  }
})();

/**
 * enc: {"whereami":"SEA{\"ct\":\"HH3f8pMFYgUkkoZ2YPQobVju2UZH\",\"iv\":\"YP4LcGr4aKvIXDbuJ3uU\",\"s\":\"bysXPuyhH/zF\"}"}
 * dec: {"whereami":"shire"}
 * err: Error: Could not decrypt
 */
