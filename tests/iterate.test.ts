import { iterate } from '../src/iterate';
import { createGun, TEST_GUN_OPTIONS } from '../src/gun';
import { IGunChainReference } from 'gun/types/chain';
import _ from 'lodash';

interface Item {
    name: string;
}

interface State {
    [key: string]: any;
    items: Item[];
}

let gun: IGunChainReference<State>;

describe('iterate', () => {

    beforeAll(() => {
        gun = createGun<State>(TEST_GUN_OPTIONS);
    });

    afterAll(() => {
        gun.off();
        (gun as any) = undefined;
    });

    it('should iterate all records once', async () => {
        let itemsRef = gun.get('items');
        
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