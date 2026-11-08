import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { emptyAnnotation, type LocalAccount, type SnapshotInput } from './model';

beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
);
let account: LocalAccount;
beforeEach(async () => {
  await repository.clear();
  account = await repository.createAccount('Test', 'test');
});
const input = (): SnapshotInput => ({
  localAccountId: account.id,
  status: 'complete',
  sourceFormat: 'json',
  followers: ['alice'],
  following: ['bob'],
  warnings: [],
  accountConfirmed: true,
  completenessConfirmed: true,
});

describe('SocialLens transactions', () => {
  it('deduplicates concurrent imports atomically, separately per local account', async () => {
    const result = await Promise.all([
      repository.saveSnapshot(input()),
      repository.saveSnapshot(input()),
    ]);
    expect(result.filter(item => item.duplicate)).toHaveLength(1);
    const second = await repository.createAccount('Other', 'other');
    await repository.saveSnapshot({ ...input(), localAccountId: second.id });
    expect((await repository.load()).snapshots).toHaveLength(2);
  });
  it('requires account confirmation and downgrades unconfirmed completeness', async () => {
    await expect(
      repository.saveSnapshot({ ...input(), accountConfirmed: false })
    ).rejects.toThrow();
    expect(
      (await repository.saveSnapshot({ ...input(), completenessConfirmed: false })).snapshot.status
    ).toBe('incomplete');
  });
  it('promotes a confirmed reimport using its new observation time while keeping one record', async () => {
    const original = await repository.saveSnapshot({
      ...input(),
      completenessConfirmed: false,
      importedAt: '2026-01-01T12:00:00.000Z',
    });
    const confirmed = await repository.saveSnapshot({
      ...input(),
      importedAt: '2026-11-08T12:00:00.000Z',
    });
    expect(confirmed.duplicate).toBe(true);
    expect(confirmed.snapshot.status).toBe('complete');
    expect(confirmed.snapshot.id).toBe(original.snapshot.id);
    expect(confirmed.snapshot.importedAt).toBe('2026-11-08T12:00:00.000Z');
    expect((await repository.load()).snapshots).toHaveLength(1);
  });
  it('retains annotations across imports and protects whitelisted profiles', async () => {
    await repository.saveAnnotation({
      ...emptyAnnotation(account.id, 'alice'),
      favorite: true,
      notes: 'Keep this',
      tags: ['friend'],
      lists: ['school'],
      protectedFromCleanup: true,
      cleanup: true,
    });
    await repository.saveSnapshot(input());
    await repository.saveSnapshot({ ...input(), followers: ['charlie'] });
    const annotation = (await repository.load()).annotations[0];
    expect(annotation).toMatchObject({
      notes: 'Keep this',
      favorite: true,
      tags: ['friend'],
      lists: ['school'],
      cleanup: false,
    });
  });
  it('rolls back a malformed record without damaging the previous workspace', async () => {
    await repository.saveSnapshot(input());
    const before = await repository.load();
    await expect(
      repository.saveAnnotation({
        ...emptyAnnotation(account.id, 'alice'),
        notes: 'x'.repeat(10001),
      })
    ).rejects.toThrow();
    expect(await repository.load()).toEqual(before);
  });
  it('does not lose updates from concurrent annotation writes', async () => {
    await Promise.all(
      ['alice', 'bob', 'charlie'].map(profile =>
        repository.saveAnnotation(emptyAnnotation(account.id, profile))
      )
    );
    expect((await repository.load()).annotations).toHaveLength(3);
  });
  it('cascades account deletion while preserving a second account', async () => {
    await repository.saveSnapshot(input());
    await repository.saveAnnotation(emptyAnnotation(account.id, 'alice'));
    await repository.saveFilter({
      id: 'filter',
      localAccountId: account.id,
      name: 'Friends',
      query: '',
      relationship: 'all',
      favoriteOnly: true,
      tag: '',
    });
    const second = await repository.createAccount('Second', 'second');
    await repository.deleteAccount(account.id);
    expect(await repository.load()).toMatchObject({
      accounts: [second],
      snapshots: [],
      annotations: [],
      savedFilters: [],
    });
  });
  it('rejects corrupt restores before replacing any data', async () => {
    await repository.saveSnapshot(input());
    const original = await repository.load();
    const corrupted = structuredClone(original);
    corrupted.snapshots[0]!.followers.push('forged');
    await expect(repository.restore(corrupted)).rejects.toThrow('Prüfsumme');
    expect(await repository.load()).toEqual(original);
  });
  it('recovers a corrupted workspace with a verified restore', async () => {
    const valid = await repository.load();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('sociallens', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ version: 1, broken: true }, 'data');
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect(repository.load()).rejects.toThrow();
    await repository.restore(valid);
    expect(await repository.load()).toEqual(valid);
  });
  it('rejects future schemas and invalid references', async () => {
    const data = await repository.load();
    await expect(repository.restore({ ...data, version: 50 })).rejects.toThrow();
    await expect(
      repository.restore({ ...data, annotations: [emptyAnnotation('absent', 'alice')] })
    ).rejects.toThrow();
  });
});
