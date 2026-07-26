# Synchroner Einkaufsreiter

## Ziel

Der Reiter `Einkauf` zeigt immer dieselbe vollständige Einkaufsliste wie der aktuell geladene Angebots-Sparplan. Es darf keine zweite, aus einer statischen Vorlagenwoche berechnete Liste mehr geben.

## Datenquelle

`activePlan.shopping` ist die einzige Datenquelle für beide sichtbaren Einkaufslisten:

- die kompakte Einkaufsliste im Sparplan,
- die ausführliche Liste im Reiter `Einkauf`.

Solange noch kein aktueller Plan geladen wurde, zeigt der Einkaufsreiter einen Ladehinweis. Ein stiller Rückfall auf die Einkaufsliste einer Vorlagenwoche ist ausgeschlossen, weil diese einen anderen Rezeptstand vortäuschen würde.

Die Monats- und Wochenvorlagen bleiben im Reiter `Vorlagen` erhalten. Sie beeinflussen den aktuellen Einkauf nicht.

## Gemeinsame Darstellung und Zustand

Eine gemeinsame Renderfunktion erzeugt beide Listen aus denselben Gruppen und Positionen. Pro Position wird derselbe stabile Schlüssel aus Abteilung und Produktname verwendet. Der Abhakzustand liegt weiterhin unter `state.checked.plan`.

Wird eine Position in einer Ansicht abgehakt, wird der Zustand gespeichert und anschließend in beiden Ansichten aktualisiert. Der Einkaufsreiter zeigt außerdem:

- den empfohlenen Markt aus `activePlan.recommendation.market`,
- die geschätzte Gesamtsumme aus `activePlan.recommendation.estimatedTotal`,
- die Anzahl erledigter und gesamter Positionen,
- denselben Quellenstatus wie der geladene Plan.

Preiskennzeichnung, Mengen, Hinweise und veröffentlichte Vergleichspreise entsprechen exakt der Sparplan-Ansicht.

## Aktionen

`Kopieren` verwendet ausschließlich die Positionen aus `activePlan.shopping` und enthält je Position Produktname, Menge, Hinweis und Preisstatus. `Drucken` druckt weiterhin die aktuelle Ansicht. `Zurücksetzen` leert `state.checked.plan` und aktualisiert beide Listen.

`Quellenstatus prüfen` darf den dargestellten Einkauf nicht durch Vorlagendaten ersetzen. Der bestehende Preis-JSON-Import gehört zu den alten Vorlagenpreisen und wird aus dem Einkaufsreiter entfernt, damit er nicht fälschlich als Aktualisierung des aktiven Sparplans verstanden wird. Angebotsimporte und Neuberechnung bleiben im Sparplan.

## Fehlerzustand

Kann kein aktueller Plan geladen werden, bleiben Markt, Summe und Fortschritt neutral und der Einkaufsreiter erklärt, dass der Sparplan nicht verfügbar ist. Es werden keine möglicherweise falschen Zutaten angezeigt.

## Tests

- Beide Ansichten enthalten nach dem Laden dieselben Gruppen, Produktnamen, Mengen, Hinweise und Preisangaben.
- Schweineschnitzel und alle anderen nicht angebotenen Pflichtzutaten erscheinen auch im Einkaufsreiter.
- Abhaken in einer Ansicht aktualisiert beide Ansichten.
- Zurücksetzen leert beide Ansichten.
- Markt, Gesamtsumme und Fortschritt stammen aus dem aktuellen Plan.
- Kopieren enthält die vollständige aktuelle Plan-Einkaufsliste.
- Vor dem Laden beziehungsweise bei einem Ladefehler erscheint keine statische Vorlagenliste.
- Bestehende Planungs-, Angebots-, Ausschluss- und Vollständigkeitstests bleiben grün.
