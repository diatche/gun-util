# Change Log

## develop

### Features

- `Auth` supports login with a SEA pair.
- `Auth` supports user recall on web and via a delegate on other platforms.
- If no order is specified on `iterateRecord()` (or other methods which use it), then a more
efficient algorithm is used to iterate over the record. However, order is not defined in this case.

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
