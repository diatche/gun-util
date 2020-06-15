import { iterate } from '../src/iterate';
import { TEST_GUN_OPTIONS } from '../src/const';
import { IGunChainReference } from 'gun/types/chain';
import _ from 'lodash';
import Gun from 'gun';
import { GunUser } from '..';

interface Item {
    name: string;
}

interface State {
    [user: string]: UserState | any;
    items: Item[];
    strings: string[];
}

interface UserState {
    privateItems: Item[];
}

let gun: IGunChainReference<State>;
let userRef: IGunChainReference<UserState>;
const creds = { alias: 'foo', pass: 'bar' };

describe('iterate', () => {
    jest.setTimeout(20000);

    beforeAll(async () => {
        gun = Gun<State>(TEST_GUN_OPTIONS);
        let pub = await GunUser.create(creds, gun);
        userRef = gun.get(pub);
    });

    afterAll(() => {
        gun.off();
        (gun as any) = undefined;
    });

    it('should iterate all primitives once', async () => {
        let stringsRef = gun.get('strings');
        
        let names = ['foo', 'bar', 'gaz'];
        let expectedItems: string[] = [];
        for (let name of names) {
            let item = name + '1';
            expectedItems.push(item);
            stringsRef.get(name).put(item);
        }

        let iteratedItems: string[] = [];
        for await (let item of iterate(stringsRef)) {
            iteratedItems.push(item);
        }
        expect(iteratedItems).toEqual(expectedItems);
    });

    it('should iterate all records once', async () => {
        let itemsRef = gun.get('items');
        
        let names = ['foo', 'bar', 'gaz'];
        let expectedItems: Item[] = [];
        for (let name of names) {
            let item = { name };
            let itemRef = gun.get(name).put(item as never);
            expectedItems.push(item);
            itemsRef.set(itemRef as any);
        }

        let iteratedItems: Item[] = [];
        for await (let item of iterate(itemsRef)) {
            iteratedItems.push(_.omit(item, '_'));
        }
        expect(iteratedItems).toEqual(expectedItems);
    });

    it('should iterate all encrypted records once', async () => {
        let itemsRef = userRef.get('privateItems');
        
        let names = ['foo', 'bar', 'gaz'];
        let expectedItems: Item[] = [];
        for (let name of names) {
            let item = { name };
            let itemRef = (gun.get(name) as IGunChainReference<Item>).put(item);
            expectedItems.push(item);
            itemsRef.set(itemRef as any);
        }

        let iteratedItems: Item[] = [];
        for await (let item of iterate(itemsRef)) {
            iteratedItems.push(_.omit(item, '_'));
        }
        expect(iteratedItems).toEqual(expectedItems);
    });
});
