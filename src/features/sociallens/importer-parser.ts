import {
  BlobReader,
  ZipReader,
  configure,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js/lib/zip-core-native.js';
import { parseRelationshipFile } from '@/core/parsers/instagram-html';
import { resolveEntries, resolveEntryList } from '@/core/parsers/instagram-utils';

configure({ useWebWorkers: false });

export interface ImportPreview {
  followers: string[];
  following: string[];
  sourceFormat: 'json' | 'html';
  /** Structural completeness only. The owner must additionally confirm account and export coverage. */
  status: 'complete' | 'incomplete';
  warnings: string[];
  sourceFileName: string;
  sourceFileSize: number;
  files: string[];
}

export const IMPORT_LIMITS = {
  archiveBytes: 256 * 1024 * 1024,
  entryBytes: 32 * 1024 * 1024,
  selectedBytes: 128 * 1024 * 1024,
  entries: 10_000,
  relationshipFiles: 500,
  compressionRatio: 500,
} as const;

type RelationshipEntry = {
  entry: FileEntry;
  kind: 'followers' | 'following';
  shard: number | null;
  format: 'json' | 'html';
  directory: string;
};

function relationshipEntry(entry: Entry): RelationshipEntry | null {
  if (entry.directory) return null;
  const match = /^(.*\/)?(followers(?:_(\d+))?|following)\.(json|html)$/i.exec(entry.filename);
  if (!match) {
    if (/(^|\/)followers_[^/]+\.(json|html)$/i.test(entry.filename)) {
      throw new Error(
        'Die Nummerierung der Follower-Dateien ist unbekannt. Bitte einen unveränderten Meta-Export verwenden.'
      );
    }
    return null;
  }
  const directory = match[1] ?? '';
  // A single enclosing export directory is permitted, but not arbitrary data categories.
  if (directory && !/(^|\/)(connections\/)?followers_and_following\/$/i.test(directory))
    return null;
  return {
    entry,
    kind: match[2]!.toLowerCase() === 'following' ? 'following' : 'followers',
    shard: match[3] ? Number(match[3]) : null,
    format: match[4]!.toLowerCase() as 'json' | 'html',
    directory,
  };
}

function assertSafePath(path: string): void {
  if (
    !path ||
    path.length > 1024 ||
    path.includes('\\') ||
    [...path].some(character => character.charCodeAt(0) < 32) ||
    /^(\/|[a-z]:)/i.test(path)
  ) {
    throw new Error('Das ZIP enthält einen unsicheren oder ungewöhnlichen Dateipfad.');
  }
  const segments = path.replace(/\/$/, '').split('/');
  if (segments.some(segment => segment === '..' || segment === '.' || segment === '')) {
    throw new Error('Das ZIP enthält einen unsicheren oder ungewöhnlichen Dateipfad.');
  }
}

async function readBoundedText(entry: FileEntry): Promise<string> {
  if (!entry.getData) throw new Error('Der ZIP-Eintrag kann nicht gelesen werden.');
  let bytes = 0;
  const chunks: string[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      bytes += chunk.byteLength;
      if (bytes > IMPORT_LIMITS.entryBytes || bytes > entry.uncompressedSize) {
        throw new Error('Eine entpackte Datei überschreitet die zulässige Grösse.');
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
    },
    close() {
      chunks.push(decoder.decode());
    },
  });
  await entry.getData(stream, { checkSignature: true });
  return chunks.join('');
}

async function collectEntries(reader: ZipReader<Blob>): Promise<RelationshipEntry[]> {
  const selected: RelationshipEntry[] = [];
  const names = new Set<string>();
  let count = 0;
  let selectedBytes = 0;
  for await (const entry of reader.getEntriesGenerator()) {
    if (++count > IMPORT_LIMITS.entries)
      throw new Error(
        'Das ZIP enthält mehr als 10 000 Dateien. Bitte nur Follower und Following exportieren.'
      );
    assertSafePath(entry.filename);
    const name = entry.filename.toLowerCase();
    if (names.has(name))
      throw new Error(
        'Das ZIP enthält mehrfache Dateipfade. Die Datenstände lassen sich nicht eindeutig zuordnen.'
      );
    names.add(name);
    const relationship = relationshipEntry(entry);
    if (!relationship) continue;
    if (entry.encrypted)
      throw new Error('Passwortgeschützte ZIP-Dateien werden nicht unterstützt.');
    if (
      !Number.isSafeInteger(entry.uncompressedSize) ||
      entry.uncompressedSize > IMPORT_LIMITS.entryBytes
    ) {
      throw new Error('Eine Beziehungsdatei ist grösser als 32 MiB.');
    }
    if (
      entry.uncompressedSize >
      Math.max(1, entry.compressedSize) * IMPORT_LIMITS.compressionRatio
    ) {
      throw new Error(
        'Die ungewöhnlich starke ZIP-Kompression überschreitet die Sicherheitsgrenze.'
      );
    }
    selectedBytes += entry.uncompressedSize;
    if (
      selectedBytes > IMPORT_LIMITS.selectedBytes ||
      selected.length >= IMPORT_LIMITS.relationshipFiles
    ) {
      throw new Error(
        'Die Beziehungsdaten überschreiten die Importgrenze von 128 MiB oder 500 Dateien.'
      );
    }
    selected.push(relationship);
  }
  return selected;
}

