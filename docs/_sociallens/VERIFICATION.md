# Prüfprotokoll

Prüfstand 8. November 2026, lokale Umsetzung auf macOS Apple Silicon mit Node 24.22.1. Ausschliesslich synthetische Daten in Tests und Screenshots.

## Reproduzierbare Prüfungen

| Prüfung | Lokales Ergebnis |
| --- | --- |
| Installation | `npm ci` erfolgreich |
| Formatierung | `npm run format:check` erfolgreich |
| Lint | `npm run lint:strict` erfolgreich |
| TypeScript | `npm run type-check` erfolgreich |
| Upstream-Build | `npm run build:upstream` erfolgreich, SSG und Sitemap |
| Produktionsbudget des Upstreams | 352.750 Bytes bei 354.000 Bytes Budget, mit CI-Dienstplatzhaltern |
| Upstream Hosting-Paket | `wrangler deploy --dry-run` erfolgreich, kein Upload |
| Unit-/Integration-/Build-Tests | 262 Testdateien bestanden, 1 ausgelassen; 4.746 Tests bestanden, 1 ausgelassen |
| SocialLens-Produktionsbuild | `npm run build` erfolgreich, Ausgabe `dist-sociallens/` |
| Browsermatrix | 22 bestanden, 6 bewusst ausgelassen |

Die Browsermatrix umfasst Chromium, Firefox, WebKit und eine iPhone-13-WebKit-Emulation. Die sechs ausgelassenen Fälle sind die Offline-Service-Worker-Prüfung und der grosse Performance-Test ausserhalb Chromium. Physische Mobilgeräte und eine tatsächliche Betriebssystem-PWA-Installation sind nicht geprüft.

Vitest misst mit V8 90,97 % Statements, 86,83 % Branches, 90,02 % Funktionen und 92,10 % Zeilen in den erfassten Modulen. Das sind keine Abdeckungszahlen der gesamten Anwendung. Die vorhandenen Upstream-Ausschlüsse bleiben bestehen, und unimportierte SocialLens-UI-Dateien liefern in diesem V8-Lauf keine zählbaren Statements. Die SocialLens-Oberfläche und der tatsächliche Worker werden durch die separat dokumentierten Browserabläufe geprüft. Die bestehenden Gates 85/80/80/85 wurden nicht abgesenkt.

## Geprüfte Abläufe

- Echter ZIP-Worker-Import → Dashboard → zweiter Stand → Vergleich → Annotation → Reload.
- Verschlüsseltes Backup herunterladen, lokale Daten löschen und vollständig wiederherstellen.
- Mehrere Konten, persistente Notizen, Favoriten, Whitelist, Listen und gespeicherte Filter.
- Duplikate, unvollständige Exporte und fehlende Chronologie erzeugen keine falschen Verluste.
- CSV enthält den gewählten Filterumfang und neutralisiert Formelanfänge.
- Tastatur öffnet Profile, Escape schliesst den Dialog und gibt den Fokus zurück.
- Monats-/Jahresrückblick beruht auf Exportdaten, auch wenn die ZIPs am selben Tag importiert wurden.
- Grosse Änderungslisten sind bis zur letzten Seite zugänglich.
- Nach vorbereiteter PWA ist ein neuer ZIP-Import ohne Netzwerk möglich.
- Keine externen Netzwerkanfragen im geprüften SocialLens-Kernablauf.

## Migration und Recovery

Tests verwenden die tatsächliche alte IndexedDB-Implementierung. Je Analyse wird die Quelle ausdrücklich einem Zielkonto zugeordnet, als eingeschränkt gespeichert und unverändert in der Quelldatenbank belassen. Unvollständig gespeicherte und Demo-Quellen werden ausgeschlossen. Geprüft sind Wiederholung, Kontotrennung, gelöschtes Zielkonto, Lesefehler, QuotaExceededError sowie Transaktionsabbruch nach erfolgreichem `put`. Ein fehlerhafter Restore erhält den vorherigen Zustand. Ein korrektes Backup kann eine beschädigte Arbeitsfläche ersetzen.

