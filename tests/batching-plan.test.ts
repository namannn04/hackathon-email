import { describe, expect, it } from 'vitest';
import { planBatchSizes } from '@/lib/batching/plan';

describe('remainder-aware batch planning', () => {
  it('keeps a remainder of at least 100 as its own set', () => {
    expect(planBatchSizes(1050, 300)).toEqual([300, 300, 300, 150]);
    expect(planBatchSizes(1000, 300)).toEqual([300, 300, 300, 100]);
  });

  it('merges a remainder below 100 into the last set', () => {
    expect(planBatchSizes(950, 300)).toEqual([300, 300, 350]);
  });

  it('never merges beyond Gmail\'s 500-recipient ceiling', () => {
    expect(planBatchSizes(548, 499)).toEqual([499, 49]);
  });

  it('honors organizer-selected set sizes instead of hardcoding 300', () => {
    expect(planBatchSizes(1_000, 450)).toEqual([450, 450, 100]);
  });
});
