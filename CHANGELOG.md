# Change Log

## develop

Changes on `develop` will be listed here.

### Features

- When attempting to start another login while another is in progress, `Auth` throws a `MultipleAuthError` instead of `AuthError`.
- Added `errorAfter()` and `timeoutAfter()` utility methods.
- Added `Auth#did()` method to allow using your own `gun.on('auth', cb)` listener.
- You can pass a callback to `Auth#on`.
- Added `Auth#getPub()`, which finds the public key corresponding to a user alias.
- Added `Auth#exists()`, which checks if a user with an alias exists.
- You can wait for a user operation to finish using `Auth#join()`.
- Added an optional timeout to `waitForData()`.

### Breaking Changes

- Renamed `Auth#onAuth()` to `Auth#on()`.
- `waitForData()` now takes an options object as the second parameter containing `filter` instead of the `filter` itself.

## 0.0.9

### Features

- Made `DateTree.parseDate()` public.

### Bug Fixes

- Fixed using `DateTree` with non UTC dates.

### Breaking Changes

- Removed redundant method `DateTree.iterateDates()`.

## 0.0.8

- Updated dependencies.

## 0.0.7

### Features

- Added `DateTree#on()` method, which allows subscribing to all or a subset of
the tree's data.
- Filter methods support any value which has a `valueOf()` method.
- `DateTree#getDate()` can now be used with a reference from a callback.
- Added `DateTree#largestCommonUnit()`.
- Added `DateTree#getDateComponentKeyRange()`.
- Added `DateTree#dateComponentsToString()`.

### Breaking Changes

- Renamed `filterKey()` to `isInRange()`.

## 0.0.6

### Features

- `waitForData` allows waiting for data to arrive at a node reference.
- `Auth` supports login with a SEA pair.
- `Auth` supports user recall on web and via a delegate on other platforms.

### Breaking Changes

- The stateless `GunUser` has been replaced with a stateful `Auth`. The methods are almost
identical, with the exception of `GunUser.current()`, which is now `Auth#user()`.
- `IterateOptions` no longer uses `start`, `end`, `startInclusive`, `endInclusive`. Instead
`gt`, `gte`, `lt`, `lte` is used. These can be converted to a `Range`, which resemble the previous
structure (which is still used internally) using `rangeWithFilter()`.
- Removed redundant `DateTree#put()`. Use `DateTree#get().put()` instead.
- `DateTree#changesAbout()` returns an object instead of the `off()` function directly.

## 0.0.5

### Features

- Encryption methods.
