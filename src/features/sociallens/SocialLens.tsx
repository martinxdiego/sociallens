import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  History as HistoryIcon,
  FolderHeart,
  Upload,
  Settings as SettingsIcon,
  Plus,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { emptyData, type AppData, type LocalAccount } from './model';
import { repository } from './repository';
import { Dashboard } from './ui/Dashboard';
import { Relationships } from './ui/Relationships';
import { Changes, History } from './ui/History';
import { ImportView } from './ui/ImportView';
import { Settings } from './ui/Settings';
import { Modal } from './ui/Primitives';
import { dateTime } from './ui/format';
import './sociallens.css';

const navigation = [
  {
    id: 'overview',
    label: 'Übersicht',
    icon: LayoutDashboard,
    description: 'Dein Netzwerk im Blick',
  },
  {
    id: 'relationships',
    label: 'Beziehungen',
    icon: Users,
    description: 'Entdecke deine Verbindungen',
  },
  {
    id: 'changes',
    label: 'Änderungen',
    icon: ArrowLeftRight,
    description: 'Veränderungen verstehen',
  },
  {
    id: 'history',
    label: 'Verlauf',
    icon: HistoryIcon,
    description: 'Deine gespeicherten Beobachtungen',
  },
  {
    id: 'collections',
    label: 'Sammlungen',
    icon: FolderHeart,
    description: 'Platz für deine persönlichen Listen',
  },
  {
    id: 'imports',
    label: 'Importieren',
    icon: Upload,
    description: 'Ein neuer Blick auf dein Netzwerk',
  },
  {
    id: 'settings',
    label: 'Einstellungen',
    icon: SettingsIcon,
    description: 'Deine Daten unter deiner Kontrolle',
  },
];

function accountCaption(account?: LocalAccount) {
  return account ? `@${account.username}` : 'Dein persönlicher Einblick';
}

