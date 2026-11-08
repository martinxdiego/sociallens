import {
  canonicalProfiles,
  emptyData,
  normalizeProfile,
  snapshotHash,
  validateData,
  validDate,
  verifyData,
  type AppData,
  type LocalAccount,
  type ProfileAnnotation,
  type SavedFilter,
  type Snapshot,
  type SnapshotInput,
} from './model';

export const SOCIAL_LENS_DATABASE = 'sociallens';
const DATABASE_VERSION = 1;
const STORE = 'workspace';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SOCIAL_LENS_DATABASE, DATABASE_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      // Schema version 1 introduces SocialLens alongside the untouched upstream database.
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Schliesse andere SocialLens-Tabs und versuche es erneut.'));
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Die lokale Datenbank ist nicht verfügbar.'));
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

/** Every read-modify-write runs inside one transaction, including competing tabs. */
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (data: AppData) => T,
  discardExisting = false
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = store.get('data');
    let result: T;
    let failure: unknown;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(failure ?? tx.error ?? new Error('Die Speicherung wurde abgebrochen.'));
    };
    tx.onerror = () => {
      failure ??= tx.error;
    };
    request.onsuccess = () => {
      try {
        const data =
          discardExisting || request.result === undefined
            ? emptyData()
            : validateData(request.result);
        result = action(data);
        if (mode === 'readwrite') store.put(validateData(data), 'data');
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
  });
}

function requireAccount(data: AppData, id: string): void {
  if (!data.accounts.some(account => account.id === id))
    throw new Error('Das lokale Konto existiert nicht mehr.');
}

export const repository = {
  load(): Promise<AppData> {
    return transaction('readonly', data => data);
  },

  createAccount(label: string, username: string): Promise<LocalAccount> {
    const account = {
      id: crypto.randomUUID(),
      label: label.trim() || username,
      username: normalizeProfile(username),
      createdAt: new Date().toISOString(),
    };
    return transaction('readwrite', data => {
      if (data.accounts.some(existing => existing.username === account.username))
        throw new Error('Dieses Konto ist bereits vorhanden.');
      data.accounts.push(account);
      return account;
    });
  },

  async saveSnapshot(input: SnapshotInput): Promise<{ snapshot: Snapshot; duplicate: boolean }> {
    if (!input.accountConfirmed)
      throw new Error('Bestätige, dass der Export zum ausgewählten Konto gehört.');
    const followers = canonicalProfiles(input.followers);
    const following = canonicalProfiles(input.following);
    const sourceHash = await snapshotHash(followers, following);
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      localAccountId: input.localAccountId,
      importedAt: validDate(input.importedAt ?? new Date().toISOString()),
      ...(input.exportCreatedAt ? { exportCreatedAt: validDate(input.exportCreatedAt) } : {}),
      sourceHash,
      sourceFormat: input.sourceFormat,
      status:
        input.status === 'complete' && input.completenessConfirmed ? 'complete' : 'incomplete',
      followers,
      following,
      warnings: [...input.warnings],
    };
    return transaction('readwrite', data => {
      requireAccount(data, input.localAccountId);
      const duplicate = data.snapshots.find(
        existing =>
          existing.localAccountId === input.localAccountId && existing.sourceHash === sourceHash
      );
      if (duplicate) {
        // A verified reimport may repair an earlier incomplete/legacy observation.
        // The completeness confirmation belongs to this reimport, so its observation time replaces the old one.
        if (duplicate.status === 'incomplete' && snapshot.status === 'complete') {
          Object.assign(duplicate, snapshot, {
            id: duplicate.id,
          });
        }
        return { snapshot: duplicate, duplicate: true };
      }
      data.snapshots.push(snapshot);
      return { snapshot, duplicate: false };
    });
  },

  saveAnnotation(annotation: ProfileAnnotation): Promise<void> {
    return transaction('readwrite', data => {
      requireAccount(data, annotation.localAccountId);
      const next = {
        ...annotation,
        profileKey: normalizeProfile(annotation.profileKey),
        cleanup: annotation.cleanup && !annotation.protectedFromCleanup,
      };
      data.annotations = data.annotations.filter(
        item => item.localAccountId !== next.localAccountId || item.profileKey !== next.profileKey
      );
      data.annotations.push(next);
    });
  },

  saveFilter(filter: SavedFilter): Promise<void> {
    return transaction('readwrite', data => {
      requireAccount(data, filter.localAccountId);
      const existing = data.savedFilters.find(item => item.id === filter.id);
      if (existing && existing.localAccountId !== filter.localAccountId)
        throw new Error('Dieser Filter gehört zu einem anderen Konto.');
      data.savedFilters = data.savedFilters.filter(item => item.id !== filter.id);
      data.savedFilters.push(filter);
    });
  },

  deleteFilter(id: string): Promise<void> {
    return transaction('readwrite', data => {
      data.savedFilters = data.savedFilters.filter(filter => filter.id !== id);
    });
  },

  deleteSnapshot(id: string): Promise<void> {
    return transaction('readwrite', data => {
      data.snapshots = data.snapshots.filter(snapshot => snapshot.id !== id);
    });
  },

  deleteAccount(id: string): Promise<void> {
    return transaction('readwrite', data => {
      data.accounts = data.accounts.filter(account => account.id !== id);
      data.snapshots = data.snapshots.filter(snapshot => snapshot.localAccountId !== id);
      data.annotations = data.annotations.filter(annotation => annotation.localAccountId !== id);
      data.savedFilters = data.savedFilters.filter(filter => filter.localAccountId !== id);
    });
  },

  clear(): Promise<void> {
    return transaction(
      'readwrite',
      data => {
        Object.assign(data, emptyData());
      },
      true
    );
  },

  /** Restore replaces the workspace only after validating every record and hash. */
  async restore(value: unknown): Promise<void> {
    const restored = await verifyData(value);
    await transaction(
      'readwrite',
      data => {
        Object.assign(data, restored);
      },
      true
    );
  },

  async listLegacyImports() {
    const { indexedDBService } = await import('@/lib/indexeddb/indexeddb-service');
    const files = await indexedDBService.getAllFiles();
    return files.filter(
      file => file.accountsComplete !== false && !file.fileHash.startsWith('sample')
    );
  },

  /** Each old file needs its own explicit assignment because old metadata has no owner. */
  async importLegacy(localAccountId: string, fileHash: string): Promise<number> {
    const { indexedDBService } = await import('@/lib/indexeddb/indexeddb-service');
    const files = await indexedDBService.getAllFiles();
    let count = 0;
    for (const file of files) {
      if (
        file.fileHash !== fileHash ||
        file.accountsComplete === false ||
        file.fileHash.startsWith('sample')
      )
        continue;
      const accounts = await indexedDBService.getAccountsByRange(
        file.fileHash,
        0,
        file.accountCount
      );
      const result = await repository.saveSnapshot({
        localAccountId,
        importedAt: new Date(file.uploadDate).toISOString(),
        sourceFormat: 'legacy',
        status: 'incomplete',
        accountConfirmed: true,
        completenessConfirmed: false,
        followers: accounts
          .filter(account => account.badges.followers !== undefined)
          .map(account => account.username),
        following: accounts
          .filter(account => account.badges.following !== undefined)
          .map(account => account.username),
        warnings: [
          'Aus SafeUnfollow übernommen. Ursprüngliches Format, Kontozugehörigkeit und Vollständigkeit sind nicht nachprüfbar. Für Vergleiche erneut importieren.',
        ],
      });
      if (!result.duplicate) count += 1;
    }
    return count;
  },
};
