const RECIPE_SEASONINGS = {
  'garlic-pasta': {
    required: ['1 TL mildes Paprikapulver', '3/4 TL Salz', '1/2 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1 TL italienische Kräuter ergänzen; rauchiger wird es mit 1/2 TL geräuchertem Paprikapulver.'
  },
  teriyaki: {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken ergänzen; milder bleibt das Gericht ohne Chili.'
  },
  gyros: {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräftigere Kräuternote 1/2 TL getrockneten Thymian zusätzlich unter die Marinade rühren.'
  },
  nuggets: {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL Knoblauchpulver'],
    tip: 'Für rauchige Kartoffeln 1/2 TL geräuchertes Paprikapulver vor dem Backen über die Pommes geben.'
  },
  cajun: {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken ergänzen; für eine mildere Pfanne die Chiliflocken weglassen.'
  },
  'honey-soy': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine warme Ingwernote 1/2 TL gemahlenen Ingwer zusammen mit Honig und Sojasoße einrühren.'
  },
  pizza: {
    required: ['1 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknetes Basilikum nach dem Backen über die Pizza streuen.'
  },
  'beef-onion': {
    required: ['1/2 TL schwarzer Pfeffer', '1/2 TL getrockneter Thymian'],
    tip: 'Für eine herzhaftere Soße 1/2 TL mildes Paprikapulver beim Anbraten der Zwiebeln ergänzen.'
  },
  'coconut-curry': {
    required: ['1/2 TL Kurkuma', '1/2 TL Knoblauchpulver', '1/2 TL Salz'],
    tip: 'Für mehr Wärme 1/4 TL Chiliflocken ergänzen; für ein milderes Curry die Chiliflocken weglassen.'
  },
  'bbq-pasta': {
    required: ['1/2 TL geräuchertes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken mit der BBQ-Soße einrühren; milder gelingt es ohne Chili.'
  },
  burger: {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für würzigere Kartoffeln 1/2 TL Knoblauchpulver vor dem Backen gleichmäßig über die Pommes geben.'
  },
  'sheet-pan': {
    required: ['1 TL mildes Paprikapulver', '1 TL getrockneter Rosmarin', '3/4 TL Salz', '1/2 TL schwarzer Pfeffer'],
    tip: 'Für eine mediterrane Variante 1/2 TL getrockneten Thymian zusätzlich mit dem Öl verrühren.'
  },
  'sweet-chili': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken in die Soße rühren; für die milde Variante darauf verzichten.'
  },
  'hoisin-noodles': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    tip: 'Für eine warme Würze 1/2 TL gemahlenen Ingwer zusammen mit Hoisin und Sojasoße einrühren.'
  },
  wings: {
    required: ['1 TL geräuchertes Paprikapulver', '1/2 TL Knoblauchpulver'],
    tip: 'Für pikante Wings 1/4 TL Chiliflocken mit der BBQ-Soße verrühren; milder bleiben sie ohne Chili.'
  },
  'beef-pasta': {
    required: ['1 TL italienische Kräuter', '1/2 TL schwarzer Pfeffer'],
    tip: 'Für mehr Tiefe 1/2 TL geräuchertes Paprikapulver kurz mit dem Hackfleisch anrösten.'
  },
  'mustard-chicken': {
    required: ['1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräuterige Senfsoße 1/2 TL getrockneten Rosmarin fein zerreiben und mitköcheln.'
  },
  'lemon-garlic': {
    required: ['1/2 TL getrockneter Thymian', '1/2 TL schwarzer Pfeffer'],
    tip: 'Für mehr Zitronenkräuter-Aroma 1/2 TL getrockneten Oregano kurz vor dem Servieren ergänzen.'
  },
  'pepper-beef': {
    required: ['1 TL grob gemahlener schwarzer Pfeffer', '1/2 TL getrockneter Thymian'],
    tip: 'Für eine mildere Pfeffernote nur 1/2 TL Pfeffer verwenden und dafür 1/2 TL Paprikapulver ergänzen.'
  },
  'garlic-rice': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken beim Anbraten ergänzen; milder bleibt die Pfanne ohne Chili.'
  },
  'kebab-bowl': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräftigere Kebab-Würzung 1/2 TL gemahlenen Kreuzkümmel in die Hähnchenmarinade geben.'
  },
  'crispy-chicken': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine rauchige Panade 1/2 TL geräuchertes Paprikapulver unter das Paniermehl mischen.'
  },
  'soy-sesame': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für frische Schärfe 1/2 TL gemahlenen Ingwer mit der Sojasoße verrühren; milder geht es ohne Ingwer.'
  },
  'curry-noodles': {
    required: ['1/2 TL Kurkuma', '1/2 TL Knoblauchpulver', '1/2 TL Salz'],
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken ergänzen; für eine sanfte Kokossoße das Chili weglassen.'
  },
  'bbq-tray': {
    required: ['1 TL geräuchertes Paprikapulver', '1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Rosmarin mit Öl und BBQ-Soße verrühren.'
  },
  'beef-rice': {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine rauchige Pfanne 1/2 TL geräuchertes Paprikapulver zusammen mit dem Hackfleisch anrösten.'
  },
  'garlic-parmesan': {
    required: ['1/2 TL schwarzer Pfeffer', '1/2 TL italienische Kräuter'],
    tip: 'Für mehr Kräuterfrische 1/2 TL getrocknetes Basilikum erst kurz vor dem Servieren ergänzen.'
  },
  'oven-pizza': {
    required: ['1 TL getrockneter Oregano', '1/2 TL mildes Paprikapulver'],
    tip: 'Für eine schärfere Pizza 1/4 TL Chiliflocken nach dem Backen darüberstreuen; milder bleibt sie ohne.'
  },
  'mustard-pasta': {
    required: ['1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine wärmere Senfnote 1/2 TL mildes Paprikapulver beim Anbraten des Hähnchens ergänzen.'
  },
  'crispy-wrap': {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für rauchige Wraps 1/2 TL geräuchertes Paprikapulver in die Knoblauch- oder BBQ-Soße rühren.'
  },
  'garlic-beef-noodles': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    tip: 'Für eine warme Asia-Note 1/2 TL gemahlenen Ingwer zusammen mit Sojasoße und Hoisin einrühren.'
  },
  'chicken-rice-bake': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian vor dem Backen unter die Brühe rühren.'
  },
  'hoisin-rice': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    tip: 'Für eine frische Ingwernote 1/2 TL gemahlenen Ingwer beim Anbraten des Hähnchens ergänzen.'
  },
  'frosta-evening': {
    required: ['1/4 TL schwarzer Pfeffer', '1/2 TL getrocknete Petersilie'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknetes Basilikum erst nach dem Erhitzen unter die Pfanne rühren.'
  },
  'mexico-pork': {
    required: ['1/2 TL geräuchertes Paprikapulver', '1/2 TL Knoblauchpulver'],
    tip: 'Für zusätzliche Schärfe 1/4 TL Chiliflocken über die Kartoffeln geben; milder bleiben sie ohne Chili.'
  },
  'spinach-pasta': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL italienische Kräuter kurz vor dem Servieren in die Soße rühren.'
  },
  'spinach-potatoes-eggs': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine würzigere Eierschicht 1/2 TL mildes Paprikapulver über die fertigen Spiegeleier streuen.'
  },
  'leberkaese-eggs': {
    required: ['1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für herzhaftere Bratkartoffeln 1/2 TL getrockneten Majoran kurz vor Ende der Bratzeit ergänzen.'
  },
  'leberkaese-spinach': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine wärmere Kartoffelnote 1/2 TL mildes Paprikapulver unter den fertigen Stampf rühren.'
  },
  'ham-cream-pasta': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian kurz vor dem Servieren in die Sahnesoße rühren.'
  },
  'spinach-gnocchi': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine italienische Note 1/2 TL getrockneten Oregano zusammen mit dem Frischkäse einrühren.'
  },
  'schnitzel-potatoes': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräuterige Panade 1/2 TL getrocknete Petersilie unter das Paniermehl mischen.'
  },
  'meatballs-cream': {
    required: ['1/2 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine warme Rahmsoße 1/4 TL Muskat erst am Ende der Kochzeit vorsichtig einrühren.'
  },
  'pork-tenderloin-pasta': {
    required: ['1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Rosmarin fein zerreiben und beim Anbraten ergänzen.'
  },
  'chicken-spinach-lasagna': {
    required: ['1/4 TL Muskat', '1 TL italienische Kräuter', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräftigere Kräuterschicht 1/2 TL getrockneten Oregano über die Béchamelsoße streuen.'
  },
  'potato-mince-bake': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine rauchige Hackschicht 1/2 TL geräuchertes Paprikapulver beim Anbraten ergänzen.'
  },
  kaesespaetzle: {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine herzhafte Zwiebelnote 1/2 TL getrockneten Majoran kurz unter die Röstzwiebeln mischen.'
  },
  'paprika-cream-pork': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine rauchigere Soße 1/2 TL geräuchertes Paprikapulver zusammen mit der Paprika anrösten.'
  },
  'beef-fried-noodles': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL Chiliflocken'],
    tip: 'Für eine wärmere Würze 1/2 TL gemahlenen Ingwer beim scharfen Anbraten des Rindfleischs ergänzen.'
  },
  'sausage-spinach-pasta': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Majoran', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräftigere Bratwurstnote 1/2 TL mildes Paprikapulver zusammen mit der Zwiebel anrösten.'
  },
  'chicken-spinach-rice': {
    required: ['1/4 TL Muskat', '1/2 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian kurz vor Ende der Garzeit einrühren.'
  },
  'pesto-pea-pasta': {
    required: ['1/4 TL schwarzer Pfeffer', '1/2 TL getrocknetes Basilikum'],
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken zusammen mit dem Pesto einrühren; milder bleibt die Pasta ohne Chili.'
  },
  'vegetable-egg-rice': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für leichte Schärfe 1/4 TL Chiliflocken beim Braten ergänzen; milder bleibt der Reis ohne Chili.'
  },
  'broccoli-potato-bake': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian vor dem Überbacken in die Sahne rühren.'
  },
  'lentil-bolognese': {
    required: ['1 TL italienische Kräuter', '1 TL mildes Paprikapulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Tiefe 1/2 TL geräuchertes Paprikapulver zusammen mit den Zwiebeln kurz anrösten.'
  },
  'garlic-oil-spinach-pasta': {
    required: ['1/2 TL Chiliflocken', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine mildere Variante nur 1/4 TL Chiliflocken verwenden und 1/2 TL Oregano ergänzen.'
  },
  'veggie-coconut-curry': {
    required: ['1/2 TL Kurkuma', '1/2 TL Knoblauchpulver', '1/2 TL Salz'],
    tip: 'Für ein schärferes Curry 1/4 TL Chiliflocken ergänzen; für die milde Variante darauf verzichten.'
  },
  'potato-egg-skillet': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine herzhafte Kartoffelnote 1/2 TL getrockneten Majoran kurz vor Ende der Bratzeit ergänzen.'
  },
  'spinach-feta-bake': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian vor dem Backen über den Feta streuen.'
  },
  'broccoli-cheese-pasta': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräuterige Käsesoße 1/2 TL getrockneten Thymian zusammen mit der Milch einrühren.'
  },
  'pea-carrot-rice': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknete Petersilie kurz vor dem Servieren unter den Reis heben.'
  },
  'oven-potato-herb-quark': {
    required: ['1 TL getrockneter Schnittlauch', '3/4 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine knoblauchige Quarkvariante 1/2 TL Knoblauchpulver gründlich unter den Kräuterquark rühren.'
  },
  'egg-noodle-stirfry': {
    required: ['1/2 TL Knoblauchpulver', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Schärfe 1/4 TL Chiliflocken beim Braten ergänzen; milder bleiben die Nudeln ohne Chili.'
  },
  'chicken-pesto-pasta': {
    required: ['1/2 TL schwarzer Pfeffer', '1/2 TL italienische Kräuter'],
    tip: 'Für eine zitronige Kräuternote 1/2 TL getrocknetes Basilikum zusammen mit dem Pesto einrühren.'
  },
  'pork-noodle-skillet': {
    required: ['1/2 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine rauchige Fleischkruste 1/2 TL geräuchertes Paprikapulver beim scharfen Anbraten ergänzen.'
  },
  'spinach-tortellini': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Oregano', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrocknetes Basilikum erst kurz vor dem Servieren einrühren.'
  },
  'vegetable-noodle-bake': {
    required: ['1/4 TL Muskat', '1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine mediterrane Variante 1/2 TL getrockneten Oregano vor dem Backen in die Sahne rühren.'
  },
  'chicken-potato-pan': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Rosmarin', '3/4 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für mehr Kräuteraroma 1/2 TL getrockneten Thymian beim Anbraten der Kartoffeln ergänzen.'
  },
  'spinach-rice-omelette': {
    required: ['1/4 TL Muskat', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für leicht pikante Omelettstreifen 1/4 TL Chiliflocken in die verquirlten Eier rühren.'
  },
  'paprika-cream-pasta': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Thymian', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine rauchige Paprikasoße 1/2 TL geräuchertes Paprikapulver beim Anbraten ergänzen.'
  },
  'sausage-potato-skillet': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Majoran', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräftigere Kartoffelnote 1/2 TL getrockneten Rosmarin kurz vor Ende der Bratzeit ergänzen.'
  },
  'roast-vegetable-couscous': {
    required: ['1 TL mildes Paprikapulver', '1 TL getrockneter Thymian', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine orientalische Variante 1/2 TL gemahlenen Kreuzkümmel unter das Olivenöl rühren.'
  },
  'chicken-schnitzel-pasta': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrocknete Petersilie', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine kräftigere Knoblauchnote 1/2 TL Knoblauchpulver unter das Paniermehl mischen.'
  },
  'broccoli-rice-bake': {
    required: ['1/4 TL Muskat', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine mediterrane Käsekruste 1/2 TL getrockneten Oregano vor dem Backen darüberstreuen.'
  },
  'beef-potato-bowl': {
    required: ['1 TL mildes Paprikapulver', '1/2 TL getrockneter Oregano', '1/2 TL Salz', '1/4 TL schwarzer Pfeffer'],
    tip: 'Für eine Kebab-Note 1/2 TL gemahlenen Kreuzkümmel beim Anbraten des Hackfleischs ergänzen.'
  }
};

if (typeof window !== 'undefined') window.RECIPE_SEASONINGS = RECIPE_SEASONINGS;
if (typeof module !== 'undefined') module.exports = RECIPE_SEASONINGS;
