# Ausgangsbasis

Geprüft am 7. November 2026. Upstream `ignromanov/safe-unfollow`, Commit `883cfac67244c3acb6845976d2d060e8a29b5d45`, Version 1.6.0, MIT. LICENSE und Copyright bleiben erhalten.

React 18, TypeScript strict, Vite 7, Tailwind 4, Zustand, IndexedDB v2, Comlink-Worker, TanStack Virtual, zip.js und htmlparser2 sind vorhanden. JSON und HTML sowie zusätzliche Beziehungskategorien sind bereits implementiert. Das bestehende Datenmodell speichert eine aktuelle Analyse mit Bitsets und Suchindex, jedoch keine belastbare kontogetrennte Snapshot-Historie. Bestehende Cache-Daten enthalten keine verlässlich bestätigte Kontozugehörigkeit oder Vollständigkeit.

Upstream enthält Umami, Heatmaps, Werbung, Dodo-Zahlungen und ein Tally-Formular. SocialLens verwendet einen eigenen lokalen Einstieg und Build mit ausgeschalteten Dienstvariablen sowie restriktiver CSP. Die bisherige Analyse ist über `/legacy` erreichbar. Der originale Quellcode und das ursprüngliche Buildprofil bleiben für Regressionstests erhalten.

`npm ci` erfolgreich mit Node 24.22.1. Upstream empfiehlt Node 22. Sauberer separater Upstream-Checkout wurde für Typecheck und Build verwendet, damit gleichzeitig entstehende SocialLens-Dateien die Baseline nicht beeinflussen.

Erste Baseline ohne fertiges dist-Artefakt: 246 Testdateien bestanden, 12 Build-Suites ausgelassen, 4583 Tests bestanden und 109 ausgelassen. Lint erfolgreich. Typecheck und SSG-Build im unveränderten separaten Checkout erfolgreich. Der vollständige Lauf mit erzeugtem dist wird separat dokumentiert.

Erster `npm audit` meldete 35 Befunde (2 kritisch, 10 hoch, 18 mittel, 5 niedrig). Kompatible Korrekturen werden mit `npm audit fix` geprüft. Das Abschlussprotokoll nennt verbleibende Befunde.
