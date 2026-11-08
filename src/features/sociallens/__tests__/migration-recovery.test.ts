import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountBadges } from '@/core/types';
import { indexedDBService } from '@/lib/indexeddb/indexeddb-service';
import { DB_CONFIG, STORES, type FileMetadataRecord } from '@/lib/indexeddb/indexeddb-schema';
import { decodeBackup, encodeBackup } from '../backup';
import { emptyAnnotation, type AppData, type LocalAccount, type SnapshotInput } from '../model';
import { repository } from '../repository';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

let personal: LocalAccount;
let work: LocalAccount;

beforeEach(async () => {
  await repository.clear();
  personal = await repository.createAccount('Privat', 'private_account');
  work = await repository.createAccount('Arbeit', 'work_account');
  for (const file of await indexedDBService.getAllFiles())
    await indexedDBService.clearFile(file.fileHash);
});

afterEach(() => vi.restoreAllMocks());

const legacyProfiles: AccountBadges[] = [
  { username: 'alice', badges: { followers: true, following: true } },
  { username: 'bob', badges: { followers: true } },
  { username: 'charlie', badges: { following: true } },
  { username: 'pending_only', badges: { pending: true } },
];

async function seedLegacy(fileHash = 'synthetic-export', profiles = legacyProfiles) {
  const metadata: FileMetadataRecord = {
    fileHash,
    fileName: `${fileHash}.zip`,
    fileSize: 2048,
    uploadDate: new Date('2025-04-05T12:00:00.000Z'),
    accountCount: profiles.length,
    lastAccessed: 1_743_854_400_000,
    version: 2,
  };
  await indexedDBService.saveFileMetadata(metadata);
  await indexedDBService.storeAllAccounts(fileHash, profiles, {});
  return (await indexedDBService.getFileMetadata(fileHash))!;
}

function snapshotInput(account = personal): SnapshotInput {
  return {
    localAccountId: account.id,
    sourceFormat: 'json',
    status: 'complete',
    followers: ['alice'],
    following: ['charlie'],
    warnings: [],
    accountConfirmed: true,
    completenessConfirmed: true,
    importedAt: '2026-11-08T10:00:00.000Z',
    exportCreatedAt: '2026-11-07T10:00:00.000Z',
  };
}

async function writeRawLegacyMetadata(metadata: FileMetadataRecord): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction(STORES.FILES, 'readwrite');
      transaction.objectStore(STORES.FILES).put(metadata);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

/** Simulates a disk/transaction failure after the replacement row has been written, before commit. */
function abortWorkspaceWrite() {
  const originalPut = IDBObjectStore.prototype.put;
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
    const request = originalPut.call(this, value, key);
    if (this.name === 'workspace') {
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
    }
    return request;
  });
}

