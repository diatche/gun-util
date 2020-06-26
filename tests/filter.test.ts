import {
    Filter,
    rangeWithFilter,
    ValueRange,
    filterWithRange,
    mapValueRange,
    filteredIndexRange,
    filterKey,
    isValueRangeEmpty
} from '../src/filter';


describe('isValueRangeEmpty', () => {

    it('should handle closed ranges correctly', () => {
        expect(isValueRangeEmpty({
            start: 'a',
            end: 'z',
            startClosed: true,
            endClosed: true,
        })).toBeFalsy();

        expect(isValueRangeEmpty({
            start: 'a',
            end: 'a',
            startClosed: true,
            endClosed: true,
        })).toBeFalsy();

        expect(isValueRangeEmpty({
            start: 'z',
            end: 'a',
            startClosed: true,
            endClosed: true,
        })).toBeTruthy();
    });

    it('should handle open ranges correctly', () => {
        expect(isValueRangeEmpty({
            start: 'a',
            end: 'z',
            startClosed: false,
            endClosed: false,
        })).toBeFalsy();

        expect(isValueRangeEmpty({
            start: 'a',
            end: 'a',
            startClosed: false,
            endClosed: false,
        })).toBeTruthy();

        expect(isValueRangeEmpty({
            start: 'z',
            end: 'a',
            startClosed: false,
            endClosed: false,
        })).toBeTruthy();
    });

    it('should handle open-closed ranges correctly', () => {
        expect(isValueRangeEmpty({
            start: 'a',
            end: 'z',
            startClosed: false,
            endClosed: true,
        })).toBeFalsy();

        expect(isValueRangeEmpty({
            start: 'a',
            end: 'a',
            startClosed: false,
            endClosed: true,
        })).toBeTruthy();

        expect(isValueRangeEmpty({
            start: 'z',
            end: 'a',
            startClosed: false,
            endClosed: true,
        })).toBeTruthy();
    });

    it('should handle closed-open ranges correctly', () => {
        expect(isValueRangeEmpty({
            start: 'a',
            end: 'z',
            startClosed: true,
            endClosed: false,
        })).toBeFalsy();

        expect(isValueRangeEmpty({
            start: 'a',
            end: 'a',
            startClosed: true,
            endClosed: false,
        })).toBeTruthy();

        expect(isValueRangeEmpty({
            start: 'z',
            end: 'a',
            startClosed: true,
            endClosed: false,
        })).toBeTruthy();
    });
});

describe('filterKey', () => {

    it('should filter correctly with open subset range', () => {
        let range = {
            start: 'bar',
            end: 'gaz',
            startClosed: false,
            endClosed: false,
        };
        expect(filterKey('a', range)).toBeFalsy();
        expect(filterKey('bar', range)).toBeFalsy();
        expect(filterKey('foo', range)).toBeTruthy();
        expect(filterKey('gaz', range)).toBeFalsy();
        expect(filterKey('z', range)).toBeFalsy();
    });

    it('should filter correctly with closed subset range', () => {
        let range = {
            start: 'bar',
            end: 'gaz',
            startClosed: true,
            endClosed: true,
        };
        expect(filterKey('a', range)).toBeFalsy();
        expect(filterKey('bar', range)).toBeTruthy();
        expect(filterKey('foo', range)).toBeTruthy();
        expect(filterKey('gaz', range)).toBeTruthy();
        expect(filterKey('z', range)).toBeFalsy();
    });

    it('should filter correctly with positive infinity range', () => {
        let range = {
            start: 'foo',
            end: undefined,
            startClosed: true,
            endClosed: true,
        };
        expect(filterKey('a', range)).toBeFalsy();
        expect(filterKey('z', range)).toBeTruthy();
    });

    it('should filter correctly with negative infinity range', () => {
        let keys = ['bar', 'foo', 'gaz'];
        let range = {
            start: undefined,
            end: 'foo',
            startClosed: true,
            endClosed: true,
        };
        expect(filterKey('a', range)).toBeTruthy();
        expect(filterKey('z', range)).toBeFalsy();
    });
});

