const RECIPE_SEASONINGS = {
  'garlic-pasta': {
    required: ['1 TL mildes Paprikapulver', '3/4 TL Salz', '1/2 TL schwarzer Pfeffer'],
    application: 'Paprikapulver, Salz und Pfeffer über die Hähnchenwürfel geben und vor dem kräftigen Anbraten rundum einmassieren.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1 TL italienische Kräuter ergänzen; rauchiger wird es mit 1/2 TL geräuchertem Paprikapulver.'
  },
  teriyaki: {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Knoblauchpulver und schwarzen Pfeffer in die Teriyaki-Soße rühren, bevor sie das angebratene Hähnchen glasiert.',
    applicationIndex: 3,
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken ergänzen; milder bleibt das Gericht ohne Chili.'
  },
  gyros: {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Oregano', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Oregano mit Öl und 2 EL Gyrosgewürz ans Hähnchen geben; Salz und Pfeffer anschließend vollständig in den Knoblauchjoghurt rühren.',
    applicationIndex: 1,
    tip: 'Für eine kräftigere Kräuternote 1/2 TL getrockneten Thymian zusätzlich unter die Marinade rühren.'
  },
  nuggets: {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL Knoblauchpulver'],
    application: 'Paprikapulver und Knoblauchpulver mit den noch ungebackenen Pommes mischen, bevor Nuggets und Pommes in Ofen oder Airfryer kommen.',
    applicationIndex: 1,
    tip: 'Für rauchige Kartoffeln 1/2 TL geräuchertes Paprikapulver vor dem Backen über die Pommes geben.'
  },
  cajun: {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und schwarzen Pfeffer zusammen mit dem Cajun-Gewürz auf dem Hähnchen verteilen und die Würzung kurz mit anrösten.',
    applicationIndex: 2,
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken ergänzen; für eine mildere Pfanne die Chiliflocken weglassen.'
  },
  'honey-soy': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Knoblauchpulver und Pfeffer mit Honig und Sojasoße glatt rühren und diese Würzsoße vor dem Binden zum Hähnchen geben.',
    applicationIndex: 2,
    tip: 'Für eine warme Ingwernote 1/2 TL gemahlenen Ingwer zusammen mit Honig und Sojasoße einrühren.'
  },
  pizza: {
    required: ['1 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    application: 'Oregano vor dem Backen auf der Pizza verteilen und den schwarzen Pfeffer frisch über den angemachten Gurkensalat geben.',
    applicationIndex: 0,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknetes Basilikum nach dem Backen über die Pizza streuen.'
  },
  'beef-onion': {
    required: ['1/2 TL schwarzer Pfeffer', '1/2 TL getrockneter Thymian'],
    application: 'Den Pfeffer direkt vor dem portionsweisen Anbraten aufs Rind geben und den Thymian beim Ablöschen in die Zwiebelsoße rühren.',
    applicationIndex: 1,
    tip: 'Für eine herzhaftere Soße 1/2 TL mildes Paprikapulver beim Anbraten der Zwiebeln ergänzen.'
  },
  'coconut-curry': {
    required: ['1/2 TL Kurkuma', '1/2 TL Knoblauchpulver', '1/2 TL Salz'],
    application: 'Kurkuma und Knoblauchpulver mit dem Currypulver kurz bei Zwiebel und Hähnchen anrösten; das Salz nach dem Angießen der Kokosmilch einrühren.',
    applicationIndex: 3,
    tip: 'Für mehr Wärme 1/4 TL Chiliflocken ergänzen; für ein milderes Curry die Chiliflocken weglassen.'
  },
  'bbq-pasta': {
    required: ['1/2 TL geräuchertes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Geräuchertes Paprikapulver und Pfeffer mit BBQ-Soße und Brühe verrühren, bevor die gekochte Pasta in der Soße bindet.',
    applicationIndex: 3,
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken mit der BBQ-Soße einrühren; milder gelingt es ohne Chili.'
  },
  burger: {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver vor dem Garen über die Pommes geben und den Pfeffer nach dem Wenden auf den heißen Chickenburger-Patties verteilen.',
    applicationIndex: 0,
    tip: 'Für würzigere Kartoffeln 1/2 TL Knoblauchpulver vor dem Backen gleichmäßig über die Pommes geben.'
  },
  'sheet-pan': {
    required: ['1 TL mildes Paprikapulver', '1 TL getrockneter Rosmarin', '3/4 TL Salz', '1/2 TL schwarzer Pfeffer'],
    application: 'Paprikapulver, Rosmarin, Salz und Pfeffer mit etwas Öl verrühren, Kartoffelecken und Hähnchen damit umhüllen und dann aufs Blech geben.',
    applicationIndex: 0,
    tip: 'Für eine mediterrane Variante 1/2 TL getrockneten Thymian zusätzlich mit dem Öl verrühren.'
  },
  'sweet-chili': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Knoblauchpulver und schwarzen Pfeffer in Sweet-Chili- und Sojasoße einrühren, ehe das gebratene Hähnchen darin kurz glasiert.',
    applicationIndex: 2,
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken in die Soße rühren; für die milde Variante darauf verzichten.'
  },
  'hoisin-noodles': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    application: 'Knoblauchpulver und Chiliflocken mit Hoisin, Sojasoße und Wasser verrühren und die Mischung zum angebratenen Hähnchen geben.',
    applicationIndex: 2,
    tip: 'Für eine warme Würze 1/2 TL gemahlenen Ingwer zusammen mit Hoisin und Sojasoße einrühren.'
  },
  wings: {
    required: ['1 TL geräuchertes Paprikapulver', '1/2 TL Knoblauchpulver'],
    application: 'Geräuchertes Paprikapulver und Knoblauchpulver vor dem Backen gleichmäßig auf Wings und Kartoffelspalten verteilen.',
    applicationIndex: 0,
    tip: 'Für pikante Wings 1/4 TL Chiliflocken mit der BBQ-Soße verrühren; milder bleiben sie ohne Chili.'
  },
  'beef-pasta': {
    required: ['1 TL italienische Kräuter', '1/2 TL schwarzer Pfeffer'],
    application: 'Den Pfeffer beim Bräunen ans Hackfleisch geben und die italienischen Kräuter nach dem Ablöschen in der Brühe ziehen lassen.',
    applicationIndex: 1,
    tip: 'Für mehr Tiefe 1/2 TL geräuchertes Paprikapulver kurz mit dem Hackfleisch anrösten.'
  },
  'mustard-chicken': {
    required: ['1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    application: 'Pfeffer auf das Hähnchen geben, bevor es in die Pfanne kommt, und den Thymian zusammen mit Senf und Honig in die Soße rühren.',
    applicationIndex: 1,
    tip: 'Für eine kräuterige Senfsoße 1/2 TL getrockneten Rosmarin fein zerreiben und mitköcheln.'
  },
  'lemon-garlic': {
    required: ['1/2 TL getrockneter Thymian', '1/2 TL schwarzer Pfeffer'],
    application: 'Den Pfeffer vor dem Anbraten aufs Hähnchen geben und den Thymian nach Knoblauch, Brühe und Zitronensaft in die Pfanne geben.',
    applicationIndex: 1,
    tip: 'Für mehr Zitronenkräuter-Aroma 1/2 TL getrockneten Oregano kurz vor dem Servieren ergänzen.'
  },
  'pepper-beef': {
    required: ['1 TL grob gemahlener schwarzer Pfeffer', '1/2 TL getrockneter Thymian'],
    application: 'Den groben Pfeffer auf das frisch angebratene Rind geben und den Thymian beim Ablöschen in der Senfsoße mitziehen lassen.',
    applicationIndex: 3,
    tip: 'Für eine mildere Pfeffernote nur 1/2 TL Pfeffer verwenden und dafür 1/2 TL Paprikapulver ergänzen.'
  },
  'garlic-rice': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Knoblauchpulver und Pfeffer kurz mit Hähnchen und optionalem Ei anrösten, bevor Reis und Sojasoße untergehoben werden.',
    applicationIndex: 3,
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken beim Anbraten ergänzen; milder bleibt die Pfanne ohne Chili.'
  },
  'kebab-bowl': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver, Oregano und Pfeffer mit wenig Öl am Hähnchen verteilen und es anschließend kräftig für die Bowl anbraten.',
    applicationIndex: 1,
    tip: 'Für eine kräftigere Kebab-Würzung 1/2 TL gemahlenen Kreuzkümmel in die Hähnchenmarinade geben.'
  },
  'crispy-chicken': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver, Knoblauchpulver und Pfeffer ins Paniermehl mischen, bevor das Hähnchen paniert und im Ofen gebacken wird.',
    applicationIndex: 0,
    tip: 'Für eine rauchige Panade 1/2 TL geräuchertes Paprikapulver unter das Paniermehl mischen.'
  },
  'soy-sesame': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Knoblauchpulver und Pfeffer in Sojasoße, Sesamöl und Honig rühren und die Würzsoße am Hähnchen kurz einkochen.',
    applicationIndex: 2,
    tip: 'Für frische Schärfe 1/2 TL gemahlenen Ingwer mit der Sojasoße verrühren; milder geht es ohne Ingwer.'
  },
  'curry-noodles': {
    required: ['1/2 TL Kurkuma', '1/2 TL Knoblauchpulver', '1/2 TL Salz'],
    application: 'Kurkuma und Knoblauchpulver kurz mit dem Curry am Hähnchen rösten; das Salz erst nach der Kokosmilch in die Nudelsoße geben.',
    applicationIndex: 2,
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken ergänzen; für eine sanfte Kokossoße das Chili weglassen.'
  },
  'bbq-tray': {
    required: ['1 TL geräuchertes Paprikapulver', '1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Geräuchertes Paprikapulver und Knoblauchpulver unter die BBQ-Soße rühren, das Hähnchen damit bestreichen und den Pfeffer vor dem Backen an die Kartoffeln geben.',
    applicationIndex: 0,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Rosmarin mit Öl und BBQ-Soße verrühren.'
  },
  'beef-rice': {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und schwarzen Pfeffer nach Zwiebel und Knoblauch zum gebräunten Hack geben und kurz vor Brühe und Sojasoße anrösten.',
    applicationIndex: 3,
    tip: 'Für eine rauchige Pfanne 1/2 TL geräuchertes Paprikapulver zusammen mit dem Hackfleisch anrösten.'
  },
  'garlic-parmesan': {
    required: ['1/2 TL schwarzer Pfeffer', '1/2 TL italienische Kräuter'],
    application: 'Pfeffer und italienische Kräuter in die heiße Brühe geben, bevor Parmesan und Pasta zur cremigen Knoblauchsoße kommen.',
    applicationIndex: 4,
    tip: 'Für mehr Kräuterfrische 1/2 TL getrocknetes Basilikum erst kurz vor dem Servieren ergänzen.'
  },
  'oven-pizza': {
    required: ['1 TL getrockneter Oregano', '1/2 TL mildes Paprikapulver'],
    application: 'Oregano und Paprikapulver vor dem Backen gleichmäßig auf den individuell belegten Pizzahälften verteilen.',
    applicationIndex: 2,
    tip: 'Für eine schärfere Pizza 1/4 TL Chiliflocken nach dem Backen darüberstreuen; milder bleibt sie ohne.'
  },
  'mustard-pasta': {
    required: ['1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    application: 'Den Pfeffer ans Hähnchen geben, sobald es Farbe hat, und den Thymian mit Brühe und Senf in der Pastasoße aufkochen.',
    applicationIndex: 1,
    tip: 'Für eine wärmere Senfnote 1/2 TL mildes Paprikapulver beim Anbraten des Hähnchens ergänzen.'
  },
  'crispy-wrap': {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Pfeffer vor dem Garen auf dem Crispy Chicken verteilen, damit die Würzung später in jedem Wrap steckt.',
    applicationIndex: 0,
    tip: 'Für rauchige Wraps 1/2 TL geräuchertes Paprikapulver in die Knoblauch- oder BBQ-Soße rühren.'
  },
  'garlic-beef-noodles': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    application: 'Knoblauchpulver und Chiliflocken nach dem scharfen Anbraten zum Rind geben und nur kurz rösten, bevor Soja und Hoisin folgen.',
    applicationIndex: 2,
    tip: 'Für eine warme Asia-Note 1/2 TL gemahlenen Ingwer zusammen mit Sojasoße und Hoisin einrühren.'
  },
  'chicken-rice-bake': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver, Knoblauchpulver und Pfeffer mit Reis und Brühe in der Form verrühren, bevor das Hähnchen darauf verteilt wird.',
    applicationIndex: 1,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian vor dem Backen unter die Brühe rühren.'
  },
  'hoisin-rice': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    application: 'Knoblauchpulver und Chiliflocken in Hoisin und Soja rühren und die Mischung am gebratenen Hähnchen kurz karamellisieren lassen.',
    applicationIndex: 2,
    tip: 'Für eine frische Ingwernote 1/2 TL gemahlenen Ingwer beim Anbraten des Hähnchens ergänzen.'
  },
  'frosta-evening': {
    required: ['1/4 TL schwarzer Pfeffer', '1/2 TL getrocknete Petersilie'],
    application: 'Pfeffer und getrocknete Petersilie erst in der letzten Pfannenminute unter die vollständig erhitzte FRoSTA-Pfanne heben.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknetes Basilikum erst nach dem Erhitzen unter die Pfanne rühren.'
  },
  'mexico-pork': {
    required: ['1/2 TL geräuchertes Paprikapulver', '1/2 TL Knoblauchpulver'],
    application: 'Geräuchertes Paprikapulver und Knoblauchpulver mit wenig Öl an die Kartoffelspalten geben, bevor sie 30–35 Minuten backen.',
    applicationIndex: 0,
    tip: 'Für zusätzliche Schärfe 1/4 TL Chiliflocken über die Kartoffeln geben; milder bleiben sie ohne Chili.'
  },
  'spinach-pasta': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat, Salz und Pfeffer vollständig in Spinat und Kochsahne rühren und die Soße vor Nudeln und Parmesan kurz abschmecken.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1/2 TL italienische Kräuter kurz vor dem Servieren in die Soße rühren.'
  },
  'spinach-potatoes-eggs': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat und Salz beim langsamen Erhitzen in den Rahmspinat rühren und den Pfeffer über die frisch gebratenen Spiegeleier geben.',
    applicationIndex: 1,
    tip: 'Für eine würzigere Eierschicht 1/2 TL mildes Paprikapulver über die fertigen Spiegeleier streuen.'
  },
  'leberkaese-eggs': {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver beim Knusprigbraten über die Kartoffelscheiben streuen und den Pfeffer vor dem Servieren auf die aufgelegten Spiegeleier geben.',
    applicationIndex: 1,
    tip: 'Für herzhaftere Bratkartoffeln 1/2 TL getrockneten Majoran kurz vor Ende der Bratzeit ergänzen.'
  },
  'leberkaese-spinach': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat beim Erhitzen gründlich unter den Rahmspinat rühren und den Pfeffer zum Schluss über Kartoffelstampf und Leberkäse mahlen.',
    applicationIndex: 1,
    tip: 'Für eine wärmere Kartoffelnote 1/2 TL mildes Paprikapulver unter den fertigen Stampf rühren.'
  },
  'ham-cream-pasta': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat und Pfeffer in die Kochsahne rühren, sobald Erbsen und Schinken heiß sind, und erst danach Nudeln und Parmesan unterheben.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian kurz vor dem Servieren in die Sahnesoße rühren.'
  },
  'spinach-gnocchi': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat, Salz und Pfeffer mit Spinat und Frischkäse verrühren, bevor die goldbraunen Gnocchi in der Soße fertig ziehen.',
    applicationIndex: 2,
    tip: 'Für eine italienische Note 1/2 TL getrockneten Oregano zusammen mit dem Frischkäse einrühren.'
  },
  'schnitzel-potatoes': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Pfeffer ins Paniermehl mischen; das Salz vollständig in den noch warmen Kartoffel-Gurkensalat geben.',
    applicationIndex: 0,
    tip: 'Für eine kräuterige Panade 1/2 TL getrocknete Petersilie unter das Paniermehl mischen.'
  },
  'meatballs-cream': {
    required: ['1/2 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Pfeffer in die Hackmasse kneten und den Thymian nach Brühe und Kochsahne in der Rahmsoße mitziehen lassen.',
    applicationIndex: 1,
    tip: 'Für eine warme Rahmsoße 1/4 TL Muskat erst am Ende der Kochzeit vorsichtig einrühren.'
  },
  'pork-tenderloin-pasta': {
    required: ['1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Salz und Pfeffer direkt vor dem scharfen Anbraten auf die Filetstreifen geben; den Thymian anschließend in der Spinat-Sahne-Soße köcheln.',
    applicationIndex: 1,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Rosmarin fein zerreiben und beim Anbraten ergänzen.'
  },
  'chicken-spinach-lasagna': {
    required: ['1/4 TL Muskat', '1 TL italienische Kräuter', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat und Pfeffer in den aufgetauten Spinat rühren und die italienischen Kräuter zwischen Spinat, Hähnchen und Soße einschichten.',
    applicationIndex: 1,
    tip: 'Für eine kräftigere Kräuterschicht 1/2 TL getrockneten Oregano über die Béchamelsoße streuen.'
  },
  'potato-mince-bake': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver, Thymian, Salz und Pfeffer ins fertig gebräunte Hack rühren, bevor Hack, Kartoffeln und Kochsahne geschichtet werden.',
    applicationIndex: 2,
    tip: 'Für eine rauchige Hackschicht 1/2 TL geräuchertes Paprikapulver beim Anbraten ergänzen.'
  },
  kaesespaetzle: {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat und Pfeffer in die warme Milch rühren, bevor der Käse zwischen den heißen Spätzle schmilzt.',
    applicationIndex: 2,
    tip: 'Für eine herzhafte Zwiebelnote 1/2 TL getrockneten Majoran kurz unter die Röstzwiebeln mischen.'
  },
  'paprika-cream-pork': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Thymian bei Zwiebel und frischer Paprika kurz anrösten und den Pfeffer in die angegossene Rahmsoße geben.',
    applicationIndex: 2,
    tip: 'Für eine rauchigere Soße 1/2 TL geräuchertes Paprikapulver zusammen mit der Paprika anrösten.'
  },
  'beef-fried-noodles': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    application: 'Knoblauchpulver und Chiliflocken nach dem Gemüse in den heißen Wok geben und vor Nudeln und Sojasoße wenige Sekunden rösten.',
    applicationIndex: 3,
    tip: 'Für eine wärmere Würze 1/2 TL gemahlenen Ingwer beim scharfen Anbraten des Rindfleischs ergänzen.'
  },
  'sausage-spinach-pasta': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Majoran', '1/4 TL schwarzer Pfeffer'],
    application: 'Majoran mit der krümelig gebratenen Bratwurst rösten und Muskat sowie Pfeffer erst mit Spinat und Kochsahne einrühren.',
    applicationIndex: 1,
    tip: 'Für eine kräftigere Bratwurstnote 1/2 TL mildes Paprikapulver zusammen mit der Zwiebel anrösten.'
  },
  'chicken-spinach-rice': {
    required: ['1/4 TL Muskat', '1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver beim Anbraten ans Hähnchen geben und Muskat sowie Pfeffer mit Spinat und Brühe einrühren, bevor der Reis folgt.',
    applicationIndex: 1,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian kurz vor Ende der Garzeit einrühren.'
  },
  'pesto-pea-pasta': {
    required: ['1/4 TL schwarzer Pfeffer', '1/2 TL getrocknetes Basilikum'],
    application: 'Pfeffer und getrocknetes Basilikum mit Pesto und Nudelwasser verrühren, ehe Nudeln und Erbsen darin geschwenkt werden.',
    applicationIndex: 2,
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken zusammen mit dem Pesto einrühren; milder bleibt die Pasta ohne Chili.'
  },
  'vegetable-egg-rice': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Knoblauchpulver beim Braten über Gemüse und Reis streuen und den Pfeffer mit der Sojasoße unter die gestockten Eier ziehen.',
    applicationIndex: 1,
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken beim Braten ergänzen; milder bleibt der Reis ohne Chili.'
  },
  'broccoli-potato-bake': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat, Salz und Pfeffer in die Kochsahne rühren und über vorgegarte Kartoffeln, weichen Brokkoli und Zwiebel gießen.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian vor dem Überbacken in die Sahne rühren.'
  },
  'lentil-bolognese': {
    required: ['1 TL italienische Kräuter', '1 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver bei Zwiebeln und Möhren kurz anrösten und italienische Kräuter sowie Pfeffer während des Linsenköchelns zugeben.',
    applicationIndex: 0,
    tip: 'Für mehr Tiefe 1/2 TL geräuchertes Paprikapulver zusammen mit den Zwiebeln kurz anrösten.'
  },
  'garlic-oil-spinach-pasta': {
    required: ['1/2 TL Chiliflocken', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Chiliflocken kurz im Knoblauchöl ziehen lassen und Salz sowie Pfeffer mit Spinat und Nudelwasser unter die Spaghetti schwenken.',
    applicationIndex: 1,
    tip: 'Für eine mildere Variante nur 1/4 TL Chiliflocken verwenden und 1/2 TL Oregano ergänzen.'
  },
  'veggie-coconut-curry': {
    required: ['1/2 TL Kurkuma', '1/2 TL Knoblauchpulver', '1/2 TL Salz'],
    application: 'Kurkuma und Knoblauchpulver vor der Kokosmilch kurz am weichen Gemüse anrösten und das Salz während der zehn Minuten Kochzeit einrühren.',
    applicationIndex: 2,
    tip: 'Für ein schärferes Curry 1/4 TL Chiliflocken ergänzen; für die milde Variante darauf verzichten.'
  },
  'potato-egg-skillet': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Salz auf die goldbraunen Kartoffelwürfel geben und den Pfeffer über die Eier streuen, bevor sie zugedeckt stocken.',
    applicationIndex: 2,
    tip: 'Für eine herzhafte Kartoffelnote 1/2 TL getrockneten Majoran kurz vor Ende der Bratzeit ergänzen.'
  },
  'spinach-feta-bake': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat und Pfeffer in Spinat und Kochsahne rühren und den Oregano vor dem Backen über Nudeln und Feta verteilen.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian vor dem Backen über den Feta streuen.'
  },
  'broccoli-cheese-pasta': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat, Salz und Pfeffer in die warme Milch rühren, bevor der Käse schmilzt und Nudeln sowie Brokkoli dazukommen.',
    applicationIndex: 2,
    tip: 'Für eine kräuterige Käsesoße 1/2 TL getrockneten Thymian zusammen mit der Milch einrühren.'
  },
  'pea-carrot-rice': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat und Pfeffer in Brühe, Erbsen und Möhren einrühren und mit dem Reis garen, bevor der Parmesan bindet.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknete Petersilie kurz vor dem Servieren unter den Reis heben.'
  },
  'oven-potato-herb-quark': {
    required: ['1 TL getrockneter Schnittlauch', '3/4 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Die Hälfte des Salzes vor dem Backen an die Kartoffeln geben; Schnittlauch, restliches Salz und Pfeffer in den Gurkenquark rühren.',
    applicationIndex: 0,
    tip: 'Für eine knoblauchige Quarkvariante 1/2 TL Knoblauchpulver gründlich unter den Kräuterquark rühren.'
  },
  'egg-noodle-stirfry': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    application: 'Knoblauchpulver über das weich gebratene Gemüse geben und den Pfeffer mit Nudeln und Sojasoße unter die gestockten Eier schwenken.',
    applicationIndex: 2,
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken beim Braten ergänzen; milder bleiben die Nudeln ohne Chili.'
  },
  'chicken-pesto-pasta': {
    required: ['1/2 TL schwarzer Pfeffer', '1/2 TL italienische Kräuter'],
    application: 'Den Pfeffer beim Bräunen ans Hähnchen geben und die italienischen Kräuter mit Pesto und Nudelwasser unter Pasta und Brokkoli mischen.',
    applicationIndex: 1,
    tip: 'Für eine zitronige Kräuternote 1/2 TL getrocknetes Basilikum zusammen mit dem Pesto einrühren.'
  },
  'pork-noodle-skillet': {
    required: ['1/2 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Pfeffer ans scharf angebratene Fleisch geben und den Thymian mit Knoblauch und Brühe kurz aufkochen.',
    applicationIndex: 2,
    tip: 'Für eine rauchige Fleischkruste 1/2 TL geräuchertes Paprikapulver beim scharfen Anbraten ergänzen.'
  },
  'spinach-tortellini': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat, Oregano und Pfeffer in Spinat und Kochsahne einrühren und die Tortellini darin kurz fertig ziehen lassen.',
    applicationIndex: 2,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknetes Basilikum erst kurz vor dem Servieren einrühren.'
  },
  'vegetable-noodle-bake': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat, Thymian, Salz und Pfeffer in die Kochsahne rühren und über Penne, Brokkoli und Erbsen gießen, bevor der Käse folgt.',
    applicationIndex: 2,
    tip: 'Für eine mediterrane Variante 1/2 TL getrockneten Oregano vor dem Backen in die Sahne rühren.'
  },
  'chicken-potato-pan': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Rosmarin', '3/4 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver, Rosmarin und die Hälfte des Salzes ans Hähnchen geben; restliches Salz und Pfeffer mit Kartoffeln und Zwiebel einbraten.',
    applicationIndex: 1,
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian beim Anbraten der Kartoffeln ergänzen.'
  },
  'spinach-rice-omelette': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat unter den weich gegarten Spinat rühren und den Pfeffer in die Eier schlagen, bevor die dünnen Omeletts gebraten werden.',
    applicationIndex: 1,
    tip: 'Für leicht pikante Omelettstreifen 1/4 TL Chiliflocken in die verquirlten Eier rühren.'
  },
  'paprika-cream-pasta': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Thymian mit Paprika und Zwiebel rösten; Salz und Pfeffer nach der Kochsahne vor dem Pürieren einrühren.',
    applicationIndex: 1,
    tip: 'Für eine rauchige Paprikasoße 1/2 TL geräuchertes Paprikapulver beim Anbraten ergänzen.'
  },
  'sausage-potato-skillet': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Majoran', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Majoran über Bratwurst und Kartoffeln geben, sobald sie gebräunt sind, und den Pfeffer zum Schluss an die frische Paprika geben.',
    applicationIndex: 3,
    tip: 'Für eine kräftigere Kartoffelnote 1/2 TL getrockneten Rosmarin kurz vor Ende der Bratzeit ergänzen.'
  },
  'roast-vegetable-couscous': {
    required: ['1 TL mildes Paprikapulver', '1 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Thymian mit Öl am Gemüse verteilen und vor dem Rösten aufs Blech geben; den Pfeffer danach in den Couscous rühren.',
    applicationIndex: 0,
    tip: 'Für eine orientalische Variante 1/2 TL gemahlenen Kreuzkümmel unter das Olivenöl rühren.'
  },
  'chicken-schnitzel-pasta': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrocknete Petersilie', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und Petersilie ins Paniermehl mischen, das Salz vor dem Panieren aufs Hähnchen geben und den Pfeffer zuletzt unter die Knoblauchnudeln ziehen.',
    applicationIndex: 1,
    tip: 'Für eine kräftigere Knoblauchnote 1/2 TL Knoblauchpulver unter das Paniermehl mischen.'
  },
  'broccoli-rice-bake': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Muskat, Salz und Pfeffer in die Kochsahne geben und die Mischung über vorgegarten Reis, weichen Brokkoli und Zwiebel gießen.',
    applicationIndex: 2,
    tip: 'Für eine mediterrane Käsekruste 1/2 TL getrockneten Oregano vor dem Backen darüberstreuen.'
  },
  'beef-potato-bowl': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Oregano', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    application: 'Paprikapulver und die Hälfte des Salzes an die Ofenkartoffeln geben; Oregano, restliches Salz und Pfeffer beim Bräunen ins Rinderhack rühren.',
    applicationIndex: 0,
    tip: 'Für eine Kebab-Note 1/2 TL gemahlenen Kreuzkümmel beim Anbraten des Hackfleischs ergänzen.'
  }
};

if (typeof window !== 'undefined') window.RECIPE_SEASONINGS = RECIPE_SEASONINGS;
if (typeof module !== 'undefined') module.exports = RECIPE_SEASONINGS;
