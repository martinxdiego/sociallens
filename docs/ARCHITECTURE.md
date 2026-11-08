# SocialLens Architektur

Die Anwendung erweitert den MIT-lizenzierten SafeUnfollow-Quellcode. `npm run dev` und `npm run build` verwenden `vite.sociallens.config.ts`, `app/index.html` und `src/sociallens-main.tsx`. Der Build landet in `dist-sociallens`. Das ursprüngliche SSG-Profil bleibt über `build:upstream` für Regressionen verfügbar.

## Datenfluss

Browser-Datei → begrenzte ZIP-Verarbeitung im Worker → JSON-/HTML-Validierung → Importvorschau → Bestätigung von Konto und vollständigem Zeitraum → SHA-256 → IndexedDB-Transaktion.

`src/features/sociallens/model.ts` enthält reine Mengenoperationen und Validierung. `repository.ts` verwaltet versionierte Daten, kontogetrennte Annotationen und atomare Schreiboperationen. `backup.ts` validiert Schema und Prüfsumme und verschlüsselt optional lokal mit Web Crypto. `importer.ts` und `importer.worker.ts` begrenzen Archivstruktur und entpackte Daten. Die UI komponiert diese Funktionen.

Das bisherige IndexedDB-Schema bleibt erhalten. Eine Übernahme alter Analysen erfolgt explizit und konservativ als unvollständiger Datenstand, da Konto und Vollständigkeit aus den alten Daten nicht nachgewiesen werden können. Dadurch entstehen aus historischen Cache-Daten keine vermeintlich sicheren Unfollower-Ereignisse.

## Zeit und Identität

Importzeit und Export-Erstellungszeit sind unterschiedliche Angaben. Nur verifizierbare Metadaten dürfen als Exportdatum verwendet werden. Vergleiche erfolgen ausschliesslich zwischen vollständigen, vergleichbaren Snapshots desselben lokalen Kontos. Änderungen liegen innerhalb eines Beobachtungsintervalls. Usernames sind normalisierte Bezeichner und keine unveränderliche Personenidentität. Änderungen eines Usernames können als Verlust und Zugang erscheinen.

## Lokale Sicherheit

Kernfunktionen haben keinen Server. Fonts, Worker und App-Shell werden lokal ausgeliefert und vom Service Worker vorgehalten. CSP begrenzt Verbindungen auf denselben Ursprung. Importiertes HTML wird als Daten gelesen, niemals in die Seite eingebettet. ZIPs und Backups werden nicht an GitHub oder andere Dienste übertragen. Profillinks öffnen Instagram erst auf ausdrücklichen Klick.

Ein Backup ist ein versioniertes JSON-Archiv. Unverschlüsselte Backups enthalten personenbezogene Listen und Notizen. Optionales AES-GCM schützt den heruntergeladenen Inhalt mit einer Passphrase. Browserdaten selbst unterliegen dem Schutz des Browserprofils. Gelöschte Browserdaten und verlorene Passphrasen können ohne nutzerseitiges Backup nicht wiederhergestellt werden.
