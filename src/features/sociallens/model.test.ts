import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalProfiles,
  compareSnapshots,
  normalizeProfile,
  relationshipStats,
  snapshotHash,
  type Snapshot,
} from './model';

beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
);
const previous: Snapshot = {
  id: 'one',
  localAccountId: 'account',
  importedAt: '2026-01-01T00:00:00.000Z',
  exportCreatedAt: '2025-12-31T00:00:00.000Z',
  sourceHash: '',
  sourceFormat: 'json',
  status: 'complete',
  followers: ['alice', 'bob'],
  following: ['alice', 'charlie'],
  warnings: [],
};
const current: Snapshot = {
  ...previous,
  id: 'two',
  importedAt: '2026-02-01T00:00:00.000Z',
  exportCreatedAt: '2026-01-31T00:00:00.000Z',
  followers: ['alice', 'dave'],
  following: ['bob', 'dave'],
};

describe('SocialLens domain', () => {
  it('normalizes case, whitespace, @ and compatible Unicode without inventing identities', () => {
    expect(canonicalProfiles([' @Alice ', 'alice', 'ＢＯＢ'])).toEqual(['alice', 'bob']);
    expect(() => normalizeProfile('alice<script>')).toThrow();
    expect(() => normalizeProfile('bad/name')).toThrow();
    expect(() => normalizeProfile('é')).toThrow();
  });
  it('uses the same snapshot for every relationship and zero-safe ratio', () => {
    expect(relationshipStats(previous)).toEqual({
      mutuals: ['alice'],
      nonFollowers: ['charlie'],
      fans: ['bob'],
      followBackRate: 50,
      mutualsRate: 50,
    });
    expect(relationshipStats({ followers: [], following: [] }).followBackRate).toBe(0);
  });
  it('computes all four differences with direction', () => {
    expect(compareSnapshots(previous, current)).toEqual({
      comparable: true,
      newFollowers: ['dave'],
      lostFollowers: ['bob'],
      startedFollowing: ['bob', 'dave'],
      stoppedFollowing: ['alice', 'charlie'],
    });
  });
  it.each([
    { localAccountId: 'other' },
    { status: 'incomplete' as const },
    { sourceFormat: 'html' as const },
    { id: 'one' },
    { exportCreatedAt: '2025-01-01T00:00:00Z' },
    { exportCreatedAt: undefined },
  ])('does not invent unfollowers for non-comparable snapshots %j', patch => {
    const comparison = compareSnapshots(previous, { ...current, ...patch });
    expect(comparison.comparable).toBe(false);
    expect(comparison.lostFollowers).toEqual([]);
    expect(comparison.reason).toBeTruthy();
  });
  it('uses known export dates rather than reversed import dates', () => {
    expect(
      compareSnapshots(
        { ...previous, exportCreatedAt: '2026-03-01T00:00:00Z' },
        { ...current, exportCreatedAt: '2026-02-01T00:00:00Z' }
      ).comparable
    ).toBe(false);
  });
  it('hashes canonical content independent of ordering, duplicates and casing', async () => {
    expect(await snapshotHash(['alice', 'BOB', 'alice'], ['c'])).toBe(
      await snapshotHash(['bob', 'Alice'], ['c'])
    );
    expect(await snapshotHash(['alice'], ['bob'])).not.toBe(await snapshotHash(['bob'], ['alice']));
  });
  it('handles 50,000 profiles with linear set operations', () => {
    const profiles = Array.from({ length: 50000 }, (_, index) => `profile${index}`);
    const result = relationshipStats({ followers: profiles, following: profiles.slice(25000) });
    expect(result.mutuals).toHaveLength(25000);
    expect(result.fans).toHaveLength(25000);
  });
});
