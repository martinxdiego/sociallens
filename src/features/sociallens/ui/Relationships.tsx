import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink, Search, Star, ShieldCheck, Download, BookmarkPlus } from 'lucide-react';
import {
  emptyAnnotation,
  relationshipStats,
  type ProfileAnnotation,
  type Snapshot,
  type SavedFilter,
  type RelationshipFilter,
} from '../model';
import { repository } from '../repository';
import { Modal, EmptyState } from './Primitives';
import { downloadCsv, number, dateTime } from './format';

const relationNames = {
  all: 'Alle Profile',
  mutuals: 'Gegenseitig',
  nonFollowers: 'Folgen nicht zurück',
  fans: 'Fans',
};
const splitLabels = (text: string) => [
  ...new Set(
    text
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  ),
];

type Props = {
  snapshot?: Snapshot;
  snapshots: Snapshot[];
  annotations: ProfileAnnotation[];
  savedFilters: SavedFilter[];
  accountId: string;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  collections?: boolean;
};

function ProfileDialog({
  profile,
  accountId,
  snapshots,
  annotation,
  reload,
  notify,
  onClose,
}: {
  profile: string;
  accountId: string;
  snapshots: Snapshot[];
  annotation?: ProfileAnnotation;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(annotation ?? emptyAnnotation(accountId, profile));
  const [tags, setTags] = useState(draft.tags.join(', '));
  const [lists, setLists] = useState(draft.lists.join(', '));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await repository.saveAnnotation({
        ...draft,
        tags: splitLabels(tags),
        lists: splitLabels(lists),
        cleanup: draft.cleanup && !draft.protectedFromCleanup,
      });
      await reload();
      notify('Profilnotizen gespeichert.');
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`@${profile}`}
      description="Deine Notizen gelten für dieses lokale Konto und bleiben nach weiteren Imports erhalten."
      onClose={onClose}
    >
      <a
        className="sl-profile-link"
        href={`https://www.instagram.com/${encodeURIComponent(profile)}/`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Instagram-Profil öffnen <ExternalLink size={15} />
      </a>
      <div className="sl-check-grid">
        <label className="sl-check">
          <input
            type="checkbox"
            checked={draft.favorite}
            onChange={event => setDraft({ ...draft, favorite: event.target.checked })}
          />
          Favorit
        </label>
        <label className="sl-check">
          <input
            type="checkbox"
            checked={draft.protectedFromCleanup}
            onChange={event =>
              setDraft({
                ...draft,
                protectedFromCleanup: event.target.checked,
                cleanup: event.target.checked ? false : draft.cleanup,
              })
            }
          />
          Whitelist
        </label>
        <label className="sl-check">
          <input
            type="checkbox"
            checked={draft.cleanup}
            disabled={draft.protectedFromCleanup}
            onChange={event => setDraft({ ...draft, cleanup: event.target.checked })}
          />
          Manuell prüfen
        </label>
      </div>
      <label>
        Tags, durch Komma getrennt
        <input
          value={tags}
          maxLength={1000}
          onChange={event => setTags(event.target.value)}
          placeholder="Freunde, Fotografie"
        />
      </label>
      <label>
        Eigene Listen, durch Komma getrennt
        <input
          value={lists}
          maxLength={1000}
          onChange={event => setLists(event.target.value)}
          placeholder="Lieblingsprofile, Beruflich"
        />
      </label>
      <label>
        Persönliche Notizen
        <textarea
          value={draft.notes}
          maxLength={10000}
          onChange={event => setDraft({ ...draft, notes: event.target.value })}
          rows={3}
        />
      </label>
      <details>
        <summary>Beobachteter Beziehungsverlauf</summary>
        <ul className="sl-timeline">
          {snapshots.map(snapshot => {
            const follower = snapshot.followers.includes(profile);
            const following = snapshot.following.includes(profile);
            const status =
              follower && following
                ? 'Gegenseitig'
                : follower
                  ? 'Folgt dir'
                  : following
                    ? 'Du folgst'
                    : 'In beiden Listen nicht enthalten';
            return (
              <li key={snapshot.id}>
                <time>{dateTime(snapshot.importedAt)}</time>
                <strong>{status}</strong>
                <small>
                  {snapshot.status === 'complete'
                    ? 'Vollständiger Datenstand'
                    : 'Eingeschränkter Datenstand'}
                </small>
              </li>
            );
          })}
        </ul>
        <p className="sl-hint">
          Benutzernamen können sich ändern. Der Verlauf belegt keine eindeutige Personenidentität.
        </p>
      </details>
      <button className="sl-primary" disabled={busy} onClick={() => void save()}>
        Änderungen speichern
      </button>
    </Modal>
  );
}

