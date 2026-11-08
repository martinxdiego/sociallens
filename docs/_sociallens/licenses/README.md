# Lizenzhinweise

Die unveränderte Wurzellizenz enthält MIT und das Copyright von Igor Romanov für SafeUnfollow. SocialLens übernimmt dessen Attribution.

`scripts/sociallens-licenses.ts` sammelt aus Rollups tatsächlichen Chunk-Modulen die verwendeten npm-Pakete. Deren mitgelieferte LICENSE-, COPYING-, OFL- und NOTICE-Dateien werden mit Paketversion und Quellrepository in `dist-sociallens/THIRD_PARTY_NOTICES.txt` zusammengeführt. Fehlende Lizenztexte lassen den Build fehlschlagen. Auch Schriften werden durch ihre im Bundle verwendeten CSS-Module erfasst.

Zwei npm-Pakete enthalten keinen eigenen Lizenztext. Dafür wurden am 8. November 2026 die unveränderten MIT-Texte aus ihren offiziellen Quellrepositories ergänzt:

- `html-parse-stringify.txt` aus https://raw.githubusercontent.com/henrikjoreteg/html-parse-stringify/master/LICENSE
- `react-remove-scroll-bar.txt` aus https://raw.githubusercontent.com/theKashey/react-remove-scroll-bar/master/LICENSE

Die Originalquellen aller Abhängigkeiten sind zusätzlich in `package-lock.json` festgehalten. Buildwerkzeuge werden mit npm installiert und nicht als ausführbare Anwendung ausgeliefert. Ihre eigenen Lizenzdateien bleiben in der Installation erhalten. Die SocialLens-Icons sind neu als SVG erstellt und davon als PNG gerendert. Screenshots enthalten ausschliesslich synthetische Profile. Die unveränderten Anleitungsvideos und Beispieldaten stammen aus dem MIT-lizenzierten Upstream.
