import { useEffect, useState } from 'react';
import { Download, ShieldCheck, HardDrive, Upload } from 'lucide-react';
import { encodeBackup, decodeBackup } from '../backup';
import { verifyData, type AppData, type LocalAccount } from '../model';
import { repository } from '../repository';
import { ConfirmDialog, Modal } from './Primitives';
import { downloadFile } from './format';

export function Settings({
  data,
  account,
  reload,
  notify,
}: {
  data: AppData;
  account?: LocalAccount;
  reload: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restore, setRestore] = useState<AppData>();
  const [deleting, setDeleting] = useState<'account' | 'all'>();
  const [storage, setStorage] = useState<StorageEstimate>();
  const [legacy, setLegacy] = useState<Awaited<ReturnType<typeof repository.listLegacyImports>>>(
    []
  );
  const [legacyId, setLegacyId] = useState('');
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  useEffect(() => {
    void navigator.storage
      ?.estimate()
      .then(setStorage)
      .catch(() => undefined);
  }, [data]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    await run(async () => {
      if (file.size > 280 * 1024 * 1024) throw new Error('Das Backup ist zu gross.');
      setRestore(await decodeBackup(await file.text(), passphrase || undefined));
    });
  }
  const mib = (value = 0) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
  return (
    <div className="sl-stack">
      <section className="sl-panel">
        <div className="sl-section-heading">
          <h2>Datenschutz</h2>
          <ShieldCheck size={24} />
        </div>
        <p>
          SocialLens verarbeitet Exporte lokal in deinem Browser. Es verwendet keine
          Instagram-Zugangsdaten. CSV-Dateien und Backups werden auf deinem Gerät erzeugt.
        </p>
        <p>
          Die App und Schriftarten liegen auf demselben Ursprung. Instagram wird erst durch einen
          Klick auf einen Profillink geöffnet. Deine Daten sind an dieses Browserprofil und diese
          Adresse gebunden.
        </p>
        <p className="sl-hint">
          Oberfläche Deutsch. Die bisherige Analyse bietet ihre vorhandenen weiteren Sprachen.
        </p>
      </section>
      <section className="sl-panel sl-stack">
        <h2>Backup und Wiederherstellung</h2>
        <p>
          Ein Backup enthält alle lokalen Konten, Datenstände, Notizen, Listen und Filter. Bewahre
          es an einem sicheren Ort auf.
        </p>
        <label>
          Passphrase für verschlüsselte Backups (optional)
          <input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={event => setPassphrase(event.target.value)}
            placeholder="Mindestens 12 Zeichen"
          />
        </label>
        <p className="sl-hint">
          Ohne Passphrase ist das Backup lesbares JSON. Mit Passphrase wird es lokal verschlüsselt.
          Eine verlorene Passphrase kann nicht zurückgesetzt werden.
        </p>
        <div className="sl-actions">
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const text = await encodeBackup(await repository.load(), passphrase || undefined);
                downloadFile(text, 'sociallens-backup.json', 'application/json');
                notify('Backup erstellt.');
              })
            }
          >
            <Download size={17} />
            Backup herunterladen
          </button>
          <label className="sl-button">
            <Upload size={17} />
            Backup öffnen
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={event => {
                void readBackup(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {busy && <p role="status">Daten werden geprüft …</p>}
        {error && (
          <p role="alert" className="sl-error">
            {error}
          </p>
        )}
      </section>
      <section className="sl-panel sl-stack">
        <div className="sl-section-heading">
          <h2>Speicher und Integrität</h2>
          <HardDrive size={22} />
        </div>
        <p>
          {data.accounts.length} Konten · {data.snapshots.length} Datenstände ·{' '}
          {data.annotations.length} Profilnotizen
        </p>
        <p>
          {storage
            ? `${mib(storage.usage)} im Browser belegt · ${mib(storage.quota)} verfügbares Kontingent`
            : 'Speicherangaben sind in diesem Browser nicht verfügbar.'}
        </p>
        <div className="sl-actions">
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await verifyData(await repository.load());
                notify('Alle Datensätze und Prüfsummen sind gültig.');
              })
            }
          >
            Datenintegrität prüfen
          </button>
          <button
            onClick={() =>
              void run(async () => {
                const granted = await navigator.storage?.persist?.();
                notify(
                  granted
                    ? 'Dauerhafte Speicherung aktiviert.'
                    : 'Der Browser hat dauerhafte Speicherung nicht zugesichert. Sichere regelmässig ein Backup.'
                );
              })
            }
          >
            Dauerhafte Speicherung anfragen
          </button>
        </div>
      </section>
      <section className="sl-panel sl-stack">
        <h2>Vorhandene SafeUnfollow-Daten übernehmen</h2>
        <p>
          Wähle genau einen alten Import und bestätige dessen Zuordnung. Altdaten werden als
          eingeschränkt gespeichert. Die ursprüngliche Analyse bleibt erhalten.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const imports = await repository.listLegacyImports();
              setLegacy(imports);
              notify(
                imports.length
                  ? `${imports.length} alte Imports gefunden.`
                  : 'Keine alten Imports auf diesem Ursprung gefunden.'
              );
            })
          }
        >
          Alte Imports suchen
        </button>
        {legacy.length > 0 && (
          <>
            <label>
              Alter Import
              <select
                value={legacyId}
                onChange={event => {
                  setLegacyId(event.target.value);
                  setLegacyConfirmed(false);
                }}
              >
                <option value="">Auswählen</option>
                {legacy.map(file => (
                  <option key={file.fileHash} value={file.fileHash}>
                    {new Date(file.uploadDate).toLocaleString('de-CH')} · {file.accountCount}{' '}
                    Profile
                  </option>
                ))}
              </select>
            </label>
            <label className="sl-check">
              <input
                type="checkbox"
                checked={legacyConfirmed}
                onChange={event => setLegacyConfirmed(event.target.checked)}
              />
              Dieser alte Import gehört zu @{account?.username ?? '…'}.
            </label>
            <button
              disabled={!account || !legacyId || !legacyConfirmed || busy}
              onClick={() =>
                void run(async () => {
                  await repository.importLegacy(account!.id, legacyId);
                  await reload();
                  notify('Altdaten übernommen.');
                })
              }
            >
              Ausgewählten Import übernehmen
            </button>
          </>
        )}
      </section>
      <section className="sl-panel sl-stack">
        <h2>Daten löschen</h2>
        <p>
          Erstelle vorher ein Backup, wenn du die Daten später wiederherstellen möchtest. Bereits
          heruntergeladene Dateien bleiben auf deinem Gerät.
        </p>
        <div className="sl-actions">
          <button
            className="sl-danger"
            disabled={!account || busy}
            onClick={() => setDeleting('account')}
          >
            Ausgewähltes Konto löschen
          </button>
          <button className="sl-danger" disabled={busy} onClick={() => setDeleting('all')}>
            Alle SocialLens-Daten löschen
          </button>
        </div>
      </section>
      {deleting && (
        <ConfirmDialog
          title={
            deleting === 'all' ? 'Alle SocialLens-Daten löschen?' : `@${account?.username} löschen?`
          }
          description="Diese Daten werden endgültig aus SocialLens entfernt. Gespeicherte SafeUnfollow-Altdaten werden separat in der bisherigen Analyse verwaltet."
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            void run(async () => {
              if (deleting === 'all') await repository.clear();
              else if (account) await repository.deleteAccount(account.id);
              await reload();
              setDeleting(undefined);
              notify('Daten gelöscht.');
            })
          }
        />
      )}
      {restore && (
        <Modal
          title="Geprüftes Backup wiederherstellen"
          description={`Das Backup enthält ${restore.accounts.length} Konten, ${restore.snapshots.length} Datenstände und ${restore.annotations.length} Profilnotizen. Die aktuellen SocialLens-Daten werden ersetzt.`}
          onClose={() => setRestore(undefined)}
        >
          <div className="sl-actions">
            <button onClick={() => setRestore(undefined)}>Abbrechen</button>
            <button
              className="sl-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await repository.restore(restore);
                  await reload();
                  setRestore(undefined);
                  notify('Backup wiederhergestellt.');
                })
              }
            >
              Daten ersetzen und wiederherstellen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
