const Gun = require('gun');
const { v4: uuidv4 } = require('uuid');
const {
    GunUser,
} = require('../dist');

let gun = Gun();

GunUser.onLogin(gun).then(pub => {
    console.log('Detected login: ' + pub);
});

(async () => {
    console.log('creating account...');
    let creds = {
        alias: uuidv4(),
        pass: uuidv4(),
    };
    let pub = await GunUser.create(creds, gun);
    console.log('account created: ' + pub);
    GunUser.logout(gun);
    console.log('login...');
    pub = await GunUser.login(creds, gun);
    console.log('Logged in: ' + pub);
})()
    .catch(e => console.error(e + ''))
    .then(() => process.exit(0));