export function Relationships({
  snapshot,
  snapshots,
  annotations,
  savedFilters,
  accountId,
  reload,
  notify,
  collections = false,
}: Props) {
  const [relationship, setRelationship] = useState<RelationshipFilter>('all');
  const [query, setQuery] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('asc');
  const [collection, setCollection] = useState('all');
  const [selected, setSelected] = useState<string>();
  const [filterName, setFilterName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const parent = useRef<HTMLDivElement>(null);
  const annotationMap = useMemo(
    () => new Map(annotations.map(item => [item.profileKey, item])),
    [annotations]
  );
  const stats = useMemo(() => (snapshot ? relationshipStats(snapshot) : undefined), [snapshot]);
  const tags = useMemo(
    () => [...new Set(annotations.flatMap(item => item.tags))].sort(),
    [annotations]
  );
  const lists = useMemo(
    () => [...new Set(annotations.flatMap(item => item.lists))].sort(),
    [annotations]
  );
  const profiles = useMemo(() => {
    const source =
      relationship === 'all'
        ? [
            ...new Set([
              ...(snapshot?.followers ?? []),
              ...(snapshot?.following ?? []),
              ...(collections ? annotations.map(item => item.profileKey) : []),
            ]),
          ]
        : (stats?.[relationship] ?? []);
    return source
      .filter(profile => {
        const item = annotationMap.get(profile) ?? emptyAnnotation(accountId, profile);
        if (
          query &&
          ![profile, item.notes, ...item.tags].some(value =>
            value.toLowerCase().includes(query.toLowerCase())
          )
        )
          return false;
        if (favoriteOnly && !item.favorite) return false;
        if (tag && !item.tags.includes(tag)) return false;
        if (!collections || collection === 'all') return true;
        if (collection === 'favorites') return item.favorite;
        if (collection === 'whitelist') return item.protectedFromCleanup;
        if (collection === 'cleanup') return item.cleanup && !item.protectedFromCleanup;
        if (collection === 'notes') return Boolean(item.notes);
        return item.lists.includes(collection.slice(5));
      })
      .sort((left, right) =>
        sort === 'asc' ? left.localeCompare(right) : right.localeCompare(left)
      );
  }, [
    snapshot,
    stats,
    relationship,
    collections,
    annotations,
    annotationMap,
    query,
    favoriteOnly,
    tag,
    collection,
    sort,
    accountId,
  ]);
  const virtual = useVirtualizer({
    count: profiles.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 70,
    overscan: 8,
  });
  async function toggleFavorite(profile: string) {
    const annotation = annotationMap.get(profile) ?? emptyAnnotation(accountId, profile);
    try {
      await repository.saveAnnotation({ ...annotation, favorite: !annotation.favorite });
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    }
  }
  async function saveFilter() {
    try {
      await repository.saveFilter({
        id: crypto.randomUUID(),
        localAccountId: accountId,
        name: filterName.trim(),
        query,
        relationship,
        favoriteOnly,
        tag,
      });
      await reload();
      setSaveOpen(false);
      setFilterName('');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Filter konnte nicht gespeichert werden.');
    }
  }
  if (!snapshot && !annotations.length)
    return (
      <EmptyState title="Deine Beziehungen beginnen mit einem Import">
        Importiere deinen Instagram-Export. Danach kannst du Profile durchsuchen und persönliche
        Listen erstellen.
      </EmptyState>
    );
  return (
    <div className="sl-stack">
      {collections && (
        <section className="sl-collection-tabs" aria-label="Sammlungen">
          {[
            ['all', 'Alle Profile'],
            ['favorites', 'Favoriten'],
            ['whitelist', 'Whitelist'],
            ['cleanup', 'Manuell prüfen'],
            ['notes', 'Mit Notizen'],
            ...lists.map(list => [`list:${list}`, list]),
          ].map(([key, label]) => (
            <button key={key} aria-pressed={collection === key} onClick={() => setCollection(key!)}>
              {label}
            </button>
          ))}
          {collection === 'cleanup' && (
            <p className="sl-hint">
              Öffne die Profile einzeln und entscheide selbst. Whitelist-Profile sind geschützt.
            </p>
          )}
        </section>
      )}
      <section className="sl-panel sl-relationship-panel">
        <div className="sl-tabs" aria-label="Beziehung filtern">
          {Object.entries(relationNames).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={relationship === key}
              onClick={() => setRelationship(key as RelationshipFilter)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="sl-toolbar">
          <label className="sl-search">
            <Search size={18} />
            <input
              aria-label="Profile durchsuchen"
              placeholder="Profile, Tags oder Notizen suchen"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Sortierung"
            value={sort}
            onChange={event => setSort(event.target.value)}
          >
            <option value="asc">A bis Z</option>
            <option value="desc">Z bis A</option>
          </select>
          <button
            onClick={() =>
              downloadCsv(
                [
                  ['Profil', 'Favorit', 'Whitelist', 'Tags', 'Listen', 'Notizen'],
                  ...profiles.map(profile => {
                    const item = annotationMap.get(profile);
                    return [
                      profile,
                      item?.favorite ? 'ja' : 'nein',
                      item?.protectedFromCleanup ? 'ja' : 'nein',
                      item?.tags.join(', ') ?? '',
                      item?.lists.join(', ') ?? '',
                      item?.notes ?? '',
                    ];
                  }),
                ],
                'sociallens-profile.csv'
              )
            }
          >
            <Download size={16} />
            CSV
          </button>
        </div>
        <div className="sl-filterbar">
          <label className="sl-check">
            <input
              type="checkbox"
              checked={favoriteOnly}
              onChange={event => setFavoriteOnly(event.target.checked)}
            />
            Nur Favoriten
          </label>
          <select
            aria-label="Nach Tag filtern"
            value={tag}
            onChange={event => setTag(event.target.value)}
          >
            <option value="">Alle Tags</option>
            {tags.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button onClick={() => setSaveOpen(true)}>
            <BookmarkPlus size={16} />
            Filter speichern
          </button>
          <span className="sl-result-count" aria-live="polite">
            {number(profiles.length)} Profile
          </span>
        </div>
        {savedFilters.length > 0 && (
          <div className="sl-saved-filters">
            {savedFilters.map(filter => (
              <div key={filter.id}>
                <button
                  onClick={() => {
                    setRelationship(filter.relationship);
                    setQuery(filter.query);
                    setFavoriteOnly(filter.favoriteOnly);
                    setTag(filter.tag);
                  }}
                >
                  {filter.name}
                </button>
                <button
                  aria-label={`Filter ${filter.name} löschen`}
                  onClick={() => {
                    void repository
                      .deleteFilter(filter.id)
                      .then(reload)
                      .catch(error => notify(String(error)));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="sl-list-heading">
          <span>Profil</span>
          <span>Organisation</span>
        </div>
        <div ref={parent} className="sl-profile-list" aria-label="Profilübersicht" tabIndex={0}>
          {!profiles.length && (
            <p className="sl-list-empty">Keine Profile entsprechen diesen Filtern.</p>
          )}
          <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
            {virtual.getVirtualItems().map(row => {
              const profile = profiles[row.index]!;
              const annotation = annotationMap.get(profile);
              return (
                <div
                  className="sl-profile-row"
                  key={profile}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <button className="sl-profile-main" onClick={() => setSelected(profile)}>
                    <span className="sl-avatar">{profile.slice(0, 2)}</span>
                    <span>
                      <strong>@{profile}</strong>
                      <small>
                        {annotation?.tags.join(' · ') || 'Profil ansehen und Notizen hinzufügen'}
                      </small>
                    </span>
                  </button>
                  <div className="sl-row-actions">
                    {annotation?.protectedFromCleanup && (
                      <span title="Whitelist">
                        <ShieldCheck size={18} />
                      </span>
                    )}
                    <button
                      aria-label={`${annotation?.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'} @${profile}`}
                      aria-pressed={Boolean(annotation?.favorite)}
                      className="sl-icon-button"
                      onClick={() => void toggleFavorite(profile)}
                    >
                      <Star size={19} fill={annotation?.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <a
                      aria-label={`Instagram-Profil @${profile} öffnen`}
                      href={`https://www.instagram.com/${encodeURIComponent(profile)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sl-icon-button"
                    >
                      <ExternalLink size={17} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <p className="sl-hint">
        Die Angaben stammen aus dem ausgewählten Datenstand. Umbenennungen können wie ein
        Profilwechsel erscheinen.
      </p>
      {selected && (
        <ProfileDialog
          profile={selected}
          accountId={accountId}
          snapshots={snapshots}
          annotation={annotationMap.get(selected)}
          reload={reload}
          notify={notify}
          onClose={() => setSelected(undefined)}
        />
      )}
      {saveOpen && (
        <Modal
          title="Filter speichern"
          description="Deine Suchanfrage und Beziehungsfilter für dieses Konto wiederverwenden."
          onClose={() => setSaveOpen(false)}
        >
          <label>
            Filtername
            <input
              value={filterName}
              maxLength={200}
              onChange={event => setFilterName(event.target.value)}
            />
          </label>
          <button
            className="sl-primary"
            disabled={!filterName.trim()}
            onClick={() => void saveFilter()}
          >
            Speichern
          </button>
        </Modal>
      )}
    </div>
  );
}
