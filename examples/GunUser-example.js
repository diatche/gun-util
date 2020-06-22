const Gun = require('gun/gun');
const { v4: uuidv4 } = require('uuid');
const {
    GunUser,
    fixSea,
} = require('../dist');

fixSea(Gun);

let gun = Gun();
let user = gun.user();

user.on('auth', () => {
    console.log('Logged in!');
});

(async () => {
    console.log('creating account...');
    let creds = {
        alias: uuidv4(),
        pass: uuidv4(),
    };
    let pub = await GunUser.create(creds, gun);
    console.log('account created: ' + pub);
    GunUser.logout();
    console.log('login...');
    pub = await GunUser.login(creds, gun);
    console.log('Logged in: ' + pub);
})()
    .catch(e => console.error(e + ''))
    .then(() => process.exit(0));
