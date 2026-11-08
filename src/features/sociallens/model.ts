/** Domain records deliberately contain no Instagram credentials or inferred person IDs. */
export interface LocalAccount {
  id: string;
  label: string;
  username: string;
  createdAt: string;
}

export interface Snapshot {
  id: string;
  localAccountId: string;
  importedAt: string;
  exportCreatedAt?: string;
  sourceHash: string;
  sourceFormat: 'json' | 'html' | 'legacy';
  status: 'complete' | 'incomplete';
  followers: string[];
  following: string[];
  warnings: string[];
}

export interface ProfileAnnotation {
  localAccountId: string;
  profileKey: string;
  favorite: boolean;
  protectedFromCleanup: boolean;
  tags: string[];
  notes: string;
  lists: string[];
  cleanup: boolean;
}

export type RelationshipFilter = 'all' | 'mutuals' | 'nonFollowers' | 'fans';
export interface SavedFilter {
  id: string;
  localAccountId: string;
  name: string;
  query: string;
  relationship: RelationshipFilter;
  favoriteOnly: boolean;
  tag: string;
}

export interface AppData {
  version: 1;
  accounts: LocalAccount[];
  snapshots: Snapshot[];
  annotations: ProfileAnnotation[];
  savedFilters: SavedFilter[];
}

export type SnapshotInput = Omit<Snapshot, 'id' | 'sourceHash' | 'importedAt'> & {
  importedAt?: string;
  accountConfirmed: boolean;
  completenessConfirmed: boolean;
};

export function emptyData(): AppData {
  return { version: 1, accounts: [], snapshots: [], annotations: [], savedFilters: [] };
}

export function normalizeProfile(value: string): string {
  const profile = value.trim().normalize('NFKC').replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(profile)) {
    throw new Error('Ungültiger Instagram-Benutzername.');
  }
  return profile;
}

export function canonicalProfiles(profiles: string[]): string[] {
  return [...new Set(profiles.map(normalizeProfile))].sort();
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function snapshotHash(followers: string[], following: string[]): Promise<string> {
  return sha256(JSON.stringify([canonicalProfiles(followers), canonicalProfiles(following)]));
}

export function relationshipStats(snapshot: Pick<Snapshot, 'followers' | 'following'>) {
  const followers = new Set(snapshot.followers);
  const following = new Set(snapshot.following);
  const mutuals = [...followers].filter(profile => following.has(profile));
  const nonFollowers = [...following].filter(profile => !followers.has(profile));
  const fans = [...followers].filter(profile => !following.has(profile));
  return {
    mutuals,
    nonFollowers,
    fans,
    followBackRate: following.size ? (mutuals.length / following.size) * 100 : 0,
    mutualsRate: followers.size ? (mutuals.length / followers.size) * 100 : 0,
  };
}

export interface SnapshotComparison {
  comparable: boolean;
  reason?: string;
  newFollowers: string[];
  lostFollowers: string[];
  startedFollowing: string[];
  stoppedFollowing: string[];
}

/** Import timestamps are observation times. Export clocks are used only when both exist. */
export function compareSnapshots(previous: Snapshot, current: Snapshot): SnapshotComparison {
  let reason: string | undefined;
  if (previous.localAccountId !== current.localAccountId)
    reason = 'Die Datenstände gehören zu unterschiedlichen Konten.';
  else if (previous.status !== 'complete' || current.status !== 'complete')
    reason = 'Für einen Vergleich müssen beide Datenstände vollständig bestätigt sein.';
  else if (!previous.exportCreatedAt || !current.exportCreatedAt)
    reason =
      'Für gerichtete Änderungen müssen beide Erstellungszeiten der Exporte bekannt sein. Die Importreihenfolge beweist keine zeitliche Reihenfolge.';
  else if (previous.sourceFormat !== current.sourceFormat)
    reason = 'Unterschiedliche Exportformate sind nicht sicher vergleichbar.';
  else if (
    !Number.isFinite(Date.parse(previous.exportCreatedAt ?? previous.importedAt)) ||
    !Number.isFinite(Date.parse(current.exportCreatedAt ?? current.importedAt))
  )
    reason = 'Die Zeitangaben sind ungültig.';
  else if (previous.id === current.id) reason = 'Wähle zwei unterschiedliche Datenstände.';
  else if (Boolean(previous.exportCreatedAt) !== Boolean(current.exportCreatedAt))
    reason = 'Die Datenstände verwenden unterschiedliche Zeitgrundlagen.';
  else if (
    Date.parse(previous.exportCreatedAt ?? previous.importedAt) >=
    Date.parse(current.exportCreatedAt ?? current.importedAt)
  )
    reason = 'Der Ziel-Datenstand muss zeitlich nach dem Ausgang stehen.';
  if (reason)
    return {
      comparable: false,
      reason,
      newFollowers: [],
      lostFollowers: [],
      startedFollowing: [],
      stoppedFollowing: [],
    };
  const difference = (left: string[], right: string[]) => {
    const known = new Set(right);
    return left.filter(profile => !known.has(profile));
  };
  return {
    comparable: true,
    newFollowers: difference(current.followers, previous.followers),
    lostFollowers: difference(previous.followers, current.followers),
    startedFollowing: difference(current.following, previous.following),
    stoppedFollowing: difference(previous.following, current.following),
  };
}

export function emptyAnnotation(localAccountId: string, profileKey: string): ProfileAnnotation {
  return {
    localAccountId,
    profileKey: normalizeProfile(profileKey),
    favorite: false,
    protectedFromCleanup: false,
    tags: [],
    notes: '',
    lists: [],
    cleanup: false,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültige Datenstruktur.');
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 10000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Ungültiger Textwert.');
  return value;
}
function identity(value: unknown): string {
  const result = string(value, 100);
  if (!result) throw new Error('Fehlende Kennung.');
  return result;
}
function strings(value: unknown, max = 1000000): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Ungültige Liste.');
  return value.map(item => string(item));
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Ungültiger Wahrheitswert.');
  return value;
}
export function validDate(value: unknown): string {
  const text = string(value, 50);
  if (!/^\d{4}-\d\d-\d\dT/.test(text) || !Number.isFinite(Date.parse(text)))
    throw new Error('Ungültiger Zeitpunkt.');
  return new Date(text).toISOString();
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100000) throw new Error('Ungültige Datensammlung.');
  return value;
}
function assertUnique(values: string[]): void {
  if (new Set(values).size !== values.length) throw new Error('Doppelte Kennungen im Backup.');
}

