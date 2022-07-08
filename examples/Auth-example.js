const Gun = require('gun');
const { v4: uuidv4 } = require('uuid');
const { Auth } = require('../dist'); /* Replace with 'gun-util' in your own project. */

let gun = Gun();
let auth = Auth.default(gun);

auth.on(pub => {
    console.log('Detected login: ' + pub);
});

(async () => {
    console.log('creating account...');
    let creds = {
        alias: 'test-' + uuidv4(),
        pass: uuidv4(),
    };
    let pub = await auth.create(creds, gun);
    console.log('account created: ' + pub);
    auth.logout(gun);
    console.log('login...');
    pub = await auth.login(creds, gun);
    console.log('Logged in: ' + pub);
})()
    .then(() => process.exit(0))
    .catch(e => {
        console.error(e + '');
        process.exit(1);
    });
