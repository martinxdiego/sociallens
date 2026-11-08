import { useState } from 'react';
import { Download, Trash2, Check } from 'lucide-react';
import { compareSnapshots, type Snapshot, type SnapshotComparison } from '../model';
import { repository } from '../repository';
import { TrendChart } from './TrendChart';
import { EmptyState, ConfirmDialog } from './Primitives';
import { dateTime, downloadCsv, number } from './format';

const changeLabels: [keyof Omit<SnapshotComparison, 'comparable' | 'reason'>, string][] = [
  ['newFollowers', 'Neue Follower'],
  ['lostFollowers', 'Verlorene Follower'],
  ['startedFollowing', 'Neu gefolgt'],
  ['stoppedFollowing', 'Nicht mehr gefolgt'],
];

export function Changes({ snapshots }: { snapshots: Snapshot[] }) {
  const [fromId, setFromId] = useState(snapshots[snapshots.length - 2]?.id ?? '');
  const [toId, setToId] = useState(snapshots[snapshots.length - 1]?.id ?? '');
  if (snapshots.length < 2)
    return (
      <EmptyState title="Noch kein Vergleich möglich">
        Speichere mindestens zwei vollständige Datenstände desselben Kontos. SocialLens zeigt dann
        die beobachteten Veränderungen.
      </EmptyState>
    );
  const from = snapshots.find(item => item.id === fromId);
  const to = snapshots.find(item => item.id === toId);
  const comparison = from && to ? compareSnapshots(from, to) : undefined;
  return (
    <div className="sl-stack">
      <section className="sl-panel">
        <div className="sl-compare-controls">
          <label>
            Ausgangs-Datenstand
            <select value={fromId} onChange={event => setFromId(event.target.value)}>
              <option value="">Auswählen</option>
              {snapshots.map(item => (
                <option key={item.id} value={item.id}>
                  {dateTime(item.importedAt)} ·{' '}
                  {item.status === 'complete' ? 'vollständig' : 'eingeschränkt'}
                </option>
              ))}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label>
            Ziel-Datenstand
            <select value={toId} onChange={event => setToId(event.target.value)}>
              <option value="">Auswählen</option>
              {snapshots.map(item => (
                <option key={item.id} value={item.id}>
                  {dateTime(item.importedAt)} ·{' '}
                  {item.status === 'complete' ? 'vollständig' : 'eingeschränkt'}
                </option>
              ))}
            </select>
          </label>
        </div>
        {comparison?.comparable && from && to ? (
          <p className="sl-hint">
            Beobachtungsintervall vom {dateTime(from.exportCreatedAt ?? from.importedAt)} bis{' '}
            {dateTime(to.exportCreatedAt ?? to.importedAt)}. Der genaue Zeitpunkt einzelner
            Änderungen ist unbekannt.
          </p>
        ) : (
          <p className="sl-warning">{comparison?.reason ?? 'Wähle zwei Datenstände aus.'}</p>
        )}
      </section>
      {comparison?.comparable && (
        <>
          <div className="sl-section-heading">
            <h2>Beobachtete Änderungen</h2>
            <button
              onClick={() =>
                downloadCsv(
                  [
                    ['Änderung', 'Profil', 'Nach', 'Bis'],
                    ...changeLabels.flatMap(([key, label]) =>
                      comparison[key].map(profile => [
                        label,
                        profile,
                        from!.exportCreatedAt ?? from!.importedAt,
                        to!.exportCreatedAt ?? to!.importedAt,
                      ])
                    ),
                  ],
                  'sociallens-vergleich.csv'
                )
              }
            >
              <Download size={16} />
              CSV exportieren
            </button>
          </div>
          <div className="sl-comparison-grid">
            {changeLabels.map(([key, label]) => (
              <ChangeProfiles
                key={`${key}:${fromId}:${toId}`}
                label={label}
                profiles={comparison[key]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChangeProfiles({ label, profiles }: { label: string; profiles: string[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(profiles.length / 100));
  return (
    <section className="sl-panel">
      <div className="sl-section-heading">
        <h2>{label}</h2>
        <strong>{number(profiles.length)}</strong>
      </div>
      <div className="sl-change-profiles">
        {profiles.length ? (
          profiles.slice(page * 100, (page + 1) * 100).map(profile => (
            <a
              key={profile}
              href={`https://www.instagram.com/${encodeURIComponent(profile)}/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{profile}
            </a>
          ))
        ) : (
          <p className="sl-hint">Keine beobachteten Änderungen.</p>
        )}
      </div>
      {pages > 1 && (
        <nav aria-label={`${label} Seiten`} className="sl-actions">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Zurück
          </button>
          <span role="status">
            Seite {page + 1} von {pages}
          </span>
          <button disabled={page + 1 === pages} onClick={() => setPage(page + 1)}>
            Weiter
          </button>
        </nav>
      )}
    </section>
  );
}

export function History({
  snapshots,
  selectedId,
  select,
  reload,
  notify,
}: {
  snapshots: Snapshot[];
  selectedId?: string;
  select: (id: string) => void;
  reload: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState<Snapshot>();
  const [period, setPeriod] = useState('all');
  // Calendar periods describe the exported data, never the day an old ZIP was opened.
  const dated = snapshots
    .filter((item): item is Snapshot & { exportCreatedAt: string } => Boolean(item.exportCreatedAt))
    .sort((a, b) => a.exportCreatedAt.localeCompare(b.exportCreatedAt));
  const periods = [
    ...new Set(
      dated.flatMap(item => [item.exportCreatedAt.slice(0, 4), item.exportCreatedAt.slice(0, 7)])
    ),
  ]
    .sort()
    .reverse();
  const selected =
    period === 'all' ? dated : dated.filter(item => item.exportCreatedAt.startsWith(period));
  const complete = selected.filter(item => item.status === 'complete');
  const first = complete[0];
  const last = complete[complete.length - 1];
  const summary = first && last ? compareSnapshots(first, last) : undefined;
  async function remove() {
    if (!deleting) return;
    try {
      await repository.deleteSnapshot(deleting.id);
      await reload();
      setDeleting(undefined);
      notify('Datenstand gelöscht. Persönliche Notizen bleiben erhalten.');
    } catch (error) {
      notify(String(error));
    }
  }
  if (!snapshots.length)
    return (
      <EmptyState title="Hier wächst deine Historie">
        Jeder neue Import ergänzt deinen Verlauf. Frühere Datenstände bleiben erhalten und können
        jederzeit ausgewählt werden.
      </EmptyState>
    );
  return (
    <div className="sl-stack">
      <section className="sl-panel">
        <div className="sl-section-heading">
          <h2>Dein Verlauf</h2>
          <span className="sl-badge">{snapshots.length} Datenstände</span>
        </div>
        <TrendChart snapshots={snapshots} />
      </section>
      <section className="sl-panel">
        <div className="sl-section-heading">
          <div>
            <h2>Dein Rückblick</h2>
            <p>Nach bekanntem Exportdatum (UTC) · ohne undatierte Datenstände</p>
          </div>
          <select
            aria-label="Zeitraum des Rückblicks"
            value={period}
            onChange={event => setPeriod(event.target.value)}
          >
            <option value="all">Gesamte gespeicherte Zeit</option>
            {periods.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {summary?.comparable && first && last ? (
          <>
            <div className="sl-change-summary">
              <span>
                <strong>{number(complete.length)}</strong> vollständige Datenstände
              </span>
              <span>
                <strong>{number(last.followers.length - first.followers.length)}</strong> Follower
                netto
              </span>
              <span>
                <strong>{number(last.following.length - first.following.length)}</strong> gefolgte
                Profile netto
              </span>
            </div>
            <p className="sl-hint">
              Abdeckung vom {dateTime(first.exportCreatedAt)} bis {dateTime(last.exportCreatedAt)}.
              Nicht beobachtete Zeiträume und zwischenzeitliche Änderungen sind nicht enthalten.
            </p>
            <button
              onClick={() =>
                downloadCsv(
                  [
                    [
                      'Zeitraum',
                      'Erster Export',
                      'Letzter Export',
                      'Follower netto',
                      'Following netto',
                    ],
                    [
                      period,
                      first.exportCreatedAt,
                      last.exportCreatedAt,
                      String(last.followers.length - first.followers.length),
                      String(last.following.length - first.following.length),
                    ],
                  ],
                  'sociallens-rueckblick.csv'
                )
              }
            >
              Rückblick als CSV
            </button>
          </>
        ) : (
          <p className="sl-hint">
            Für diesen Zeitraum fehlen zwei vergleichbare vollständige Datenstände.
          </p>
        )}
      </section>
      <section className="sl-panel">
        <h2>Gespeicherte Datenstände</h2>
        <p className="sl-hint">
          Wähle einen früheren Stand, um dessen Beziehungen wieder anzusehen.
        </p>
        <ul className="sl-snapshots">
          {[...snapshots].reverse().map(snapshot => (
            <li key={snapshot.id}>
              <div className="sl-calendar-tile">
                <strong>{new Date(snapshot.importedAt).getDate()}</strong>
                <small>
                  {new Date(snapshot.importedAt).toLocaleDateString('de-CH', { month: 'short' })}
                </small>
              </div>
              <div className="sl-snapshot-info">
                <strong>{dateTime(snapshot.importedAt)}</strong>
                <span>
                  {number(snapshot.followers.length)} Follower · {number(snapshot.following.length)}{' '}
                  gefolgt
                </span>
                <small>
                  {snapshot.sourceFormat.toUpperCase()} ·{' '}
                  {snapshot.status === 'complete' ? 'Vollständig bestätigt' : 'Eingeschränkt'}
                </small>
                <details>
                  <summary>Diagnose und Prüfsumme</summary>
                  <p className="sl-hash">{snapshot.sourceHash}</p>
                  <p>
                    Export erstellt{' '}
                    {snapshot.exportCreatedAt ? dateTime(snapshot.exportCreatedAt) : 'unbekannt'}
                  </p>
                  <ul>
                    {snapshot.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </details>
              </div>
              <div className="sl-snapshot-actions">
                <button
                  aria-pressed={selectedId === snapshot.id}
                  onClick={() => select(snapshot.id)}
                >
                  {selectedId === snapshot.id ? (
                    <>
                      <Check size={16} />
                      Ausgewählt
                    </>
                  ) : (
                    'Ansehen'
                  )}
                </button>
                <button
                  className="sl-icon-button"
                  aria-label={`Datenstand ${dateTime(snapshot.importedAt)} löschen`}
                  onClick={() => setDeleting(snapshot)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="sl-panel">
        <h2>Änderungskalender</h2>
        <p className="sl-hint">
          Jeder Eintrag beschreibt ein Beobachtungsintervall. Es gibt keine exakten
          Entfolgezeitpunkte.
        </p>
        <ul className="sl-timeline">
          {snapshots.slice(1).map((current, index) => {
            const previous = snapshots[index]!;
            const difference = compareSnapshots(previous, current);
            return (
              <li key={current.id}>
                <time>
                  {dateTime(previous.exportCreatedAt ?? previous.importedAt)} —{' '}
                  {dateTime(current.exportCreatedAt ?? current.importedAt)}
                </time>
                {difference.comparable ? (
                  <span>
                    {difference.newFollowers.length} neue und {difference.lostFollowers.length}{' '}
                    verlorene Follower
                  </span>
                ) : (
                  <span>{difference.reason}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {deleting && (
        <ConfirmDialog
          title="Datenstand löschen?"
          description={`Der Import vom ${dateTime(deleting.importedAt)} wird endgültig entfernt. Erstelle bei Bedarf vorher ein Backup.`}
          onClose={() => setDeleting(undefined)}
          onConfirm={() => void remove()}
        />
      )}
    </div>
  );
}
