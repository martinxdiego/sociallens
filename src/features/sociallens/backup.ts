import { sha256, verifyData, type AppData } from './model';

const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
const ITERATIONS = 310000;
interface PlainBackup {
  application: 'SocialLens';
  version: 1;
  createdAt: string;
  checksum: string;
  data: AppData;
}

function toBase64(bytes: Uint8Array): string {
  let value = '';
  for (let index = 0; index < bytes.length; index += 8192)
    value += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(value);
}
function fromBase64(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string') throw new Error('Ungültiges verschlüsseltes Backup.');
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
async function encryptionKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encodeBackup(value: AppData, passphrase?: string): Promise<string> {
  const data = await verifyData(value);
  const backup: PlainBackup = {
    application: 'SocialLens',
    version: 1,
    createdAt: new Date().toISOString(),
    checksum: await sha256(JSON.stringify(data)),
    data,
  };
  const plain = JSON.stringify(backup);
  if (new TextEncoder().encode(plain).byteLength > MAX_BACKUP_BYTES)
    throw new Error('Das Backup überschreitet die Grössenbegrenzung von 200 MiB.');
  if (!passphrase) return plain;
  if (passphrase.length < 12)
    throw new Error('Verwende eine Passphrase mit mindestens 12 Zeichen.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain)
  );
  return JSON.stringify({
    application: 'SocialLens',
    version: 1,
    encrypted: true,
    algorithm: 'AES-GCM',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  });
}

/** Version 1 is the first public backup format. Future versions must migrate before restore. */
export async function decodeBackup(text: string, passphrase?: string): Promise<AppData> {
  if (text.length > MAX_BACKUP_BYTES * 1.4) throw new Error('Das Backup ist zu gross.');
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error('Das Backup enthält kein gültiges JSON.');
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
    throw new Error('Ungültiges Backup.');
  const outer = envelope as Record<string, unknown>;
  if (outer.application !== 'SocialLens' || outer.version !== 1)
    throw new Error('Unbekanntes Backupformat oder neuere Backupversion.');
  if (outer.encrypted === true) {
    if (!passphrase) throw new Error('Gib die Passphrase dieses Backups ein.');
    if (outer.algorithm !== 'AES-GCM' || outer.iterations !== ITERATIONS)
      throw new Error('Unbekannte Verschlüsselungsparameter.');
    const salt = fromBase64(outer.salt);
    const iv = fromBase64(outer.iv);
    if (salt.length !== 16 || iv.length !== 12)
      throw new Error('Ungültige Verschlüsselungsparameter.');
    let plain: string;
    try {
      const key = await encryptionKey(passphrase, salt);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        fromBase64(outer.ciphertext)
      );
      plain = new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
    } catch {
      throw new Error('Falsche Passphrase oder beschädigtes Backup.');
    }
    // An encrypted backup always contains a plain envelope, never another encrypted layer.
    const inner = JSON.parse(plain) as Record<string, unknown>;
    if (inner.encrypted) throw new Error('Verschachtelte Backups werden nicht unterstützt.');
    return decodeBackup(plain);
  }
  if (
    typeof outer.checksum !== 'string' ||
    outer.checksum !== (await sha256(JSON.stringify(outer.data)))
  )
    throw new Error('Die Backup-Prüfsumme stimmt nicht.');
  return verifyData(outer.data);
}
