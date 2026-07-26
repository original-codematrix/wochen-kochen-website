
'use strict';
const DATA=window.KOCHBUCH_DATA;
const RECIPES=DATA.recipes, WEEKS=DATA.weeks;
const ICONS={'Nudeln':'🍝','Reis':'🍚','Rind':'🥩','Kartoffeln':'🥔','TK & Ofen':'🍗','Bowls':'🥙','Fleischklassiker':'🍳','Pfannengerichte':'🥘','Hackfleisch':'🧆','Aufläufe':'🫕'};
const STORE_KEY='feierabend-kochbuch-v3';
const defaults={week:0,favorites:[],checked:{},prep:{},prices:{},priceMeta:{source:'REWE-Richtwerte',updated:null},settings:{postalCode:'85386',marketId:'440303',endpoint:'/api/rewe-prices',refreshToken:'',excludedIngredients:''},dark:false};
let state=loadState(); let deferredInstall; let activePlan=null;
function loadState(){try{return {...defaults,...JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}}catch{return structuredClone(defaults)}}
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state))}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const byId=id=>RECIPES.find(r=>r.id===id);
const euro=n=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n)||0);
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),1800)}
function showView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===name+'View'));$$('.main-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='shopping')renderShopping();window.scrollTo({top:document.querySelector('.main-nav').offsetTop,behavior:'smooth'})}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));$$('[data-view-target]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.viewTarget)));
function uniqueWeekRecipes(){return [...new Set(WEEKS[state.week].days.map(d=>d[1]))].map(byId)}
function renderWeek(){const w=WEEKS[state.week];$('#weekTitle').textContent=w.name;$('#weekSubtitle').textContent=w.subtitle;$('#weekTabs').innerHTML=WEEKS.map((x,i)=>`<button class="${i===state.week?'active':''}" data-week="${i}">${x.name.replace('Woche ','')}</button>`).join('');$$('[data-week]').forEach(b=>b.onclick=()=>{state.week=+b.dataset.week;saveState();renderWeek();renderShopping()});$('#dayGrid').innerHTML=w.days.map(([day,id])=>{const r=byId(id);return `<article class="day-card"><span class="day-label">${day}</span><div class="dish-icon">${ICONS[r.cat]||'🍽️'}</div><h3>${r.name}</h3><p class="muted">${r.time} Min. · ${euro(r.cost/r.servings)} pro Portion</p><button class="text-btn" data-open="${r.id}">Rezept öffnen →</button></article>`}).join('');bindRecipeOpen();const u=uniqueWeekRecipes();$('#weekDishCount').textContent=u.length;$('#weekCost').textContent=euro(u.reduce((s,r)=>s+r.cost,0));$('#weekCookTime').textContent=u.reduce((s,r)=>s+r.time,0)+' Min.';updateProgress()}
function recipeCard(r){const fav=state.favorites.includes(r.id);return `<article class="recipe-card"><div class="recipe-cover"><span class="emoji">${ICONS[r.cat]||'🍽️'}</span><button class="favorite" data-fav="${r.id}" aria-label="Favorit">${fav?'♥':'♡'}</button></div><div class="recipe-body"><span class="eyebrow">${r.cat}</span><h3>${r.name}</h3><p>${r.desc}</p><div class="chips">${r.tags.map(t=>`<span class="chip">${t}</span>`).join('')}</div><div class="card-foot"><span>${r.time} Min. · ${euro(r.cost/r.servings)}</span><button class="text-btn" data-open="${r.id}">Öffnen</button></div></div></article>`}
function renderRecipes(){const q=$('#recipeSearch').value.trim().toLowerCase(),cat=$('#categoryFilter').value;let list=RECIPES.filter(r=>(cat==='all'||r.cat===cat)&&(!q||JSON.stringify(r).toLowerCase().includes(q))&&(!$('#favoritesOnly').checked||state.favorites.includes(r.id)));$('#recipeGrid').innerHTML=list.map(recipeCard).join('')||'<article class="info-card">Keine passenden Rezepte gefunden.</article>';bindRecipeOpen();$$('[data-fav]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.fav;state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];saveState();renderRecipes();toast('Favoriten aktualisiert')})}
function bindRecipeOpen(){$$('[data-open]').forEach(b=>b.onclick=()=>openRecipe(b.dataset.open))}
function openRecipe(id){const r=byId(id);$('#dialogContent').innerHTML=`<div class="dialog-inner"><span class="eyebrow">${r.cat}</span><h2>${r.name}</h2><p class="muted">${r.desc}</p><div class="stats-grid"><article><span>Zeit</span><strong>${r.time} Min.</strong></article><article><span>Preis / 4 Port.</span><strong>${euro(r.cost)}</strong></article><article><span>Kalorien</span><strong>${r.kcal} kcal</strong></article><article><span>Protein</span><strong>${r.protein} g</strong></article></div><div class="dialog-grid"><div><h3>Zutaten</h3><ul class="dialog-list">${r.ingredients.map(x=>`<li>${x}</li>`).join('')}</ul></div><div><h3>Zubereitung</h3><ol class="dialog-list">${r.steps.map(x=>`<li>${x}</li>`).join('')}</ol></div></div><div class="notice"><strong>Low-Carb-Variante:</strong> ${r.lowcarb}<br><strong>Einfrieren:</strong> ${r.freeze}<br><strong>Schwierigkeit:</strong> ${r.difficulty}</div></div>`;$('#recipeDialog').showModal()}
$('#closeDialog').onclick=()=>$('#recipeDialog').close();$('#recipeDialog').onclick=e=>{if(e.target===$('#recipeDialog'))$('#recipeDialog').close()};
function parseIngredient(raw){const m=raw.match(/^([\d.,]+)\s*(kg|g|ml|l|EL|TL|Stück|Dose|Dosen)?\s+(.+)$/i);if(!m)return {name:raw,qty:1,unit:'',raw};return {qty:parseFloat(m[1].replace(',','.')),unit:m[2]||'',name:m[3],raw}}
function department(name){const n=name.toLowerCase();if(/hähnchen|rind|hack|wings|nuggets|patties/.test(n))return 'Fleisch & Tiefkühl';if(/brokkoli|kartoff|zwiebel|knoblauch|gurke|salat|frühlings/.test(n))return 'Obst & Gemüse';if(/reis|nudel|penne|fusilli|rigatoni|brötchen/.test(n))return 'Nudeln, Reis & Beilagen';if(/soße|soja|hoisin|teriyaki|senf|honig|kokos|brühe|öl|gewürz/.test(n))return 'Soßen & Vorrat';return 'Sonstiges'}
function aggregateShopping(){const map=new Map();uniqueWeekRecipes().forEach(r=>r.ingredients.forEach(raw=>{const p=parseIngredient(raw);const key=p.name.toLowerCase();if(!map.has(key))map.set(key,{...p,count:0});map.get(key).count++}));return [...map.values()].sort((a,b)=>department(a.name).localeCompare(department(b.name))||a.name.localeCompare(b.name))}
function estimateItem(item){const prices={...DATA.priceCatalog,...state.prices};const key=Object.keys(prices).find(k=>item.name.toLowerCase().includes(k.toLowerCase())||k.toLowerCase().includes(item.name.toLowerCase()));return key?Number(prices[key]):null}
function updateProgress(){const items=aggregateShopping(),wk='week'+state.week,c=state.checked[wk]||{},done=items.filter(x=>c[department(x.name)+'-'+x.name]).length,p=items.length?Math.round(done/items.length*100):0;$('#weekProgress').textContent=p+' %'}
const fallbackPrep={title:'Meal-Prep-Vorlage',summary:'Sobald ein Angebotsplan geladen ist, wird diese Liste automatisch ersetzt.',steps:[{time:'0–15 Min.',title:'Grundlagen vorbereiten',instruction:'Reis oder Kartoffeln aufsetzen und den Backofen bei Bedarf vorheizen.'},{time:'15–35 Min.',title:'Gemüse & Protein',instruction:'Gemüse schneiden und Fleisch getrennt portionieren.'},{time:'35–50 Min.',title:'Portionieren & beschriften',instruction:'Behälter mit Gericht und Esstag beschriften.'}]};
function renderPrep(plan=activePlan){const prep=plan?.mealPrep||fallbackPrep;const revision=plan?.planRevision??'template';$('#prepTitle').textContent=prep.title||'Meal-Prep für euren Plan';$('#prepSummary').textContent=prep.summary||'';$('#prepTimeline').innerHTML=prep.steps.map((step,i)=>{const key=`${revision}-${i}`;return `<label class="prep-step"><span class="prep-time">${step.time}</span><span><strong>${step.title}</strong><small>${step.instruction}</small>${step.storage?`<span class="chip">${step.storage}</span>`:''}</span><input type="checkbox" data-prep="${key}" ${state.prep[key]?'checked':''}></label>`}).join('');$$('[data-prep]').forEach(x=>x.onchange=()=>{state.prep[x.dataset.prep]=x.checked;saveState()})}
function sourceStatusLabel(sources){return 'Wochenlauf: '+sources.map(source=>{const offers=source.offerCount?`${source.offerCount} Angebote${source.status==='browser-cached'?' (Chrome-Import)':''}`:source.status==='error'?'blockiert':'eingeschränkt';const regular=Number.isFinite(source.regularPriceCount)?` · ${source.regularPriceCount} Normalpreise`:'';return `${source.market} ${offers}${regular}`}).join(' · ')}
async function refreshPrices(){const status=$('#priceStatus');status.textContent='Quellenstatus wird geprüft …';try{const res=await fetch('/api/status');if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();state.priceMeta={source:sourceStatusLabel(data.sources||[]),updated:data.generatedAt||new Date().toISOString()};saveState();renderShopping();toast('Quellenstatus aktualisiert')}catch(e){state.priceMeta={source:'Wochenlauf nicht erreichbar – aktueller Sparplan bleibt unverändert',updated:new Date().toISOString()};saveState();renderShopping();toast('Wochenlauf nicht erreichbar')}}
function importJson(file,handler){const reader=new FileReader();reader.onload=()=>{try{handler(JSON.parse(reader.result));toast('Datei importiert')}catch{toast('Ungültige JSON-Datei')}};reader.readAsText(file)}
$('#refreshPrices').onclick=refreshPrices;
$('#copyShopping').onclick=async()=>{if(!activePlan){toast('Kein aktueller Sparplan geladen');return}try{await navigator.clipboard.writeText(shoppingClipboardText(activePlan));toast('Einkaufsliste kopiert')}catch{toast('Kopieren im lokalen Dateimodus blockiert')}};
$('#printShopping').onclick=()=>window.print();
$('#resetShopping').onclick=()=>{state.checked.plan={};saveState();renderPlanShoppingViews()};
$('#resetPrep').onclick=()=>{state.prep={};saveState();renderPrep()};
$('#themeToggle').onclick=()=>{state.dark=!state.dark;document.body.classList.toggle('dark',state.dark);saveState()};
function excludedIngredients(){return $('#dietaryExclusions').value.split(/[,;\n]/).map(value=>value.trim()).filter(Boolean)}
function planningBody(extra={}){return JSON.stringify({...extra,excludedIngredients:excludedIngredients()})}
$('#dietaryExclusions').onchange=()=>{state.settings.excludedIngredients=$('#dietaryExclusions').value.trim();saveState()};
$('#saveSettings').onclick=()=>{state.settings={postalCode:$('#postalCode').value.trim(),marketId:$('#marketId').value.trim(),endpoint:$('#priceEndpoint').value.trim(),refreshToken:$('#refreshToken').value.trim(),excludedIngredients:$('#dietaryExclusions').value.trim()};saveState();toast('Einstellungen gespeichert')};
$('#exportData').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='feierabend-kochbuch-daten.json';a.click()};$('#importData').onclick=()=>$('#dataFile').click();$('#dataFile').onchange=e=>importJson(e.target.files[0],d=>{state={...defaults,...d};saveState();location.reload()});$('#clearData').onclick=()=>{if(confirm('Alle lokalen Daten wirklich löschen?')){localStorage.removeItem(STORE_KEY);location.reload()}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#installBtn').hidden=false});$('#installBtn').onclick=async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#installBtn').hidden=true}};
function planDayCard(item){const r=byId(item.recipeId),name=r?.name||item.name||'Gericht';return `<article class="plan-day"><span class="day-label">${item.day}</span><div><h4>${name}</h4><p>${item.reason}</p></div>${r?`<button class="text-btn" data-open="${r.id}">Rezept →</button>`:''}</article>`}
function sourceVisual(source){if(source.status==='current')return {className:'ok',label:'● aktuell'};if(source.status==='browser-cached')return {className:'ok',label:'● Chrome-Import'};if(source.status==='error')return {className:'error',label:'× blockiert'};return {className:'limited',label:'◐ eingeschränkt'}}
function priceTypeLabel(item){if(item.status==='regular')return 'Normalpreis · öffentlich geprüft';if(item.status==='stale-regular')return `Normalpreis · zuletzt gesehen${item.capturedAt?' '+new Date(item.capturedAt).toLocaleDateString('de-DE'):''}`;if(item.status==='app-offer')return 'App-Angebot';if(item.status==='offer')return 'Angebot';if(item.status==='estimated')return 'geschätzt';return item.status==='pantry'?'Vorrat':'Preis offen'}
function shoppingItemId(group,item){return group.department+'-'+item.name}
function planShoppingItems(plan){return (plan?.shopping||[]).flatMap(group=>group.items.map(item=>({group,item,id:shoppingItemId(group,item)})))}
function shoppingItemMarkup(group,item){
  const id=shoppingItemId(group,item),checked=!!state.checked.plan[id];
  const priceLabel=item.status==='pantry'?'Vorrat':item.price!=null?euro(item.price):'Preis offen';
  const reference=item.regularPrice!=null?`<small class="reference-price">statt ${euro(item.regularPrice)} · spart ${euro(item.savings)}</small>`:'';
  return `<label class="shopping-item ${checked?'done':''}"><input type="checkbox" data-current-shop="${encodeURIComponent(id)}" ${checked?'checked':''}><span>${item.name}<small>${item.quantity} · ${item.note}</small></span><span class="price-tag ${item.status}">${priceLabel}<small class="price-type">${priceTypeLabel(item)}</small>${reference}</span></label>`;
}
function renderPlanShoppingInto(selector,plan){
  $(selector).innerHTML=plan.shopping.map(group=>`<section class="shopping-group"><h3>${group.department}</h3>${group.items.map(item=>shoppingItemMarkup(group,item)).join('')}</section>`).join('');
}
function renderPlanShoppingViews(){
  state.checked.plan=state.checked.plan||{};
  if(!activePlan){
    $('#planShoppingGroups').innerHTML='<article class="info-card">Aktueller Sparplan ist nicht verfügbar.</article>';
    $('#shoppingGroups').innerHTML='<article class="info-card">Aktueller Sparplan ist nicht verfügbar.</article>';
    $('#shoppingWeekLabel').textContent='–';
    $('#shoppingTotal').textContent='–';
    $('#shoppingDone').textContent='0 / 0';
    return;
  }
  renderPlanShoppingInto('#planShoppingGroups',activePlan);
  renderPlanShoppingInto('#shoppingGroups',activePlan);
  const items=planShoppingItems(activePlan);
  const done=items.filter(entry=>state.checked.plan[entry.id]).length;
  $('#shoppingWeekLabel').textContent=activePlan.recommendation.market;
  $('#shoppingTotal').textContent=euro(activePlan.recommendation.estimatedTotal);
  $('#shoppingDone').textContent=`${done} / ${items.length}`;
  $$('[data-current-shop]').forEach(el=>el.onchange=()=>{
    state.checked.plan[decodeURIComponent(el.dataset.currentShop)]=el.checked;
    saveState();
    renderPlanShoppingViews();
  });
}
function renderShopping(){
  renderPlanShoppingViews();
  const meta=state.priceMeta;
  $('#priceStatus').className='status '+(activePlan?'success':'');
  $('#priceStatus').textContent=activePlan?`Preisquelle: ${meta.source}${meta.updated?' · aktualisiert '+new Date(meta.updated).toLocaleString('de-DE'):''}`:'Aktueller Sparplan ist nicht verfügbar.';
}
function shoppingClipboardText(plan){
  return planShoppingItems(plan).map(({item})=>{
    const price=item.status==='pantry'?'Vorrat':item.price!=null?euro(item.price):'Preis offen';
    return `☐ ${item.quantity} ${item.name} – ${item.note} – ${price} (${priceTypeLabel(item)})`;
  }).join('\n');
}
function renderCurrentPlan(plan){
  activePlan=plan;
  const savedExclusions=(plan.preferences?.excludedIngredients||[]).join(', ');
  $('#dietaryExclusions').value=savedExclusions;
  state.settings.excludedIngredients=savedExclusions;
  $('#planNotice').textContent=plan.notice||`Erstellt ${new Date(plan.generatedAt).toLocaleString('de-DE')}`;
  $('#sourceStatus').innerHTML=(plan.sources||[]).map(source=>{
    const visual=sourceVisual(source);
    const regular=Number.isFinite(source.regularPriceCount)?` · ${source.regularPriceCount} benötigte Normalpreise`:'';
    return `<a class="source-card ${visual.className}" href="${source.url}" target="_blank" rel="noreferrer"><span>${visual.label}</span><strong>${source.market}</strong><small>gültig bis ${new Date(source.validUntil+'T12:00:00').toLocaleDateString('de-DE')} · ${source.coverage}${regular}</small></a>`
  }).join('');
  const rec=plan.recommendation;
  const comparison=rec.publishedNormalPriceTotal>0?`<br>${euro(rec.publishedSavings)} Ersparnis bei ${rec.normalPriceCoverage}% preislich vergleichbaren Angebotspositionen`:'';
  const checkedRegular=Number(rec.confirmedRegularTotal)||0;
  $('#marketRecommendation').innerHTML=`<div><span class="eyebrow">HEUTIGE EMPFEHLUNG</span><h3>${rec.market}</h3><p>${rec.summary}</p><small>${rec.qualityNote}</small></div><div class="recommendation-price"><strong>${euro(rec.estimatedTotal)}</strong><span>davon ${euro(rec.confirmedOfferTotal)} bestätigte Angebote<br>${euro(checkedRegular)} öffentlich geprüfte Normalpreise<br>${euro(rec.estimatedNormalPriceTotal)} noch geschätzt${comparison}</span></div>`;
  $('#weekendPlan').innerHTML=plan.weekend.map(planDayCard).join('');
  $('#nextWeekPlan').innerHTML=plan.nextWeek.map(planDayCard).join('');
  state.priceMeta={source:sourceStatusLabel(plan.sources||[]),updated:plan.generatedAt};
  saveState();
  renderShopping();
  renderPrep(plan);
  bindRecipeOpen()
}
async function loadCurrentPlan(){try{let response=await fetch('/api/current-plan');if(!response.ok)throw new Error();renderCurrentPlan(await response.json())}catch{try{const response=await fetch('./server/current-plan.json');renderCurrentPlan(await response.json())}catch{$('#planNotice').textContent='Sparplan konnte nicht geladen werden.'}}}
$('#runWeeklyPlan').onclick=async()=>{const button=$('#runWeeklyPlan');button.disabled=true;button.textContent='Angebote werden geprüft …';try{const response=await fetch('/api/refresh',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:planningBody()});const result=await response.json();if(!response.ok)throw new Error(result.error||'Aktualisierung fehlgeschlagen');renderCurrentPlan(result);toast('Sparplan aktualisiert')}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Angebote neu laden'}};
$('#rerollPlan').onclick=async()=>{const button=$('#rerollPlan');button.disabled=true;button.textContent='Würfelt …';try{const response=await fetch('/api/regenerate',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:planningBody()});const result=await response.json();if(!response.ok)throw new Error(result.error||'Neuberechnung fehlgeschlagen');renderCurrentPlan(result);toast('Neue Rezepte mit euren Vorgaben ausgewählt')}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Rezepte neu würfeln'}};
$('#applyExclusions').onclick=()=>$('#rerollPlan').click();
let retailerImportMarket='';
function authHeaders(extra={}){const headers={...extra};if(state.settings.refreshToken)headers.authorization='Bearer '+state.settings.refreshToken;return headers}
function chooseRetailerHtml(market){retailerImportMarket=market;$('#retailerHtmlFile').value='';$('#retailerHtmlFile').click()}
$('#importReweHtml').onclick=()=>chooseRetailerHtml('REWE Eching');
$('#importEdekaHtml').onclick=()=>chooseRetailerHtml('EDEKA Morsestraße');
$('#importKauflandHtml').onclick=()=>chooseRetailerHtml('Kaufland Lohhof');
$('#retailerHtmlFile').onchange=async event=>{const file=event.target.files[0];if(!file||!retailerImportMarket)return;const buttons=[$('#importReweHtml'),$('#importEdekaHtml'),$('#importKauflandHtml')];buttons.forEach(button=>button.disabled=true);$('#planNotice').textContent=`${retailerImportMarket}: gespeicherte Chrome-Seite wird ausgewertet und der Plan neu berechnet …`;try{const response=await fetch('/api/import-offers',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:planningBody({market:retailerImportMarket,html:await file.text()})});const imported=await response.json();if(!response.ok)throw new Error(imported.error||'Import fehlgeschlagen');if(!imported.plan)throw new Error('Server hat keinen neuen Sparplan geliefert');renderCurrentPlan(imported.plan);toast(`${imported.count} Angebote übernommen und neu geplant`)}catch(error){$('#planNotice').textContent=`Import fehlgeschlagen: ${error.message}`;toast(error.message)}finally{buttons.forEach(button=>button.disabled=false);event.target.value='';retailerImportMarket=''}};
function init(){document.body.classList.toggle('dark',state.dark);$('#heroRecipeCount').textContent=RECIPES.length;$('#postalCode').value=state.settings.postalCode;$('#marketId').value=state.settings.marketId;$('#priceEndpoint').value=state.settings.endpoint;$('#refreshToken').value=state.settings.refreshToken||'';$('#dietaryExclusions').value=state.settings.excludedIngredients||'';const cats=[...new Set(RECIPES.map(r=>r.cat))].sort();$('#categoryFilter').innerHTML+cats.map(c=>`<option value="${c}">${c}</option>`).join('');$('#recipeSearch').oninput=renderRecipes;$('#categoryFilter').onchange=renderRecipes;$('#favoritesOnly').onchange=renderRecipes;renderWeek();renderRecipes();renderShopping();renderPrep();loadCurrentPlan();if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js')}
init();