describe('SocialLens legacy migration', () => {
  it('requires a selected source and copies only its relationships into the chosen account', async () => {
    const source = await seedLegacy();
    await seedLegacy('other-export', [{ username: 'other_profile', badges: { followers: true } }]);
    const beforeSource = await indexedDBService.getAccountsByRange(
      source.fileHash,
      0,
      source.accountCount
    );

    expect(await repository.listLegacyImports()).toHaveLength(2);
    expect((await repository.load()).snapshots).toEqual([]);
    expect(await repository.importLegacy(work.id, source.fileHash)).toBe(1);

    const data = await repository.load();
    expect(data.snapshots).toHaveLength(1);
    expect(data.snapshots[0]).toMatchObject({
      localAccountId: work.id,
      followers: ['alice', 'bob'],
      following: ['alice', 'charlie'],
      importedAt: source.uploadDate.toISOString(),
      sourceFormat: 'legacy',
      status: 'incomplete',
    });
    expect(data.snapshots[0]!.exportCreatedAt).toBeUndefined();
    expect(data.snapshots[0]!.warnings.join(' ')).toContain('nicht nachprüfbar');
    expect(data.snapshots.some(snapshot => snapshot.localAccountId === personal.id)).toBe(false);
    expect(await indexedDBService.getFileMetadata(source.fileHash)).toEqual(source);
    expect(
      await indexedDBService.getAccountsByRange(source.fileHash, 0, source.accountCount)
    ).toEqual(beforeSource);
    expect(await indexedDBService.getAllFiles()).toHaveLength(2);
  });

  it('migrates metadata written before the accountsComplete marker without changing its source', async () => {
    const source = await seedLegacy();
    delete source.accountsComplete;
    await writeRawLegacyMetadata(source);

    expect((await repository.listLegacyImports()).map(file => file.fileHash)).toEqual([
      source.fileHash,
    ]);
    expect(await repository.importLegacy(personal.id, source.fileHash)).toBe(1);
    expect((await repository.load()).snapshots[0]).toMatchObject({
      sourceFormat: 'legacy',
      status: 'incomplete',
      followers: ['alice', 'bob'],
    });
    expect(
      (await indexedDBService.getFileMetadata(source.fileHash))!.accountsComplete
    ).toBeUndefined();
  });

  it('skips unfinished legacy writes and sample data even when explicitly requested', async () => {
    const incomplete = await seedLegacy('incomplete-export');
    await writeRawLegacyMetadata({ ...incomplete, accountsComplete: false });
    await seedLegacy('sample-synthetic');
    const before = await repository.load();

    expect(await repository.listLegacyImports()).toEqual([]);
    expect(await repository.importLegacy(personal.id, 'incomplete-export')).toBe(0);
    expect(await repository.importLegacy(personal.id, 'sample-synthetic')).toBe(0);
    expect(await repository.importLegacy(personal.id, 'missing-export')).toBe(0);
    expect(await repository.load()).toEqual(before);
  });

  it('deduplicates retries in one account and keeps explicit assignments to different accounts separate', async () => {
    const source = await seedLegacy();
    expect(await repository.importLegacy(personal.id, source.fileHash)).toBe(1);
    expect(await repository.importLegacy(personal.id, source.fileHash)).toBe(0);
    expect(await repository.importLegacy(work.id, source.fileHash)).toBe(1);
    const snapshots = (await repository.load()).snapshots;
    expect(snapshots).toHaveLength(2);
    expect(new Set(snapshots.map(snapshot => snapshot.localAccountId))).toEqual(
      new Set([personal.id, work.id])
    );
    expect(snapshots[0]!.sourceHash).toBe(snapshots[1]!.sourceHash);
  });

  it('does not downgrade a verified snapshot or its observation time when legacy data matches', async () => {
    const source = await seedLegacy();
    await repository.saveSnapshot({
      ...snapshotInput(),
      followers: ['alice', 'bob'],
      following: ['alice', 'charlie'],
    });
    await repository.saveAnnotation({
      ...emptyAnnotation(personal.id, 'alice'),
      notes: 'Verified note',
    });
    const before = await repository.load();

    expect(await repository.importLegacy(personal.id, source.fileHash)).toBe(0);
    expect(await repository.load()).toEqual(before);
  });

  it('leaves both databases intact when the destination account disappeared', async () => {
    const source = await seedLegacy();
    await repository.saveSnapshot(snapshotInput());
    const before = await repository.load();

    await expect(repository.importLegacy('deleted-account', source.fileHash)).rejects.toThrow(
      'existiert nicht'
    );
    expect(await repository.load()).toEqual(before);
    expect(await indexedDBService.getFileMetadata(source.fileHash)).toEqual(source);
  });

  it('preserves current snapshots when the legacy data cannot be read', async () => {
    const source = await seedLegacy();
    await repository.saveSnapshot(snapshotInput());
    const before = await repository.load();
    vi.spyOn(indexedDBService, 'getAccountsByRange').mockRejectedValueOnce(
      new Error('Legacy column unreadable')
    );

    await expect(repository.importLegacy(personal.id, source.fileHash)).rejects.toThrow(
      'Legacy column unreadable'
    );
    expect(await repository.load()).toEqual(before);
    expect(await indexedDBService.getFileMetadata(source.fileHash)).toEqual(source);
  });
});