describe('filteredIndexRange', () => {

    it('should return correct index range with open subset range', () => {
        let keys = ['bar', 'foo', 'gaz'];
        let range = filteredIndexRange(keys, {
            start: 'bar',
            end: 'gaz',
            startClosed: false,
            endClosed: false,
        });
        expect(range).toEqual([1, 2]);
    });

    it('should return correct index range with closed subset range', () => {
        let keys = ['bar', 'foo', 'gaz', 'gazb'];
        let range = filteredIndexRange(keys, {
            start: 'foo',
            end: 'gaz',
            startClosed: true,
            endClosed: true,
        });
        expect(range).toEqual([1, 3]);
    });

    it('should return correct index range with superset range', () => {
        let keys = ['bar', 'foo', 'gaz', 'gazb'];
        let range = filteredIndexRange(keys, {
            start: 'a',
            end: 'z',
            startClosed: true,
            endClosed: true,
        });
        expect(range).toEqual([0, 4]);
    });

    it('should return correct index range with positive infinity range', () => {
        let keys = ['bar', 'foo', 'gaz'];
        let range = filteredIndexRange(keys, {
            start: 'foo',
            end: undefined,
            startClosed: true,
            endClosed: true,
        });
        expect(range).toEqual([1, 3]);
    });

    it('should return correct index range with negative infinity range', () => {
        let keys = ['bar', 'foo', 'gaz'];
        let range = filteredIndexRange(keys, {
            start: undefined,
            end: 'foo',
            startClosed: true,
            endClosed: true,
        });
        expect(range).toEqual([0, 2]);
    });

    it('should return correct index range with a single value closed', () => {
        let keys = ['foo'];
        let range = filteredIndexRange(keys, {
            start: 'foo',
            startClosed: true,
            endClosed: false,
        });
        expect(range).toEqual([0, 1]);
    });

    it('should return correct index range with a single value open', () => {
        let keys = ['foo'];
        let range = filteredIndexRange(keys, {
            start: 'foo',
            startClosed: false,
            endClosed: false,
        });
        expect(range).toEqual([0, 0]);
    });

    it('should return empty range with empty set', () => {
        let range = filteredIndexRange([], {
            start: 'foo',
            startClosed: false,
            endClosed: false,
        });
        expect(range).toEqual([0, 0]);
    });
});

describe('rangeWithFilter', () => {

    it('should parse open range correctly', () => {
        let filter: Filter<string> = {
            gt: 'a',
            lt: 'b',
        };
        let range = rangeWithFilter(filter);
        expect(range).toEqual({
            start: 'a',
            end: 'b',
            startClosed: false,
            endClosed: false,
        } as ValueRange<string>);
    });

    it('should parse closed range correctly', () => {
        let filter: Filter<string> = {
            gte: 'a',
            lte: 'b',
        };
        let range = rangeWithFilter(filter);
        expect(range).toEqual({
            start: 'a',
            end: 'b',
            startClosed: true,
            endClosed: true,
        } as ValueRange<string>);
    });
});

describe('filterWithRange', () => {

    it('should parse open range correctly', () => {
        let range: ValueRange<string> = {
            start: 'a',
            end: 'b',
            startClosed: false,
            endClosed: false,
        };
        let filter = filterWithRange(range);
        expect(filter).toEqual({
            gt: 'a',
            lt: 'b',
        });
    });

    it('should parse closed range correctly', () => {
        let range: ValueRange<string> = {
            start: 'a',
            end: 'b',
            startClosed: true,
            endClosed: true,
        };
        let filter = filterWithRange(range);
        expect(filter).toEqual({
            gte: 'a',
            lte: 'b',
        });
    });
});

describe('mapValueRange', () => {

    it('should map range correctly', () => {
        let range: ValueRange<string> = {
            start: 'a',
            end: 'b',
            startClosed: true,
            endClosed: false,
        };
        let mappedFilter = mapValueRange(range, v => v + '1');
        expect(mappedFilter).toEqual({
            start: 'a1',
            end: 'b1',
            startClosed: true,
            endClosed: false,
        } as ValueRange<string>);
    });
});