export default function SocialLens() {
  const [data, setData] = useState<AppData>(emptyData);
  const [accountId, setAccountId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [username, setUsername] = useState('');
  const [label, setLabel] = useState('');
  const [accountError, setAccountError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('sociallens-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const reload = useCallback(async () => {
    const next = await repository.load();
    setData(next);
    setError('');
    setAccountId(current =>
      next.accounts.some(account => account.id === current) ? current : (next.accounts[0]?.id ?? '')
    );
  }, []);
  useEffect(() => {
    void reload()
      .catch(cause => setError(String(cause)))
      .finally(() => setLoading(false));
  }, [reload]);
  useEffect(() => {
    const refresh = () => {
      void reload().catch(cause => setError(String(cause)));
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [reload]);
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('sociallens-theme', dark ? 'dark' : 'light');
    } catch {
      /* Theme remains usable without persistence. */
    }
  }, [dark]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6500);
    return () => clearTimeout(timer);
  }, [message]);
  const account = data.accounts.find(item => item.id === accountId);
  const snapshots = data.snapshots
    .filter(item => item.localAccountId === accountId)
    .sort((a, b) => Date.parse(a.importedAt) - Date.parse(b.importedAt));
  const snapshot =
    snapshots.find(item => item.id === selectedId) ?? snapshots[snapshots.length - 1];
  const annotations = data.annotations.filter(item => item.localAccountId === accountId);
  const savedFilters = data.savedFilters.filter(item => item.localAccountId === accountId);
  const current = navigation.find(item => item.id === view)!;
  async function addAccount() {
    setSaving(true);
    setAccountError('');
    try {
      const created = await repository.createAccount(label, username);
      await reload();
      setAccountId(created.id);
      setSelectedId('');
      setAdding(false);
      setUsername('');
      setLabel('');
      setView('imports');
    } catch (cause) {
      setAccountError(
        cause instanceof Error ? cause.message : 'Konto konnte nicht angelegt werden.'
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={`sociallens ${dark ? 'sl-dark' : ''}`}>
      <a className="sl-skip" href="#sl-main">
        Zum Inhalt
      </a>
      <aside className="sl-sidebar">
        <a href="/" className="sl-brand">
          <img src="/sociallens.svg" alt="" width="34" height="34" />
          <strong>SocialLens</strong>
        </a>
        <p className="sl-brand-caption">Deine Verbindungen verstehen</p>
        <div className="sl-account-select">
          <label>
            Lokales Konto
            <select
              aria-label="Lokales Konto"
              value={accountId}
              onChange={event => {
                setAccountId(event.target.value);
                setSelectedId('');
              }}
            >
              <option value="" disabled>
                Konto auswählen
              </option>
              {data.accounts.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label} · @{item.username}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setAdding(true)}>
            <Plus size={16} />
            Konto hinzufügen
          </button>
        </div>
        <nav aria-label="Hauptnavigation">
          {navigation.map(item => (
            <button
              key={item.id}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sl-sidebar-bottom">
          <div className="sl-local-status">
            <ShieldCheck size={18} />
            <span>Bleibt auf deinem Gerät</span>
          </div>
          <button onClick={() => setDark(!dark)}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            {dark ? 'Helles Design' : 'Dunkles Design'}
          </button>
          <small>Auf Basis von SafeUnfollow · MIT</small>
          <a href="/legacy">Bisherige Analyse öffnen</a>
        </div>
      </aside>
      <main id="sl-main" className="sl-main">
        <header className="sl-page-header">
          <div>
            <p>{accountCaption(account)}</p>
            <h1>{current.label}</h1>
            <span>{current.description}</span>
          </div>
          <button className="sl-primary" onClick={() => setView('imports')}>
            <Upload size={17} />
            Daten importieren
          </button>
        </header>
        {snapshot && (
          <div className="sl-current-snapshot">
            <span>Datenstand vom {dateTime(snapshot.importedAt)}</span>
            <button className="sl-link-button" onClick={() => setView('history')}>
              Datenstand wechseln
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="sl-error">
            <p>{error}</p>
            <button onClick={() => setView('settings')}>Backup wiederherstellen</button>
          </div>
        )}
        {loading ? (
          <p className="sl-skeleton" role="status">
            Lokale Daten werden geladen …
          </p>
        ) : (
          <div key={`${accountId}-${view}`}>
            {view === 'overview' && (
              <Dashboard
                snapshot={snapshot}
                snapshots={snapshots}
                onImport={() => setView('imports')}
                onRelationships={() => setView('relationships')}
                onChanges={() => setView('changes')}
              />
            )}
            {(view === 'relationships' || view === 'collections') && (
              <Relationships
                snapshot={snapshot}
                snapshots={snapshots}
                annotations={annotations}
                savedFilters={savedFilters}
                accountId={accountId}
                reload={reload}
                notify={setMessage}
                collections={view === 'collections'}
              />
            )}
            {view === 'changes' && <Changes snapshots={snapshots} />}
            {view === 'history' && (
              <History
                snapshots={snapshots}
                selectedId={snapshot?.id}
                select={id => {
                  setSelectedId(id);
                  setView('overview');
                }}
                reload={reload}
                notify={setMessage}
              />
            )}
            {view === 'imports' && (
              <ImportView
                account={account}
                onSaved={async () => {
                  await reload();
                  setSelectedId('');
                }}
                notify={setMessage}
              />
            )}
            {view === 'settings' && (
              <Settings data={data} account={account} reload={reload} notify={setMessage} />
            )}
          </div>
        )}
        <footer className="sl-footer">
          Beobachtungen aus deinen Exporten. Benutzernamen können sich ändern.
        </footer>
      </main>
      {message && (
        <div className="sl-toast" role="status">
          {message}
        </div>
      )}
      {adding && (
        <Modal
          title="Lokales Konto hinzufügen"
          description="Vergib eine Bezeichnung und den Instagram-Benutzernamen. Die Zuordnung bleibt auf diesem Gerät."
          onClose={() => setAdding(false)}
        >
          <form
            onSubmit={event => {
              event.preventDefault();
              void addAccount();
            }}
          >
            <label>
              Bezeichnung
              <input
                value={label}
                maxLength={200}
                placeholder="Mein persönliches Konto"
                onChange={event => setLabel(event.target.value)}
              />
            </label>
            <label>
              Instagram-Benutzername
              <input
                required
                value={username}
                maxLength={30}
                placeholder="dein.name"
                onChange={event => setUsername(event.target.value)}
              />
            </label>
            {accountError && (
              <p role="alert" className="sl-error">
                {accountError}
              </p>
            )}
            <button className="sl-primary" disabled={saving || !username.trim()}>
              Konto anlegen
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
