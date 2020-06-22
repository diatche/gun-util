# Change Log

## 0.0.6

### Features

- If no order is specified on `iterateRecord()` (or other methods which use it), then a more
efficient algorithm is used to iterate over the record. However, order is not defined in this case.

### Breaking Changes

- `IterateOptions` no longer uses `start`, `end`, `startInclusive`, `endInclusive`. Instead
`gt`, `gte`, `lt`, `lte` is used. These can be converted to a `Range`, which resemble the previous
structure (which is still used internally) using `rangeWithFilter()`.
- Removed redundant `DateTree#.put()`. Use `DateTree#.get().put()` instead.

## 0.0.5

### Features

- Encryption methods.
