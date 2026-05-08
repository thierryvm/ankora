import { describe, it, expect } from 'vitest';

import { largestRemainderRound } from '../largestRemainderRound';

describe('largestRemainderRound (Hamilton method)', () => {
  it('returns all zeros when total is 0', () => {
    expect(largestRemainderRound([5, 3, 2], 0)).toEqual([0, 0, 0]);
  });

  it('returns empty array for empty input', () => {
    expect(largestRemainderRound([], 100)).toEqual([]);
  });

  it('canonical case: [5,3,2,0,2] / 12 → [42,25,17,0,16] (sum = 100)', () => {
    const result = largestRemainderRound([5, 3, 2, 0, 2], 12);
    expect(result).toEqual([42, 25, 17, 0, 16]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('every count = total → equal distribution that sums to 100', () => {
    const result = largestRemainderRound([1, 1, 1, 1], 4);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toEqual([25, 25, 25, 25]);
  });

  it('one count = total → single 100', () => {
    expect(largestRemainderRound([10, 0, 0], 10)).toEqual([100, 0, 0]);
  });

  it('three equal counts → distribution stable, sums to 100', () => {
    // Each 1/3 = 33.33... ; floor 33 each ; remainder 0.33 same for all.
    // toDistribute = 100 - 99 = 1 → first index by stable sort wins +1.
    const result = largestRemainderRound([1, 1, 1], 3);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toContain(34);
    expect(result.filter((v) => v === 33)).toHaveLength(2);
  });

  it('handles real-world admin Top sources sample', () => {
    // Direct: 12, Search: 8, Social: 5, Email: 3, Other: 2 ; total = 30
    const result = largestRemainderRound([12, 8, 5, 3, 2], 30);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    // Direct should be largest, descending order respected
    expect(result[0]).toBeGreaterThanOrEqual(result[1]!);
    expect(result[1]).toBeGreaterThanOrEqual(result[2]!);
  });

  it('handles single zero in input — that bucket stays at 0%', () => {
    const result = largestRemainderRound([5, 0, 5], 10);
    expect(result[1]).toBe(0);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('returns immutable result (does not mutate input)', () => {
    const input = [5, 3, 2];
    const inputCopy = [...input];
    largestRemainderRound(input, 10);
    expect(input).toEqual(inputCopy);
  });

  it('handles total smaller than sum of values gracefully', () => {
    // values sum to 10 but total claimed = 5 → percentages > 100 each
    // Function should still output a finite array of integers.
    const result = largestRemainderRound([5, 3, 2], 5);
    expect(result).toHaveLength(3);
    result.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
