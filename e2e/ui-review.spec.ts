import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

async function importProfiles(
  page: Page,
  followers: string[],
  following: string[],
  exportDate?: string
) {
  const zip = new JSZip();
  const rows = (names: string[]) => names.map(value => ({ string_list_data: [{ value }] }));
  zip.file('followers_1.json', JSON.stringify(rows(followers)));
  zip.file('following.json', JSON.stringify({ relationships_following: rows(following) }));
  await page.getByRole('button', { name: 'Importieren', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic-ui-review.zip',
    mimeType: 'application/zip',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await expect(page.getByRole('heading', { name: 'Import prüfen' })).toBeVisible();
  await page.getByLabel('Dieser Export gehört zu @ui_review.').check();
  await page
    .getByLabel('Ich habe Follower und Following für den gesamten Zeitraum exportiert.')
    .check();
  if (exportDate)
    await page
      .getByLabel('Erstellungszeit des Exports, falls verlässlich bekannt')
      .fill(exportDate);
  await page.getByRole('button', { name: 'Datenstand speichern', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import prüfen' })).toHaveCount(0);
}

async function createAccountWithKeyboard(page: Page) {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Konto hinzufügen' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Lokales Konto hinzufügen' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Instagram-Benutzername', { exact: true }).fill('ui_review');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Importieren', exact: true })).toBeVisible();
}

test('keyboard controls, scoped CSV export, filters and annotations remain usable', async ({
  page,
}) => {
  await createAccountWithKeyboard(page);
  await importProfiles(page, ['alice', 'bob'], ['alice', 'charlie']);
  await page.getByRole('button', { name: 'Beziehungen', exact: true }).click();
  const alice = page.getByRole('button', { name: /@alice Profil ansehen/ });
  await alice.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '@alice' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Persönliche Notizen').fill('=SUM(1,2)');
  await page.getByLabel('Tags, durch Komma getrennt').fill('Fotos, Freunde');
  await page.getByLabel('Eigene Listen, durch Komma getrennt').fill('Fotografie');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await page.getByLabel('Profile durchsuchen').fill('alice');
  await page.getByRole('button', { name: 'Filter speichern', exact: true }).click();
  await page.getByLabel('Filtername').fill('Alice suchen');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, 'utf8');
  expect(csv).toContain('alice');
  expect(csv).not.toContain('charlie');
  expect(csv).not.toContain('bob');
  expect(csv).toContain('"\'=SUM(1,2)"');
  await page.reload();
  await page.getByRole('button', { name: 'Beziehungen', exact: true }).click();
  await page.getByRole('button', { name: 'Alice suchen', exact: true }).click();
  await expect(page.getByLabel('Profile durchsuchen')).toHaveValue('alice');
  await page.getByRole('button', { name: 'Sammlungen', exact: true }).click();
  await page.getByRole('button', { name: 'Fotografie', exact: true }).click();
  await expect(page.getByRole('button', { name: /@alice/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /@bob/ })).toHaveCount(0);
  const collectionProfile = page.getByRole('button', { name: /@alice/ }).first();
  await collectionProfile.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '@alice' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(collectionProfile).toBeFocused();
});

test('20,000 profiles stay searchable with a bounded rendered list', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'Large real ZIP benchmark uses Chromium once.');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await createAccountWithKeyboard(page);
  const profiles = Array.from(
    { length: 20000 },
    (_, index) => `profile_${String(index).padStart(5, '0')}`
  );
  const startedAt = Date.now();
  await importProfiles(page, profiles, profiles.slice(0, 15000));
  const importMilliseconds = Date.now() - startedAt;
  await testInfo.attach('large-import-benchmark', {
    body: JSON.stringify({ profiles: profiles.length, importMilliseconds }),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: 'Beziehungen', exact: true }).click();
  await expect(page.locator('.sl-result-count')).toHaveText(/20.000 Profile/);
  expect(await page.locator('.sl-profile-row').count()).toBeLessThan(100);
  await page.getByLabel('Profile durchsuchen').fill('profile_19999');
  await expect(page.getByRole('button', { name: /@profile_19999 Profil ansehen/ })).toBeVisible();
  await expect(page.getByText('1 Profile', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('dated recaps use export periods and change lists expose every page', async ({ page }) => {
  await createAccountWithKeyboard(page);
  const older = Array.from({ length: 250 }, (_, index) => `old_${String(index).padStart(3, '0')}`);
  const newer = Array.from({ length: 250 }, (_, index) => `new_${String(index).padStart(3, '0')}`);
  await importProfiles(page, older, ['alice'], '2025-10-01T12:00');
  await importProfiles(page, newer, ['alice', 'bob'], '2025-11-01T12:00');
  await page.getByRole('button', { name: 'Änderungen', exact: true }).click();
  const pages = page.getByRole('navigation', { name: 'Neue Follower Seiten' });
  await expect(pages).toBeVisible();
  await expect(page.getByRole('link', { name: '@new_000', exact: true })).toBeVisible();
  await pages.getByRole('button', { name: 'Weiter', exact: true }).click();
  await pages.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(pages.getByRole('status')).toHaveText('Seite 3 von 3');
  await expect(page.getByRole('link', { name: '@new_249', exact: true })).toBeVisible();
  await expect(pages.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Verlauf', exact: true }).click();
  await page.getByLabel('Zeitraum des Rückblicks').selectOption('2025');
  await expect(page.getByText(/Abdeckung vom/)).toContainText('2025');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Rückblick als CSV', exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('2025-10-01');
  expect(csv).toContain('2025-11-01');
  await page.getByLabel('Zeitraum des Rückblicks').selectOption('2025-10');
  await expect(
    page.getByText('Für diesen Zeitraum fehlen zwei vergleichbare vollständige Datenstände.')
  ).toBeVisible();
});