function validateLayout(entries: RelationshipEntry[]): string[] {
  if (!entries.length)
    throw new Error(
      'Keine unterstützten Follower-/Following-Dateien gefunden. Bitte JSON oder HTML für den gesamten Zeitraum exportieren.'
    );
  if (new Set(entries.map(item => item.directory)).size > 1) {
    throw new Error(
      'Mehrere Exportordner gefunden. Bitte jedes Konto und jeden Datenstand als eigene ZIP-Datei importieren.'
    );
  }
  if (new Set(entries.map(item => item.format)).size > 1) {
    throw new Error(
      'Gemischte JSON-/HTML-Dateien können aus unterschiedlichen Datenständen stammen. Bitte einen einzelnen Export importieren.'
    );
  }
  const followers = entries.filter(item => item.kind === 'followers');
  const following = entries.filter(item => item.kind === 'following');
  if (
    following.length > 1 ||
    new Set(followers.map(item => item.shard)).size !== followers.length
  ) {
    throw new Error(
      'Eine Beziehungskategorie oder Teilnummer ist mehrfach vorhanden. Der Import wurde abgebrochen.'
    );
  }
  if (followers.length > 1 && followers.some(item => item.shard === null)) {
    throw new Error('Eine vollständige Follower-Datei und Teil-Dateien sind vermischt.');
  }
  const warnings: string[] = [];
  if (!followers.length)
    warnings.push('Follower-Datei fehlt. Dieser Datenstand ist unvollständig.');
  if (!following.length)
    warnings.push('Following-Datei fehlt. Dieser Datenstand ist unvollständig.');
  const shards = followers
    .flatMap(item => (item.shard === null ? [] : [item.shard]))
    .sort((a, b) => a - b);
  if (shards.some((shard, index) => shard !== index + 1)) {
    warnings.push(
      'Die Nummerierung der Follower-Teildateien hat Lücken. Dieser Datenstand ist unvollständig.'
    );
  }
  return warnings;
}

async function validateZipFile(file: Blob & { name?: string }): Promise<void> {
  if (file.size === 0 || file.size > IMPORT_LIMITS.archiveBytes) {
    throw new Error('Bitte eine ZIP-Datei zwischen 1 Byte und 256 MiB wählen.');
  }
  if (file.name && !/\.zip$/i.test(file.name)) throw new Error('Bitte eine ZIP-Datei auswählen.');
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (magic[0] !== 0x50 || magic[1] !== 0x4b || ![0x03, 0x05, 0x07].includes(magic[2] ?? 0)) {
    throw new Error('Die Datei ist kein gültiges ZIP-Archiv.');
  }
}

/** Reads only expected relationship files, in a worker in normal browser use. Never writes storage. */
export async function parseInstagramZip(
  file: Blob & { name?: string },
  onProgress: (message: string) => void = () => undefined
): Promise<ImportPreview> {
  await validateZipFile(file);
  const reader = new ZipReader(new BlobReader(file));
  try {
    onProgress('ZIP-Struktur wird geprüft …');
    const entries = await collectEntries(reader);
    const warnings = validateLayout(entries);
    const profiles = { followers: new Set<string>(), following: new Set<string>() };
    let incomplete = warnings.length > 0;
    for (const item of entries) {
      onProgress(`${item.entry.filename} wird lokal gelesen …`);
      const text = await readBoundedText(item.entry);
      let data: unknown;
      try {
        data = parseRelationshipFile(item.entry.filename, text).data;
      } catch {
        throw new Error(
          `Ungültige JSON-Daten in ${item.entry.filename}. Es wurde nichts gespeichert.`
        );
      }
      const raw = resolveEntryList(data, [`relationships_${item.kind}`]);
      if (raw === null) {
        throw new Error(
          `Unbekanntes oder beschädigtes Format in ${item.entry.filename}. Es wurde nichts gespeichert.`
        );
      }
      if (item.format === 'html' && raw.length === 0) {
        incomplete = true;
        warnings.push(
          `${item.entry.filename}: Leeres HTML lässt sich nicht sicher von einem unbekannten Exportlayout unterscheiden. Vergleiche sind gesperrt.`
        );
      }
      const { items, unresolved } = resolveEntries(raw);
      if (unresolved) {
        incomplete = true;
        warnings.push(
          `${item.entry.filename}: ${unresolved} von ${raw.length} Einträgen konnten nicht gelesen werden. Vergleiche sind gesperrt.`
        );
      }
      let duplicates = raw.length - unresolved - items.length;
      for (const profile of items) {
        if (profiles[item.kind].has(profile.username)) duplicates++;
        profiles[item.kind].add(profile.username);
      }
      if (duplicates)
        warnings.push(
          `${item.entry.filename}: ${duplicates} doppelte Profilkennungen wurden zusammengeführt.`
        );
    }
    warnings.push(
      'Kontozugehörigkeit und Exportzeitraum können aus diesen Dateien nicht verlässlich geprüft werden. Bitte das richtige Konto und den gesamten Zeitraum bestätigen.'
    );
    warnings.push(
      'Profile werden anhand normalisierter Benutzernamen zugeordnet. Umbenennungen können wie Zugänge und Abgänge erscheinen.'
    );
    return {
      followers: [...profiles.followers].sort(),
      following: [...profiles.following].sort(),
      sourceFormat: entries[0]!.format,
      status: incomplete ? 'incomplete' : 'complete',
      warnings,
      sourceFileName: file.name ?? 'instagram.zip',
      sourceFileSize: file.size,
      files: entries.map(item => item.entry.filename),
    };
  } finally {
    await reader.close();
  }
}
