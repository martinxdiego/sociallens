import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { IMPORT_LIMITS, parseInstagramZip } from './importer';

const row = (username: string) => ({
  string_list_data: [
    { value: username, href: `https://www.instagram.com/${username}/`, timestamp: 1_700_000_000 },
  ],
});
const list = (...names: string[]) => JSON.stringify(names.map(row));
const following = (...names: string[]) =>
  JSON.stringify({
    relationships_following: names.map(username => ({
      title: username,
      string_list_data: [{ href: `https://www.instagram.com/${username}/` }],
    })),
  });

async function zip(
  files: Record<string, string>,
  compression: 'STORE' | 'DEFLATE' = 'STORE'
): Promise<Blob> {
  const archive = new JSZip();
  for (const [name, content] of Object.entries(files))
    archive.file(name, content, { createFolders: false });
  return archive.generateAsync({ type: 'blob', compression });
}

async function patchCentralSize(blob: Blob, size: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const data = new DataView(bytes.buffer);
  for (let offset = 0; offset <= bytes.length - 46; offset++) {
    if (data.getUint32(offset, true) === 0x02014b50) {
      data.setUint32(offset + 24, size, true);
      break;
    }
  }
  return new Blob([bytes]);
}

describe('SocialLens staged ZIP import', () => {
  it('reads nested split JSON exports and normalizes/deduplicates usernames', async () => {
    const preview = await parseInstagramZip(
      await zip({
        'instagram-export/connections/followers_and_following/followers_1.json': list(
          ' Alice ',
          'bob',
          'ALICE'
        ),
        'instagram-export/connections/followers_and_following/followers_2.json': list(
          'carol',
          'bob'
        ),
        'instagram-export/connections/followers_and_following/following.json': following(
          'alice',
          'david'
        ),
        'media/profile.jpg': 'ignored',
      })
    );
    expect(preview.followers).toEqual(['alice', 'bob', 'carol']);
    expect(preview.following).toEqual(['alice', 'david']);
    expect(preview.status).toBe('complete');
    expect(preview.sourceFormat).toBe('json');
    expect(preview.files).toHaveLength(3);
    expect(preview.warnings.filter(warning => warning.includes('doppelte'))).toHaveLength(2);
  });

  it('accepts explicit empty arrays as structurally complete', async () => {
    const preview = await parseInstagramZip(
      await zip({ 'followers.json': '[]', 'following.json': following() })
    );
    expect(preview.status).toBe('complete');
    expect(preview.followers).toEqual([]);
    expect(preview.warnings.some(warning => warning.includes('Exportzeitraum'))).toBe(true);
  });

  it('marks missing followers or following as incomplete, never as an empty complete list', async () => {
    for (const name of ['followers_1.json', 'following.json']) {
      const preview = await parseInstagramZip(await zip({ [name]: list('alice') }));
      expect(preview.status).toBe('incomplete');
      expect(preview.warnings.some(warning => warning.includes('fehlt'))).toBe(true);
    }
  });

  it('marks missing follower shards as incomplete', async () => {
    const preview = await parseInstagramZip(
      await zip({
        'followers_1.json': list('alice'),
        'followers_3.json': list('bob'),
        'following.json': following('alice'),
      })
    );
    expect(preview.status).toBe('incomplete');
    expect(preview.warnings.some(warning => warning.includes('Lücken'))).toBe(true);
  });

  it('reports malformed records and Unicode usernames without silently claiming complete data', async () => {
    const preview = await parseInstagramZip(
      await zip({
        'followers_1.json': JSON.stringify([
          row('alice'),
          row('café'),
          null,
          { string_list_data: [{ value: 4 }] },
        ]),
        'following.json': following('alice'),
      })
    );
    expect(preview.followers).toEqual(['alice']);
    expect(preview.status).toBe('incomplete');
    expect(preview.warnings.some(warning => warning.includes('3 von 4'))).toBe(true);
  });

  it('rejects broken JSON and unknown top-level schemas', async () => {
    for (const content of ['{broken', '{"renamed_followers":[]}']) {
      await expect(
        parseInstagramZip(await zip({ 'followers_1.json': content, 'following.json': following() }))
      ).rejects.toThrow();
    }
  });

  it('reads HTML through the existing inert parser without executing embedded script', async () => {
    const html =
      '<html><body><script>throw new Error("EXECUTED")</script><div class="uiBoxWhite"><a href="https://www.instagram.com/alice/">Alice</a></div></body></html>';
    const preview = await parseInstagramZip(
      await zip({ 'followers_1.html': html, 'following.html': html })
    );
    expect(preview.followers).toEqual(['alice']);
    expect(preview.following).toEqual(['alice']);
    expect(preview.sourceFormat).toBe('html');
    expect(preview.status).toBe('complete');
  });

  it('does not treat arbitrary empty HTML as proof of a complete empty relationship list', async () => {
    const preview = await parseInstagramZip(
      await zip({
        'followers_1.html': '<html><body></body></html>',
        'following.html': '<html><body></body></html>',
      })
    );
    expect(preview.status).toBe('incomplete');
    expect(preview.warnings.some(warning => warning.includes('Leeres HTML'))).toBe(true);
  });

  it('rejects truncated HTML and orphaned relationship markup', async () => {
    for (const html of [
      '<html><div class="uiBoxWhite"><a href="https://www.instagram.com/alice/">alice',
      '<html><body><a href="https://www.instagram.com/alice/">alice</a></body></html>',
    ]) {
      await expect(
        parseInstagramZip(await zip({ 'followers_1.html': html, 'following.html': html }))
      ).rejects.toThrow();
    }
  });

  it('rejects combined export directories and mixed formats', async () => {
    await expect(
      parseInstagramZip(
        await zip({
          'followers_1.json': list('alice'),
          'followers_and_following/following.json': following('alice'),
        })
      )
    ).rejects.toThrow('Mehrere Exportordner');
    await expect(
      parseInstagramZip(
        await zip({ 'followers_1.json': list('alice'), 'following.html': '<html></html>' })
      )
    ).rejects.toThrow('Gemischte');
  });

  it('rejects duplicate shard numbers and a whole file combined with shards', async () => {
    await expect(
      parseInstagramZip(
        await zip({
          'followers_1.json': list('alice'),
          'followers_01.json': list('bob'),
          'following.json': following(),
        })
      )
    ).rejects.toThrow('mehrfach');
    await expect(
      parseInstagramZip(
        await zip({
          'followers.json': list('alice'),
          'followers_1.json': list('bob'),
          'following.json': following(),
        })
      )
    ).rejects.toThrow('vermischt');
  });

  it('rejects traversal, absolute paths and backslash paths, even in unselected entries', async () => {
    for (const path of ['../secret.txt', '/secret.txt', 'C:\\secret.txt', 'folder\\secret.txt']) {
      await expect(
        parseInstagramZip(
          await zip({ [path]: 'bad', 'followers_1.json': list(), 'following.json': following() })
        )
      ).rejects.toThrow();
    }
  });

  it('rejects unknown shard numbering and unrelated files', async () => {
    await expect(
      parseInstagramZip(
        await zip({ 'followers_mystery.json': list('alice'), 'following.json': following() })
      )
    ).rejects.toThrow('Nummerierung');
    await expect(
      parseInstagramZip(await zip({ 'unrelated/users.json': list('alice') }))
    ).rejects.toThrow('Keine unterstützten');
  });

  it('enforces declared decompression limits before allocation', async () => {
    const archive = await zip({ 'followers_1.json': list('alice'), 'following.json': following() });
    await expect(
      parseInstagramZip(await patchCentralSize(archive, IMPORT_LIMITS.entryBytes + 1))
    ).rejects.toThrow('32 MiB');
    await expect(parseInstagramZip(await patchCentralSize(archive, 1_000_000))).rejects.toThrow(
      'Kompression'
    );
  });

  it('enforces actual decompressed size when archive metadata lies', async () => {
    const archive = await zip({ 'followers_1.json': list('alice'), 'following.json': following() });
    await expect(parseInstagramZip(await patchCentralSize(archive, 1))).rejects.toThrow();
  });

  it('rejects non-ZIP bytes and corrupt ZIP bytes', async () => {
    await expect(parseInstagramZip(new Blob(['not zip']))).rejects.toThrow('kein gültiges ZIP');
    await expect(
      parseInstagramZip(new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])]))
    ).rejects.toThrow();
  });

  it('reads compressed exports with tens of thousands of profiles', async () => {
    const names = Array.from({ length: 20_000 }, (_, index) => `profile_${index}`);
    const started = performance.now();
    const preview = await parseInstagramZip(
      await zip(
        {
          'followers_1.json': list(...names),
          'following.json': following(...names.slice(0, 10_000)),
        },
        'DEFLATE'
      )
    );
    expect(preview.followers).toHaveLength(20_000);
    expect(preview.following).toHaveLength(10_000);
    expect(preview.status).toBe('complete');
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});
