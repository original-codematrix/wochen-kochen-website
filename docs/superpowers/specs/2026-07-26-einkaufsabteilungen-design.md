# Einheitliche Einkaufsabteilungen

## Ziel

Alle Einkaufspositionen werden unabhängig von ihrem Preisstatus nach dem tatsächlichen Bereich im Supermarkt gruppiert. Angebote, öffentliche Normalpreise und geschätzte beziehungsweise noch offene Preise verwenden dieselbe Gruppierungslogik.

## Abteilungen

Die Einkaufsliste verwendet diese Reihenfolge:

1. `Fleisch & Frischetheke`
2. `Obst & Gemüse`
3. `Kühlregal & Tiefkühl`
4. `Nudeln, Reis & Beilagen`
5. `Soßen, Gewürze & Vorrat`
6. `Weitere Zutaten`

`Weitere Zutaten` enthält ausschließlich Positionen, die weder anhand ihrer internen Kategorie noch anhand ihres konkreten Namens zuverlässig zugeordnet werden können.

## Zuordnungsregeln

- Rindergeschnetzeltes, Schweineschnitzel, Nackensteaks, Hähnchen und vergleichbare Fleischprodukte gehören zu `Fleisch & Frischetheke`.
- Gurke, Zwiebel, Knoblauch, Paprika und frisches Gemüse gehören zu `Obst & Gemüse`.
- TK-Spinat, Tiefkühlprodukte, Eier und gekühlte Milchprodukte gehören zu `Kühlregal & Tiefkühl`.
- Nudeln, Reis, Kartoffeln, Couscous und Paniermehl gehören zu `Nudeln, Reis & Beilagen`.
- Brühe beziehungsweise Fond, Öl, Senf, Stärke, Soßen und Gewürze gehören zu `Soßen, Gewürze & Vorrat`.

Konkrete Namensmerkmale wie `TK`, `Brühe` oder `Öl` dürfen eine zu grobe interne Preiskategorie für die Abteilungsanzeige präzisieren. Die bestehende Produkttauglichkeits- und Preislogik bleibt unverändert.

## Datenfluss

`buildShopping()` baut weiterhin dieselben Einkaufspositionen mit denselben Mengen, Preisen, Preisstatus und Zutatenkennungen. Erst danach ordnet eine zentrale Funktion jede fertige Position einer Abteilung zu. Dadurch gelten die Regeln gleichermaßen für bepreiste und geschätzte Positionen.

Der Sparplan und der Reiter `Einkauf` bleiben synchron, weil beide weiterhin `activePlan.shopping` anzeigen.

## Aktualisierung

Der aktuelle Laufzeitplan und der eingecheckte Offline-Fallback werden nach der Änderung mit denselben sichtbaren Rezepten neu aufgebaut, damit die korrigierten Abteilungen sofort sichtbar sind. Rezeptauswahl, Mengen, Preiswerte und Zutatenabdeckung dürfen sich dabei nicht ändern.

## Tests

- Rindergeschnetzeltes, Schnitzel und Nackensteaks erscheinen unter `Fleisch & Frischetheke`.
- TK-Spinat erscheint unter `Kühlregal & Tiefkühl`.
- Gurke, Zwiebeln und Knoblauch erscheinen unter `Obst & Gemüse`.
- Brühe, Öl, Senf und Stärke erscheinen unter `Soßen, Gewürze & Vorrat`.
- Nudeln, Reis, Kartoffeln, Couscous und Paniermehl erscheinen unter `Nudeln, Reis & Beilagen`.
- Angebote und geschätzte Positionen verwenden dieselbe Gruppierungsfunktion.
- Keine Position und keine `ingredientId` geht beim Umgruppieren verloren oder wird doppelt ausgegeben.
- Beide Einkaufsansichten bleiben im Browser identisch.
