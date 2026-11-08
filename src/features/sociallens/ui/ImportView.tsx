import { useEffect, useRef, useState } from 'react';
import { Upload, FileArchive, ShieldCheck } from 'lucide-react';
import { importInstagramZip, type ImportPreview } from '../importer';
import { repository } from '../repository';
import type { LocalAccount } from '../model';
import { number } from './format';

export function ImportView({
  account,
  onSaved,
  notify,
}: {
  account?: LocalAccount;
  onSaved: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [preview, setPreview] = useState<ImportPreview>();
  const [phase, setPhase] = useState<'idle' | 'reading' | 'saving'>('idle');
  const busy = phase !== 'idle';
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const [complete, setComplete] = useState(false);
  const [createdAt, setCreatedAt] = useState('');
  const abort = useRef<AbortController>();

  useEffect(() => () => abort.current?.abort(), []);

  async function read(file?: File) {
    if (!file || busy) return;
    setPhase('reading');
    setError('');
    setPreview(undefined);
    setAccountConfirmed(false);
    setComplete(false);
    setCreatedAt('');
    abort.current = new AbortController();
    try {
      setPreview(
        await importInstagramZip(file, { signal: abort.current.signal, onProgress: setProgress })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Datei konnte nicht gelesen werden.');
    } finally {
      setPhase('idle');
    }
  }
  async function save() {
    if (!preview || !account) return;
    setPhase('saving');
    setError('');
    try {
      const result = await repository.saveSnapshot({
        localAccountId: account.id,
        sourceFormat: preview.sourceFormat,
        status: preview.status,
        followers: preview.followers,
        following: preview.following,
        warnings: preview.warnings,
        accountConfirmed,
        completenessConfirmed: complete,
        ...(createdAt ? { exportCreatedAt: new Date(createdAt).toISOString() } : {}),
      });
      await onSaved();
      notify(
        result.duplicate
          ? 'Dieser Datenstand ist bereits gespeichert.'
          : 'Datenstand lokal gespeichert.'
      );
      setPreview(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Speichern fehlgeschlagen.');
    } finally {
      setPhase('idle');
    }
  }
  return (
    <div className="sl-stack">
      <section className="sl-panel sl-import-intro">
        <div>
          <h2>Deine Daten. Auf deinem Gerät.</h2>
          <p>
            Öffne einen offiziellen Instagram-Export, prüfe die Zusammenfassung und speichere einen
            neuen Datenstand.
          </p>
        </div>
        <ShieldCheck size={36} />
      </section>
      {!account && (
        <p className="sl-warning">Lege zuerst über „Konto hinzufügen“ ein lokales Konto an.</p>
      )}
      <section
        className="sl-dropzone"
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault();
          void read(event.dataTransfer.files[0]);
        }}
      >
        <span className="sl-drop-icon">
          <FileArchive size={32} />
        </span>
        <h2>Instagram-ZIP hier ablegen</h2>
        <p>JSON oder HTML · maximal 256 MiB · Verarbeitung im Browser</p>
        <label className={`sl-button sl-primary ${busy ? 'sl-disabled' : ''}`}>
          <Upload size={17} /> ZIP auswählen
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={event => {
              void read(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        {busy && (
          <div role="status">
            <p>
              {phase === 'saving'
                ? 'Datenstand wird gespeichert …'
                : progress || 'Daten werden verarbeitet …'}
            </p>
            {phase === 'reading' && (
              <button onClick={() => abort.current?.abort()}>Verarbeitung abbrechen</button>
            )}
          </div>
        )}
      </section>
      {error && (
        <p className="sl-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <section className="sl-panel sl-stack">
          <div className="sl-section-heading">
            <div>
              <h2>Import prüfen</h2>
              <p>{preview.sourceFileName}</p>
            </div>
            <span className={`sl-badge ${preview.status === 'complete' ? 'sl-good' : ''}`}>
              {preview.status === 'complete' ? 'Dateien vollständig' : 'Lücken erkannt'}
            </span>
          </div>
          <div className="sl-import-counts">
            <span>
              <strong>{number(preview.followers.length)}</strong> Follower
            </span>
            <span>
              <strong>{number(preview.following.length)}</strong> Gefolgt
            </span>
            <span>
              <strong>{preview.files.length}</strong> Dateien
            </span>
          </div>
          {preview.warnings.length > 0 && (
            <ul className="sl-diagnostics">
              {preview.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <details>
            <summary>Erkannte Dateien</summary>
            <ul>
              {preview.files.map(file => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </details>
          <label className="sl-check">
            <input
              type="checkbox"
              checked={accountConfirmed}
              onChange={event => setAccountConfirmed(event.target.checked)}
            />
            Dieser Export gehört zu @{account?.username ?? '…'}.
          </label>
          <label className="sl-check">
            <input
              type="checkbox"
              checked={complete}
              onChange={event => setComplete(event.target.checked)}
              disabled={preview.status !== 'complete'}
            />
            Ich habe Follower und Following für den gesamten Zeitraum exportiert.
          </label>
          <label>
            Erstellungszeit des Exports, falls verlässlich bekannt
            <input
              type="datetime-local"
              value={createdAt}
              onChange={event => setCreatedAt(event.target.value)}
            />
          </label>
          <p className="sl-hint">
            Ohne bestätigte Vollständigkeit bleibt der Import eingeschränkt. Veränderungen werden
            nur zwischen vollständigen, vergleichbaren Datenständen berechnet.
          </p>
          <div className="sl-actions">
            <button disabled={busy} onClick={() => setPreview(undefined)}>
              Verwerfen
            </button>
            <button
              className="sl-primary"
              disabled={busy || !account || !accountConfirmed}
              onClick={() => void save()}
            >
              Datenstand speichern
            </button>
          </div>
        </section>
      )}
      <section className="sl-panel">
        <h2>So erhältst du deinen Export</h2>
        <ol className="sl-instructions">
          <li>
            Öffne in Instagram die Kontenübersicht und „Deine Informationen und Berechtigungen“.
          </li>
          <li>
            Wähle „Deine Informationen exportieren“, dein Instagram-Konto und „Auf Gerät
            exportieren“.
          </li>
          <li>Wähle Follower und gefolgte Konten, den gesamten Zeitraum und möglichst JSON.</li>
          <li>Lade das ZIP herunter und öffne es hier. Das Archiv bleibt auf deinem Gerät.</li>
        </ol>
        <p className="sl-hint">
          Die Bezeichnungen im Meta Accounts Center können sich ändern. Verwende pro Import den
          Export eines einzelnen Kontos.
        </p>
      </section>
    </div>
  );
}