SocialLens beginnt mit Schema-/Backupversion 1. Es gibt keine erfundene Migration aus früheren SocialLens-Versionen. Zukünftige unbekannte Formate werden abgewiesen. Der explizite Adapter für die bestehende SafeUnfollow-Datenbank ist der getestete Migrationspfad.

## Performance

Der Browser-Test importiert einen tatsächlichen ZIP mit 20.000 Profilen, findet ein Profil am Ende der Liste und prüft weniger als 100 gerenderte Listeneinträge. Der lokale erste Review-Lauf benötigte ungefähr 0,7 Sekunden inklusive UI-Aktualisierung. Dies ist ein einzelner lokaler Messwert, keine zugesicherte Laufzeit. Der Unit-Test verwendet 20.000 Follower und 10.000 Following sowie Mengenoperationen mit 50.000 Kennungen.

Die ZIP-Verarbeitung läuft im Worker. Kanonisierung, Hash-Vorbereitung und Workspace-Validierung nach dem Import laufen teilweise auf dem UI-Thread. Für extrem viele historische Snapshots ist eine inkrementelle Storage-Architektur ein Folgeprojekt. Browserabhängige Quoten begrenzen die nutzbare Datenmenge.

## Sicherheit und verbleibende Befunde

Der erste Audit meldete 35 Abhängigkeitsbefunde, darunter zwei kritische und zehn hohe. Nach kompatiblen Korrekturen und dem Vitest-4-Update bleiben im dokumentierten Audit 14 Befunde: null kritisch, null hoch, zwölf mittel, zwei niedrig.

- React Router 6 meldet zwei mittlere Advisories (Open Redirect und SSR-Hydration). SocialLens verwendet am Haupteinstieg keinen Router; die erhaltene Legacy-SPA verwendet feste interne Routen und keine Server-Hydration. Ein Major-Upgrade auf Router 7 wurde wegen des erhaltenen SSG-Profils nicht blind vorgenommen. Der Befund bleibt offen.
- `glob`, `minimatch` und `deepmerge` betreffen überwiegend Build-/Lint-/PWA-Abhängigkeiten. Es wurden keine erzwungenen Downgrades aus `npm audit fix --force` übernommen.
- `npm ls` meldet bestehende Peer-Bereichskonflikte für `beasties` und `picomatch`; die tatsächlichen Builds und Prüfungen sind separat ausgeführt.

Die private Vite-Konfiguration kompiliert Umami-, Heatmap-, AdSense- und Dodo-Konfiguration aus. CSP im HTML und ergänzende Hostheader begrenzen Skripte, Fonts, Worker und Verbindungen auf denselben Ursprung. Importiertes HTML wird nicht als DOM ausgeführt. Der geprüfte Dienst-Worker hält Buildassets vor, keine ZIPs und keine Backups. Externe Profillinks benötigen einen Klick und verwenden `noopener noreferrer`.

Ein unverschlüsseltes Backup besitzt eine Integritätsprüfsumme, keine Signatur und keinen Schutz vor absichtlicher Manipulation samt neuer Prüfsumme. Verschlüsselte Backups verwenden AES-256-GCM mit zufälligem Salt/IV und PBKDF2-SHA-256 mit 310.000 Iterationen. Verlorene Passphrasen sind nicht wiederherstellbar. Browserdaten selbst sind nicht zusätzlich mit der Backup-Passphrase verschlüsselt.

## Veröffentlichung

Ziel ist der eigene Fork `martinxdiego/sociallens`, Branch `feat/sociallens-foundation`, Draft-PR gegen den eigenen `main`. Kein automatischer Merge. GitHub Actions werden auf dem veröffentlichten Commit geprüft; der genaue Lauf wird im PR verlinkt. Es werden keine echten Exporte, Zugangsdaten oder `.env`-Dateien eingecheckt.

Optionales Hosting erfolgt später ausschliesslich mit `dist-sociallens/`, HTTPS, SPA-Fallback und den angegebenen Sicherheitsheadern. `npm run deploy` bleibt ein Upstream-Befehl und darf nicht zur SocialLens-Veröffentlichung verwendet werden.