describe('SocialLens transactional recovery', () => {
  it('rolls back a failed snapshot write after put and allows the same import to be retried', async () => {
    await repository.saveSnapshot(snapshotInput());
    await repository.saveAnnotation({ ...emptyAnnotation(personal.id, 'alice'), notes: 'Keep me' });
    const before = await repository.load();
    const input = { ...snapshotInput(), followers: ['new_profile'] };
    const failure = abortWorkspaceWrite();

    await expect(repository.saveSnapshot(input)).rejects.toThrow();
    failure.mockRestore();
    expect(await repository.load()).toEqual(before);
    expect((await repository.saveSnapshot(input)).duplicate).toBe(false);
    expect((await repository.load()).snapshots).toHaveLength(2);
  });

  it('atomically rolls back a restore after put instead of committing part of the replacement', async () => {
    await repository.saveSnapshot(snapshotInput());
    await repository.saveAnnotation({
      ...emptyAnnotation(personal.id, 'alice'),
      favorite: true,
      notes: 'Original',
    });
    const before = await repository.load();
    const replacement: AppData = {
      version: 1,
      accounts: [
        {
          id: 'replacement-account',
          label: 'Backup',
          username: 'backup_account',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      snapshots: [],
      annotations: [emptyAnnotation('replacement-account', 'bob')],
      savedFilters: [],
    };
    const failure = abortWorkspaceWrite();

    await expect(repository.restore(replacement)).rejects.toThrow();
    failure.mockRestore();
    expect(await repository.load()).toEqual(before);
    await repository.restore(replacement);
    expect(await repository.load()).toEqual(replacement);
  });

  it('rolls back quota failures while keeping an existing annotation and all snapshots', async () => {
    await repository.saveSnapshot(snapshotInput());
    await repository.saveAnnotation({
      ...emptyAnnotation(personal.id, 'alice'),
      notes: 'Before quota failure',
    });
    const before = await repository.load();
    const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('No space left', 'QuotaExceededError');
    });

    await expect(
      repository.saveAnnotation({ ...emptyAnnotation(personal.id, 'alice'), notes: 'Replacement' })
    ).rejects.toThrow('No space left');
    failure.mockRestore();
    expect(await repository.load()).toEqual(before);
  });

  it('roundtrips two isolated accounts with shared profile names, annotations, filters and a legacy snapshot', async () => {
    const source = await seedLegacy();
    await repository.importLegacy(personal.id, source.fileHash);
    await repository.saveSnapshot(snapshotInput(work));
    await repository.saveAnnotation({
      ...emptyAnnotation(personal.id, 'alice'),
      notes: 'Private note',
      favorite: true,
    });
    await repository.saveAnnotation({
      ...emptyAnnotation(work.id, 'alice'),
      notes: 'Work note',
      tags: ['work'],
      protectedFromCleanup: true,
    });
    await repository.saveFilter({
      id: 'saved-private',
      localAccountId: personal.id,
      name: 'Friends',
      query: 'alice',
      relationship: 'all',
      favoriteOnly: true,
      tag: '',
    });
    const original = await repository.load();
    const backup = await encodeBackup(original);

    await repository.clear();
    await repository.restore(await decodeBackup(backup));
    expect(await repository.load()).toEqual(original);
    expect((await indexedDBService.getFileMetadata(source.fileHash))!.fileHash).toBe(
      source.fileHash
    );
  });

  it('rejects a restore with valid snapshot hashes but a broken account reference without modifying storage', async () => {
    await repository.saveSnapshot(snapshotInput());
    const before = await repository.load();
    const invalid = structuredClone(before);
    invalid.annotations.push(emptyAnnotation('absent-account', 'alice'));

    await expect(repository.restore(invalid)).rejects.toThrow('unbekanntes Konto');
    expect(await repository.load()).toEqual(before);
  });
});