/** Strict whitelist reconstruction drops unrecognised fields and rejects broken references. */
export function validateData(value: unknown): AppData {
  const input = record(value);
  if (input.version !== 1) throw new Error('Diese Datenversion wird nicht unterstützt.');
  const accounts = rows(input.accounts).map(item => {
    const entry = record(item);
    return {
      id: identity(entry.id),
      label: string(entry.label, 200),
      username: normalizeProfile(string(entry.username, 100)),
      createdAt: validDate(entry.createdAt),
    };
  });
  assertUnique(accounts.map(account => account.id));
  assertUnique(accounts.map(account => account.username));
  const accountIds = new Set(accounts.map(account => account.id));
  const accountId = (value: unknown) => {
    const id = identity(value);
    if (!accountIds.has(id)) throw new Error('Verweis auf ein unbekanntes Konto.');
    return id;
  };
  const snapshots: Snapshot[] = rows(input.snapshots).map(item => {
    const entry = record(item);
    if (
      entry.sourceFormat !== 'json' &&
      entry.sourceFormat !== 'html' &&
      entry.sourceFormat !== 'legacy'
    )
      throw new Error('Unbekanntes Exportformat.');
    if (entry.status !== 'complete' && entry.status !== 'incomplete')
      throw new Error('Ungültiger Datenstatus.');
    if (entry.sourceFormat === 'legacy' && entry.status === 'complete')
      throw new Error('Altdaten sind nicht als vollständig nachgewiesen.');
    const hash = string(entry.sourceHash, 64);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Ungültige Prüfsumme.');
    return {
      id: identity(entry.id),
      localAccountId: accountId(entry.localAccountId),
      importedAt: validDate(entry.importedAt),
      ...(entry.exportCreatedAt === undefined
        ? {}
        : { exportCreatedAt: validDate(entry.exportCreatedAt) }),
      sourceHash: hash,
      sourceFormat: entry.sourceFormat,
      status: entry.status,
      followers: canonicalProfiles(strings(entry.followers)),
      following: canonicalProfiles(strings(entry.following)),
      warnings: strings(entry.warnings, 1000),
    };
  });
  assertUnique(snapshots.map(snapshot => snapshot.id));
  assertUnique(
    snapshots.map(snapshot => JSON.stringify([snapshot.localAccountId, snapshot.sourceHash]))
  );
  const annotations: ProfileAnnotation[] = rows(input.annotations).map(item => {
    const entry = record(item);
    const protectedFromCleanup = boolean(entry.protectedFromCleanup);
    return {
      localAccountId: accountId(entry.localAccountId),
      profileKey: normalizeProfile(string(entry.profileKey)),
      favorite: boolean(entry.favorite),
      protectedFromCleanup,
      tags: strings(entry.tags, 100),
      notes: string(entry.notes),
      lists: strings(entry.lists, 100),
      cleanup: boolean(entry.cleanup) && !protectedFromCleanup,
    };
  });
  assertUnique(
    annotations.map(annotation =>
      JSON.stringify([annotation.localAccountId, annotation.profileKey])
    )
  );
  const savedFilters: SavedFilter[] = rows(input.savedFilters).map(item => {
    const entry = record(item);
    if (!['all', 'mutuals', 'nonFollowers', 'fans'].includes(string(entry.relationship)))
      throw new Error('Ungültiger Filter.');
    return {
      id: identity(entry.id),
      localAccountId: accountId(entry.localAccountId),
      name: string(entry.name, 200),
      query: string(entry.query, 200),
      relationship: entry.relationship as RelationshipFilter,
      favoriteOnly: boolean(entry.favoriteOnly),
      tag: string(entry.tag, 200),
    };
  });
  assertUnique(savedFilters.map(filter => filter.id));
  return { version: 1, accounts, snapshots, annotations, savedFilters };
}

export async function verifyData(value: unknown): Promise<AppData> {
  const data = validateData(value);
  for (const snapshot of data.snapshots) {
    if (snapshot.sourceHash !== (await snapshotHash(snapshot.followers, snapshot.following)))
      throw new Error('Die Prüfsumme eines Datenstands stimmt nicht.');
  }
  return data;
}
