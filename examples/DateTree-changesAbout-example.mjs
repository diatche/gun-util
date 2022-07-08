import Gun from 'gun';
import { DateTree } from '../dist/index.mjs'; /* Replace with 'gun-util' in your own project or run `yarn build` first. */

let gun = Gun();
let treeRoot = gun.get('test-tree-changesAbout');
let tree = new DateTree(treeRoot, 'minute');

tree.get('1995-01-21 14:02').put({ blog: 'good times' });
tree.get('2015-08-23 23:45').put({ blog: 'ultimate' });
tree.get('2019-12-31 23:54').put({ blog: 'almost NY' });

/*
 * Let's say we want to listen to changes to a blog described
 * by a date tree.
 *
 * How would we handle a case where we are close to the end
 * of the nodes for the current time period?
 *
 * For example, we are at 2019-12-31 23:54, which is the end
 * of the hour, day, month and year. We may get a message this
 * minute or next hour or day.
 *
 * Subscribing to all nodes would be impractical.
 *
 * Listen to a single path of the tree instead with `changesAbout()`.
 */

let unsub = tree.changesAbout('2019-12-31 23:54', dateComponents => {
  /*
   * Whenever a node changes next to the direct path between the root and the
   * tree's maximum resolution, the callback is called with the date components
   * identifying the node. Note that the date components are partial unless the
   * change occured at the maximum resolution.
   */

  // Create a date to visualise the data
  let date = DateTree.getDateWithComponents(dateComponents);
  console.log(date.toISOString());
  // Output:
  // 1995-01-01T00:00:00.000Z
  // 2015-01-01T00:00:00.000Z
  // 2019-12-31T23:59:00.000Z
  // 2019-12-31T23:59:00.000Z
  // 2019-12-31T23:59:00.000Z
  // 2019-12-31T23:59:00.000Z
  // 2020-01-01T00:00:00.000Z

  /*
   * At each date in the future, we can call tree.latest()
   * and tree.iterate() to get the latest data.
   *
   * When the date gets too far away, for example after 2020-01-01,
   * we can call unsub() and resubscribe to a later date.
   */
});

tree.get('2019-12-31 23:59').put({ blog: '3! 2! 1!' });
tree.get('2020-01-01 00:12').put({ blog: 'Happy NY!' });

// Force stop Gun worker
setTimeout(() => process.exit(0), 1000);

// Delete your radata folder (Gun's local storage) if you see unexpected logs
