# Change Log

## develop

Changes on `develop` will be listed here.

## 0.0.7

### Features

- Added `DateTree#.on()` method, which allows subscribing to all or a subset of
the tree's data.
- Filter methods support any value which has a `valueOf()` method.
- `DateTree#.getDate()` can now be used with a reference from a callback.
- Added `DateTree#.largestCommonUnit()`.
- Added `DateTree#.getDateComponentKeyRange()`.
- Added `DateTree#.dateComponentsToString()`.

### Breaking Changes

- Renamed `filterKey()` to `isInRange()`.

## 0.0.6

### Features

- `waitForData` allows waiting for data to arrive at a node reference.
- `Auth` supports login with a SEA pair.
- `Auth` supports user recall on web and via a delegate on other platforms.

### Breaking Changes

- The stateless `GunUser` has been replaced with a stateful `Auth`. The methods are almost
identical, with the exception of `GunUser.current()`, which is now `Auth#.user()`.
- `IterateOptions` no longer uses `start`, `end`, `startInclusive`, `endInclusive`. Instead
`gt`, `gte`, `lt`, `lte` is used. These can be converted to a `Range`, which resemble the previous
structure (which is still used internally) using `rangeWithFilter()`.
- Removed redundant `DateTree#.put()`. Use `DateTree#.get().put()` instead.
- `DateTree#.changesAbout()` returns an object instead of the `off()` function directly.

## 0.0.5

### Features

- Encryption methods.
