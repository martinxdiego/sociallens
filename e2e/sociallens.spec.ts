import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

async function fixture(followers: string[], following: string[], missing = false) {
  const zip = new JSZip();
  const rows = (names: string[]) =>
    names.map(value => ({
      string_list_data: [
        { value, href: `https://www.instagram.com/${value}/`, timestamp: 1700000000 },
      ],
    }));
  zip.file('connections/followers_and_following/followers_1.json', JSON.stringify(rows(followers)));
  if (!missing)
    zip.file(
      'connections/followers_and_following/following.json',
      JSON.stringify({ relationships_following: rows(following) })
    );
  return {
    name: 'synthetic-instagram.zip',
    mimeType: 'application/zip',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  };
}
async function createAccount(page: Page, username: string) {
  await page.getByRole('button', { name: 'Konto hinzufügen' }).click();
  await page.getByLabel('Instagram-Benutzername', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'Konto anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Importieren', exact: true })).toBeVisible();
}
async function importData(
  page: Page,
  username: string,
  followers: string[],
  following: string[],
  date: string,
  missing = false
) {
  await page.getByRole('button', { name: 'Importieren', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles(await fixture(followers, following, missing));
  await expect(page.getByRole('heading', { name: 'Import prüfen', exact: true })).toBeVisible();
  await page.getByLabel(`Dieser Export gehört zu @${username}.`, { exact: true }).check();
  if (!missing)
    await page
      .getByLabel('Ich habe Follower und Following für den gesamten Zeitraum exportiert.')
      .check();
  await page.getByLabel('Erstellungszeit des Exports, falls verlässlich bekannt').fill(date);
  await page.getByRole('button', { name: 'Datenstand speichern', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import prüfen', exact: true })).toHaveCount(0);
}

test('local import, history, annotations, duplicate, backup, restore and isolation', async ({
  page,
}, testInfo) => {
  const remote: string[] = [];
  const errors: string[] = [];
  page.on('request', request => {
    if (
      !request.url().startsWith('http://127.0.0.1:5173') &&
      !request.url().startsWith('blob:') &&
      !request.url().startsWith('data:')
    )
      remote.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await createAccount(page, 'demo_owner');
  await importData(page, 'demo_owner', ['alice', 'bob'], ['alice', 'charlie'], '2026-10-01T12:00');
  await page.getByRole('button', { name: 'Beziehungen', exact: true }).click();
  await page.getByRole('button', { name: /@alice Profil ansehen/ }).click();
  await page.getByLabel('Persönliche Notizen').fill('Synthetische Notiz');
  await page.getByLabel('Favorit', { exact: true }).check();
  await page.getByLabel('Whitelist', { exact: true }).check();
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await importData(
    page,
    'demo_owner',
    ['alice', 'dave'],
    ['alice', 'charlie', 'dave'],
    '2026-11-01T12:00'
  );
  await page.getByRole('button', { name: 'Änderungen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Neue Follower', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '@bob', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '@dave', exact: true }).first()).toBeVisible();
  await importData(
    page,
    'demo_owner',
    ['alice', 'dave'],
    ['alice', 'charlie', 'dave'],
    '2026-11-01T12:00'
  );
  await expect(page.getByRole('status')).toContainText('bereits gespeichert');
  await page.reload();
  await page.getByRole('button', { name: 'Sammlungen', exact: true }).click();
  await page.getByRole('button', { name: 'Favoriten', exact: true }).click();
  await page
    .getByRole('button', { name: /@alice/ })
    .first()
    .click();
  await expect(page.getByLabel('Persönliche Notizen')).toHaveValue('Synthetische Notiz');
  await expect(page.getByLabel('Manuell prüfen', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Schliessen', exact: true }).click();
  await page.getByRole('button', { name: 'Übersicht', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page
    .getByLabel('Passphrase für verschlüsselte Backups (optional)')
    .fill('synthetic-only-passphrase');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup herunterladen' }).click();
  const download = await downloadPromise;
  const backup = await download.path();
  expect(backup).toBeTruthy();
  await page.getByRole('button', { name: 'Alle SocialLens-Daten löschen', exact: true }).click();
  await page.getByRole('button', { name: 'Endgültig löschen', exact: true }).click();
  await expect(page.getByText('0 Konten · 0 Datenstände · 0 Profilnotizen')).toBeVisible();
  await page
    .getByLabel('Passphrase für verschlüsselte Backups (optional)')
    .fill('synthetic-only-passphrase');
  await page.locator('input[type=file]').setInputFiles(backup!);
  await expect(
    page.getByRole('heading', { name: 'Geprüftes Backup wiederherstellen' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Daten ersetzen und wiederherstellen' }).click();
  await expect(page.getByText('1 Konten · 2 Datenstände · 1 Profilnotizen')).toBeVisible();
  await createAccount(page, 'second_owner');
  await page.getByRole('button', { name: 'Übersicht', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ein klarer Blick auf deine Verbindungen' })
  ).toBeVisible();
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('incomplete imports cannot report lost followers', async ({ page }) => {
  await page.goto('/');
  await createAccount(page, 'demo_owner');
  await importData(page, 'demo_owner', ['alice'], ['alice'], '2026-10-01T12:00');
  await importData(page, 'demo_owner', ['bob'], [], '2026-11-01T12:00', true);
  await page.getByRole('button', { name: 'Änderungen', exact: true }).click();
  await expect(
    page.getByText('Für einen Vergleich müssen beide Datenstände vollständig bestätigt sein.')
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verlorene Follower', exact: true })).toHaveCount(
    0
  );
});

test('PWA can import an unseen ZIP after going offline', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium service-worker lifecycle is exercised here.');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await createAccount(page, 'offline_owner');
  await importData(page, 'offline_owner', ['alice'], ['bob'], '2026-10-01T12:00');
  await page.getByRole('button', { name: 'Beziehungen', exact: true }).click();
  await expect(page.getByRole('button', { name: /@alice Profil ansehen/ })).toBeVisible();
});

test('retained legacy sample analysis and local assets remain available', async ({ page }) => {
  const failed: string[] = [];
  const remote: string[] = [];
  page.on('response', response => {
    if (response.status() >= 400) failed.push(response.url());
  });
  page.on('request', request => {
    if (request.url().startsWith('http') && !request.url().startsWith('http://127.0.0.1:5173'))
      remote.push(request.url());
  });
  await page.goto('/legacy');
  await page.getByRole('link', { name: 'Try with Sample', exact: true }).click();
  await expect(page).toHaveURL(/\/sample$/);
  await expect(page.getByText('Viewing Sample Data', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Analysis Results' })).toBeVisible();
  await expect(page.getByText('Sample Data (Demo) • 1,180 Total', { exact: true })).toBeVisible();
  expect(failed).toEqual([]);
  expect(remote).toEqual([]);
});
