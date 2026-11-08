import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBackup, encodeBackup } from './backup';
import { emptyData, sha256 } from './model';

beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
);
const data = {
  ...emptyData(),
  accounts: [
    { id: 'account', label: 'Personal', username: 'test', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
};

describe('SocialLens backup validation', () => {
  it('roundtrips a versioned backup', async () => {
    expect(await decodeBackup(await encodeBackup(data))).toEqual(data);
  });
  it('roundtrips AES-GCM and rejects missing or wrong passphrases', async () => {
    const backup = await encodeBackup(data, 'a long secret phrase');
    expect(backup).not.toContain('Personal');
    expect(await decodeBackup(backup, 'a long secret phrase')).toEqual(data);
    await expect(decodeBackup(backup)).rejects.toThrow('Passphrase');
    await expect(decodeBackup(backup, 'wrong password')).rejects.toThrow('Passphrase');
    await expect(encodeBackup(data, 'short')).rejects.toThrow('12');
  });
  it('rejects mutations, unknown schemas, invalid JSON and malformed data', async () => {
    const backup = JSON.parse(await encodeBackup(data));
    backup.data.accounts[0].label = 'tampered';
    await expect(decodeBackup(JSON.stringify(backup))).rejects.toThrow('Prüfsumme');
    await expect(decodeBackup('[')).rejects.toThrow('JSON');
    await expect(decodeBackup(JSON.stringify({ ...backup, version: 2 }))).rejects.toThrow(
      'Backupversion'
    );
    backup.checksum = await sha256(JSON.stringify(backup.data));
    backup.data.accounts[0].username = '<script>';
    backup.checksum = await sha256(JSON.stringify(backup.data));
    await expect(decodeBackup(JSON.stringify(backup))).rejects.toThrow('Benutzername');
  });
  it('drops unknown fields instead of merging attacker-controlled keys', async () => {
    const backup = JSON.parse(await encodeBackup(data));
    backup.data.accounts[0].unexpected = { pollution: true };
    backup.checksum = await sha256(JSON.stringify(backup.data));
    expect(await decodeBackup(JSON.stringify(backup))).toEqual(data);
  });
});
