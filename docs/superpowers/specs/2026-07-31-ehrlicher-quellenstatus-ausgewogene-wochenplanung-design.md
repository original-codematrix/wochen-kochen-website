# Ehrlicher Quellenstatus und ausgewogene Wochenplanung

## Ziel

Die Quellenkarten sollen eindeutig zwischen dem Zeitpunkt eines aktuellen Abrufs beziehungsweise Chrome-Imports und der Gültigkeit veröffentlichter Angebote unterscheiden. Die Rezeptauswahl soll Angebote weiterhin preislich berücksichtigen, aber über den gesamten sichtbaren Zeitraum eine alltagstaugliche Mischung aus Fleisch-, Pasta- und fleischfreien Gerichten erzeugen.

## Quellenstatus

- Jeder automatisch abgerufene Quellenstand erhält einen `checkedAt`-Zeitpunkt.
- Jeder aus Chrome übernommene Markt erhält seinen eigenen `importedAt`-Zeitpunkt; ein späterer Import eines anderen Marktes darf diesen Zeitpunkt nicht überschreiben.
- Die API übernimmt diese Zeitpunkte in `plan.sources`.
- Die Oberfläche zeigt bei `browser-cached` den Text „importiert am …“ und bei einem direkten Abruf „abgerufen am …“.
- `validUntil` wird nur als „gültig bis …“ dargestellt, wenn das Datum am Tag der Anzeige noch nicht abgelaufen ist. Ein alter Basiswert darf nicht den Eindruck eines aktuellen Angebotszeitraums erwecken.
- Die Zahl `0/15 benötigte Normalpreise` bleibt sichtbar: Sie beschreibt die öffentliche Normalpreisabdeckung und ist unabhängig davon, ob Wochenangebote importiert wurden.

## Ausgewogene Auswahl

Der sichtbare Plan umfasst je nach Wochentag heute bis Sonntag plus die sieben Tage der Folgewoche. Für einen zehn Gerichte umfassenden Plan gelten folgende Ziele:

- drei bis vier Fleischgerichte;
- zwei bis drei Pastagerichte;
- mindestens drei fleischfreie Gerichte;
- keine wiederholte Rezept-ID;
- zusätzliche Kategorievielfalt für Reis-, Kartoffel-, Ofen- und sonstige Gerichte.

Für kürzere sichtbare Zeiträume werden die Zielwerte proportional skaliert. Ein Gericht kann mehrere Ziele erfüllen: Eine Hähnchen-Pasta zählt sowohl als Fleisch- als auch als Pastagericht. Fisch und Meeresfrüchte bleiben vollständig ausgeschlossen.

Die Auswahl arbeitet nicht mit einer starren Wochenvorlage. Zuerst bewertet der bestehende Planner weiterhin Angebotstreffer, bestätigte Preise, geschätzte Kosten und Rezeptqualität. Anschließend stellt eine deterministische, quotenbewusste Auswahl aus den gut bewerteten Kandidaten die Mischung her. Innerhalb gleich geeigneter Kandidaten gewinnt weiterhin die bessere Angebots- und Preisbewertung. Wenn der Katalog wegen aktiver Ausschlüsse eine Zielquote nicht erfüllen kann, liefert der Planner den bestmöglichen Plan, statt die Berechnung abzubrechen.

## Neuwürfeln und Import

- Angebotsabruf, HTML-Import und manuelles Neuwürfeln verwenden dieselbe Mischungslogik.
- `variation` verändert die Auswahl innerhalb der zulässigen Kandidaten, darf die Mischungsziele aber nicht systematisch aushebeln.
- Nach einem Import wird weiterhin automatisch ein vollständiger Plan mit Einkaufsliste und Meal-Prep erzeugt.

## Tests und Abnahme

- Refresh-Tests prüfen marktbezogene `importedAt`- und direkte `checkedAt`-Metadaten.
- UI-Tests prüfen, dass alte Gültigkeitsdaten nicht als aktuell erscheinen und echte Import-/Abrufzeitpunkte sichtbar sind.
- Planner-Tests prüfen die Fleisch-, Pasta- und fleischfreien Zielbereiche für Freitag bis Sonntag plus Folgewoche sowie einen proportional kürzeren Zeitraum.
- Bestehende Tests für Angebotsgewichtung, Ausschlüsse, Fischfreiheit, eindeutige Rezepte, vollständige Einkaufsliste und Meal-Prep bleiben grün.
- Der aktuell importierte Lauf wird nach dem Merge erneut berechnet und die lokale Seite anschließend mit dem neuen Plan gestartet.
