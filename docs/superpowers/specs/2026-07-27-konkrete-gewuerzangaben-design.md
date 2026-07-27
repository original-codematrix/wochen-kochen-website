# Konkrete Gewürzangaben für alle Rezepte

## Ziel

Alle bestehenden 75 Rezepte erhalten eine verlässliche Grundwürzung mit konkreten Mengen. Die benötigten Gewürze erscheinen wie andere Zutaten in der vollständigen Einkaufsliste. Zusätzlich zeigt jedes Rezept passende optionale Geschmacksvarianten.

Der Katalog wird außerdem um 25 eigenständig formulierte Rezepte auf mindestens 100 Rezepte erweitert. Öffentlich sichtbare Chefkoch-Kategorien und Rezeptideen dienen zur Themenfindung; fremde Zutatenlisten oder Zubereitungstexte werden nicht kopiert.

## Neue Rezepte

- Die 25 neuen Rezepte ergänzen gezielt Pasta, Kartoffeln, Reis und Bowls, Aufläufe sowie schnelle Pfannen- und Ofengerichte.
- Mindestens 13 der 25 neuen Rezepte sind fleischfrei. Die übrigen ergänzen unterschiedliche Fleischgerichte, ohne den Plan wieder fleischlastig zu machen.
- Fisch, Meeresfrüchte, Garnelen, Hummer und vergleichbare Zutaten bleiben vollständig ausgeschlossen.
- Neue Gerichte dürfen keine bloßen Umbenennungen bestehender Rezepte sein.
- Jedes neue Rezept ist vollständig: Mengen für vier Portionen, Zubereitung, Zeit, Kosten, Nährwerte, Kategorie, Meal-Prep- beziehungsweise Einfrierhinweis, Low-Carb-Variante, Schwierigkeit, konkrete Grundwürzung und optionale Gewürzempfehlung.
- Die Auswahl bevorzugt alltagstaugliche, gut bewertete Gerichtsideen, die in ungefähr 20 bis 50 Minuten zubereitet werden können und sich für Feierabend oder Meal Prep eignen.

## Datenmodell

- Verbindlich benötigte Gewürze stehen als einzelne, messbare Einträge in `ingredients`, zum Beispiel `1 TL mildes Paprikapulver`, `1/2 TL schwarzer Pfeffer` oder `3/4 TL Salz`.
- Die Mengen gelten wie alle bestehenden Rezeptangaben für vier Portionen. Der Wochenplan skaliert sie für den Einkauf automatisch auf zwei Portionen.
- Jedes bestehende und neue Rezept erhält ein nicht leeres Feld `seasoningTip`. Es beschreibt individuelle, optionale Varianten, etwa rauchiger, schärfer, kräuteriger oder milder.
- Optionale Varianten werden nicht automatisch zur Einkaufsliste hinzugefügt. Nur die verbindliche Grundwürzung ist einkaufsrelevant.

## Rezeptqualität

- Jedes Rezept wird einzeln und passend zu seinen übrigen Zutaten gewürzt.
- Salzige Zutaten wie Sojasoße, Teriyaki-Soße, Brühe oder Fertigsoßen werden bei der zusätzlichen Salzmenge berücksichtigt.
- Pauschale Zutaten wie `Gewürze` sowie ungemessene Sammelangaben wie `Salz und Pfeffer` werden durch getrennte Mengenangaben ersetzt.
- Die Zubereitung nennt den sinnvollen Zeitpunkt für die Grundwürzung. Bestehende Schritte dürfen dafür präzisiert werden, ohne das Gericht grundsätzlich zu verändern.
- Bei Fertiggerichten oder bereits stark gewürzten Komponenten wird nur eine tatsächlich sinnvolle Ergänzung festgelegt; es werden keine unnötigen Gewürze erzwungen.

## Oberfläche

Der Rezeptdialog zeigt unter Zutaten und Zubereitung einen klar beschrifteten Abschnitt `Gewürzempfehlung`. Dort steht ausschließlich die optionale Variation aus `seasoningTip`. Die verbindlichen Gewürze bleiben Teil der normalen Zutatenliste und werden dadurch nicht doppelt angezeigt.

## Einkaufsplanung

Der bestehende Planer verarbeitet die neuen Gewürzzutaten wie andere Pflichtzutaten:

- Sie werden auf die geplante Portionszahl skaliert.
- Sie werden unter `Soßen, Gewürze & Vorrat` gruppiert.
- Fehlende veröffentlichte Preise bleiben transparent als Schätzung markiert.
- Mehrere geplante Rezepte dürfen denselben Gewürzvorrat gemeinsam verwenden; die bestehende Zutatenaggregation bleibt maßgeblich.

## Tests und Abnahmekriterien

- Der gesamte Rezeptkatalog enthält mindestens 100 Rezepte.
- Genau 25 neue, eindeutige Rezept-IDs ergänzen den bisherigen Bestand; mindestens 13 davon sind fleischfrei.
- Jedes Rezept besitzt einen nicht leeren `seasoningTip`.
- Kein Rezept enthält den pauschalen Pflichtzutaten-Eintrag `Gewürze`.
- Gewürz-Pflichtzutaten enthalten konkrete Mengen und sind nicht nur ungemessene Sammelbegriffe.
- Kein bestehendes oder neues Rezept enthält Fisch oder Meeresfrüchte.
- Der Rezeptdialog rendert die Gewürzempfehlung.
- Ein generierter Wochenplan übernimmt konkrete Gewürze in die Einkaufsliste und ordnet sie `Soßen, Gewürze & Vorrat` zu.
- Bestehende Angebots-, Einkaufs-, Ausschluss-, Fischfilter- und Meal-Prep-Funktionen bleiben unverändert funktionsfähig.
