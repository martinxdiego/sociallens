import {
  Users,
  UserRoundCheck,
  UserRoundMinus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
} from 'lucide-react';
import { compareSnapshots, relationshipStats, type Snapshot } from '../model';
import { TrendChart } from './TrendChart';
import { dateTime, number } from './format';
import { EmptyState } from './Primitives';

export function Dashboard({
  snapshot,
  snapshots,
  onImport,
  onRelationships,
  onChanges,
}: {
  snapshot?: Snapshot;
  snapshots: Snapshot[];
  onImport: () => void;
  onRelationships: () => void;
  onChanges: () => void;
}) {
  if (!snapshot)
    return (
      <div className="sl-welcome">
        <div className="sl-welcome-art" aria-hidden="true">
          <div className="sl-orbit">
            <span />
            <span />
            <span />
            <span />
            <span />
            <div className="sl-lens-mark">s</div>
          </div>
        </div>
        <EmptyState
          title="Ein klarer Blick auf deine Verbindungen"
          action={
            <button className="sl-primary" onClick={onImport}>
              Ersten Datenstand importieren
            </button>
          }
        >
          Entdecke gegenseitige Follows, halte Veränderungen fest und organisiere deine Kontakte.
          Dein offizieller Instagram-Export ist der Anfang.
        </EmptyState>
        <div className="sl-welcome-benefits">
          <span>Lokale Verarbeitung</span>
          <span>Ohne Instagram-Anmeldung</span>
          <span>Deine persönliche Historie</span>
        </div>
      </div>
    );
  const stats = relationshipStats(snapshot);
  const previous = snapshots
    .filter(item => compareSnapshots(item, snapshot).comparable)
    .sort((a, b) => b.exportCreatedAt!.localeCompare(a.exportCreatedAt!))[0];
  const comparison = previous ? compareSnapshots(previous, snapshot) : undefined;
  const total = stats.mutuals.length + stats.nonFollowers.length + stats.fans.length;
  const cards = [
    {
      label: 'Follower',
      value: number(snapshot.followers.length),
      icon: Users,
      detail: 'Folgen deinem Konto',
    },
    {
      label: 'Gefolgt',
      value: number(snapshot.following.length),
      icon: UserRoundCheck,
      detail: 'Diesen Profilen folgst du',
    },
    {
      label: 'Folgen nicht zurück',
      value: number(stats.nonFollowers.length),
      icon: UserRoundMinus,
      detail: 'Aus diesem Datenstand',
    },
    {
      label: 'Verlorene Follower',
      value: comparison ? number(comparison.lostFollowers.length) : '—',
      icon: ArrowDownLeft,
      detail: comparison ? 'Seit dem letzten vergleichbaren Stand' : 'Noch kein Vergleich möglich',
    },
  ];
  return (
    <div className="sl-stack">
      {snapshot.status !== 'complete' && (
        <p className="sl-warning">
          Dieser Datenstand ist eingeschränkt. Die Zahlen beschreiben die enthaltenen Listen.
          Änderungen werden daraus nicht abgeleitet.
        </p>
      )}
      <div className="sl-kpis">
        {cards.map(card => (
          <section key={card.label}>
            <div>
              <span>{card.label}</span>
              <card.icon size={19} />
            </div>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </section>
        ))}
      </div>
      <div className="sl-overview-grid">
        <section className="sl-panel sl-trend-panel">
          <div className="sl-section-heading">
            <div>
              <h2>Deine Verbindungen im Verlauf</h2>
              <p>
                {snapshots.filter(item => item.status === 'complete').length} vollständige
                Datenstände
              </p>
            </div>
            <span className="sl-badge">Lokal gespeichert</span>
          </div>
          <TrendChart snapshots={snapshots} />
        </section>
        <section className="sl-panel sl-breakdown">
          <h2>Beziehungen</h2>
          <p>Aus demselben Datenstand</p>
          <div className="sl-breakdown-bar" aria-hidden="true">
            <span style={{ flex: stats.mutuals.length || 0.001 }} />
            <span style={{ flex: stats.nonFollowers.length || 0.001 }} />
            <span style={{ flex: stats.fans.length || 0.001 }} />
          </div>
          <ul>
            {[
              ['Gegenseitig', stats.mutuals.length],
              ['Folgen nicht zurück', stats.nonFollowers.length],
              ['Fans', stats.fans.length],
            ].map(([label, value], index) => (
              <li key={label}>
                <span>
                  <i className={`sl-color-${index}`} />
                  {label}
                </span>
                <strong>{number(Number(value))}</strong>
              </li>
            ))}
          </ul>
          <div className="sl-rate">
            <span>Follow-back-Quote</span>
            <strong>{stats.followBackRate.toFixed(1)} %</strong>
            <small>
              {number(stats.mutuals.length)} von {number(snapshot.following.length)} gefolgten
              Profilen
            </small>
          </div>
          <div className="sl-rate">
            <span>Mutuals-Quote</span>
            <strong>{stats.mutualsRate.toFixed(1)} %</strong>
            <small>
              {number(stats.mutuals.length)} von {number(snapshot.followers.length)} Followern
            </small>
          </div>
          <p className="sl-hint">{number(total)} unterschiedliche Benutzernamen</p>
          <button className="sl-link-button" onClick={onRelationships}>
            Beziehungen erkunden <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="sl-overview-grid">
        <section className="sl-panel">
          <div className="sl-section-heading">
            <h2>Seit dem letzten Vergleich</h2>
            <button className="sl-link-button" onClick={onChanges}>
              Alle Änderungen <ArrowRight size={16} />
            </button>
          </div>
          {comparison && previous ? (
            <>
              <p className="sl-hint">
                Beobachtet zwischen {dateTime(previous.exportCreatedAt ?? previous.importedAt)} und{' '}
                {dateTime(snapshot.exportCreatedAt ?? snapshot.importedAt)}
              </p>
              <div className="sl-change-summary">
                <span>
                  <ArrowUpRight size={21} />
                  <strong>+{number(comparison.newFollowers.length)}</strong> neue Follower
                </span>
                <span>
                  <ArrowDownLeft size={21} />
                  <strong>{number(comparison.lostFollowers.length)}</strong> verlorene Follower
                </span>
                <span>
                  <strong>
                    {comparison.newFollowers.length - comparison.lostFollowers.length > 0
                      ? '+'
                      : ''}
                    {number(comparison.newFollowers.length - comparison.lostFollowers.length)}
                  </strong>{' '}
                  Nettoveränderung
                </span>
              </div>
            </>
          ) : (
            <p className="sl-hint">
              Noch kein Vergleich möglich. Importiere einen weiteren vollständigen Datenstand
              desselben Kontos und Formats.
            </p>
          )}
        </section>
        <section className="sl-panel">
          <h2>Dein ausgewählter Datenstand</h2>
          <dl className="sl-metadata">
            <div>
              <dt>Importiert</dt>
              <dd>{dateTime(snapshot.importedAt)}</dd>
            </div>
            <div>
              <dt>Export erstellt</dt>
              <dd>
                {snapshot.exportCreatedAt
                  ? dateTime(snapshot.exportCreatedAt)
                  : 'Zeitpunkt unbekannt'}
              </dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{snapshot.sourceFormat.toUpperCase()}</dd>
            </div>
          </dl>
          <button onClick={onImport}>Weiteren Datenstand importieren</button>
        </section>
      </div>
    </div>
  );
}
