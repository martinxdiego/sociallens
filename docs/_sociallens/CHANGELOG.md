# SocialLens 0.1.0 — Draft

8. November 2026. Aufbau auf SafeUnfollow 1.6.0, Commit `883cfac67244c3acb6845976d2d060e8a29b5d45`.

- Eigener privater Build, SocialLens-Branding, deutsche responsive Oberfläche und Dark Mode.
- Kontogetrennte Snapshot-Engine in IndexedDB mit kanonischen Hashes, Deduplizierung, konservativer Legacy-Übernahme und atomarem Restore.
- Begrenzter JSON-/HTML-ZIP-Import im Worker mit Vorschau, Diagnose, Abbruch und expliziten Bestätigungen.
- Dashboard, Mengenanalysen, sichere Vergleiche, Charts, Beobachtungsintervalle und datierte Monats-/Jahresberichte.
- Virtualisierte Beziehungsliste, Suche, Filter, Favoriten, Whitelist, eigene Listen, Tags, Notizen und manuelle Prüfliste.
- CSV, versionierte Backups, optionale lokale Verschlüsselung, Integritätsprüfung, Speicherverwaltung und gezielte Löschung.
- PWA nach vollständigem ersten Laden ohne Netzwerk verwendbar, Tastaturbedienung mit Fokus-Rückgabe, Cross-Browser- und Mobile-Tests.
- Abhängigkeitskorrekturen einschliesslich Vitest 4, angepasste Konstruktor-Mocks und Coverage-Konfiguration.
- Upstream-Quellen, MIT-Lizenz und bisherige Analyse erhalten. Kein Merge, keine öffentliche Bereitstellung und keine Instagram-Automatisierung.

Die logisch getrennten Implementierungsschritte werden als Commits in einem gemeinsamen Draft-PR zur Prüfung vorgelegt. Dies weicht von den nacheinander vorgeschlagenen Phasen-PRs ab, damit keine ungeprüften Zwischenschritte in `main` gemergt werden müssen.
