const APP_VERSION = '1.4.0';
const MASTER_URL = 'data/assessment_master_v1.json';
const LIKERT = ['لا أوافق بشدة','لا أوافق','محايد','أوافق','أوافق بشدة'];
const STORAGE_KEY = 'assessment_trainer_state_v2';
const LEGACY_STORAGE_KEYS = ['assessment_trainer_state_v1_1','assessment_trainer_state_v1'];
const SETTINGS_KEY = 'assessment_trainer_settings_v2';
const MODULES = ['gcat','pq10','derailers','leadership'];
const RATING_LABELS = {1:'غير فعال إطلاقًا',2:'غير فعال',3:'فعال إلى حد ما',4:'فعال',5:'فعال جدًا'};
const CRITERION_AR = {
  acquiring_information:'جمع المعلومات', generating_ideas:'توليد الأفكار', proactivity:'المبادرة',
  continuous_improvement:'التحسين المستمر', emotional_awareness:'الوعي العاطفي', teamwork:'روح الفريق',
  confidence:'الثقة', leadership_presence:'الحضور القيادي والتأثير'
};

function emptySaved(){return {responses:{},results:{},fullResults:{},history:[],favorites:[],sessionMeta:{},reviewItems:{}};}
function loadSettings(){
  try{return {theme:'light',fontSize:'medium',timerVisible:true,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}
  catch{return {theme:'light',fontSize:'medium',timerVisible:true}}
}
function loadSaved(){
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{}
  if(!raw){
    for(const key of LEGACY_STORAGE_KEYS){
      try{raw=JSON.parse(localStorage.getItem(key)||'null');if(raw)break}catch{}
    }
  }
  const base=emptySaved(); raw=raw||{};
  return {...base,...raw,responses:raw.responses||{},results:raw.results||{},fullResults:raw.fullResults||{},history:Array.isArray(raw.history)?raw.history:[],favorites:Array.isArray(raw.favorites)?raw.favorites:[],sessionMeta:raw.sessionMeta||{},reviewItems:raw.reviewItems||{}};
}
const state = {
  master:null,banks:{},ui:{view:'home',simId:null,module:null,mode:null},session:null,
  saved:loadSaved(),settings:loadSettings()
};

function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state.saved));}
function persistSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings));}
function applySettings(){
  document.body.classList.toggle('dark',state.settings.theme==='dark');
  document.body.classList.toggle('font-small',state.settings.fontSize==='small');
  document.body.classList.toggle('font-large',state.settings.fontSize==='large');
}
function scopeKey(mid,module,responseScope){return `${mid}|${module}|${responseScope}`;}
function responseScopeFor(mode,fullRun){return fullRun?'full_exam':mode;}
function timerDurationMs(module,mode){if(mode!=='exam')return null;if(module==='gcat')return 20*60*1000;if(module==='leadership')return 45*60*1000;return null;}
function esc(v=''){return String(v).replace(/[&<>'"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s]));}
function el(id){return document.getElementById(id)}
function toast(msg){const t=el('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function updateMobileNav(){
  const nav=el('mobileNav');if(!nav)return;
  document.body.classList.toggle('session-active',!!state.session);
  const view=state.ui?.view||'home';
  const active=view==='results'?'results-home':view==='mistakes'?'mistakes-home':(view==='review'||view==='favorites'||view==='review-result')?'review-home':'home';
  if(typeof nav.querySelectorAll!=='function')return;
  nav.querySelectorAll('[data-action]').forEach(btn=>{const on=btn.dataset.action===active;btn.classList.toggle('active',on);if(on)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current')});
}
function setTitle(t){const n=el('pageTitle');if(n)n.textContent=t;updateMobileNav()}
function percent(n,d){return d?Math.round(n/d*100):0}
function moduleName(m){return ({gcat:'GCAT',numerical:'عددي',verbal:'لفظي',abstract:'تجريدي',pq10:'PQ10',derailers:'السلوكيات المعطلة',leadership:'الحكم القيادي'})[m]||m}
function modeName(scope){return scope==='exam'?'اختبار':scope==='training'?'تدريب':scope==='full_exam'?'محاكاة شاملة':'مراجعة'}
function formatDate(iso){try{return new Intl.DateTimeFormat('ar-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso))}catch{return iso||''}}

async function loadJSON(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`تعذر تحميل ${url}`);return r.json();}
async function loadVerifiedJSON(url,expectedHash){
  const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`تعذر تحميل ${url}`);
  const buf=await r.arrayBuffer();if(!globalThis.crypto?.subtle)throw new Error('المتصفح لا يدعم فحص سلامة ملفات البيانات SHA-256.');
  const digest=await crypto.subtle.digest('SHA-256',buf);const actual=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(expectedHash&&actual!==expectedHash)throw new Error(`فشل فحص سلامة ملف البيانات: ${url}`);
  return JSON.parse(new TextDecoder('utf-8').decode(buf));
}
async function boot(){
  applySettings();
  try{
    state.master=await loadJSON(MASTER_URL);
    const loaded=await Promise.all(Object.entries(state.master.bank_registry).map(async([k,spec])=>[k,await loadVerifiedJSON('data/'+spec.filename,spec.sha256)]));
    state.banks=Object.fromEntries(loaded);validateRuntime();persist();renderHome();
    if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }catch(e){el('main').innerHTML=`<div class="error-box"><strong>تعذر تشغيل التطبيق.</strong><p>${esc(e.message)}</p><p class="small">شغّل المجلد عبر خادم محلي أو استضافة HTTPS، ولا تفتح index.html مباشرة عبر file://.</p></div>`;}
}
function validateRuntime(){
  if(!state.master||state.master.status!=='READY_FOR_APPLICATION_BUILD')throw new Error('ملف الـMaster غير جاهز للبناء.');
  if(state.master.simulations.length!==7)throw new Error('عدد المحاكاة في الـMaster ليس 7.');
  for(const sim of state.master.simulations){const b=sim.binding;if(b.gcat.numerical.item_count!==14||b.gcat.verbal.item_count!==14||b.gcat.abstract.item_count!==14)throw new Error(`خلل GCAT في ${sim.master_simulation_id}`);if(b.pq10.item_count!==144||b.derailers.item_count!==60||b.leadership.item_count!==16)throw new Error(`خلل في مكونات ${sim.master_simulation_id}`)}
}

function resultScopes(mid,module){const b=state.saved.results?.[mid]?.[module];if(!b)return{};if(b.score!==undefined||b.alignment!==undefined||b.accuracy!==undefined)return{[b.responseScope||b.mode||'training']:b};return b;}
function latestModuleResult(mid,module,preferred='exam'){const s=resultScopes(mid,module);return s[preferred]||s.exam||s.training||Object.values(s)[0]||state.saved.fullResults?.[mid]?.[module]||null;}
function simProgress(mid){let done=0;for(const m of MODULES)if(latestModuleResult(mid,m))done++;return{done,total:4,pct:done*25};}
function trainingReadiness(){
  let completed=0;for(const sim of state.master?.simulations||[])for(const m of MODULES)if(resultScopes(sim.master_simulation_id,m).exam||state.saved.fullResults?.[sim.master_simulation_id]?.[m])completed++;
  const coverage=percent(completed,28);const issues=Object.values(state.saved.reviewItems||{});const unresolved=issues.filter(x=>!x.resolved).length;const resolved=issues.filter(x=>x.resolved).length;const reviewClosure=issues.length?percent(resolved,issues.length):100;
  return {score:Math.round(coverage*.7+reviewClosure*.3),coverage,reviewClosure,completed,unresolved};
}
function resultHeadline(module,r){if(module==='gcat')return`${r.score}%`;if(module==='pq10')return`${r.alignment}% توافق`;if(module==='derailers')return`${r.safety}% توافق آمن`;if(module==='leadership')return`${r.accuracy}% دقة الحكم`;return'';}
function resultInterpretation(module){
  if(module==='gcat')return 'النتيجة تمثل نسبة الإجابات الصحيحة، مع عرض الأداء في العددي واللفظي والتجريدي كلٌّ على حدة.';
  if(module==='pq10')return 'درجة التوافق تقيس قرب إجاباتك من الشخصية القيادية المستهدفة في هذا البنك التدريبي، وليست تشخيصًا للشخصية أو درجة معيارية.';
  if(module==='derailers')return 'مؤشر التوافق الآمن يعبّر عن قرب إجاباتك من السلوك المتزن المقابل للسلوكيات المعطلة؛ ويعرض مؤشر الخطر بصورة عكسية للتدريب فقط.';
  if(module==='leadership')return 'دقة الحكم تقارن تقييمك لكل تصرف بالمفتاح التدريبي 1–5، وتوضح مواضع المبالغة أو التقليل في التقييم.';
  return 'هذه نتيجة تدريبية مبنية على المفتاح الداخلي للبنك.';
}

function moduleLaunchLabel(mid,module,scope){
  const base=scope==='training'?'التدريب':'الاختبار';
  const meta=state.saved.sessionMeta?.[scopeKey(mid,module,scope)];
  if(meta?.status==='active')return `متابعة ${base}`;
  if(resultScopes(mid,module)?.[scope])return `عرض نتيجة ${base}`;
  return scope==='training'?'تدريب':'اختبار';
}
function fullRunStatus(mid){
  const finished=MODULES.filter(m=>!!state.saved.fullResults?.[mid]?.[m]).length;
  let started=finished>0;
  if(!started){for(const m of MODULES){if(Object.keys(state.saved.responses?.[mid]?.[m]?.full_exam||{}).length){started=true;break;}const meta=state.saved.sessionMeta?.[scopeKey(mid,m,'full_exam')];if(meta?.status==='active'){started=true;break;}}}
  return {finished,started,done:finished===MODULES.length};
}
function fullRunLabel(mid){const st=fullRunStatus(mid);return st.done?'عرض النتيجة الشاملة':st.started?'متابعة المحاكاة الشاملة':'بدء المحاكاة الشاملة';}
function renderHome(){
  state.session=null;
  state.ui={view:'home',simId:null,module:null,mode:null};setTitle('مدرب المحاكاة القيادية');const readiness=trainingReadiness();
  const cards=state.master.simulations.map(sim=>{const p=simProgress(sim.master_simulation_id);return `<article class="card"><div class="card-head"><span class="pill">${esc(sim.master_simulation_id)}</span><span class="small muted numeric-ltr" dir="ltr">${p.done}/4</span></div><h3>${esc(sim.title_ar)}</h3><div class="progress"><span style="width:${p.pct}%"></span></div><div class="muted small">اكتمل ${p.done} من 4 أقسام</div><div class="btn-row"><button class="btn primary" data-action="open-sim" data-sim="${sim.master_simulation_id}">فتح المحاكاة</button></div></article>`}).join('');
  el('main').innerHTML=`<section class="hero"><div class="pill">الإصدار <bdi dir="ltr">${APP_VERSION}</bdi></div><h2>منصة المحاكاة والتدريب</h2><p>سبع محاكاة تجمع أربعة أقسام: <bdi dir="ltr">GCAT</bdi>، <bdi dir="ltr">PQ10</bdi>، السلوكيات المعطلة، والحكم القيادي؛ مع حفظ تلقائي ومراجعة ذكية وتقارير تفصيلية.</p><p class="small muted">«جاهزية التدريب» مؤشر إنجاز ومراجعة داخل التطبيق، وليست درجة سيكومترية أو معيارًا للتوظيف.</p></section>
  <div class="score-box dashboard-strip"><div class="score"><span>جاهزية التدريب</span><strong>${readiness.score}%</strong><small>إنجاز + إغلاق المراجعات</small></div><div class="score"><span>إنجاز الاختبارات</span><strong>${readiness.coverage}%</strong><small><bdi dir="ltr">${readiness.completed}/28</bdi> قسمًا</small></div><div class="score"><span>مراجعات مفتوحة</span><strong>${readiness.unresolved}</strong><small>تحتاج إعادة تدريب</small></div></div>
  <div class="quick-links"><button class="btn" data-action="review-home">المراجعة الذكية</button><button class="btn" data-action="mistakes-home">دفتر الأخطاء</button><button class="btn" data-action="favorites-home">المفضلة</button><button class="btn" data-action="results-home">النتائج والمحاولات</button></div>
  <div class="grid">${cards}</div>`;
}
function renderSimulation(mid){
  const sim=state.master.simulations.find(s=>s.master_simulation_id===mid);if(!sim)return renderHome();state.ui={view:'simulation',simId:mid,module:null,mode:null};setTitle(sim.title_ar);
  const mods=[['gcat','GCAT','42 سؤالًا','14 عددي + 14 لفظي + 14 تجريدي — 20 دقيقة في نمط الاختبار'],['pq10','PQ10','144 بندًا','اختبار الشخصية — غير موقّت'],['derailers','السلوكيات المعطلة','60 بندًا','قياس الميل إلى السلوكيات المعطلة — غير موقّت'],['leadership','الحكم القيادي','16 موقفًا','4 تصرفات تُقيّم مستقلًا — 45 دقيقة في نمط الاختبار']];
  const moduleCards=mods.map(([id,name,count,desc])=>{const r=latestModuleResult(mid,id);const openMist=unresolvedFor(mid,id).length;return `<article class="card module-card"><div class="card-head"><span class="pill">${count}</span>${openMist?`<span class="pill warn-pill">${openMist} للمراجعة</span>`:''}</div><h3>${name}</h3><p class="muted">${desc}</p><div class="spacer"></div>${r?`<div class="small correct">آخر نتيجة محفوظة: ${resultHeadline(id,r)}</div>`:''}<div class="btn-row"><button class="btn" data-action="start" data-sim="${mid}" data-module="${id}" data-mode="training">${moduleLaunchLabel(mid,id,'training')}</button><button class="btn primary" data-action="start" data-sim="${mid}" data-module="${id}" data-mode="exam">${moduleLaunchLabel(mid,id,'exam')}</button>${openMist?`<button class="btn ghost" data-action="train-mistakes" data-sim="${mid}" data-module="${id}">أخطائي فقط</button>`:''}</div></article>`}).join('');
  const fst=fullRunStatus(mid);const fullMeta=fst.started&&!fst.done?`<div class="small muted">اكتمل ${fst.finished} من 4 أقسام في المحاكاة الشاملة.</div>`:'';
  el('main').innerHTML=`<div class="section-head"><div><h2>${esc(sim.title_ar)}</h2><div class="muted">اختر قسمًا للتدريب أو الاختبار، أو استخدم المحاكاة الشاملة بأقسامها الأربعة.</div>${fullMeta}</div><button class="btn primary" data-action="full-run" data-sim="${mid}">${fullRunLabel(mid)}</button></div><div class="grid">${moduleCards}</div><div class="btn-row"><button class="btn ghost" data-action="home">← جميع المحاكاة</button></div>`;
}

function resolveItems(mid,module){
  const sim=state.master.simulations.find(s=>s.master_simulation_id===mid);if(!sim)return[];const b=sim.binding;
  if(module==='gcat'){
    const nm=state.banks.gcat_numerical.mocks.find(m=>m.mock_id===b.gcat.numerical.bank_simulation_id);const vm=state.banks.gcat_verbal.mocks.find(m=>m.mock_id===b.gcat.verbal.bank_simulation_id);
    const aq=state.banks.gcat_abstract.questions.filter(q=>q.assignment_status==='used'&&q.target_simulation_id===mid).sort((x,y)=>x.target_abstract_order-y.target_abstract_order);
    return [...nm.questions.slice().sort((x,y)=>x.selected_sequence-y.selected_sequence).map(q=>({kind:'numerical',id:q.id,data:q,sourceMid:mid})),...vm.questions.slice().sort((x,y)=>x.assigned_sequence-y.assigned_sequence).map(q=>({kind:'verbal',id:q.original_question_id,data:q,sourceMid:mid})),...aq.map(q=>({kind:'abstract',id:q.question_id,data:q,sourceMid:mid}))];
  }
  if(module==='pq10')return state.banks.pq10.simulations.find(s=>s.simulation_id===b.pq10.bank_simulation_id).questions.map(q=>({kind:'pq10',id:q.question_id,data:q,sourceMid:mid}));
  if(module==='derailers')return state.banks.derailers.simulations.find(s=>s.simulation_id===b.derailers.bank_simulation_id).questions.map(q=>({kind:'derailers',id:q.question_id,data:q,sourceMid:mid}));
  if(module==='leadership')return state.banks.leadership.simulations.find(s=>s.simulation_id===b.leadership.bank_simulation_id).scenarios.slice().sort((x,y)=>x.scenario_number-y.scenario_number).map(q=>({kind:'leadership',id:q.scenario_id,data:q,sourceMid:mid}));
  return[];
}
function responseStore(mid,module,responseScope=(state.session?.responseScope||'training')){state.saved.responses[mid]||={};state.saved.responses[mid][module]||={};state.saved.responses[mid][module][responseScope]||={};return state.saved.responses[mid][module][responseScope];}
function storageId(item){return item.storageId||item.id;}
function itemComplete(module,item,store){const id=storageId(item);if(module==='leadership'){const ratings=store[id];return!!ratings&&item.data.options.every(o=>ratings[o.response_id]!==undefined)}return store[id]!==undefined;}
function sessionResult(mid,module,responseScope){if(responseScope==='full_exam')return state.saved.fullResults?.[mid]?.[module]||null;return resultScopes(mid,module)[responseScope]||null;}

function startSession(mid,module,mode,fullRun=false){
  const items=resolveItems(mid,module);const responseScope=responseScopeFor(mode,fullRun);const existing=responseStore(mid,module,responseScope);const sk=scopeKey(mid,module,responseScope);const meta=state.saved.sessionMeta[sk];const prior=sessionResult(mid,module,responseScope);
  const continueAfterFinished=()=>{if(fullRun){const order=MODULES,idx=order.indexOf(module);if(idx<order.length-1)return startSession(mid,order[idx+1],mode,true);return renderFullRunResult(mid)}return renderResult(mid,module,prior,!!prior?.timedOut)};
  if(meta?.status==='finished'&&prior)return continueAfterFinished();
  let index=0;while(index<items.length&&itemComplete(module,items[index],existing))index++;
  if(index>=items.length){if(prior)return continueAfterFinished();state.session={mid,module,mode,responseScope,fullRun,items,index:Math.max(0,items.length-1),startedAt:meta?.startedAt||Date.now(),deadline:meta?.deadline??null,feedbackShown:false,isReview:false};return finishSession(false)}
  let deadline=null;const duration=timerDurationMs(module,mode);if(duration)deadline=(meta&&meta.status==='active'&&Number.isFinite(meta.deadline))?meta.deadline:Date.now()+duration;
  state.saved.sessionMeta[sk]={status:'active',deadline,startedAt:meta?.startedAt||Date.now(),mid,module,mode,responseScope,fullRun,alertsShown:Array.isArray(meta?.alertsShown)?meta.alertsShown:[]};persist();
  state.session={mid,module,mode,responseScope,fullRun,items,index,startedAt:state.saved.sessionMeta[sk].startedAt,deadline,feedbackShown:false,isReview:false,reviewLabel:null};renderSession();
}
function startReviewSession(module,entries,label='مراجعة ذكية'){
  if(!entries.length){toast('لا توجد أسئلة مناسبة للمراجعة');return;}
  const scope=`review_${Date.now()}`;const items=entries.map(({mid,item})=>({...item,sourceMid:mid,storageId:`${mid}::${item.id}`}));
  state.saved.responses.REVIEW||={};state.saved.responses.REVIEW[module]||={};state.saved.responses.REVIEW[module][scope]={};
  state.session={mid:'REVIEW',module,mode:'training',responseScope:scope,fullRun:false,items,index:0,startedAt:Date.now(),deadline:null,feedbackShown:false,isReview:true,reviewLabel:label};renderSession();
}

function currentSourceMid(item){return item.sourceMid||state.session.mid;}
function favoriteKey(mid,module,item){return `${mid}|${module}|${item.id}`;}
function isFavorite(item){return state.saved.favorites.includes(favoriteKey(currentSourceMid(item),state.session.module,item));}
function questionToolbar(item){const fav=isFavorite(item);return `<div class="question-toolbar"><span class="pill">${esc(currentSourceMid(item))}</span><button class="icon-btn small-icon ${fav?'fav-active':''}" data-action="toggle-favorite" aria-label="${fav?'إزالة من المفضلة':'إضافة إلى المفضلة'}" aria-pressed="${fav?'true':'false'}">${fav?'★':'☆'}</button></div>`;}
function renderSession(){
  const s=state.session;if(!s)return renderHome();const item=s.items[s.index],n=s.items.length;setTitle(s.isReview?`${s.reviewLabel} — ${moduleName(s.module)}`:`${s.mid} — ${moduleName(s.module)}`);const progress=Math.round(s.index/n*100);
  el('main').innerHTML=`<div class="session-wrap"><div class="session-meta"><div class="session-meta-left"><span class="pill">${s.isReview?'مراجعة':s.mode==='training'?'تدريب':'اختبار'}</span> <span class="pill numeric-ltr" dir="ltr">${s.index+1} / ${n}</span></div><div class="timer-controls"><div id="timerSlot"></div><button class="btn mini exit-mini" data-action="exit-session" aria-label="حفظ التقدم والخروج">خروج</button></div></div><div class="progress" role="progressbar" aria-label="تقدم الجلسة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><div class="progress-caption">السؤال ${s.index+1} من ${n}</div><div id="questionHost"></div></div>`;renderItem(item);tickTimer();
}
function renderItem(item){if(item.kind==='numerical'||item.kind==='verbal')return renderGCATText(item);if(item.kind==='abstract')return renderAbstract(item);if(item.kind==='pq10'||item.kind==='derailers')return renderLikert(item);if(item.kind==='leadership')return renderLeadership(item);}
function renderGCATText(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];let opts=[];if(item.kind==='numerical')opts=q.options.map(x=>({letter:x.label,text:x.text}));else opts=q.options.map((x,i)=>({letter:'ABCDEF'[i],text:x}));
  const html=opts.map(o=>`<button class="option-btn ${chosen===o.letter?'selected':''}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${o.letter}" aria-pressed="${chosen===o.letter?'true':'false'}"><span class="option-label">${o.letter}</span><span>${esc(o.text)}</span></button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<span class="pill">${item.kind==='numerical'?'عددي':'لفظي'}</span><div class="question-text">${esc(q.question)}</div><div class="options">${html}</div><div id="feedbackHost"></div></article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
}
function renderAbstract(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];const frames=(q.svg_inline?.frames||[]).map(s=>`<div class="svg-frame">${s}</div>`).join('');const opts='ABCDEF'.split('').map(l=>`<button class="abstract-option ${chosen===l?'selected':''}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${l}" aria-label="الخيار ${l}" aria-pressed="${chosen===l?'true':'false'}"><span class="option-label">${l}</span>${q.svg_inline?.options?.[l]||`<div>${esc(q['option_'+l])}</div>`}</button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<span class="pill">تجريدي</span><div class="question-text">${esc(q.prompt_ar)}</div><div class="abstract-frames">${frames}</div><div class="abstract-options">${opts}</div><div id="feedbackHost"></div></article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
}
function renderLikert(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];const buttons=LIKERT.map(x=>`<button class="btn ${chosen===x?'selected':''}" data-action="answer-likert" data-id="${esc(storageId(item))}" data-answer="${esc(x)}" aria-pressed="${chosen===x?'true':'false'}">${esc(x)}</button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<span class="pill">${item.kind==='pq10'?esc(q.measures):esc(q.analytic_axis||q.measures)}</span><div class="question-text">${esc(q.rewritten_question)}</div><div class="likert">${buttons}</div><div id="feedbackHost"></div></article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
}
function renderLeadership(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),ratings=store[storageId(item)]||{};
  const actions=q.options.map(o=>{const val=ratings[o.response_id];const rb=[1,2,3,4,5].map(n=>`<button class="btn ${val===n?'selected':''}" data-action="rate-lead" data-scenario="${esc(storageId(item))}" data-response="${esc(o.response_id)}" data-rating="${n}" aria-label="${n} — ${RATING_LABELS[n]}" title="${RATING_LABELS[n]}" aria-pressed="${val===n?'true':'false'}">${n}</button>`).join('');return `<div class="lead-action"><div class="lead-action-head"><div class="pill">الخيار ${esc(o.option)}</div><span class="rating-choice ${val?'chosen':''}">${val?`${val} — ${RATING_LABELS[val]}`:'اختر درجة'}</span></div><p>${esc(o.text)}</p><div class="rating-row">${rb}</div></div>`}).join('');const allDone=q.options.every(o=>ratings[o.response_id]!==undefined);
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<span class="pill">${esc(q.app_training?.criterion_ar||CRITERION_AR[q.criterion]||q.criterion)}</span><h3>${esc(q.title)}</h3><div class="question-text">${esc(q.stem)}</div><div class="rating-legend" aria-label="مقياس الفعالية"><span><strong>1</strong> غير فعال إطلاقًا</span><span><strong>3</strong> فعال إلى حد ما</span><span><strong>5</strong> فعال جدًا</span></div><div class="lead-actions">${actions}</div><div class="btn-row submit-row"><button class="btn primary" data-action="submit-lead" ${allDone?'':'disabled'}>${state.session.mode==='training'?'تثبيت وعرض التصحيح':'تثبيت ومتابعة'}</button></div><div id="feedbackHost"></div></article>`;
}
function saveAnswer(id,value){const store=responseStore(state.session.mid,state.session.module,state.session.responseScope);store[id]=value;persist();}
function nextItem(){const s=state.session;if(s.index>=s.items.length-1)return finishSession();s.index++;s.feedbackShown=false;renderSession();}

function modelAnswer(item){if(item.kind==='numerical')return item.data.correct_answer;if(item.kind==='verbal')return item.data.correct_option_letter;if(item.kind==='abstract')return item.data.correct_option;if(item.kind==='pq10'||item.kind==='derailers')return item.data.rewritten_answer;return null;}
function topicOf(item){const q=item.data;if(item.kind==='numerical')return q.category||q.subskill||'عددي';if(item.kind==='verbal')return q.skill||'لفظي';if(item.kind==='abstract')return q.primary_rule||q.question_format||'تجريدي';if(item.kind==='pq10')return q.measures||q.subtrait||'PQ10';if(item.kind==='derailers')return q.source_domain||q.analytic_axis||'السلوكيات المعطلة';if(item.kind==='leadership')return q.app_training?.criterion_ar||CRITERION_AR[q.criterion]||q.criterion;return'';}
function previewOf(item){const q=item.data;if(item.kind==='abstract')return q.prompt_ar;if(item.kind==='leadership')return q.stem;if(item.kind==='pq10'||item.kind==='derailers')return q.rewritten_question;return q.question||'';}


function likertOptionComparison(q,kind){
  const rows=LIKERT.map(opt=>{let score,label,meaning='';if(kind==='derailers'&&q.option_guidance?.[opt]){const g=q.option_guidance[opt];score=g.score;label=g.alignment;meaning=g.meaning||'';}else{const a=choiceAlignmentText(opt,q.rewritten_answer);score=a.score;label=a.label;meaning=a.d===0?'هذا هو الخيار المرجعي في هذا البند.':a.d===1?'قريب من الاتجاه المرجعي، لكنه يغيّر شدة الاستجابة درجة واحدة.':a.d===2?'يقع في منتصف المسافة من الخيار المرجعي.':'يبتعد عن الاتجاه أو الشدة المرجعية في هذا البنك التدريبي.';}return `<div class="option-compare-row ${opt===q.rewritten_answer?'model':''}"><strong>${esc(opt)}</strong><span>${esc(label||'')}</span><b>${score??'—'}%</b><small>${esc(meaning)}</small></div>`}).join('');return `<details class="feedback-detail option-comparison"><summary>كيف تُقرأ بقية الخيارات؟</summary><div class="option-compare-list">${rows}</div></details>`;
}

function showTrainingFeedback(item,chosen){
  const host=el('feedbackHost');if(!host)return;
  if(item.kind==='numerical'){
    const q=item.data,ok=chosen===q.correct_answer;let dist='';if(!ok&&q.distractor_analysis){const d=q.distractor_analysis[chosen]||q.distractor_analysis?.find?.(x=>x.option===chosen);if(d)dist=`<p><strong>لماذا هذا مشتت؟</strong> ${esc(typeof d==='string'?d:d.explanation||d.reason||'')}</p>`}
    host.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><h4 class="${ok?'correct':'incorrect'}">${ok?'إجابة صحيحة':'الإجابة الصحيحة: '+esc(q.correct_answer)}</h4><p>${esc(q.explanation||'')}</p>${q.fast_method?`<p><strong>الطريقة الأسرع:</strong> ${esc(q.fast_method)}</p>`:''}${dist}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }else if(item.kind==='verbal'){
    const q=item.data,ok=chosen===q.correct_option_letter;host.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><h4 class="${ok?'correct':'incorrect'}">${ok?'إجابة صحيحة':'الإجابة الصحيحة: '+esc(q.correct_option_letter)}</h4><p>${esc(q.explanation||'')}</p>${q.shortcut?`<p><strong>ملاحظة سريعة:</strong> ${esc(q.shortcut)}</p>`:''}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }else if(item.kind==='abstract'){
    const q=item.data,ok=chosen===q.correct_option;const de=q.distractor_explanations?.[chosen];host.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><h4 class="${ok?'correct':'incorrect'}">${ok?'إجابة صحيحة':'الإجابة الصحيحة: '+esc(q.correct_option)}</h4><p>${esc(q.explanation_ar||'')}</p>${!ok&&de?`<p><strong>لماذا هذا مشتت؟</strong> ${esc(typeof de==='string'?de:de.explanation||de.reason||'')}</p>`:''}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }else if(item.kind==='pq10'||item.kind==='derailers'){
    const q=item.data,model=q.rewritten_answer;let extra='';if(item.kind==='derailers'&&q.option_guidance?.[chosen])extra=`<p><strong>قراءتك:</strong> ${esc(q.option_guidance[chosen].meaning||'')}</p>`;host.innerHTML=`<div class="feedback ${chosen===model?'good':''}"><h4>الإجابة النموذجية: <span class="correct">${esc(model)}</span></h4><p>${esc(q.training_explanation||q.answer_basis||'')}</p><p class="small"><strong>يقيس:</strong> ${esc(q.measures||'')} — ${esc(q.subtrait||'')}</p>${extra}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }
}
function showLeadershipFeedback(item){const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope)[storageId(item)];const blocks=q.options.map(o=>{const user=store[o.response_id],model=o.app_score,tf=o.training_feedback||{};const detailed=tf.full_explanation&&tf.full_explanation!==tf.why_this_rating?`<details class="feedback-detail"><summary>التفسير التفصيلي</summary><p>${esc(tf.full_explanation)}</p>${tf.boundary_tested?`<p class="small"><strong>الحد المختبر:</strong> ${esc(tf.boundary_tested)}</p>`:''}</details>`:'';return `<div class="feedback ${user===model?'good':''}"><h4>الخيار ${esc(o.option)} — تقييمك ${user} / النموذجي ${model}</h4><p>${esc(tf.why_this_rating||o.app_score_reason||o.explanation||'')}</p><div class="small muted">${esc(tf.rating_label||o.app_score_label||'')}</div>${detailed}</div>`}).join('');el('feedbackHost').innerHTML=blocks+`<div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;}

function tickTimer(){
  const s=state.session,slot=el('timerSlot');if(!slot||!s?.deadline){if(slot)slot.innerHTML='';return;}const remaining=Math.max(0,s.deadline-Date.now()),sec=Math.floor(remaining/1000),min=Math.floor(sec/60),ss=String(sec%60).padStart(2,'0');const cls=sec<=60?'danger':sec<=300?'warn':'';
  slot.innerHTML=state.settings.timerVisible?`<span class="pill timer ${cls} numeric-ltr" dir="ltr">⏱ ${min}:${ss}</span>`:`<span class="pill">⏱ مخفي</span>`;
  const sk=scopeKey(s.mid,s.module,s.responseScope),meta=state.saved.sessionMeta[sk]||{},shown=new Set(meta.alertsShown||[]);for(const [threshold,label] of [[600,'10 دقائق'],[300,'5 دقائق'],[60,'دقيقة واحدة']]){if(sec<=threshold&&sec>0&&!shown.has(threshold)){shown.add(threshold);meta.alertsShown=[...shown];state.saved.sessionMeta[sk]=meta;persist();toast(`تنبيه: تبقى ${label}`)}}
  if(remaining<=0){finishSession(true);return;}setTimeout(tickTimer,1000);
}

function calculateItemsResult(items,module,store){
  if(module==='gcat'){
    let correct=0;const by={numerical:[0,0],verbal:[0,0],abstract:[0,0]},topics={};for(const item of items){const key=modelAnswer(item),u=store[storageId(item)];by[item.kind][1]++;const ok=u===key;if(ok){correct++;by[item.kind][0]++}(topics[topicOf(item)]||=[0,0])[1]++;if(ok)topics[topicOf(item)][0]++}return{score:percent(correct,items.length),correct,total:items.length,domains:Object.fromEntries(Object.entries(by).map(([k,[c,t]])=>[k,{correct:c,total:t,score:percent(c,t)}])),topics:Object.fromEntries(Object.entries(topics).map(([k,[c,t]])=>[k,{correct:c,total:t,score:percent(c,t)}]))};
  }
  if(module==='pq10'||module==='derailers'){
    let sum=0,n=0;const groups={};for(const item of items){const q=item.data,u=store[storageId(item)];if(u===undefined)continue;const d=Math.abs(LIKERT.indexOf(u)-LIKERT.indexOf(q.rewritten_answer)),sc=[100,75,50,25,0][d];sum+=sc;n++;const g=module==='pq10'?q.measures:q.source_domain;(groups[g]||=[]).push(sc)}const alignment=n?Math.round(sum/n):0,r={alignment,answered:n,total:items.length,groups:Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,Math.round(a.reduce((x,y)=>x+y,0)/a.length)]))};if(module==='derailers'){r.safety=alignment;r.risk=100-alignment}return r;
  }
  if(module==='leadership'){
    let pts=0,n=0,over=0,under=0,exact=0;const crit={},boundaries={};for(const item of items){const ratings=store[storageId(item)]||{};for(const o of item.data.options){const u=ratings[o.response_id];if(u===undefined)continue;const m=o.app_score,d=Math.abs(u-m),p=d===0?2:d===1?1:0;pts+=p;n++;if(d===0)exact++;if(u>m)over++;if(u<m)under++;const c=o.criterion;(crit[c]||=[0,0]);crit[c][0]+=p;crit[c][1]+=2;const b=o.boundary_tested||'غير محدد';(boundaries[b]||=[0,0]);boundaries[b][0]+=p;boundaries[b][1]+=2}}return{accuracy:n?Math.round(pts/(2*n)*100):0,exact_match:percent(exact,n),overrated:over,underrated:under,rated:n,total:items.reduce((a,it)=>a+it.data.options.length,0),criteria:Object.fromEntries(Object.entries(crit).map(([k,[p,max]])=>[k,Math.round(p/max*100)])),boundaries:Object.fromEntries(Object.entries(boundaries).map(([k,[p,max]])=>[k,Math.round(p/max*100)]))};
  }
}
function calculateResult(mid,module,responseScope=(state.session?.responseScope||'training')){return calculateItemsResult(resolveItems(mid,module),module,responseStore(mid,module,responseScope));}

function reviewIssueId(mid,module,item,responseId=null){return responseId?`${mid}|${module}|${item.id}|${responseId}`:`${mid}|${module}|${item.id}`;}
function upsertReviewIssue({mid,module,item,responseId=null,user,model,delta=null}){
  const key=reviewIssueId(mid,module,item,responseId),old=state.saved.reviewItems[key]||{};state.saved.reviewItems[key]={...old,key,mid,module,itemId:item.id,responseId,kind:item.kind,topic:topicOf(item),preview:previewOf(item),wrongCount:(old.wrongCount||0)+1,lastAt:new Date().toISOString(),lastUser:user??'—',model,delta,resolved:false,resolvedAt:null};
}
function resolveReviewIssue(mid,module,item,responseId=null){const key=reviewIssueId(mid,module,item,responseId),old=state.saved.reviewItems[key];if(old){old.resolved=true;old.resolvedAt=new Date().toISOString();old.lastAt=old.resolvedAt;}}
function recordReviewOutcomes(session){
  const store=responseStore(session.mid,session.module,session.responseScope);for(const item of session.items){const mid=currentSourceMid(item);if(session.module==='leadership'){const ratings=store[storageId(item)]||{};for(const o of item.data.options){const u=ratings[o.response_id],m=o.app_score;if(u===m)resolveReviewIssue(mid,session.module,item,o.response_id);else upsertReviewIssue({mid,module:session.module,item,responseId:o.response_id,user:u,model:m,delta:u===undefined?null:u-m})}}else{const u=store[storageId(item)],m=modelAnswer(item);if(u===m)resolveReviewIssue(mid,session.module,item);else upsertReviewIssue({mid,module:session.module,item,user:u,model:m,delta:(session.module==='pq10'||session.module==='derailers')&&u!==undefined?LIKERT.indexOf(u)-LIKERT.indexOf(m):null})}}
}
function unresolvedFor(mid,module){return Object.values(state.saved.reviewItems||{}).filter(x=>!x.resolved&&(!mid||x.mid===mid)&&(!module||x.module===module));}
function findItem(mid,module,itemId){return resolveItems(mid,module).find(x=>x.id===itemId)||null;}

function finishSession(timedOut=false){
  const s=state.session;if(!s)return;const store=responseStore(s.mid,s.module,s.responseScope),result={...calculateItemsResult(s.items,s.module,store),mode:s.mode,responseScope:s.responseScope,timedOut:!!timedOut,finishedAt:new Date().toISOString(),review:!!s.isReview};recordReviewOutcomes(s);
  if(s.isReview){state.saved.history.push({at:result.finishedAt,sim:'REVIEW',module:s.module,mode:'training',responseScope:s.responseScope,review:true,label:s.reviewLabel,result});persist();state.session=null;return renderReviewResult(s.reviewLabel,s.module,result)}
  const sk=scopeKey(s.mid,s.module,s.responseScope);state.saved.sessionMeta[sk]={...(state.saved.sessionMeta[sk]||{}),status:'finished',deadline:s.deadline,timedOut:!!timedOut,finishedAt:Date.now()};
  if(s.fullRun){state.saved.fullResults[s.mid]||={};state.saved.fullResults[s.mid][s.module]=result}else{state.saved.results[s.mid]||={};state.saved.results[s.mid][s.module]||={};state.saved.results[s.mid][s.module][s.responseScope]=result}
  state.saved.history.push({at:result.finishedAt,sim:s.mid,module:s.module,mode:s.mode,responseScope:s.responseScope,fullRun:s.fullRun,result});persist();const fullRun=s.fullRun,mid=s.mid,module=s.module,mode=s.mode;state.session=null;
  if(fullRun){const idx=MODULES.indexOf(module);if(idx<MODULES.length-1){toast(`اكتمل ${moduleName(module)} — ننتقل إلى ${moduleName(MODULES[idx+1])}`);return startSession(mid,MODULES[idx+1],mode,true)}return renderFullRunResult(mid)}renderResult(mid,module,result,timedOut);
}

function metricValue(module,r){if(!r)return null;if(module==='gcat')return r.score;if(module==='pq10')return r.alignment;if(module==='derailers')return r.safety;if(module==='leadership')return r.accuracy;return null;}
function attemptHistory(mid,module,scope='exam'){return state.saved.history.filter(h=>!h.review&&h.sim===mid&&h.module===module&&h.responseScope===scope).sort((a,b)=>new Date(a.at)-new Date(b.at));}
function comparisonHTML(mid,module,scope,current){const hs=attemptHistory(mid,module,scope);if(hs.length<2)return'';const prev=hs[hs.length-2].result,cv=metricValue(module,current),pv=metricValue(module,prev),delta=cv-pv;return `<div class="card comparison-card"><h3>مقارنة بالمحاولة السابقة</h3><div class="score-box"><div class="score"><span>السابق</span><strong>${pv}%</strong></div><div class="score"><span>الحالي</span><strong>${cv}%</strong></div><div class="score"><span>التغير</span><strong class="${delta>=0?'correct':'incorrect'}">${delta>0?'+':''}${delta}</strong></div></div></div>`;}
function reportActions(mid,module='full',scope='exam'){return `<div class="btn-row report-actions"><button class="btn" data-action="share-report" data-sim="${mid}" data-module="${module}" data-scope="${scope}">مشاركة النتيجة</button><button class="btn" data-action="print-report">حفظ PDF / طباعة</button></div>`;}
function compactBreakdown(title,obj,labeler=(k)=>k){
  if(!obj||!Object.keys(obj).length)return'';const entries=Object.entries(obj).sort((a,b)=>{const av=typeof a[1]==='object'?(a[1].score??0):a[1],bv=typeof b[1]==='object'?(b[1].score??0):b[1];return av-bv});
  return `<section class="card report-section"><h3>${esc(title)}</h3><div class="mini-grid">${entries.map(([k,v])=>`<div class="mini-stat"><span>${esc(labeler(k))}</span><strong>${typeof v==='object'?(v.score??'—'):v}%</strong></div>`).join('')}</div></section>`;
}
function renderFullRunResult(mid){
  const all=state.saved.fullResults?.[mid]||{},g=all.gcat,p=all.pq10,d=all.derailers,l=all.leadership;state.ui={view:'full-result',simId:mid,module:null,mode:'exam'};setTitle(`${mid} — النتيجة الشاملة`);const reviewCount=unresolvedFor(mid,null).length;
  el('main').innerHTML=`<section class="hero report-hero"><div class="pill">اكتملت المحاكاة الشاملة</div><h2>${mid}</h2><p>تعرض النتائج حسب كل قسم مستقلًا؛ لا تُدمج المقاييس المختلفة في نسبة واحدة.</p></section>
  <div class="score-box"><div class="score"><span>GCAT</span><strong>${g?g.score+'%':'—'}</strong></div><div class="score"><span>PQ10</span><strong>${p?p.alignment+'%':'—'}</strong></div><div class="score"><span>السلوكيات المعطلة — التوافق الآمن</span><strong>${d?d.safety+'%':'—'}</strong></div><div class="score"><span>الحكم القيادي</span><strong>${l?l.accuracy+'% ('+`<bdi dir="ltr">${l.rated}/64</bdi>`+')':'—'}</strong></div></div>
  ${g?compactBreakdown('GCAT — المجالات',g.domains,moduleName):''}
  ${p?compactBreakdown('PQ10 — الأبعاد',p.groups):''}
  ${d?compactBreakdown('السلوكيات المعطلة — الفئات الأساسية',d.groups):''}
  ${l?compactBreakdown('الحكم القيادي — المعايير',l.criteria,k=>CRITERION_AR[k]||k):''}
  ${reviewCount?`<section class="card"><h3>عناصر تحتاج مراجعة</h3><p>لديك ${reviewCount} عنصرًا مفتوحًا مرتبطًا بهذه المحاكاة.</p><button class="btn" data-action="mistakes-home">فتح دفتر الأخطاء</button></section>`:''}
  ${reportActions(mid,'full','full_exam')}<div class="btn-row"><button class="btn primary" data-action="open-sim" data-sim="${mid}">العودة للمحاكاة</button><button class="btn" data-action="restart-full" data-sim="${mid}">إعادة المحاكاة الشاملة</button></div>`;
}
function renderResult(mid,module,r,timedOut=false){
  state.ui={view:'result',simId:mid,module,mode:r.mode};setTitle(`${mid} — نتيجة ${moduleName(module)}`);let scores='',detail='';
  if(module==='gcat'){
    scores=`<div class="score-box"><div class="score"><span>النتيجة</span><strong>${r.score}%</strong></div><div class="score"><span>الصحيح</span><strong><bdi dir="ltr">${r.correct}/${r.total}</bdi></strong></div>${Object.entries(r.domains).map(([k,v])=>`<div class="score"><span>${moduleName(k)}</span><strong>${v.score}%</strong></div>`).join('')}</div>`;
    const weakest=Object.entries(r.topics||{}).sort((a,b)=>a[1].score-b[1].score).slice(0,6);if(weakest.length)detail=`<section class="card"><h3>أضعف الموضوعات في هذه المحاولة</h3><div class="mini-grid">${weakest.map(([k,v])=>`<div class="mini-stat"><span>${esc(k)}</span><strong>${v.score}%</strong></div>`).join('')}</div></section>`;
  }
  if(module==='pq10')scores=`<div class="score-box"><div class="score"><span>التوافق</span><strong>${r.alignment}%</strong></div>${Object.entries(r.groups).map(([k,v])=>`<div class="score"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join('')}</div>`;
  if(module==='derailers')scores=`<div class="score-box"><div class="score"><span>مؤشر السلامة</span><strong>${r.safety}%</strong></div><div class="score"><span>مؤشر الخطر</span><strong>${r.risk}%</strong></div>${Object.entries(r.groups).map(([k,v])=>`<div class="score"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join('')}</div>`;
  if(module==='leadership'){
    scores=`<div class="score-box"><div class="score"><span>دقة الحكم</span><strong>${r.accuracy}%</strong></div><div class="score"><span>التصرفات المقيمة</span><strong><bdi dir="ltr">${r.rated}/${r.total||64}</bdi></strong></div><div class="score"><span>تطابق تام</span><strong>${r.exact_match}%</strong></div><div class="score"><span>المبالغة في التقييم</span><strong>${r.overrated}</strong></div><div class="score"><span>التقليل من التقييم</span><strong>${r.underrated}</strong></div></div>`;
    detail=compactBreakdown('الأداء حسب المعيار',r.criteria,k=>CRITERION_AR[k]||k)+compactBreakdown('دقة الحدود',r.boundaries||{});
  }
  const reviewCount=unresolvedFor(mid,module).length;el('main').innerHTML=`<section class="hero report-hero"><div class="pill">${timedOut?'انتهى الوقت':'اكتمل القسم'}</div><h2>${moduleName(module)}</h2><p>${resultInterpretation(module)}</p></section>${scores}${detail}${r.responseScope==='exam'?comparisonHTML(mid,module,'exam',r):''}${reviewCount?`<section class="card"><h3>مراجعة مقترحة</h3><p>لديك ${reviewCount} عنصرًا مفتوحًا في هذا القسم.</p><button class="btn primary" data-action="train-mistakes" data-sim="${mid}" data-module="${module}">تدرب على أخطائي فقط</button></section>`:''}${reportActions(mid,module,r.responseScope||r.mode||'training')}<div class="btn-row"><button class="btn primary" data-action="open-sim" data-sim="${mid}">العودة للمحاكاة</button><button class="btn" data-action="restart" data-sim="${mid}" data-module="${module}" data-mode="${r.mode||'training'}">إعادة المحاولة</button></div>`;
}
function renderReviewResult(label,module,r){state.ui={view:'review-result',simId:null,module};setTitle('نتيجة المراجعة');const headline=module==='gcat'?`${r.score}%`:module==='leadership'?`${r.accuracy}%`:module==='derailers'?`${r.safety}%`:`${r.alignment}%`;el('main').innerHTML=`<section class="hero"><div class="pill">اكتملت المراجعة</div><h2>${esc(label)}</h2><p>${moduleName(module)} — النتيجة الحالية ${headline}</p></section><div class="btn-row"><button class="btn primary" data-action="review-home">العودة للمراجعة الذكية</button><button class="btn" data-action="mistakes-home">دفتر الأخطاء</button></div>`;}

function renderResultsHome(){
  state.ui={view:'results',simId:null,module:null};setTitle('النتائج والمحاولات');const rows=[];for(const sim of state.master.simulations)for(const m of MODULES)for(const [scope,r] of Object.entries(resultScopes(sim.master_simulation_id,m)))rows.push(`<tr><td>${sim.master_simulation_id}</td><td>${moduleName(m)}</td><td>${modeName(scope)}</td><td>${resultHeadline(m,r)}</td></tr>`);
  const history=state.saved.history.filter(h=>!h.review).slice().reverse().slice(0,40);const historyRows=history.map((h,i)=>`<tr><td>${formatDate(h.at)}</td><td>${h.sim}</td><td>${moduleName(h.module)}</td><td>${modeName(h.responseScope)}</td><td>${resultHeadline(h.module,h.result)}</td></tr>`).join('');
  el('main').innerHTML=`<div class="section-head"><h2>النتائج المحفوظة</h2><button class="btn danger" data-action="reset-all">مسح البيانات</button></div>${rows.length?`<div class="card table-wrap"><table class="table"><thead><tr><th>المحاكاة</th><th>القسم</th><th>النمط</th><th>آخر نتيجة</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`:`<div class="empty">لا توجد نتائج بعد.</div>`}<section class="card"><h3>سجل المحاولات</h3>${historyRows?`<div class="table-wrap"><table class="table"><thead><tr><th>الوقت</th><th>المحاكاة</th><th>القسم</th><th>النمط</th><th>النتيجة</th></tr></thead><tbody>${historyRows}</tbody></table></div>`:`<div class="muted">لا توجد محاولات مكتملة.</div>`}</section><div class="btn-row"><button class="btn" data-action="home">الرئيسية</button></div>`;
}

function renderMistakes(){
  state.ui={view:'mistakes',simId:null,module:null};setTitle('دفتر الأخطاء');const all=Object.values(state.saved.reviewItems||{}),open=all.filter(x=>!x.resolved),resolved=all.filter(x=>x.resolved);const byModule=MODULES.map(m=>[m,open.filter(x=>x.module===m).length]).filter(([,n])=>n);
  const cards=byModule.map(([m,n])=>`<article class="card"><h3>${moduleName(m)}</h3><p>${n} عنصرًا يحتاج مراجعة.</p><button class="btn primary" data-action="train-mistakes" data-module="${m}">تدرب على أخطائي</button></article>`).join('');
  const rows=open.slice().sort((a,b)=>new Date(b.lastAt)-new Date(a.lastAt)).slice(0,120).map(x=>`<tr><td>${x.mid}</td><td>${moduleName(x.module)}</td><td>${esc(x.topic)}</td><td>${esc(x.preview).slice(0,100)}</td><td>${x.wrongCount}</td></tr>`).join('');
  el('main').innerHTML=`<section class="hero"><div class="pill">مراجعة تراكمية</div><h2>دفتر الأخطاء</h2><p>المفتوح ${open.length} — المحسوم بعد إعادة التدريب ${resolved.length}.</p></section><div class="grid">${cards||'<div class="empty">لا توجد أخطاء مفتوحة.</div>'}</div>${rows?`<section class="card table-wrap"><table class="table"><thead><tr><th>المحاكاة</th><th>القسم</th><th>الموضوع</th><th>العنصر</th><th>التكرار</th></tr></thead><tbody>${rows}</tbody></table></section>`:''}<div class="btn-row"><button class="btn" data-action="review-home">المراجعة الذكية</button><button class="btn" data-action="home">الرئيسية</button></div>`;
}
function favoriteEntries(module=null){const out=[];for(const key of state.saved.favorites){const [mid,m,id]=key.split('|');if(module&&m!==module)continue;const item=findItem(mid,m,id);if(item)out.push({mid,module:m,item})}return out;}
function renderFavorites(){
  state.ui={view:'favorites',simId:null,module:null};setTitle('المفضلة');const entries=favoriteEntries();const counts=MODULES.map(m=>[m,entries.filter(x=>x.module===m).length]).filter(([,n])=>n);const buttons=counts.map(([m,n])=>`<button class="btn primary" data-action="train-favorites" data-module="${m}">${moduleName(m)} (${n})</button>`).join('');const rows=entries.map(x=>`<tr><td>${x.mid}</td><td>${moduleName(x.module)}</td><td>${esc(topicOf(x.item))}</td><td>${esc(previewOf(x.item)).slice(0,120)}</td></tr>`).join('');
  el('main').innerHTML=`<section class="hero"><div class="pill">${entries.length} محفوظ</div><h2>الأسئلة المفضلة</h2><p>احتفظ بالأسئلة أو المواقف التي تريد العودة لها بسرعة.</p></section><div class="btn-row">${buttons}</div>${rows?`<section class="card table-wrap"><table class="table"><thead><tr><th>المحاكاة</th><th>القسم</th><th>الموضوع</th><th>السؤال/الموقف</th></tr></thead><tbody>${rows}</tbody></table></section>`:`<div class="empty">لم تحفظ أي سؤال بعد.</div>`}<div class="btn-row"><button class="btn" data-action="home">الرئيسية</button></div>`;
}

function weakestForModule(module){
  let best=null;for(const sim of state.master.simulations){const mid=sim.master_simulation_id,r=resultScopes(mid,module).exam||state.saved.fullResults?.[mid]?.[module];if(!r)continue;let entries=[];if(module==='gcat')entries=Object.entries(r.domains||{}).map(([k,v])=>[k,v.score]);else if(module==='pq10'||module==='derailers')entries=Object.entries(r.groups||{});else if(module==='leadership')entries=Object.entries(r.criteria||{});for(const [area,score] of entries){if(!best||score<best.score)best={mid,module,area,score}}}return best;
}
function weaknessEntries(w){if(!w)return[];return resolveItems(w.mid,w.module).filter(item=>{if(w.module==='gcat')return item.kind===w.area;if(w.module==='pq10')return item.data.measures===w.area;if(w.module==='derailers')return item.data.source_domain===w.area;if(w.module==='leadership')return item.data.criterion===w.area;return false}).map(item=>({mid:w.mid,item}));}
function topicCatalog(module){
  const counts={};for(const sim of state.master.simulations){for(const item of resolveItems(sim.master_simulation_id,module)){const t=topicOf(item);counts[t]=(counts[t]||0)+1}}return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
}
function topicEntries(module,area){const out=[];for(const sim of state.master.simulations){const mid=sim.master_simulation_id;for(const item of resolveItems(mid,module))if(topicOf(item)===area)out.push({mid,item})}return out;}
function topicTrainingHTML(){return MODULES.map(m=>{const topics=topicCatalog(m);return `<details class="card topic-panel"><summary><strong>${moduleName(m)}</strong> — ${topics.length} موضوعًا</summary><div class="topic-buttons">${topics.map(([t,n])=>`<button class="btn" data-action="train-topic" data-module="${m}" data-area="${esc(t)}">${esc(t)} <span class="small muted">(${n})</span></button>`).join('')}</div></details>`}).join('');}
function renderReviewHome(){
  state.ui={view:'review',simId:null,module:null};setTitle('المراجعة الذكية');const readiness=trainingReadiness();const weak=MODULES.map(weakestForModule).filter(Boolean);const weakCards=weak.map(w=>`<article class="card"><span class="pill">${moduleName(w.module)} — ${w.mid}</span><h3>${esc(w.module==='leadership'?(CRITERION_AR[w.area]||w.area):moduleName(w.area)!==w.area?moduleName(w.area):w.area)}</h3><p class="muted">أقل نتيجة مكتشفة: ${w.score}%</p><button class="btn primary" data-action="train-weakness" data-module="${w.module}" data-sim="${w.mid}" data-area="${esc(w.area)}">تدرب على نقطة الضعف</button></article>`).join('');
  el('main').innerHTML=`<section class="hero"><div class="pill">جاهزية التدريب ${readiness.score}%</div><h2>المراجعة الذكية</h2><p>يركز على أخطائك المتكررة وأضعف المجالات في آخر الاختبارات، دون خلط درجات الأقسام المختلفة.</p></section><div class="quick-links"><button class="btn" data-action="mistakes-home">دفتر الأخطاء (${readiness.unresolved})</button><button class="btn" data-action="favorites-home">المفضلة (${state.saved.favorites.length})</button></div><h3>أضعف المجالات المكتشفة</h3><div class="grid">${weakCards||'<div class="empty">أكمل اختبارًا واحدًا على الأقل كي نحدد نقاط الضعف.</div>'}</div><h3>التدريب حسب الموضوع</h3><div class="topic-catalog">${topicTrainingHTML()}</div><div class="btn-row"><button class="btn" data-action="home">الرئيسية</button></div>`;
}

function trainMistakes(mid=null,module=null){
  const issues=unresolvedFor(mid,module),grouped=new Map();for(const x of issues){const k=`${x.mid}|${x.module}|${x.itemId}`;if(!grouped.has(k)){const item=findItem(x.mid,x.module,x.itemId);if(item)grouped.set(k,{mid:x.mid,module:x.module,item})}}
  let entries=[...grouped.values()];if(!module&&entries.length){module=entries[0].module;entries=entries.filter(x=>x.module===module)}if(!module||!entries.length){toast('لا توجد أخطاء مفتوحة لهذا القسم');return;}startReviewSession(module,entries.map(x=>({mid:x.mid,item:x.item})),`أخطائي — ${moduleName(module)}`);
}
function trainFavorites(module){const e=favoriteEntries(module).map(x=>({mid:x.mid,item:x.item}));startReviewSession(module,e,`المفضلة — ${moduleName(module)}`);}
function trainWeakness(mid,module,area){const w={mid,module,area},entries=weaknessEntries(w);startReviewSession(module,entries,`نقطة ضعف — ${moduleName(module)}`);}
function trainTopic(module,area){startReviewSession(module,topicEntries(module,area),`موضوع: ${area}`);}

function resetModule(mid,module,mode='training'){
  if(!confirm('هل تريد إعادة هذا القسم؟ ستُحذف إجابات هذه المحاولة الحالية مع بقاء سجل المحاولات السابقة.'))return;const responseScope=responseScopeFor(mode,false);if(state.saved.responses?.[mid]?.[module])delete state.saved.responses[mid][module][responseScope];if(state.saved.results?.[mid]?.[module])delete state.saved.results[mid][module][responseScope];delete state.saved.sessionMeta[scopeKey(mid,module,responseScope)];persist();startSession(mid,module,mode,false);
}
function toggleFavorite(item){const key=favoriteKey(currentSourceMid(item),state.session.module,item),i=state.saved.favorites.indexOf(key);if(i>=0){state.saved.favorites.splice(i,1);toast('أزيل من المفضلة')}else{state.saved.favorites.push(key);toast('أضيف إلى المفضلة')}persist();renderItem(item);}
function reportText(mid,module,scope='exam'){
  if(module==='full'){const a=state.saved.fullResults?.[mid]||{};return `نتيجة ${mid}\nGCAT: ${a.gcat?.score??'—'}%\nPQ10 — التوافق: ${a.pq10?.alignment??'—'}%\nالسلوكيات المعطلة — التوافق الآمن: ${a.derailers?.safety??'—'}%\nالحكم القيادي — دقة الحكم: ${a.leadership?.accuracy??'—'}%`}
  const r=resultScopes(mid,module)[scope]||latestModuleResult(mid,module);return `${mid} — ${moduleName(module)} — ${modeName(scope)}\n${r?resultHeadline(module,r):'لا توجد نتيجة'}`;
}
async function shareReport(mid,module,scope){const text=reportText(mid,module,scope);try{if(navigator.share)await navigator.share({title:'مدرب المحاكاة القيادية',text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);toast('تم نسخ النتيجة')}else toast('المشاركة غير مدعومة على هذا الجهاز')}catch(e){if(e?.name!=='AbortError')toast('تعذر مشاركة النتيجة')}}
function resetFullRun(mid){
  if(!confirm('هل تريد إعادة المحاكاة الشاملة؟ ستُمسح إجابات المحاولة الشاملة الحالية، مع بقاء سجل المحاولات السابقة.'))return;
  for(const m of MODULES){if(state.saved.responses?.[mid]?.[m])delete state.saved.responses[mid][m].full_exam;delete state.saved.sessionMeta[scopeKey(mid,m,'full_exam')]}
  delete state.saved.fullResults[mid];persist();startSession(mid,'gcat','exam',true);
}

function startFullRun(mid){
  const st=fullRunStatus(mid);
  if(st.started)return startSession(mid,'gcat','exam',true);
  const ok=confirm('ستبدأ المحاكاة الشاملة بأربعة أقسام: GCAT (42 سؤالًا، 20 دقيقة)، PQ10 (144 بندًا، غير موقّت)، السلوكيات المعطلة (60 بندًا، غير موقّت)، ثم الحكم القيادي (16 موقفًا، 45 دقيقة). يحفظ التطبيق تقدمك تلقائيًا ويمكنك الخروج والعودة لاحقًا. هل تريد البدء؟');
  if(!ok)return;
  return startSession(mid,'gcat','exam',true);
}
function handleClick(e){
  const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
  if(a==='home')return renderHome();if(a==='open-sim')return renderSimulation(b.dataset.sim);if(a==='results-home')return renderResultsHome();if(a==='review-home')return renderReviewHome();if(a==='mistakes-home')return renderMistakes();if(a==='favorites-home')return renderFavorites();
  if(a==='start')return startSession(b.dataset.sim,b.dataset.module,b.dataset.mode,false);if(a==='full-run')return startFullRun(b.dataset.sim);
  if(a==='exit-session'){if(state.session?.isReview){state.session=null;persist();toast('تم حفظ حالة المراجعة');return renderReviewHome()}const mid=state.session?.mid||state.ui.simId||b.dataset.sim||'M1';state.session=null;persist();toast('تم حفظ التقدم');return renderSimulation(mid)}
  if(a==='toggle-favorite')return toggleFavorite(state.session.items[state.session.index]);
  if(a==='answer-gcat'){const store=responseStore(state.session.mid,state.session.module,state.session.responseScope);if(state.session.mode==='training'&&store[b.dataset.id]!==undefined){toast('تم تثبيت إجابتك الأولى');return}saveAnswer(b.dataset.id,b.dataset.answer);const item=state.session.items[state.session.index];if(state.session.mode==='training')renderItem(item);else nextItem();return;}
  if(a==='answer-likert'){const store=responseStore(state.session.mid,state.session.module,state.session.responseScope);if(state.session.mode==='training'&&store[b.dataset.id]!==undefined){toast('تم تثبيت إجابتك الأولى');return}saveAnswer(b.dataset.id,b.dataset.answer);const item=state.session.items[state.session.index];if(state.session.mode==='training')renderItem(item);else nextItem();return;}
  if(a==='next')return nextItem();
  if(a==='rate-lead'){if(state.session.mode==='training'&&state.session.feedbackShown){toast('تم تثبيت تقييمات هذا الموقف');return}const store=responseStore(state.session.mid,state.session.module,state.session.responseScope);store[b.dataset.scenario]||={};store[b.dataset.scenario][b.dataset.response]=Number(b.dataset.rating);persist();renderItem(state.session.items[state.session.index]);return;}
  if(a==='submit-lead'){const item=state.session.items[state.session.index];if(state.session.mode==='training'){state.session.feedbackShown=true;showLeadershipFeedback(item)}else nextItem();return;}
  if(a==='restart')return resetModule(b.dataset.sim,b.dataset.module,b.dataset.mode||'training');
  if(a==='train-mistakes')return trainMistakes(b.dataset.sim||null,b.dataset.module||null);if(a==='train-favorites')return trainFavorites(b.dataset.module);if(a==='train-weakness')return trainWeakness(b.dataset.sim,b.dataset.module,b.dataset.area);if(a==='train-topic')return trainTopic(b.dataset.module,b.dataset.area);
  if(a==='toggle-timer'){state.settings.timerVisible=!state.settings.timerVisible;persistSettings();renderSession();return;}
  if(a==='share-report')return shareReport(b.dataset.sim,b.dataset.module,b.dataset.scope||'exam');if(a==='print-report'){window.print();return;}if(a==='restart-full')return resetFullRun(b.dataset.sim);
  if(a==='reset-all'){if(confirm('مسح جميع الإجابات والنتائج ودفتر الأخطاء والمفضلة المحفوظة على هذا الجهاز؟')){state.saved=emptySaved();persist();renderResultsHome()}return;}
}

/* === v1.1 comprehensive UX + analysis upgrade === */
const TRAINING_DISCLAIMER='تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.';
const GUIDE_FILES={
  gcat:'data/guides/gcat-concepts-guide.json',
  profile:'data/guides/podium-personality-derailers-guide.json',
  leadership:'data/guides/leadership-sjt-orientation-v2.json'
};
const HOME_ICONS={guide:'▤',training:'✎',simulation:'☷',review:'◎',results:'▥',install:'⇩'};
let deferredInstallPrompt=null;

function loadSettings(){
  try{return {theme:'light',fontSize:'medium',timerVisible:true,onboardingSeen:false,resultView:'latest',resultScope:'exam',...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}
  catch{return {theme:'light',fontSize:'medium',timerVisible:true,onboardingSeen:false,resultView:'latest',resultScope:'exam'}}
}
function applySettings(){
  document.body.classList.toggle('dark',state.settings.theme==='dark');
  document.body.classList.toggle('font-small',state.settings.fontSize==='small');
  document.body.classList.toggle('font-large',state.settings.fontSize==='large');
}
function updateMobileNav(){
  const nav=el('mobileNav');if(!nav)return;
  const isSession=!!state.session;
  document.body.classList.toggle('session-active',isSession);
  document.body.classList.toggle('exam-clean',isSession&&state.session.mode==='exam');
  document.body.classList.toggle('training-mode',isSession&&state.session.mode==='training');
  document.body.classList.toggle('onboarding-active',state.ui?.view==='onboarding');
  const view=state.ui?.view||'home';
  const active=view==='results'||view==='profile-report'?'results-home':view==='mistakes'?'mistakes-home':(view==='review'||view==='favorites'||view==='review-result')?'review-home':'home';
  if(typeof nav.querySelectorAll!=='function')return;
  nav.querySelectorAll('[data-action]').forEach(btn=>{const on=btn.dataset.action===active;btn.classList.toggle('active',on);if(on)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current')});
}
async function boot(){
  applySettings();
  try{
    state.master=await loadJSON(MASTER_URL);
    const loaded=await Promise.all(Object.entries(state.master.bank_registry).map(async([k,spec])=>[k,await loadVerifiedJSON('data/'+spec.filename,spec.sha256)]));
    state.banks=Object.fromEntries(loaded);
    state.guides={};
    for(const [k,url] of Object.entries(GUIDE_FILES)){try{state.guides[k]=await loadJSON(url)}catch(e){console.warn('Guide load failed',k,e)}}
    validateRuntime();persist();
    if(state.settings.onboardingSeen)renderHome();else renderOnboarding(0);
    if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }catch(e){el('main').innerHTML=`<div class="error-box"><strong>تعذر تشغيل التطبيق.</strong><p>${esc(e.message)}</p><p class="small">شغّل المجلد عبر خادم محلي أو استضافة HTTPS، ولا تفتح index.html مباشرة عبر file://.</p></div>`;}
}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;if(state.ui?.view==='home'&&state.master)renderHome();});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;state.settings.installedAt=new Date().toISOString();persistSettings();toast('تم تثبيت التطبيق');if(state.ui?.view==='home')renderHome();});
function isStandalone(){return window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent||'');}
function showInfoDialog(title,html){
  let d=el('appDialog');if(!d){d=document.createElement('dialog');d.id='appDialog';d.className='app-dialog';document.body.appendChild(d)}
  d.innerHTML=`<div class="dialog-head"><h3>${esc(title)}</h3><button class="icon-btn" data-action="close-dialog" aria-label="إغلاق">×</button></div><div class="dialog-body">${html}</div>`;
  if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');
}
async function installApp(){
  if(isStandalone()){toast('التطبيق مثبت بالفعل');return;}
  if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}catch{}deferredInstallPrompt=null;return;}
  if(isIOS())return showInfoDialog('تثبيت التطبيق على iPhone','<ol class="steps"><li>اضغط زر <strong>المشاركة</strong> في المتصفح.</li><li>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</li><li>اضغط <strong>إضافة</strong>.</li></ol><p class="small muted">لا يسمح iOS للموقع بإضافة الأيقونة تلقائيًا؛ يلزم تأكيدك من واجهة Safari.</p>');
  return showInfoDialog('تثبيت التطبيق','<p>افتح قائمة المتصفح وابحث عن <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>. إذا كان المتصفح يدعم التثبيت المباشر فسيظهر الخيار تلقائيًا.</p>');
}

function requestHome(){
  if(state.session){const ok=confirm('هل تريد حفظ المحاولة والعودة إلى الصفحة الرئيسية؟');if(!ok)return;persist();state.session=null;toast('تم حفظ التقدم');}
  renderHome();
}
function renderOnboarding(step=0){
  state.session=null;state.ui={view:'onboarding',step};setTitle('مرحبًا بك');
  const slides=[
    {icon:'▤',title:'ابدأ بفهم الاختبار',text:'من «قبل أن تبدأ» يمكنك التعرف على طبيعة الأسئلة وما الذي يتم قياسه قبل أول تدريب أو محاكاة.'},
    {icon:'✎',title:'التدريب يختلف عن الامتحان',text:'في التدريب يظهر التصحيح والشرح بعد إجابتك. في الامتحان تختفي التلميحات والتصنيفات حتى تنتهي.'},
    {icon:'✓',title:'تقدمك محفوظ على هذا الجهاز',text:'الإجابات والمحاولات والمفضلة ودفتر الأخطاء تُحفظ محليًا، ويمكنك الخروج والعودة لاحقًا.'}
  ];
  const s=slides[Math.max(0,Math.min(step,2))];
  el('main').innerHTML=`<section class="onboarding-card"><div class="onboarding-icon">${s.icon}</div><div class="small muted">${step+1} من 3</div><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="onboarding-dots">${slides.map((_,i)=>`<span class="${i===step?'active':''}"></span>`).join('')}</div><div class="btn-row"><button class="btn ghost" data-action="finish-onboarding">تخطي</button><button class="btn primary" data-action="${step<2?'next-onboarding':'finish-onboarding'}" data-step="${step+1}">${step<2?'التالي':'ابدأ'}</button></div></section>`;
  updateMobileNav();
}

function iconTile(icon,title,desc,action,extra=''){return `<button class="home-tile" data-action="${action}" ${extra}><span class="home-icon">${icon}</span><strong>${esc(title)}</strong><small>${esc(desc)}</small></button>`;}
function installCardHTML(){if(isStandalone())return'';return `<button class="install-card" data-action="install-app"><span class="install-symbol">${HOME_ICONS.install}</span><span><strong>تثبيت التطبيق</strong><small>${isIOS()?'إضافة إلى الشاشة الرئيسية':'تجربة أسرع والوصول من الشاشة الرئيسية'}</small></span><span class="chev">‹</span></button>`;}
function renderHome(){
  state.session=null;state.ui={view:'home',simId:null,module:null,mode:null};setTitle('منصة التدريب والمحاكاة');const readiness=trainingReadiness();
  el('main').innerHTML=`<section class="home-hero"><div class="hero-kicker">الإصدار <bdi dir="ltr">${APP_VERSION}</bdi></div><h2>مرحبًا بك في منصة التقييمات التجريبية</h2><p>تدرّب، اختبر نفسك، وراجع نقاط ضعفك.</p></section>
  <button class="guide-launch" data-action="orientation-home"><span class="guide-icon">${HOME_ICONS.guide}</span><span><small>قبل أن تبدأ</small><strong>دليل فهم الأسئلة والامتحان</strong><em>اعرف ما الذي تبحث عنه قبل أول محاولة</em></span><span class="chev">‹</span></button>
  <div class="home-actions-grid">
    ${iconTile(HOME_ICONS.training,'التدريب','شرح وتصحيح بعد الإجابة','training-home')}
    ${iconTile(HOME_ICONS.simulation,'المحاكاة','سبع محاكاة واختبارات كاملة','simulation-home')}
    ${iconTile(HOME_ICONS.review,'المراجعة الذكية','أخطاؤك ونقاط ضعفك','review-home')}
    ${iconTile(HOME_ICONS.results,'تقدمي ونتائجي','محاولاتك وتحليلك المتقدم','results-home')}
  </div>
  <button class="quick-review-card" data-action="quick-review"><span>⚡</span><div><strong>مراجعة سريعة قبل الامتحان</strong><small>أهم النقاط في 1–2 دقيقة</small></div><span class="chev">‹</span></button>
  <section class="mini-readiness"><div><strong>${readiness.score}%</strong><span>جاهزية التدريب</span></div><div><strong>${readiness.coverage}%</strong><span>إنجاز الاختبارات</span></div><div><strong>${readiness.unresolved}</strong><span>مراجعات مفتوحة</span></div></section>
  ${installCardHTML()}
  <p class="home-scope-note">«جاهزية التدريب» مؤشر إنجاز ومراجعة داخل التطبيق، وليست درجة سيكومترية أو معيارًا للتوظيف.</p>`;
}
function renderTrainingHub(){
  state.session=null;state.ui={view:'training-hub'};setTitle('التدريب');
  const cards=[
    ['gcat','⌁','GCAT','42 سؤالًا في التدريب الكامل، أو تدريب موجّه حسب الموضوع من المراجعة الذكية.'],
    ['pq10','◉','PQ10','تظهر الإجابة التدريبية المرجعية وسبب اختيار شدتها بعد إجابتك فقط.'],
    ['derailers','△','السلوكيات المعطلة','تعرف بعد الإجابة على المجال والمحور والنقطة التي يقيسها البند.'],
    ['leadership','♟','الحكم القيادي','قيّم التصرفات الأربعة ثم راجع سبب درجة كل تصرف وحدوده.']
  ];
  el('main').innerHTML=`<section class="page-intro"><span class="section-icon">✎</span><div><h2>وضع التدريب</h2><p>اختر القسم ثم المحاكاة. لا يظهر ما يقيسه السؤال إلا بعد تثبيت إجابتك.</p></div></section><div class="mode-card-grid">${cards.map(([m,ic,t,d])=>`<button class="mode-card" data-action="training-module" data-module="${m}"><span class="mode-icon">${ic}</span><strong>${t}</strong><small>${d}</small><span class="chev">‹</span></button>`).join('')}</div><div class="btn-row"><button class="btn" data-action="quick-review">مراجعة سريعة قبل الامتحان</button></div>`;
}
function renderTrainingModule(module){
  state.session=null;state.ui={view:'training-module',module};setTitle(`التدريب — ${moduleName(module)}`);
  const sims=state.master.simulations.map(sim=>{const mid=sim.master_simulation_id;const meta=state.saved.sessionMeta?.[scopeKey(mid,module,'training')];const r=resultScopes(mid,module).training;return `<article class="sim-card"><div><span class="sim-badge">${mid}</span><h3>${esc(sim.title_ar)}</h3><small>${r?'آخر تدريب: '+resultHeadline(module,r):meta?.status==='active'?'محاولة محفوظة للمتابعة':'لم يبدأ التدريب'}</small></div><button class="btn primary" data-action="start" data-sim="${mid}" data-module="${module}" data-mode="training">${moduleLaunchLabel(mid,module,'training')}</button></article>`}).join('');
  el('main').innerHTML=`<div class="section-head"><div><h2>${moduleName(module)}</h2><p class="muted">اختر إحدى المحاكاة السبع لبدء وضع التدريب.</p></div><button class="btn" data-action="review-home">تدريب حسب الموضوع</button></div><div class="sim-grid single-col-mobile">${sims}</div>`;
}
function renderSimulationHub(){
  state.session=null;state.ui={view:'simulation-hub'};setTitle('المحاكاة');
  const sims=state.master.simulations.map(sim=>{const mid=sim.master_simulation_id,p=simProgress(mid),full=fullRunStatus(mid);return `<article class="sim-card"><div class="sim-card-top"><span class="sim-icon">☷</span><span class="sim-badge">${mid}</span></div><h3>${esc(sim.title_ar)}</h3><div class="progress"><span style="width:${p.pct}%"></span></div><small>${full.done?'اكتملت المحاكاة الشاملة':full.started?'محاكاة شاملة محفوظة للمتابعة':`اكتمل ${p.done} من 4 أقسام`}</small><button class="btn primary" data-action="open-sim" data-sim="${mid}">فتح المحاكاة</button></article>`}).join('');
  el('main').innerHTML=`<section class="page-intro"><span class="section-icon">☷</span><div><h2>المحاكاة</h2><p>اختر رقم المحاكاة، ثم اختر التدريب أو الاختبار أو المحاكاة الشاملة أو قسمًا واحدًا.</p></div></section><div class="simulation-type-row"><div class="type-note"><strong>المحاكاة الشاملة</strong><span>جميع الأقسام بالتتابع</span></div><div class="type-note"><strong>محاكاة قسم واحد</strong><span>قسم مستقل في التدريب أو الاختبار</span></div></div><div class="sim-grid">${sims}</div>`;
}
function renderSimulation(mid){
  const sim=state.master.simulations.find(s=>s.master_simulation_id===mid);if(!sim)return renderSimulationHub();state.session=null;state.ui={view:'simulation',simId:mid};setTitle(sim.title_ar);const fst=fullRunStatus(mid);
  const fullDesc=fst.done?'عرض نتيجة المحاكاة الشاملة':fst.started?`متابعة — اكتمل ${fst.finished} من 4 أقسام`:'جميع الأقسام بالتتابع';
  el('main').innerHTML=`<section class="simulation-hero"><span class="sim-big-icon">☷</span><div><h2>${esc(sim.title_ar)}</h2><span class="status-chip">جاهزة</span><p>اختر الوضع الذي يناسبك وابدأ الآن.</p></div></section>
  <div class="mode-card-grid four-modes">
    <button class="mode-card" data-action="section-picker" data-sim="${mid}" data-mode="training"><span class="mode-icon">✎</span><strong>وضع التدريب</strong><small>تصحيح وشرح فوري بعد الإجابة</small></button>
    <button class="mode-card" data-action="section-picker" data-sim="${mid}" data-mode="exam"><span class="mode-icon">☷</span><strong>وضع الامتحان</strong><small>بدون تلميحات أو تصحيح أثناء الحل</small></button>
    <button class="mode-card" data-action="full-run" data-sim="${mid}"><span class="mode-icon">▰</span><strong>المحاكاة الشاملة</strong><small>${fullDesc}</small></button>
    <button class="mode-card" data-action="section-picker" data-sim="${mid}" data-mode="both"><span class="mode-icon">▥</span><strong>محاكاة قسم واحد</strong><small>اختر قسمًا واحدًا للتدريب أو الاختبار</small></button>
  </div>
  <section class="included-card"><h3>الأقسام المشمولة</h3><div class="included-grid"><div><bdi dir="ltr">GCAT</bdi><strong>42</strong><small>سؤالًا</small></div><div><bdi dir="ltr">PQ10</bdi><strong>144</strong><small>بندًا</small></div><div><span>السلوكيات</span><strong>60</strong><small>بندًا</small></div><div><span>الحكم القيادي</span><strong>16</strong><small>موقفًا</small></div></div></section>`;
}
function renderSectionPicker(mid,mode='both'){
  state.session=null;state.ui={view:'section-picker',simId:mid,mode};setTitle(`${mid} — اختر القسم`);
  const mods=[
    ['gcat','GCAT','42 سؤالًا',mode==='exam'?'20 دقيقة ثابتة — 42 سؤالًا':'عددي + لفظي + تجريدي'],
    ['pq10','PQ10','144 بندًا','غير موقّت'],
    ['derailers','السلوكيات المعطلة','60 بندًا','غير موقّت'],
    ['leadership','الحكم القيادي','16 موقفًا',mode==='exam'?'45 دقيقة':'4 تصرفات لكل موقف']
  ];
  const buttons=(m)=>mode==='both'?`<div class="btn-row"><button class="btn" data-action="start" data-sim="${mid}" data-module="${m}" data-mode="training">${moduleLaunchLabel(mid,m,'training')}</button><button class="btn primary" data-action="start" data-sim="${mid}" data-module="${m}" data-mode="exam">${moduleLaunchLabel(mid,m,'exam')}</button></div>`:`<button class="btn ${mode==='exam'?'primary':''}" data-action="start" data-sim="${mid}" data-module="${m}" data-mode="${mode}">${moduleLaunchLabel(mid,m,mode)}</button>`;
  el('main').innerHTML=`<section class="page-intro"><span class="section-icon">${mode==='training'?'✎':'☷'}</span><div><h2>${mode==='training'?'وضع التدريب':mode==='exam'?'وضع الامتحان':'محاكاة قسم واحد'}</h2><p>${mode==='exam'?'لن تظهر تلميحات أو تصنيفات أو شروحات أثناء الحل.':'اختر القسم الذي تريد البدء به.'}</p></div></section><div class="mode-card-grid">${mods.map(([m,n,c,d])=>`<article class="section-select-card"><span class="mode-icon">${m==='gcat'?'⌁':m==='pq10'?'◉':m==='derailers'?'△':'♟'}</span><div><h3>${n}</h3><span class="pill">${c}</span><p>${d}</p></div>${buttons(m)}</article>`).join('')}</div>`;
}

function renderOrientationHub(){
  state.session=null;state.ui={view:'orientation'};setTitle('قبل أن تبدأ');
  el('main').innerHTML=`<section class="page-intro orientation-head"><span class="section-icon">▤</span><div><h2>قبل أن تبدأ</h2><p>دليل فهم الأسئلة والامتحان</p></div></section><div class="new-user-note"><span>◷</span><div><strong>جديد هنا؟ ابدأ بهذا الدليل أولًا</strong><small>اختر القسم الذي تريد فهمه قبل أول تدريب.</small></div></div><div class="guide-card-list">
  <button class="guide-card" data-action="open-guide" data-guide="gcat"><span class="guide-round">⌁</span><div><strong>القدرات الإدراكية GCAT</strong><small>فهم أفكار العددي والتجريدي وطريقة الحل</small></div><span class="chev">‹</span></button>
  <button class="guide-card" data-action="open-guide" data-guide="profile"><span class="guide-round">◉</span><div><strong>الشخصية والسلوكيات المعطلة</strong><small>كيف تفهم اتجاه العبارة وما الذي تقيسه</small></div><span class="chev">‹</span></button>
  <button class="guide-card" data-action="open-guide" data-guide="leadership"><span class="guide-round">♟</span><div><strong>الحكم على المواقف القيادية</strong><small>كيف تقيّم الفعالية من 1 إلى 5</small></div><span class="chev">‹</span></button>
  </div><button class="quick-review-card" data-action="quick-review"><span>⚡</span><div><strong>المراجعة السريعة</strong><small>ملخص 1–2 دقيقة قبل الامتحان</small></div><span class="chev">‹</span></button>`;
}
function guideTableHTML(t){if(!t?.rows?.length)return'';return `<div class="table-wrap guide-table"><table class="table"><thead><tr>${(t.head||[]).map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(row=>`<tr>${(Array.isArray(row)?row:Object.values(row)).map(c=>`<td>${esc(c??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function guideListsHTML(lists=[]){return lists.map(l=>`<section class="guide-list"><h4>${esc(l.heading||'')}</h4><ul>${(l.items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`).join('');}
function guideBoxesHTML(boxes=[]){return boxes.filter(Boolean).map(b=>`<aside class="guide-box"><strong>${esc(b.title||'ملاحظة')}</strong>${(b.lines||[]).map(x=>`<p>${esc(x)}</p>`).join('')}</aside>`).join('');}
function guideFiguresHTML(topic,guide){const assets=guide.assets||[];return (topic.figures||[]).map(f=>{const a=assets.find(x=>x.id===f.asset_id);return a?`<figure class="guide-figure"><img alt="${esc(f.caption||'مثال بصري')}" src="data:${esc(a.mime||'image/png')};base64,${a.data_base64}"><figcaption>${esc(f.caption||'')}</figcaption></figure>`:''}).join('');}
function guideStatementsHTML(statements=[]){if(!statements.length)return'';return `<div class="statement-list">${statements.map(s=>`<div class="statement-example"><p>${esc(s.text||'')}</p><span>${esc(s.direction_ar||'')}</span><strong>${esc(s.model_answer||'')}</strong></div>`).join('')}</div>`;}
function guideTopicHTML(t,guide){return `<details class="guide-topic"><summary>${esc(t.title||t.id||'موضوع')}</summary><div class="guide-topic-body">${t.definition?`<p>${esc(t.definition)}</p>`:''}${t.target_band?`<div class="target-band">${esc(t.target_band)}</div>`:''}${(t.intro||[]).map(x=>`<p>${esc(x)}</p>`).join('')}${t.ideas?.length?`<h4>الأفكار</h4><ul>${t.ideas.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${t.tricks?.length?`<h4>الحيل</h4><ul>${t.tricks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${t.manifestations?.length?`<h4>كيف يظهر</h4><ul>${t.manifestations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${(t.tables||[]).map(guideTableHTML).join('')}${guideListsHTML(t.lists||[])}${guideStatementsHTML(t.statements||[])}${t.rationale?guideBoxesHTML([{title:t.rationale.title,lines:t.rationale.lines}]):''}${t.warning?guideBoxesHTML([{title:t.warning.title,lines:t.warning.lines}]):''}${guideBoxesHTML(t.boxes||[])}${guideFiguresHTML(t,guide)}${(t.examples||[]).map(ex=>`<div class="guide-example"><strong>${esc(ex.title||'مثال')}</strong>${(ex.lines||[]).map(x=>`<p>${esc(x)}</p>`).join('')}</div>`).join('')}</div></details>`;}
function renderGuide(key){
  const g=state.guides?.[key];if(!g)return toast('تعذر تحميل هذا الدليل');state.session=null;state.ui={view:'guide',guide:key};setTitle(g.title||'الدليل');
  const parts=(g.parts||[]).map((p,i)=>`<details class="guide-part" ${i===0?'open':''}><summary>${esc(p.title||p.id||'قسم')}</summary><div class="guide-part-body">${(p.intro||[]).map(x=>`<p>${esc(x)}</p>`).join('')}${(p.tables||[]).map(guideTableHTML).join('')}${guideListsHTML(p.lists||[])}${guideBoxesHTML(p.boxes||[])}${(p.topics||[]).map(t=>guideTopicHTML(t,g)).join('')}</div></details>`).join('');
  el('main').innerHTML=`<section class="guide-title"><span class="section-icon">▤</span><div><h2>${esc(g.title||'الدليل')}</h2><p>${esc(g.subtitle||g.purpose||'')}</p></div></section>${parts}<div class="training-disclaimer static"><strong>ملاحظة:</strong> هذا محتوى تدريبي توجيهي، وليس مفتاحًا رسميًا لجهة اختبار.</div>`;
}
function renderQuickReview(){
  state.session=null;state.ui={view:'quick-review'};setTitle('مراجعة سريعة');
  el('main').innerHTML=`<section class="page-intro"><span class="section-icon">⚡</span><div><h2>مراجعة سريعة قبل الامتحان</h2><p>أهم النقاط التي تحتاج تذكرها خلال 1–2 دقيقة.</p></div></section>
  <section class="quick-review-section"><h3>GCAT</h3><ul><li>حدّد نوع السؤال قبل أن تبدأ الحساب.</li><li>في العددي: راقب النسبة من ماذا، والوحدات، وهل المطلوب الأصل أم القيمة بعد التغيير.</li><li>في التجريدي: افحص بالترتيب الشكل، العدد، التعبئة، الاتجاه، الموضع.</li><li>لا تعتمد قاعدة تفسر انتقالًا واحدًا فقط؛ تحقق من كل المعطيات.</li><li>في وضع الامتحان: 42 سؤالًا خلال 20 دقيقة ثابتة.</li></ul></section>
  <section class="quick-review-section"><h3>الشخصية والسلوكيات المعطلة</h3><ul><li>افهم معنى العبارة وشدتها؛ لا تستخدم «بشدة» بصورة آلية.</li><li>السؤال المعكوس يغيّر اتجاه الإجابة لكنه لا يغيّر السلوك الذي يقاس.</li><li>التخطيط إيجابي عندما يدعم التنفيذ، وقد يصبح مشكلة إذا تحول إلى جمود أو تأجيل.</li><li>لا تحاول رسم صورة مثالية خالية من أي ضعف؛ اقرأ العبارة كما هي وفي سياقها.</li></ul></section>
  <section class="quick-review-section"><h3>الحكم على المواقف القيادية</h3><div class="mini-rating-scale"><span><b>1</b> ضرر/خط أحمر</span><span><b>2</b> حركة بلا تقدم معتبر</span><span><b>3</b> تقدم جزئي حقيقي</span><span><b>4</b> حل قوي بفجوة مهمة</span><span><b>5</b> حل مكتمل الحلقة</span></div><ul><li>التعادل مسموح وقد لا يوجد 5.</li><li>مرّر البديل على بوابة الضرر ثم بوابة الحركة.</li><li>افحص: السبب، الدليل، الكفاية، الإغلاق.</li><li>وجود Action لا يعني تلقائيًا 3.</li></ul></section>`;
}

function questionToolbar(item){if(state.session?.mode==='exam')return'';const fav=isFavorite(item);return `<div class="question-toolbar"><span class="pill">${esc(currentSourceMid(item))}</span><button class="icon-btn small-icon ${fav?'fav-active':''}" data-action="toggle-favorite" aria-label="${fav?'إزالة من المفضلة':'إضافة إلى المفضلة'}" aria-pressed="${fav?'true':'false'}">${fav?'★':'☆'}</button></div>`;}
function sessionModeLabel(s){return s.isReview?'مراجعة':s.mode==='training'?'وضع التدريب':'وضع الامتحان';}
function examNavHTML(){
  const s=state.session;if(!s||s.mode!=='exam')return'';const last=s.index===s.items.length-1;return `<div class="exam-nav"><button class="btn ghost" data-action="prev" ${s.index===0?'disabled':''}>السابق</button><button class="btn primary" data-action="next">${last?'إنهاء الاختبار':'التالي'}</button></div>`;
}
function renderSession(){
  const s=state.session;if(!s)return renderHome();const item=s.items[s.index],n=s.items.length;state.ui={view:'session',simId:s.mid,module:s.module,mode:s.mode};setTitle(s.isReview?`${s.reviewLabel} — ${moduleName(s.module)}`:`${moduleName(s.module)} — ${sessionModeLabel(s)}`);const progress=Math.round(s.index/n*100);
  el('main').innerHTML=`<div class="session-wrap ${s.mode==='exam'?'clean-session':'training-session'}"><div class="session-meta"><div class="session-meta-left"><span class="mode-pill ${s.mode==='exam'?'exam':'training'}">${sessionModeLabel(s)}</span><span class="pill numeric-ltr" dir="ltr">${s.index+1} / ${n}</span></div><div class="timer-controls"><div id="timerSlot"></div></div></div><div class="progress" role="progressbar" aria-label="تقدم الجلسة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><div class="progress-caption">السؤال ${s.index+1} من ${n}</div><div id="questionHost"></div></div>`;renderItem(item);tickTimer();updateMobileNav();
}
function renderGCATText(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];let opts=[];if(item.kind==='numerical')opts=q.options.map(x=>({letter:x.label,text:x.text}));else opts=q.options.map((x,i)=>({letter:'ABCDEF'[i],text:x}));
  const html=opts.map(o=>`<button class="option-btn ${chosen===o.letter?'selected':''}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${o.letter}" aria-pressed="${chosen===o.letter?'true':'false'}"><span class="option-label">${o.letter}</span><span>${esc(o.text)}</span></button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<span class="pill">${item.kind==='numerical'?'عددي':'لفظي'}</span><div class="question-text">${esc(q.question)}</div><div class="options">${html}</div><div id="feedbackHost"></div>${examNavHTML()}</article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
}
function renderAbstract(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];const frames=(q.svg_inline?.frames||[]).map(s=>`<div class="svg-frame">${s}</div>`).join('');const opts='ABCDEF'.split('').map(l=>`<button class="abstract-option ${chosen===l?'selected':''}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${l}" aria-label="الخيار ${l}" aria-pressed="${chosen===l?'true':'false'}"><span class="option-label">${l}</span>${q.svg_inline?.options?.[l]||`<div>${esc(q['option_'+l])}</div>`}</button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<span class="pill">تجريدي</span><div class="question-text">${esc(q.prompt_ar)}</div><div class="abstract-frames">${frames}</div><div class="abstract-options">${opts}</div><div id="feedbackHost"></div>${examNavHTML()}</article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
}
function likertStep(answer){const i=LIKERT.indexOf(answer);return i<0?0:i+1;}
function ratingBadge(answer){if(!answer)return'';const n=likertStep(answer);return `<div class="rating-badge level-${n}">${esc(answer)}</div>`;}
function likertCirclesHTML(item,chosen){const id=storageId(item),step=likertStep(chosen),locked=state.session.mode==='training'&&chosen!==undefined;return `<div class="circle-scale" role="radiogroup" aria-label="مقياس الإجابة">${LIKERT.map((label,i)=>{const n=i+1;return `<button class="rating-circle ${n<=step?'filled':''} ${n===step?'active':''}" data-action="answer-likert" data-id="${esc(id)}" data-answer="${esc(label)}" aria-label="${esc(label)}" aria-checked="${chosen===label?'true':'false'}" role="radio" ${locked?'disabled':''}></button>`}).join('')}</div>${ratingBadge(chosen)}<div class="scale-end-labels"><span>لا أوافق بشدة</span><span>أوافق بشدة</span></div>`;}
function renderLikert(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];const generic=item.kind==='pq10'?'الشخصية — PQ10':'السلوكيات المعطلة';
  el('questionHost').innerHTML=`<article class="question-card likert-question">${questionToolbar(item)}<span class="pill">${generic}</span><div class="question-text">${esc(q.rewritten_question)}</div>${likertCirclesHTML(item,chosen)}<div id="feedbackHost"></div>${examNavHTML()}</article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
}
function leadershipCirclesHTML(item,o,val){const locked=state.session.mode==='training'&&state.session.feedbackShown;return `<div class="circle-scale leadership-circles" role="radiogroup" aria-label="تقييم فعالية التصرف">${[1,2,3,4,5].map(n=>`<button class="rating-circle ${val&&n<=val?'filled':''} ${val===n?'active':''}" data-action="rate-lead" data-scenario="${esc(storageId(item))}" data-response="${esc(o.response_id)}" data-rating="${n}" aria-label="${RATING_LABELS[n]}" aria-checked="${val===n?'true':'false'}" role="radio" ${locked?'disabled':''}></button>`).join('')}</div>${val?`<div class="rating-badge level-${val}">${RATING_LABELS[val]}</div>`:'<div class="rating-placeholder">اختر درجة الفعالية</div>'}<div class="scale-end-labels"><span>غير فعال إطلاقًا</span><span>فعال جدًا</span></div>`;}
function renderLeadership(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),ratings=store[storageId(item)]||{};const actions=q.options.map((o,i)=>{const val=ratings[o.response_id];return `<section class="lead-action"><div class="lead-action-number">${i+1}</div><p>${esc(o.text)}</p>${leadershipCirclesHTML(item,o,val)}</section>`}).join('');const allDone=q.options.every(o=>ratings[o.response_id]!==undefined);
  el('questionHost').innerHTML=`<article class="question-card leadership-question">${questionToolbar(item)}<span class="pill">موقف قيادي</span><h3>${esc(q.title)}</h3><div class="scenario-stem">${esc(q.stem)}</div><div class="lead-instruction">قيّم مدى فعالية كل تصرف من التصرفات أدناه</div><div class="lead-actions">${actions}</div><div class="btn-row submit-row">${state.session.mode==='exam'&&state.session.index>0?'<button class="btn ghost" data-action="prev">السابق</button>':''}<button class="btn primary" data-action="submit-lead" ${allDone?'':'disabled'}>${state.session.mode==='training'?'تأكيد تقييم التصرفات':state.session.index===state.session.items.length-1?'تأكيد وإنهاء الاختبار':'تأكيد ومتابعة'}</button></div><div id="feedbackHost"></div></article>`;
  if(state.session.mode==='training'&&state.session.feedbackShown)showLeadershipFeedback(item);
}
function trainingDisclaimerHTML(){return `<div class="training-disclaimer"><span>!</span><strong>${TRAINING_DISCLAIMER}</strong></div>`;}
function choiceAlignmentText(chosen,model){const d=Math.abs(LIKERT.indexOf(chosen)-LIKERT.indexOf(model));const score=[100,75,50,25,0][d]??0;const label=d===0?'مطابق للنموذج التدريبي':d===1?'قريب من النموذج التدريبي':d===2?'متوسط التوافق':d===3?'منخفض التوافق':'بعيد عن النموذج التدريبي';return {score,label,d};}
function intensityExplanation(q){const model=q.rewritten_answer;if(model==='أوافق')return 'الاتجاه التدريبي هو الموافقة، لكن شدة العبارة أو حدود السياق لا تبرر الانتقال تلقائيًا إلى «أوافق بشدة»؛ لذلك تبقى الموافقة المعتدلة أدق.';if(model==='لا أوافق')return 'الاتجاه التدريبي هو الرفض، لكن وجود سياق أو تفاوت طبيعي في السلوك يجعل «لا أوافق» أدق من الرفض المطلق.';if(model==='محايد')return 'البند يعتمد على السياق أو يوازن بين قطبين مشروعين، لذلك لا توجد موافقة أو مخالفة مطلقة تصلح لكل موقف.';return'';}
function showTrainingFeedback(item,chosen){
  const host=el('feedbackHost');if(!host)return;
  if(item.kind==='numerical'){
    const q=item.data,ok=chosen===q.correct_answer;let dist='';if(!ok&&q.distractor_analysis){const d=q.distractor_analysis[chosen]||q.distractor_analysis?.find?.(x=>x.option===chosen);if(d)dist=`<p><strong>لماذا هذا مشتت؟</strong> ${esc(typeof d==='string'?d:d.explanation||d.reason||'')}</p>`}
    host.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><h4 class="${ok?'correct':'incorrect'}">${ok?'إجابة صحيحة':'الإجابة الصحيحة: '+esc(q.correct_answer)}</h4><p>${esc(q.explanation||'')}</p>${q.fast_method?`<p><strong>الطريقة الأسرع:</strong> ${esc(q.fast_method)}</p>`:''}${dist}${trainingDisclaimerHTML()}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }else if(item.kind==='verbal'){
    const q=item.data,ok=chosen===q.correct_option_letter;host.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><h4 class="${ok?'correct':'incorrect'}">${ok?'إجابة صحيحة':'الإجابة الصحيحة: '+esc(q.correct_option_letter)}</h4><p>${esc(q.explanation||'')}</p>${q.shortcut?`<p><strong>ملاحظة سريعة:</strong> ${esc(q.shortcut)}</p>`:''}${trainingDisclaimerHTML()}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }else if(item.kind==='abstract'){
    const q=item.data,ok=chosen===q.correct_option,de=q.distractor_explanations?.[chosen];host.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><h4 class="${ok?'correct':'incorrect'}">${ok?'إجابة صحيحة':'الإجابة الصحيحة: '+esc(q.correct_option)}</h4><p>${esc(q.explanation_ar||'')}</p>${!ok&&de?`<p><strong>لماذا هذا مشتت؟</strong> ${esc(typeof de==='string'?de:de.explanation||de.reason||'')}</p>`:''}${trainingDisclaimerHTML()}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }else if(item.kind==='pq10'||item.kind==='derailers'){
    const q=item.data,model=q.rewritten_answer,al=choiceAlignmentText(chosen,model);let selectedMeaning='';if(item.kind==='derailers'&&q.option_guidance?.[chosen])selectedMeaning=q.option_guidance[chosen].meaning||'';else selectedMeaning=`اختيارك يبعد ${al.d} ${al.d===1?'درجة':'درجات'} عن الإجابة التدريبية المرجعية على المقياس الخماسي.`;
    const measure=item.kind==='pq10'?q.measures:(q.analytic_axis||q.measures||q.source_domain),sub=q.subtrait||q.analytic_subtrait||'';
    const healthy=item.kind==='derailers'&&q.healthy_expression?`<div class="behavior-poles"><div><span>السلوك المتزن</span><strong>${esc(q.healthy_expression)}</strong></div><div><span>النمط المعطّل المحتمل</span><strong>${esc(q.derailer_risk_expression||'')}</strong></div></div>`:'';
    const intense=intensityExplanation(q);const details=intense?`<details class="feedback-detail"><summary>${model==='محايد'?'لماذا الحياد هنا؟':'لماذا ليست الإجابة الأقوى؟'}</summary><p>${esc(intense)}</p></details>`:'';
    host.innerHTML=`<div class="feedback profile-feedback ${chosen===model?'good':''}"><div class="feedback-title-row"><h4>الإجابة التدريبية المرجعية: <span class="correct">${esc(model)}</span></h4><span class="alignment-chip">${al.score}% — ${esc(al.label)}</span></div><div class="measured-box"><span>ما الذي يقيسه هذا السؤال؟</span><strong>${esc(measure)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div><p>${esc(q.training_explanation||q.answer_basis||'')}</p><p><strong>قراءة اختيارك:</strong> ${esc(selectedMeaning)}</p>${healthy}${details}${likertOptionComparison(q,item.kind)}${trainingDisclaimerHTML()}</div><div class="btn-row"><button class="btn primary" data-action="next">التالي</button></div>`;
  }
}
function showLeadershipFeedback(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope)[storageId(item)];const at=q.app_training||{};const measure=`<section class="scenario-measure"><span>ما الذي يقيسه هذا الموقف؟</span><strong>${esc(at.criterion_ar||CRITERION_AR[q.criterion]||q.criterion)}</strong><p>${esc(at.what_it_measures||'')}</p>${at.target_behaviour?`<p><b>السلوك المستهدف:</b> ${esc(at.target_behaviour)}</p>`:''}</section>`;
  const blocks=q.options.map((o,i)=>{const user=store[o.response_id],model=o.app_score,tf=o.training_feedback||{},same=user===model;const full=tf.full_explanation||o.explanation||o.app_score_reason||'';return `<div class="feedback leadership-feedback ${same?'good':''}"><div class="feedback-title-row"><h4>التصرف ${i+1}</h4><span class="${same?'match-chip':'diff-chip'}">درجتك ${user} — المرجعية ${model}</span></div><p class="small muted"><strong>المعيار:</strong> ${esc(tf.criterion_ar||at.criterion_ar||CRITERION_AR[o.criterion]||o.criterion)} · ${esc(tf.rating_label||o.app_score_label||RATING_LABELS[model])}</p><p><strong>لماذا هذه الدرجة؟</strong> ${esc(tf.why_this_rating||o.app_score_reason||'')}</p><details class="feedback-detail"><summary>لماذا ليست أعلى أو أقل؟</summary><p>${esc(full)}</p>${tf.boundary_tested?`<p class="small"><strong>الحد الذي يختبره التصرف:</strong> ${esc(tf.boundary_tested)}</p>`:''}</details>${trainingDisclaimerHTML()}</div>`}).join('');
  el('feedbackHost').innerHTML=measure+blocks+`<div class="btn-row"><button class="btn primary" data-action="next">${state.session.index===state.session.items.length-1?'إنهاء التدريب':'التالي'}</button></div>`;
}
function previousItem(){const s=state.session;if(!s||s.index<=0)return;s.index--;s.feedbackShown=false;renderSession();}
function unansweredCount(){const s=state.session;if(!s)return 0;const store=responseStore(s.mid,s.module,s.responseScope);return s.items.filter(it=>!itemComplete(s.module,it,store)).length;}
function nextItem(){const s=state.session;if(!s)return;if(s.index>=s.items.length-1){if(s.mode==='exam'){const n=unansweredCount();if(n>0&&!confirm(`لديك ${n} عنصرًا غير مجاب. هل تريد إنهاء الاختبار الآن؟`))return;}return finishSession();}s.index++;s.feedbackShown=false;renderSession();}


function tickTimer(){
  const s=state.session,slot=el('timerSlot');if(!slot||!s?.deadline){if(slot)slot.innerHTML='';return;}const remaining=Math.max(0,s.deadline-Date.now()),sec=Math.floor(remaining/1000),min=Math.floor(sec/60),ss=String(sec%60).padStart(2,'0'),cls=sec<=60?'danger':sec<=300?'warn':'';
  slot.innerHTML=`<span class="pill timer ${cls} numeric-ltr" dir="ltr">⏱ ${min}:${ss}</span>`;
  const sk=scopeKey(s.mid,s.module,s.responseScope),meta=state.saved.sessionMeta[sk]||{},shown=new Set(meta.alertsShown||[]);for(const [threshold,label] of [[600,'10 دقائق'],[300,'5 دقائق'],[60,'دقيقة واحدة']]){if(sec<=threshold&&sec>0&&!shown.has(threshold)){shown.add(threshold);meta.alertsShown=[...shown];state.saved.sessionMeta[sk]=meta;persist();toast(`تنبيه: تبقى ${label}`)}}
  if(remaining<=0){finishSession(true);return;}setTimeout(tickTimer,1000);
}

function normalizedDirectional(q,answer){const ai=LIKERT.indexOf(answer),mi=LIKERT.indexOf(q.rewritten_answer);if(ai<0||mi<0||mi===2)return null;const sign=mi>2?1:-1;return ((ai-2)*sign+2)/4*100;}
function alignmentScore(q,answer){const a=LIKERT.indexOf(answer),m=LIKERT.indexOf(q.rewritten_answer);if(a<0||m<0)return null;return [100,75,50,25,0][Math.abs(a-m)];}
function average(a){const v=a.filter(Number.isFinite);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;}
function profileLevel(v){if(v===null)return'غير كافٍ';if(v>=75)return'مرتفع';if(v>=58)return'متوسط إلى مرتفع';if(v>=42)return'متوازن/متوسط';if(v>=25)return'متوسط إلى منخفض';return'منخفض';}
const PROFILE_PHRASES={
 'التواصل والتأثير الفعال':['تميل إلى تكييف رسالتك والاستماع وبناء الفهم المشترك.','قد تميل إلى أسلوب تواصل أكثر ثباتًا أو مباشرة، مع مساحة لتطوير التكييف والتأثير.'],
 'المبادرة':['تميل إلى التحرك وتحمل ملكية الإجراء بدل الانتظار.','قد تميل إلى التريث أو انتظار دفع خارجي قبل التحرك.'],
 'اتخاذ القرار وتحمل المسؤولية':['تميل إلى الحسم وتحمل تبعات القرار مع استخدام المعطيات.','قد تميل إلى زيادة التردد أو توزيع مسؤولية القرار عند عدم اليقين.'],
 'القيادة الملهمة':['تميل إلى الحضور القيادي وتمكين الفريق وربط الأفراد بالهدف.','قد يكون أسلوبك أكثر تنفيذية وأقل اعتمادًا على التحفيز وإشراك الآخرين.'],
 'التفكير الاستراتيجي':['تميل إلى ربط المعلومات بالصورة الأوسع والآثار اللاحقة.','قد تركز أكثر على المعطيات المباشرة والنتيجة القريبة من الصورة بعيدة المدى.'],
 'تطوير المهارات':['تميل إلى نقل المعرفة والتغذية الراجعة وبناء قدرة الآخرين.','قد تركز أكثر على إنجاز المهمة بنفسك من الاستثمار المنتظم في تطوير الآخرين.'],
 'القدرة على التكيف':['تميل إلى تعديل الخطة مع تغير المعطيات والعمل تحت عدم اليقين.','قد تفضّل الثبات والوضوح قبل تغيير المسار أو العمل في ظروف متقلبة.'],
 'التحليل والتخطيط المنهجي':['تميل إلى التنظيم والتحقق والتخطيط قبل التنفيذ.','قد تميل إلى التنفيذ الأسرع مع بنية تحليلية أو تخطيطية أخف.']
};
function profilePhrase(name,v){const p=PROFILE_PHRASES[name]||['يميل نمط إجاباتك نحو القطب التدريبي المرغوب.','يميل نمط إجاباتك بعيدًا عن القطب التدريبي المرغوب.'];return v>=50?p[0]:p[1];}
function moduleBehaviorAnalysis(mid,module,scope){
  const items=resolveItems(mid,module),store=state.saved.responses?.[mid]?.[module]?.[scope]||{},groups={};let answered=[];
  for(const item of items){const q=item.data,a=store[storageId(item)];if(a===undefined)continue;answered.push(a);const key=module==='pq10'?q.measures:(q.analytic_axis||q.source_domain);(groups[key]||={dir:[],align:[],n:0});const dir=normalizedDirectional(q,a),al=alignmentScore(q,a);if(dir!==null)groups[key].dir.push(dir);if(al!==null)groups[key].align.push(al);groups[key].n++;}
  const out={};for(const [k,g] of Object.entries(groups)){out[k]={directional:Math.round(average(g.dir)??50),alignment:Math.round(average(g.align)??0),count:g.n};if(module==='derailers')out[k].risk=Math.round(100-(average(g.align)??100));}
  return {groups:out,answered,total:items.length};
}
function responseStyleAnalysis(answers){if(!answers.length)return{score:0,extremes:0,neutral:0,dominant:0,warnings:['لا توجد إجابات كافية.']};const counts=Object.fromEntries(LIKERT.map(x=>[x,answers.filter(a=>a===x).length]));const n=answers.length,extremes=percent((counts[LIKERT[0]]||0)+(counts[LIKERT[4]]||0),n),neutral=percent(counts[LIKERT[2]]||0,n),dominant=percent(Math.max(...Object.values(counts)),n);let score=100,warnings=[];if(extremes>70){score-=Math.min(22,Math.round((extremes-70)*.8));warnings.push('استخدام مرتفع جدًا للإجابات القصوى.')}if(neutral>45){score-=Math.min(22,Math.round((neutral-45)*.8));warnings.push('استخدام مرتفع للخيار الأوسط.')}if(dominant>65){score-=Math.min(22,Math.round((dominant-65)*.7));warnings.push('نمط الإجابة متركز بصورة كبيرة في خيار واحد.')}return{score:Math.max(40,score),extremes,neutral,dominant,warnings};}
function crossSimulationConsistency(module,scope){
  const bySource={};for(const sim of state.master.simulations){const mid=sim.master_simulation_id,store=state.saved.responses?.[mid]?.[module]?.[scope]||{};for(const item of resolveItems(mid,module)){const a=store[storageId(item)];if(a===undefined)continue;const q=item.data,v=normalizedDirectional(q,a);if(v===null)continue;(bySource[q.source_question_id]||=[]).push(v)}}
  const scores=[];let repeated=0;for(const vals of Object.values(bySource)){if(vals.length<2)continue;repeated++;for(let i=0;i<vals.length;i++)for(let j=i+1;j<vals.length;j++)scores.push(100-Math.abs(vals[i]-vals[j]));}
  return{score:scores.length?Math.round(average(scores)):null,repeated_sources:repeated,pairs:scores.length};
}
function confidenceAnalysis(mid,scope){
  const p=moduleBehaviorAnalysis(mid,'pq10',scope),d=moduleBehaviorAnalysis(mid,'derailers',scope),answers=[...p.answered,...d.answered],total=p.total+d.total,completeness=percent(answers.length,total),style=responseStyleAnalysis(answers),pc=crossSimulationConsistency('pq10',scope),dc=crossSimulationConsistency('derailers',scope);const cs=[pc.score,dc.score].filter(Number.isFinite),consistency=cs.length?Math.round(average(cs)):null;let score,notes=[];
  if(consistency!==null&&(pc.repeated_sources+dc.repeated_sources)>=10){score=Math.round(completeness*.35+consistency*.45+style.score*.20);notes.push(`تم التحقق عبر ${pc.repeated_sources+dc.repeated_sources} فكرة مكررة في محاكاة مختلفة.`);}else{score=Math.min(78,Math.round(completeness*.65+style.score*.35));notes.push('الثقة أولية لأن الصيغ المكررة عبر محاكاة متعددة غير كافية للتحقق من ثبات النمط.');}
  const alignmentVals=[];let unwarrantedExtreme=0,moderatePolarityCount=0;for(const module of ['pq10','derailers']){const store=state.saved.responses?.[mid]?.[module]?.[scope]||{};for(const item of resolveItems(mid,module)){const a=store[storageId(item)];if(a!==undefined){const v=alignmentScore(item.data,a);if(v!==null)alignmentVals.push(v);const mi=LIKERT.indexOf(item.data.rewritten_answer),ai=LIKERT.indexOf(a);if((mi===1||mi===3)&&ai>=0){moderatePolarityCount++;if((mi===3&&ai===4)||(mi===1&&ai===0))unwarrantedExtreme++;}}}}const overallAlignment=average(alignmentVals),desirableExtremeRate=moderatePolarityCount?percent(unwarrantedExtreme,moderatePolarityCount):0;if(desirableExtremeRate>85){score=Math.min(score,55);notes.push('معظم البنود التي يكتفي مفتاحها التدريبي بإجابة معتدلة دُفعت إلى الطرف الأقصى المرغوب. قد يكون ذلك نمطًا حقيقيًا، لكنه قد يشير إلى مبالغة إيجابية؛ لذلك خُفّضت الثقة في دقة الملف ويُنصح بقراءته بحذر.');}else if(desirableExtremeRate>70){score=Math.min(score,68);notes.push('هناك ميل مرتفع إلى تحويل الإجابات التدريبية المعتدلة إلى أطراف قصوى مرغوبة. قد يعكس ذلك شدة حقيقية، لكنه يقلل الثقة في التمييز الدقيق بين السمات.');}else if(Number.isFinite(overallAlignment)&&overallAlignment>94&&style.extremes>65){score=Math.max(40,score-10);notes.push('الإجابات شديدة الاقتراب من النموذج التدريبي مع استخدام مرتفع للأطراف؛ قد يكون ذلك نمطًا حقيقيًا، لكنه يقلل الثقة في التمييز بين السمات ويستدعي قراءة النتيجة بحذر.');}
  style.desirableExtreme=desirableExtremeRate;notes.push(...style.warnings);const label=score>=80?'مرتفعة':score>=60?'متوسطة':'منخفضة';return{score,label,completeness,style,consistency,repeated_sources:pc.repeated_sources+dc.repeated_sources,overallAlignment:Number.isFinite(overallAlignment)?Math.round(overallAlignment):null,notes};
}
function synthesizeProfile(pq,der){
  const p=pq.groups,d=der.groups,out=[];const add=(pm,da,good,caution)=>{const ps=p[pm]?.directional,dr=d[da]?.risk;if(!Number.isFinite(ps)||!Number.isFinite(dr))return;if(ps>=60&&dr>=45)out.push(caution);else if(ps>=60&&dr<35)out.push(good);};
  add('التحليل والتخطيط المنهجي','المثالية الزائدة','تنظيم وتحليل مرتفعان مع مؤشرات منخفضة على تحول الانضباط إلى مثالية زائدة.','التنظيم والتحليل من نقاط القوة، لكن تحت الضغط قد يميلان إلى تدقيق زائد أو صعوبة الاكتفاء بحل كافٍ.');
  add('المبادرة','التهور / ضعف الانضباط','مبادرة مرتفعة مع مؤشرات منخفضة على الاندفاع؛ نمط يميل إلى التحرك المنضبط.','المبادرة واضحة، لكن توجد إشارات تستحق الانتباه إلى الفرق بين السرعة والاندفاع تحت الضغط.');
  add('اتخاذ القرار وتحمل المسؤولية','اعتماد مفرط','الحسم وتحمل المسؤولية يظهران مع استقلال جيد عن طلب الموافقة الزائدة.','الحسم ظاهر في الشخصية، لكن تحت الضغط قد يزداد طلب الطمأنة أو موافقة الآخرين قبل القرار.');
  add('التواصل والتأثير الفعال','التحفظ','التواصل والتأثير يظهران مع مؤشرات منخفضة على الانسحاب عند الضغط.','التواصل جيد في الظروف العادية، مع احتمال انخفاض الحضور أو الانفتاح عندما يرتفع الضغط.');
  add('القيادة الملهمة','التنافسية المفرطة','الحضور القيادي يقترن بمؤشرات منخفضة على تحويل الإنجاز إلى منافسة فردية.','الحضور القيادي قوي، لكن قد تظهر تحت الضغط حساسية أكبر للمقارنة أو الاعتراف الفردي.');
  return out.slice(0,5);
}
function profileReportData(mid,scope='exam'){
  const pq=moduleBehaviorAnalysis(mid,'pq10',scope),der=moduleBehaviorAnalysis(mid,'derailers',scope),confidence=confidenceAnalysis(mid,scope),synthesis=synthesizeProfile(pq,der);return{pq,der,confidence,synthesis};
}
function leadershipDiagnostics(mid,scope='exam'){
  const items=resolveItems(mid,'leadership'),store=state.saved.responses?.[mid]?.leadership?.[scope]||{};const c={harm_gate_miss:0,ineffective_action_overrated:0,partial_action_overrated:0,partial_action_underrated:0,effective_action_underrated:0,closure_gap_missed:0,complete_action_underrated:0};let rated=0,delta=[];
  for(const item of items){const r=store[storageId(item)]||{};for(const o of item.data.options){const u=r[o.response_id],m=o.app_score;if(u===undefined)continue;rated++;delta.push(u-m);if(m===1&&u>=2)c.harm_gate_miss++;if(m===2&&u>=3)c.ineffective_action_overrated++;if(m===3&&u>=4)c.partial_action_overrated++;if(m===3&&u<=2)c.partial_action_underrated++;if(m===4&&u<=3)c.effective_action_underrated++;if(m===4&&u===5)c.closure_gap_missed++;if(m===5&&u<=4)c.complete_action_underrated++;}}
  const defs=[['ineffective_action_overrated','تميل إلى رفع تقييم الإجراءات الشكلية أو التي لا تحقق تقدمًا معتبرًا من 2 إلى 3 أو أعلى.'],['effective_action_underrated','تميل أحيانًا إلى التقليل من قيمة الحلول القوية التي تحقق النتيجة الأساسية رغم وجود فجوة غير قاتلة.'],['closure_gap_missed','تميل إلى منح 5 لبعض الحلول القوية قبل اكتمال الإغلاق أو المتابعة.'],['harm_gate_miss','تحتاج تشديد حساسية بوابة الضرر؛ بعض التصرفات الضارة رُفعت فوق 1.'],['partial_action_overrated','تميل إلى رفع الحل الجزئي من 3 إلى 4 قبل أن يحقق النتيجة الأساسية.'],['complete_action_underrated','تميل إلى التشدد مع الحلول المكتملة ومنحها أقل من 5.'],['partial_action_underrated','تميل إلى خفض بعض الإجراءات التي تحقق تقدمًا حقيقيًا من 3 إلى 2 أو أقل.']];
  const patterns=defs.map(([k,text])=>({key:k,count:c[k],text,confidence:c[k]>=5?'مرتفعة':c[k]>=3?'متوسطة':'منخفضة'})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);const meanDelta=delta.length?average(delta):0;const calibration=meanDelta>.25?'ميل عام لرفع الدرجات':meanDelta<-.25?'ميل عام لخفض الدرجات':'معايرة عامة متوازنة';return{counts:c,patterns,rated,total:64,confidence:rated>=56?'مرتفعة':rated>=40?'متوسطة':'منخفضة',meanDelta:Math.round(meanDelta*100)/100,calibration};
}
function renderProfileReport(mid,scope='exam'){
  state.session=null;state.ui={view:'profile-report',simId:mid,scope};setTitle(`${mid} — التحليل السلوكي`);const data=profileReportData(mid,scope),pqEntries=Object.entries(data.pq.groups).sort((a,b)=>b[1].directional-a[1].directional),derEntries=Object.entries(data.der.groups).sort((a,b)=>b[1].risk-a[1].risk);if(!data.pq.answered.length||!data.der.answered.length){el('main').innerHTML=`<div class="empty">أكمل PQ10 والسلوكيات المعطلة في النمط نفسه أولًا للحصول على التحليل المتكامل.</div>`;return;}
  el('main').innerHTML=`<section class="profile-report-hero"><div><span>الملف السلوكي المستنتج من إجاباتك</span><h2>${mid}</h2><p>هذا وصف تدريبي مبني على نمط إجاباتك، وليس تشخيصًا نفسيًا أو حقيقة مطلقة عن شخصيتك.</p></div><div class="confidence-ring ${data.confidence.label==='مرتفعة'?'high':data.confidence.label==='متوسطة'?'medium':'low'}"><strong>${data.confidence.label}</strong><small>الثقة في الاستنتاج</small></div></section>
  <section class="card confidence-card"><h3>جودة الاستجابة والثقة</h3><div class="mini-grid"><div class="mini-stat"><span>الثقة</span><strong>${data.confidence.score}%</strong></div><div class="mini-stat"><span>اكتمال الإجابات</span><strong>${data.confidence.completeness}%</strong></div><div class="mini-stat"><span>الاتساق عبر المحاكاة</span><strong>${data.confidence.consistency??'غير متاح'}${data.confidence.consistency!==null?'%':''}</strong></div><div class="mini-stat"><span>الإجابات القصوى</span><strong>${data.confidence.style.extremes}%</strong></div></div><ul>${data.confidence.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></section>
  <section class="card"><h3>نمط الشخصية الظاهر — PQ10</h3><div class="trait-list">${pqEntries.map(([k,v])=>`<div class="trait-row"><div><strong>${esc(k)}</strong><small>${esc(profilePhrase(k,v.directional))}</small></div><span>${profileLevel(v.directional)}</span></div>`).join('')}</div></section>
  <section class="card"><h3>السلوكيات المحتملة تحت الضغط</h3><p class="muted small">النسب أدناه تعبر عن الابتعاد عن النمط التدريبي الآمن داخل هذا البنك، وليست تشخيصًا سريريًا.</p><div class="trait-list">${derEntries.map(([k,v])=>`<div class="trait-row"><div><strong>${esc(k)}</strong><small>${v.risk<30?'مؤشرات منخفضة في هذه المحاولة.':v.risk<50?'مؤشرات متوسطة تستحق المراجعة في السياق.':'هذا من أعلى الأنماط ظهورًا نسبيًا في إجابات هذه المحاولة.'}</small></div><span>${v.risk}%</span></div>`).join('')}</div></section>
  ${data.synthesis.length?`<section class="card"><h3>القراءة المشتركة</h3><ul class="synthesis-list">${data.synthesis.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}
  <section class="card"><h3>كيف تقرأ مستوى الثقة؟</h3><p>«ثقة منخفضة» لا تعني أن المستخدم غير صادق. تعني أن البيانات الحالية أقل اتساقًا، أو شديدة التمركز في نمط إجابة واحد، أو لا تتضمن محاولات مكررة كافية لتثبيت الاستنتاج.</p></section>${reportActions(mid,'profile',scope)}`;
}

function reportText(mid,module,scope='exam'){
  if(module==='profile'){const d=profileReportData(mid,scope);return `${mid} — الملف السلوكي المستنتج\nالثقة في الاستنتاج: ${d.confidence.label} (${d.confidence.score}%)\nهذا تحليل تدريبي وليس تشخيصًا نفسيًا أو حقيقة مطلقة.`;}
  if(module==='full'){const a=state.saved.fullResults?.[mid]||{};return `نتيجة ${mid}\nGCAT: ${a.gcat?.score??'—'}%\nPQ10 — التوافق: ${a.pq10?.alignment??'—'}%\nالسلوكيات المعطلة — التوافق الآمن: ${a.derailers?.safety??'—'}%\nالحكم القيادي — دقة الحكم: ${a.leadership?.accuracy??'—'}%`}
  const r=resultScopes(mid,module)[scope]||latestModuleResult(mid,module);return `${mid} — ${moduleName(module)} — ${modeName(scope)}\n${r?resultHeadline(module,r):'لا توجد نتيجة'}`;
}
function leadershipDiagnosticsHTML(mid,scope){const d=leadershipDiagnostics(mid,scope);return `<section class="card"><div class="card-head"><h3>تشخيص نمط الحكم القيادي</h3><span class="confidence-chip">ثقة ${d.confidence}</span></div><p class="muted">${esc(d.calibration)} · متوسط الانحياز ${d.meanDelta>0?'+':''}${d.meanDelta}</p>${d.patterns.length?`<div class="diagnostic-list">${d.patterns.slice(0,5).map(p=>`<div><strong>${p.count} مرات — ثقة ${p.confidence}</strong><span>${esc(p.text)}</span></div>`).join('')}</div>`:'<p>لم يظهر نمط خطأ متكرر واضح في هذه المحاولة.</p>'}</section>`;}

function renderResult(mid,module,r,timedOut=false){
  state.session=null;state.ui={view:'result',simId:mid,module,mode:r.mode};setTitle(`${mid} — نتيجة ${moduleName(module)}`);let scores='',detail='';
  if(module==='gcat'){scores=`<div class="score-box"><div class="score"><span>النتيجة</span><strong>${r.score}%</strong></div><div class="score"><span>الصحيح</span><strong><bdi dir="ltr">${r.correct}/${r.total}</bdi></strong></div>${Object.entries(r.domains).map(([k,v])=>`<div class="score"><span>${moduleName(k)}</span><strong>${v.score}%</strong></div>`).join('')}</div>`;const weakest=Object.entries(r.topics||{}).sort((a,b)=>a[1].score-b[1].score).slice(0,6);if(weakest.length)detail=`<section class="card"><h3>أضعف الموضوعات في هذه المحاولة</h3><div class="mini-grid">${weakest.map(([k,v])=>`<div class="mini-stat"><span>${esc(k)}</span><strong>${v.score}%</strong></div>`).join('')}</div></section>`;}
  if(module==='pq10')scores=`<div class="score-box"><div class="score"><span>مدى التوافق مع النموذج التدريبي</span><strong>${r.alignment}%</strong></div>${Object.entries(r.groups).map(([k,v])=>`<div class="score"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join('')}</div>`;
  if(module==='derailers')scores=`<div class="score-box"><div class="score"><span>مدى التوافق مع النموذج التدريبي الآمن</span><strong>${r.safety}%</strong></div><div class="score"><span>مؤشر الابتعاد التدريبي</span><strong>${r.risk}%</strong></div>${Object.entries(r.groups).map(([k,v])=>`<div class="score"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join('')}</div>`;
  if(module==='leadership'){scores=`<div class="score-box"><div class="score"><span>دقة الحكم</span><strong>${r.accuracy}%</strong></div><div class="score"><span>التصرفات المقيمة</span><strong><bdi dir="ltr">${r.rated}/${r.total||64}</bdi></strong></div><div class="score"><span>تطابق تام</span><strong>${r.exact_match}%</strong></div><div class="score"><span>رفعت التقييم</span><strong>${r.overrated}</strong></div><div class="score"><span>خفضت التقييم</span><strong>${r.underrated}</strong></div></div>`;detail=compactBreakdown('الأداء حسب المعيار',r.criteria,k=>CRITERION_AR[k]||k)+compactBreakdown('دقة الحدود',r.boundaries||{})+leadershipDiagnosticsHTML(mid,r.responseScope||r.mode||'exam');}
  const reviewCount=unresolvedFor(mid,module).length;const profileButton=(module==='pq10'||module==='derailers')&&state.saved.responses?.[mid]?.pq10?.[r.responseScope]&&state.saved.responses?.[mid]?.derailers?.[r.responseScope]?`<section class="card"><h3>تحليل الملف السلوكي</h3><p>اربط نمط الشخصية بالسلوكيات المحتملة تحت الضغط، مع تقدير الثقة في الاستنتاج.</p><button class="btn primary" data-action="profile-report" data-sim="${mid}" data-scope="${r.responseScope}">فتح التحليل المتقدم</button></section>`:'';
  el('main').innerHTML=`<section class="hero report-hero"><div class="pill">${timedOut?'انتهى الوقت':'اكتمل القسم'}</div><h2>${moduleName(module)}</h2><p>${resultInterpretation(module)}</p></section>${scores}${detail}${profileButton}${r.responseScope==='exam'?comparisonHTML(mid,module,'exam',r):''}${reviewCount?`<section class="card"><h3>مراجعة مقترحة</h3><p>لديك ${reviewCount} عنصرًا مفتوحًا في هذا القسم.</p><button class="btn primary" data-action="train-mistakes" data-sim="${mid}" data-module="${module}">تدرب على أخطائي فقط</button></section>`:''}${reportActions(mid,module,r.responseScope||r.mode||'training')}<div class="btn-row"><button class="btn primary" data-action="open-sim" data-sim="${mid}">العودة للمحاكاة</button><button class="btn" data-action="restart" data-sim="${mid}" data-module="${module}" data-mode="${r.mode||'training'}">إعادة المحاولة</button></div>`;
}
function renderFullRunResult(mid){
  state.session=null;const all=state.saved.fullResults?.[mid]||{},g=all.gcat,p=all.pq10,d=all.derailers,l=all.leadership;state.ui={view:'full-result',simId:mid,module:null,mode:'exam'};setTitle(`${mid} — النتيجة الشاملة`);const reviewCount=unresolvedFor(mid,null).length;
  el('main').innerHTML=`<section class="hero report-hero"><div class="pill">اكتملت المحاكاة الشاملة</div><h2>${mid}</h2><p>تعرض النتائج حسب كل قسم مستقلًا؛ لا تُدمج المقاييس المختلفة في نسبة نفسية واحدة.</p></section><div class="score-box"><div class="score"><span>GCAT</span><strong>${g?g.score+'%':'—'}</strong></div><div class="score"><span>PQ10 — التوافق التدريبي</span><strong>${p?p.alignment+'%':'—'}</strong></div><div class="score"><span>السلوكيات — التوافق الآمن</span><strong>${d?d.safety+'%':'—'}</strong></div><div class="score"><span>الحكم القيادي</span><strong>${l?l.accuracy+'%':'—'}</strong></div></div>${g?compactBreakdown('GCAT — المجالات',g.domains,moduleName):''}${p?compactBreakdown('PQ10 — الأبعاد',p.groups):''}${d?compactBreakdown('السلوكيات المعطلة — الفئات الأساسية',d.groups):''}${l?compactBreakdown('الحكم القيادي — المعايير',l.criteria,k=>CRITERION_AR[k]||k)+leadershipDiagnosticsHTML(mid,'full_exam'):''}${p&&d?`<section class="card"><h3>التحليل السلوكي المتقدم</h3><p>تحليل مستقل عن الدرجة الإجمالية يربط نمط الشخصية بالسلوكيات تحت الضغط ويقدّر الثقة في الاستنتاج.</p><button class="btn primary" data-action="profile-report" data-sim="${mid}" data-scope="full_exam">فتح التحليل المتقدم</button></section>`:''}${reviewCount?`<section class="card"><h3>عناصر تحتاج مراجعة</h3><p>لديك ${reviewCount} عنصرًا مفتوحًا مرتبطًا بهذه المحاكاة.</p><button class="btn" data-action="mistakes-home">فتح دفتر الأخطاء</button></section>`:''}${reportActions(mid,'full','full_exam')}<div class="btn-row"><button class="btn primary" data-action="open-sim" data-sim="${mid}">العودة للمحاكاة</button><button class="btn" data-action="restart-full" data-sim="${mid}">إعادة المحاكاة الشاملة</button></div>`;
}
function historyMetric(h){return metricValue(h.module,h.result)??0;}
function filteredAttempts(scope){return state.saved.history.filter(h=>!h.review&&h.responseScope===scope);}
function renderResultsHome(view=state.settings.resultView||'latest',scope=state.settings.resultScope||'exam'){
  state.session=null;state.settings.resultView=view;state.settings.resultScope=scope;persistSettings();state.ui={view:'results',resultView:view,resultScope:scope};setTitle('نتائجي وتقدمي');const hs=filteredAttempts(scope),grouped={};for(const h of hs){const k=`${h.sim}|${h.module}`;(grouped[k]||=[]).push(h)}let content='';
  if(view==='latest'){const latest=Object.values(grouped).map(a=>a.sort((x,y)=>new Date(y.at)-new Date(x.at))[0]).sort((a,b)=>new Date(b.at)-new Date(a.at));content=latest.length?`<div class="result-card-list">${latest.map(h=>`<article class="result-row-card"><div><span>${h.sim} · ${moduleName(h.module)}</span><strong>${resultHeadline(h.module,h.result)}</strong><small>${formatDate(h.at)}</small></div></article>`).join('')}</div>`:'<div class="empty">لا توجد محاولات في هذا النمط بعد.</div>';}
  if(view==='best'){const best=Object.values(grouped).map(a=>a.sort((x,y)=>historyMetric(y)-historyMetric(x))[0]).sort((a,b)=>historyMetric(b)-historyMetric(a));content=best.length?`<div class="result-card-list">${best.map(h=>`<article class="result-row-card"><div><span>${h.sim} · ${moduleName(h.module)}</span><strong>${resultHeadline(h.module,h.result)}</strong><small>أفضل محاولة محفوظة</small></div></article>`).join('')}</div>`:'<div class="empty">لا توجد محاولات في هذا النمط بعد.</div>';}
  if(view==='trend'){const rows=Object.entries(grouped).map(([k,a])=>{a.sort((x,y)=>new Date(x.at)-new Date(y.at));const vals=a.slice(-3).map(x=>historyMetric(x));const [mid,m]=k.split('|');return `<article class="trend-card"><strong>${mid} · ${moduleName(m)}</strong><div class="trend-values">${vals.map((v,i)=>`<span>${v}%<small>${i===vals.length-1?'الأحدث':''}</small></span>`).join('')}</div></article>`}).join('');content=rows||'<div class="empty">تحتاج محاولتين أو أكثر لعرض التطور.</div>';}
  const analysable=state.master.simulations.filter(s=>state.saved.responses?.[s.master_simulation_id]?.pq10?.[scope]&&state.saved.responses?.[s.master_simulation_id]?.derailers?.[scope]);
  el('main').innerHTML=`<section class="results-hero"><span class="section-icon">▥</span><div><h2>نتائجي وتقدمي</h2><p>اعرض التدريب والاختبار والمحاكاة الشاملة كلًا على حدة.</p></div></section><div class="filter-block"><div class="segmented">${[['exam','الاختبار'],['training','التدريب'],['full_exam','المحاكاة الشاملة']].map(([k,l])=>`<button class="${scope===k?'active':''}" data-action="results-scope" data-scope="${k}">${l}</button>`).join('')}</div><div class="segmented secondary">${[['latest','آخر محاولة'],['best','أفضل محاولة'],['trend','التطور عبر الوقت']].map(([k,l])=>`<button class="${view===k?'active':''}" data-action="results-view" data-view="${k}">${l}</button>`).join('')}</div></div>${content}${analysable.length?`<section class="card"><h3>التحليل السلوكي المتقدم</h3><p>يحلل نمط الشخصية والسلوكيات المعطلة ويعطي مستوى ثقة في الاستنتاج.</p><div class="btn-row">${analysable.map(s=>`<button class="btn primary" data-action="profile-report" data-sim="${s.master_simulation_id}" data-scope="${scope}">${s.master_simulation_id}</button>`).join('')}</div></section>`:''}<div class="data-actions"><button class="btn" data-action="export-data">تصدير بياناتي</button><button class="btn danger" data-action="reset-all">مسح بياناتي</button></div>`;
}
function exportData(){const payload={exportedAt:new Date().toISOString(),appVersion:APP_VERSION,settings:state.settings,data:state.saved};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`assessment-trainer-data-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function handleClick(e){
  const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
  if(a==='home')return requestHome();if(a==='orientation-home')return renderOrientationHub();if(a==='quick-review')return renderQuickReview();if(a==='training-home')return renderTrainingHub();if(a==='training-module')return renderTrainingModule(b.dataset.module);if(a==='simulation-home')return renderSimulationHub();if(a==='open-guide')return renderGuide(b.dataset.guide);if(a==='install-app')return installApp();if(a==='close-dialog'){const d=el('appDialog');if(d?.close)d.close();else d?.removeAttribute('open');return;}
  if(a==='next-onboarding')return renderOnboarding(Number(b.dataset.step||1));if(a==='finish-onboarding'){state.settings.onboardingSeen=true;persistSettings();return renderHome();}
  if(a==='open-sim')return renderSimulation(b.dataset.sim);if(a==='section-picker')return renderSectionPicker(b.dataset.sim,b.dataset.mode);if(a==='results-home')return renderResultsHome();if(a==='review-home')return renderReviewHome();if(a==='mistakes-home')return renderMistakes();if(a==='favorites-home')return renderFavorites();
  if(a==='start')return startSession(b.dataset.sim,b.dataset.module,b.dataset.mode,false);if(a==='full-run')return startFullRun(b.dataset.sim);
  if(a==='exit-session')return requestHome();if(a==='toggle-favorite')return toggleFavorite(state.session.items[state.session.index]);
  if(a==='answer-gcat'){const store=responseStore(state.session.mid,state.session.module,state.session.responseScope);if(state.session.mode==='training'&&store[b.dataset.id]!==undefined){toast('تم تثبيت إجابتك الأولى');return}saveAnswer(b.dataset.id,b.dataset.answer);const item=state.session.items[state.session.index];renderItem(item);return;}
  if(a==='answer-likert'){const store=responseStore(state.session.mid,state.session.module,state.session.responseScope);if(state.session.mode==='training'&&store[b.dataset.id]!==undefined){toast('تم تثبيت إجابتك الأولى');return}saveAnswer(b.dataset.id,b.dataset.answer);const item=state.session.items[state.session.index];renderItem(item);return;}
  if(a==='prev')return previousItem();if(a==='next')return nextItem();
  if(a==='rate-lead'){if(state.session.mode==='training'&&state.session.feedbackShown){toast('تم تثبيت تقييمات هذا الموقف');return}const store=responseStore(state.session.mid,state.session.module,state.session.responseScope);store[b.dataset.scenario]||={};store[b.dataset.scenario][b.dataset.response]=Number(b.dataset.rating);persist();renderItem(state.session.items[state.session.index]);return;}
  if(a==='submit-lead'){const item=state.session.items[state.session.index];if(state.session.mode==='training'){state.session.feedbackShown=true;renderLeadership(item)}else nextItem();return;}
  if(a==='restart')return resetModule(b.dataset.sim,b.dataset.module,b.dataset.mode||'training');if(a==='train-mistakes')return trainMistakes(b.dataset.sim||null,b.dataset.module||null);if(a==='train-favorites')return trainFavorites(b.dataset.module);if(a==='train-weakness')return trainWeakness(b.dataset.sim,b.dataset.module,b.dataset.area);if(a==='train-topic')return trainTopic(b.dataset.module,b.dataset.area);
  if(a==='toggle-timer'){state.settings.timerVisible=!state.settings.timerVisible;persistSettings();renderSession();return;}if(a==='share-report')return shareReport(b.dataset.sim,b.dataset.module,b.dataset.scope||'exam');if(a==='print-report'){window.print();return;}if(a==='restart-full')return resetFullRun(b.dataset.sim);if(a==='profile-report')return renderProfileReport(b.dataset.sim,b.dataset.scope||'exam');if(a==='results-view')return renderResultsHome(b.dataset.view,state.settings.resultScope||'exam');if(a==='results-scope')return renderResultsHome(state.settings.resultView||'latest',b.dataset.scope);if(a==='export-data')return exportData();
  if(a==='reset-all'){if(confirm('سيتم مسح جميع الإجابات والنتائج والمفضلة ودفتر الأخطاء المحفوظة على هذا الجهاز. هل تريد المتابعة؟')){state.saved=emptySaved();persist();renderResultsHome()}return;}
}


document.addEventListener('click',handleClick);
el('homeBtn').addEventListener('click',requestHome);
el('themeBtn').addEventListener('click',()=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';persistSettings();applySettings()});
el('fontBtn').addEventListener('click',()=>{state.settings.fontSize=state.settings.fontSize==='small'?'medium':state.settings.fontSize==='medium'?'large':'small';persistSettings();applySettings();toast(`حجم الخط: ${state.settings.fontSize==='small'?'صغير':state.settings.fontSize==='medium'?'متوسط':'كبير'}`)});
boot();


/* === v1.2 navigation + GCAT training upgrade === */
const V12_NAV_STACK=[];
const V12_PAGE_ACTIONS=new Set(['orientation-home','quick-review','training-home','training-module','simulation-home','open-guide','open-sim','section-picker','results-home','review-home','mistakes-home','favorites-home','start','full-run','profile-report','train-mistakes','train-favorites','train-weakness','train-topic']);
function v12Snapshot(){return state.ui?JSON.parse(JSON.stringify(state.ui)):null;}
function v12PushCurrent(){const s=v12Snapshot();if(!s||s.view==='onboarding')return;const prev=V12_NAV_STACK[V12_NAV_STACK.length-1];if(prev&&JSON.stringify(prev)===JSON.stringify(s))return;V12_NAV_STACK.push(s);if(V12_NAV_STACK.length>40)V12_NAV_STACK.shift();}
function v12UpdateTopNav(){const back=el('backBtn'),home=el('homeBtn');if(home){home.disabled=false;home.style.visibility='visible'}if(back){const atHome=state.ui?.view==='home';back.disabled=atHome&&!V12_NAV_STACK.length;back.style.opacity=back.disabled?'.35':'1';back.setAttribute('aria-disabled',back.disabled?'true':'false')}}
const v12SetTitleBase=setTitle;
setTitle=function(t){v12SetTitleBase(t);v12UpdateTopNav();};
function v12Restore(s){if(!s)return renderHome();switch(s.view){
  case 'home':return renderHome();case 'orientation':return renderOrientationHub();case 'guide':return renderGuide(s.guide);case 'quick-review':return renderQuickReview();
  case 'training-hub':return renderTrainingHub();case 'training-module':return renderTrainingModule(s.module);case 'gcat-training':return renderGCATTrainingHub();case 'gcat-training-sims':return renderGCATSimulationTraining();case 'gcat-training-topics':return renderGCATTopicPicker();
  case 'simulation-hub':return renderSimulationHub();case 'simulation':return renderSimulation(s.simId);case 'section-picker':return renderSectionPicker(s.simId,s.mode);
  case 'results':return renderResultsHome(s.resultView||state.settings.resultView||'latest',s.resultScope||state.settings.resultScope||'exam');case 'review':return renderReviewHome();case 'mistakes':return renderMistakes();case 'favorites':return renderFavorites();
  case 'profile-report':return renderProfileReport(s.simId,s.scope||s.mode||'exam');case 'full-result':return renderFullRunResult(s.simId);
  case 'result':{const r=resultScopes(s.simId,s.module)?.[s.mode]||latestModuleResult(s.simId,s.module,s.mode);return r?renderResult(s.simId,s.module,r,!!r.timedOut):renderSimulation(s.simId)}
  default:return renderHome();}}
function goBack(){
  if(state.session){const ok=confirm('هل تريد حفظ المحاولة والعودة إلى الصفحة السابقة؟');if(!ok)return;persist();state.session=null;toast('تم حفظ التقدم');}
  const target=V12_NAV_STACK.pop();if(target)return v12Restore(target);
  const u=state.ui||{};if(u.view==='guide')return renderOrientationHub();if(u.view==='training-module'||u.view==='gcat-training')return renderTrainingHub();if(u.view==='gcat-training-sims'||u.view==='gcat-training-topics')return renderGCATTrainingHub();if(u.view==='simulation')return renderSimulationHub();if(u.view==='section-picker')return renderSimulation(u.simId);if(u.view==='orientation'||u.view==='training-hub'||u.view==='simulation-hub'||u.view==='review'||u.view==='mistakes'||u.view==='favorites'||u.view==='results'||u.view==='quick-review')return renderHome();return renderHome();
}

function v12Shuffle(a){const out=a.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out;}
function allGCATEntries(kind=null){const out=[],seen=new Set();for(const sim of state.master.simulations){const mid=sim.master_simulation_id;for(const item of resolveItems(mid,'gcat')){if(kind&&item.kind!==kind)continue;const k=item.kind+'|'+item.id;if(seen.has(k))continue;seen.add(k);out.push({mid,item});}}return out;}
function v12Sample(entries,n){return v12Shuffle(entries).slice(0,Math.min(n,entries.length));}
function startGCATFocused(kind){let entries,label;if(kind==='mixed'){entries=[...v12Sample(allGCATEntries('numerical'),14),...v12Sample(allGCATEntries('verbal'),14),...v12Sample(allGCATEntries('abstract'),14)];entries=v12Shuffle(entries);label='GCAT — تدريب مختلط عشوائي';}else{const names={numerical:'العددي',verbal:'اللفظي',abstract:'التجريدي'};entries=v12Sample(allGCATEntries(kind),14);label=`GCAT — ${names[kind]} فقط`;}startReviewSession('gcat',entries,label);}
function gcatCount(kind){return allGCATEntries(kind).length;}
function renderGCATTrainingHub(){
  state.session=null;state.ui={view:'gcat-training',module:'gcat'};setTitle('GCAT — التدريب');const mistakes=unresolvedFor(null,'gcat').length,favs=favoriteEntries('gcat').length;
  const tile=(action,icon,title,desc,extra='')=>`<button class="training-choice-card" data-action="${action}" ${extra}><span class="training-choice-icon">${icon}</span><strong>${title}</strong><small>${desc}</small><span class="chev">‹</span></button>`;
  el('main').innerHTML=`<section class="page-intro gcat-training-head"><span class="section-icon">⌁</span><div><h2>GCAT — التدريب</h2><p>اختر نوع التدريب الذي تريده. التدريب غير موقّت ويعرض التصحيح والشرح بعد إجابتك.</p></div></section><div class="training-choice-grid">
  ${tile('gcat-training-mixed','✦','تدريب مختلط عشوائي','42 سؤالًا متوازنًا: 14 عددي + 14 لفظي + 14 تجريدي')}
  ${tile('gcat-training-domain','123','العددي فقط',`14 سؤالًا عشوائيًا من أصل ${gcatCount('numerical')}`,'data-kind="numerical"')}
  ${tile('gcat-training-domain','Aa','اللفظي فقط',`14 سؤالًا عشوائيًا من أصل ${gcatCount('verbal')}`,'data-kind="verbal"')}
  ${tile('gcat-training-domain','◇','التجريدي فقط',`14 سؤالًا عشوائيًا من أصل ${gcatCount('abstract')}`,'data-kind="abstract"')}
  ${tile('gcat-training-topics','☷','تدريب حسب الموضوع','اختر المتتاليات أو النسب أو المرادفات أو الدوران وغيرها')}
  ${tile('gcat-training-sims','M','تدريب حسب المحاكاة','اختر M1–M7 إذا أردت التدريب على حزمة محددة')}
  ${tile('gcat-training-mistakes','!','أخطائي فقط',mistakes?`${mistakes} عنصرًا مفتوحًا للمراجعة`:'لا توجد أخطاء مفتوحة حاليًا')}
  ${tile('gcat-training-favorites','★','المفضلة',favs?`${favs} سؤالًا محفوظًا`:'لم تحفظ أسئلة GCAT بعد')}
  </div><button class="quick-review-card" data-action="quick-review"><span>⚡</span><div><strong>مراجعة سريعة قبل الامتحان</strong><small>أهم قواعد GCAT في 1–2 دقيقة</small></div><span class="chev">‹</span></button>`;
}
const v12RenderTrainingModuleBase=renderTrainingModule;
renderTrainingModule=function(module){if(module==='gcat')return renderGCATTrainingHub();return v12RenderTrainingModuleBase(module);};
function renderGCATSimulationTraining(){state.session=null;state.ui={view:'gcat-training-sims',module:'gcat'};setTitle('GCAT — حسب المحاكاة');const cards=state.master.simulations.map(sim=>{const mid=sim.master_simulation_id,r=resultScopes(mid,'gcat').training,meta=state.saved.sessionMeta?.[scopeKey(mid,'gcat','training')];return `<button class="gcat-sim-icon-card" data-action="gcat-sim-start" data-sim="${mid}"><span class="training-choice-icon">${mid}</span><strong>${esc(sim.title_ar)}</strong><small>${r?'آخر تدريب: '+resultHeadline('gcat',r):meta?.status==='active'?'محاولة محفوظة للمتابعة':'42 سؤالًا · بدون مؤقت'}</small></button>`}).join('');el('main').innerHTML=`<section class="page-intro"><span class="section-icon">M</span><div><h2>التدريب حسب المحاكاة</h2><p>اختر حزمة M1–M7. كل حزمة تحتوي 42 سؤالًا في التدريب.</p></div></section><div class="gcat-sim-icon-grid">${cards}</div>`;}
function renderGCATTopicPicker(){state.session=null;state.ui={view:'gcat-training-topics',module:'gcat'};setTitle('GCAT — حسب الموضوع');const groups=[['numerical','123','العددي'],['verbal','Aa','اللفظي'],['abstract','◇','التجريدي']];const html=groups.map(([kind,ic,title])=>{const counts={};for(const {item} of allGCATEntries(kind)){const t=topicOf(item);counts[t]=(counts[t]||0)+1}return `<section class="topic-icon-section"><div class="topic-section-head"><span class="training-choice-icon">${ic}</span><div><h3>${title}</h3><small>${Object.keys(counts).length} موضوعًا</small></div></div><div class="topic-chip-grid">${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`<button class="topic-icon-chip" data-action="gcat-topic-start" data-area="${esc(t)}"><strong>${esc(t)}</strong><small>${n} سؤالًا</small></button>`).join('')}</div></section>`}).join('');el('main').innerHTML=`<section class="page-intro"><span class="section-icon">☷</span><div><h2>التدريب حسب الموضوع</h2><p>اختر الفكرة التي تريد التدرب عليها مباشرة.</p></div></section>${html}`;}

function v12Capture(e){const b=e.target?.closest?.('[data-action]');if(!b)return;const a=b.dataset.action;if(['gcat-training-mixed','gcat-training-domain','gcat-training-topics','gcat-training-sims','gcat-sim-start','gcat-topic-start','gcat-training-mistakes','gcat-training-favorites','back'].includes(a)){e.stopImmediatePropagation?.();if(a!=='back')v12PushCurrent();if(a==='back')return goBack();if(a==='gcat-training-mixed')return startGCATFocused('mixed');if(a==='gcat-training-domain')return startGCATFocused(b.dataset.kind);if(a==='gcat-training-topics')return renderGCATTopicPicker();if(a==='gcat-training-sims')return renderGCATSimulationTraining();if(a==='gcat-sim-start')return startSession(b.dataset.sim,'gcat','training',false);if(a==='gcat-topic-start')return startReviewSession('gcat',topicEntries('gcat',b.dataset.area),`GCAT — ${b.dataset.area}`);if(a==='gcat-training-mistakes')return trainMistakes(null,'gcat');if(a==='gcat-training-favorites')return trainFavorites('gcat');}
  if(V12_PAGE_ACTIONS.has(a))v12PushCurrent();}
document.addEventListener('click',v12Capture,true);
const v12BackBtn=el('backBtn');if(v12BackBtn)v12BackBtn.addEventListener('click',goBack);
v12UpdateTopNav();

/* === v1.3 critical abstract + feedback + diagnostics + universal answers/export upgrade === */
const V13_LEAD_SUBMISSIONS_KEY='leadershipTrainingSubmissions';
function v13LeadMap(){return state.saved[V13_LEAD_SUBMISSIONS_KEY]||(state.saved[V13_LEAD_SUBMISSIONS_KEY]={});}
function v13LeadSubmissionKey(item){const s=state.session;return `${s?.mid||''}|${s?.module||''}|${s?.responseScope||''}|${storageId(item)}`;}
function v13LeadSignature(item,ratings){return item.data.options.map(o=>ratings?.[o.response_id]??'_').join('|');}
function v13LeadSubmitted(item,ratings){if(state.session?.mode!=='training')return false;const complete=item.data.options.every(o=>ratings?.[o.response_id]!==undefined);if(state.session?.feedbackShown&&complete)return true;const rec=v13LeadMap()[v13LeadSubmissionKey(item)];return !!rec&&rec.signature===v13LeadSignature(item,ratings)&&complete;}
function v13SetLeadSubmitted(item,ratings){v13LeadMap()[v13LeadSubmissionKey(item)]={signature:v13LeadSignature(item,ratings),at:new Date().toISOString()};persist();}

function v13CurrentAnswered(item){const s=state.session,store=responseStore(s.mid,s.module,s.responseScope),id=storageId(item);if(item.kind==='leadership')return itemComplete('leadership',item,store);return store[id]!==undefined;}
function v13SessionNavHTML(item,{nextEnabled=null,nextAction='next',nextLabel=null}={}){
  const s=state.session;if(!s)return'';const last=s.index===s.items.length-1;
  if(nextEnabled===null)nextEnabled=s.mode==='exam'||v13CurrentAnswered(item);
  if(!nextLabel)nextLabel=last?(s.mode==='exam'?'إنهاء الاختبار':s.isReview?'إنهاء المراجعة':'إنهاء التدريب'):'التالي';
  return `<nav class="question-pagination" aria-label="التنقل بين الأسئلة"><button class="btn ghost prev-question" data-action="prev" ${s.index===0?'disabled':''}><span aria-hidden="true">→</span> السابق</button><span class="question-position numeric-ltr" dir="ltr">${s.index+1} / ${s.items.length}</span><button class="btn primary next-question" data-action="${nextAction}" ${nextEnabled?'':'disabled'}>${esc(nextLabel)} <span aria-hidden="true">←</span></button></nav>`;
}

function v13FrameCell(svg,label,extra=''){return `<div class="abstract-cell ${extra}"><span class="frame-index">${esc(label)}</span><div class="svg-frame">${svg}</div></div>`;}
function v13MissingCell(label='?'){return `<div class="abstract-cell missing-cell" aria-label="الخانة المطلوبة"><span class="frame-index">${esc(label)}</span><div class="missing-box">?</div></div>`;}
function v13AbstractPatternHTML(q){
  const fs=q.svg_inline?.frames||[],fmt=q.question_format||'sequence';if(!fs.length)return'';
  if(fmt==='sequence'){
    const cells=[];fs.forEach((s,i)=>{cells.push(v13FrameCell(s,String(i+1)));cells.push('<span class="flow-arrow" aria-hidden="true">→</span>')});cells.push(v13MissingCell('?'));
    return `<div class="abstract-direction-note"><strong>اتجاه النمط:</strong> من اليسار إلى اليمين <bdi dir="ltr">→</bdi></div><div class="abstract-flow frames-${fs.length}" dir="ltr">${cells.join('')}</div>`;
  }
  if(fmt==='matrix'){
    const cols=fs.length===8?3:2,labels=fs.length===8?['1','2','3','4','5','6','7','8']:['1','2','3'];
    const cells=fs.map((s,i)=>v13FrameCell(s,labels[i]||String(i+1))).join('')+v13MissingCell('?');
    return `<div class="abstract-direction-note"><strong>المطلوب:</strong> أكمل الخانة الفارغة. تُقرأ المصفوفة صفًا بعد صف من اليسار إلى اليمين.</div><div class="abstract-matrix matrix-${cols}" dir="ltr">${cells}</div>`;
  }
  if(fmt==='analogy'||fmt==='transformation'){
    const title=fmt==='analogy'?'العلاقة البصرية':'قاعدة التحويل';
    return `<div class="abstract-direction-note"><strong>${title}:</strong> استخرج العلاقة في الصف الأول ثم طبّقها على الصف الثاني.</div><div class="abstract-relation" dir="ltr"><div class="relation-row">${v13FrameCell(fs[0],'A')}<span class="flow-arrow">→</span>${v13FrameCell(fs[1],'B')}</div><div class="relation-row">${v13FrameCell(fs[2],'C')}<span class="flow-arrow">→</span>${v13MissingCell('?')}</div></div>`;
  }
  return `<div class="abstract-direction-note"><strong>اتجاه القراءة:</strong> من اليسار إلى اليمين.</div><div class="abstract-flow" dir="ltr">${fs.map((s,i)=>v13FrameCell(s,String(i+1))).join('<span class="flow-arrow">→</span>')}</div>`;
}
function v13GCATClass(item,letter,chosen){
  if(state.session?.mode!=='training'||chosen===undefined)return chosen===letter?'selected':'';const key=modelAnswer(item);if(letter===key)return'correct-option';if(letter===chosen&&chosen!==key)return'wrong-option';return'';
}
function v13GCATAnswerText(item,letter){
  if(letter===undefined||letter===null)return'غير مجاب';const q=item.data;if(item.kind==='numerical'){const o=q.options?.find(x=>x.label===letter);return o?`${letter} — ${o.text}`:letter;}if(item.kind==='verbal'){const i='ABCDEF'.indexOf(letter);return i>=0&&q.options?.[i]!==undefined?`${letter} — ${q.options[i]}`:letter;}return letter;
}
function v13AbstractSteps(q){const s=q.logical_steps||[];if(!s.length)return'';return `<details class="feedback-detail solution-steps"><summary>خطوات الحل ببساطة</summary><ol>${s.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></details>`;}

renderGCATText=function(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];let opts=[];if(item.kind==='numerical')opts=q.options.map(x=>({letter:x.label,text:x.text}));else opts=q.options.map((x,i)=>({letter:'ABCDEF'[i],text:x}));
  const html=opts.map(o=>`<button class="option-btn ${v13GCATClass(item,o.letter,chosen)}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${o.letter}" aria-pressed="${chosen===o.letter?'true':'false'}" ${state.session.mode==='training'&&chosen!==undefined?'disabled':''}><span class="option-label">${o.letter}</span><span>${esc(o.text)}</span></button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<span class="pill">${item.kind==='numerical'?'عددي':'لفظي'}</span><div class="question-text">${esc(q.question)}</div><div class="options">${html}</div><div id="feedbackHost"></div>${v13SessionNavHTML(item)}</article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
};
renderAbstract=function(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)],opts='ABCDEF'.split('').map(l=>`<button class="abstract-option ${v13GCATClass(item,l,chosen)}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${l}" aria-label="الخيار ${l}" aria-pressed="${chosen===l?'true':'false'}" ${state.session.mode==='training'&&chosen!==undefined?'disabled':''}><span class="option-label">${l}</span>${q.svg_inline?.options?.[l]||`<div>${esc(q['option_'+l])}</div>`}</button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card abstract-question">${questionToolbar(item)}<span class="pill">تجريدي · ${esc(q.question_format||'')}</span><div class="question-text">${esc(q.prompt_ar)}</div>${v13AbstractPatternHTML(q)}<div class="abstract-options">${opts}</div><div id="feedbackHost"></div>${v13SessionNavHTML(item)}</article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
};
renderLikert=function(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)],generic=item.kind==='pq10'?'الشخصية — PQ10':'السلوكيات المعطلة';
  el('questionHost').innerHTML=`<article class="question-card likert-question">${questionToolbar(item)}<span class="pill">${generic}</span><div class="question-text">${esc(q.rewritten_question)}</div>${likertCirclesHTML(item,chosen)}<div id="feedbackHost"></div>${v13SessionNavHTML(item)}</article>`;if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
};

function v13LeadMatch(user,model){const d=Math.abs((user??0)-model);if(d===0)return{label:'مطابقة كاملة',cls:'exact',score:100};if(d===1)return{label:'قريب من المرجع',cls:'near',score:50};return{label:'يحتاج مراجعة',cls:'review',score:0};}
function v13LeadFeedbackCard(q,o,i,user){
  const model=o.app_score,tf=o.training_feedback||{},m=v13LeadMatch(user,model),criterion=tf.criterion_ar||q.app_training?.criterion_ar||CRITERION_AR[o.criterion]||o.criterion,full=tf.full_explanation||o.explanation||o.app_score_reason||'';
  return `<div class="inline-lead-feedback"><div class="answer-compare-grid"><div><span>إجابتك</span><strong>${user} — ${esc(RATING_LABELS[user]||'')}</strong></div><div class="reference"><span>الدرجة المرجعية</span><strong>${model} — ${esc(tf.rating_label||o.app_score_label||RATING_LABELS[model])}</strong></div></div><div class="match-status ${m.cls}">${m.label}${Math.abs(user-model)===1?' · الفرق درجة واحدة':''}</div><div class="measured-box"><span>المعيار الذي يقيسه التصرف</span><strong>${esc(criterion)}</strong></div><div class="explanation-block"><strong>لماذا هذه الدرجة؟</strong><p>${esc(tf.why_this_rating||o.app_score_reason||'')}</p></div><details class="feedback-detail"><summary>لماذا ليست الدرجة أعلى أو أقل؟</summary><p>${esc(full)}</p>${tf.boundary_tested?`<p class="small"><strong>الحد الذي يختبره هذا التصرف:</strong> ${esc(tf.boundary_tested)}</p>`:''}</details>${trainingDisclaimerHTML()}</div>`;
}
leadershipCirclesHTML=function(item,o,val){const ratings=responseStore(state.session.mid,state.session.module,state.session.responseScope)[storageId(item)]||{},locked=v13LeadSubmitted(item,ratings);return `<div class="circle-scale leadership-circles" role="radiogroup" aria-label="تقييم فعالية التصرف">${[1,2,3,4,5].map(n=>`<button class="rating-circle ${val&&n<=val?'filled':''} ${val===n?'active':''}" data-action="rate-lead" data-scenario="${esc(storageId(item))}" data-response="${esc(o.response_id)}" data-rating="${n}" aria-label="${RATING_LABELS[n]}" aria-checked="${val===n?'true':'false'}" role="radio" ${locked?'disabled':''}></button>`).join('')}</div>${val?`<div class="rating-badge level-${val}">${RATING_LABELS[val]}</div>`:'<div class="rating-placeholder">اختر درجة الفعالية</div>'}<div class="scale-end-labels"><span>غير فعال إطلاقًا</span><span>فعال جدًا</span></div>`;};
renderLeadership=function(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),ratings=store[storageId(item)]||{},submitted=v13LeadSubmitted(item,ratings),allDone=q.options.every(o=>ratings[o.response_id]!==undefined);
  const actions=q.options.map((o,i)=>{const val=ratings[o.response_id];return `<section class="lead-action ${submitted?'reviewed':''}"><div class="lead-action-number">${i+1}</div><p>${esc(o.text)}</p>${leadershipCirclesHTML(item,o,val)}${submitted?v13LeadFeedbackCard(q,o,i,val):''}</section>`}).join('');
  const scenarioMeasure=submitted?`<section class="scenario-measure"><span>ما الذي يقيسه هذا الموقف؟</span><strong>${esc(q.app_training?.criterion_ar||CRITERION_AR[q.criterion]||q.criterion)}</strong><p>${esc(q.app_training?.what_it_measures||'')}</p></section>`:'';
  let footer;if(state.session.mode==='training')footer=`${!submitted?`<div class="confirm-lead-row"><button class="btn primary" data-action="submit-lead" ${allDone?'':'disabled'}>تأكيد تقييم التصرفات</button></div>`:''}${v13SessionNavHTML(item,{nextEnabled:submitted})}`;else footer=v13SessionNavHTML(item,{nextEnabled:allDone,nextAction:'submit-lead'});
  el('questionHost').innerHTML=`<article class="question-card leadership-question">${questionToolbar(item)}<span class="pill">موقف قيادي</span><h3>${esc(q.title)}</h3><div class="scenario-stem">${esc(q.stem)}</div>${scenarioMeasure}<div class="lead-instruction">قيّم مدى فعالية كل تصرف من التصرفات أدناه</div><div class="lead-actions">${actions}</div>${footer}</article>`;
};
showLeadershipFeedback=function(item){renderLeadership(item);};

showTrainingFeedback=function(item,chosen){
  const host=el('feedbackHost');if(!host)return;
  if(['numerical','verbal','abstract'].includes(item.kind)){
    const q=item.data,key=modelAnswer(item),ok=chosen===key,userText=v13GCATAnswerText(item,chosen),keyText=v13GCATAnswerText(item,key);let body='';
    if(item.kind==='numerical'){
      let dist='';if(!ok&&q.distractor_analysis){const d=q.distractor_analysis[chosen]||q.distractor_analysis?.find?.(x=>x.option===chosen);if(d)dist=`<div class="explanation-block"><strong>لماذا كان اختيارك مشتتًا؟</strong><p>${esc(typeof d==='string'?d:d.explanation||d.reason||'')}</p></div>`;}
      body=`<div class="explanation-block"><strong>الشرح</strong><p>${esc(q.explanation||'')}</p></div>${q.fast_method?`<div class="fast-method"><strong>الطريقة الأسرع</strong><p>${esc(q.fast_method)}</p></div>`:''}${dist}`;
    }else if(item.kind==='verbal')body=`<div class="explanation-block"><strong>الشرح</strong><p>${esc(q.explanation||'')}</p></div>${q.shortcut?`<div class="fast-method"><strong>المفتاح السريع</strong><p>${esc(q.shortcut)}</p></div>`:''}`;
    else{const de=q.distractor_explanations?.[chosen];body=`<div class="explanation-block"><strong>الفكرة والحل</strong><p>${esc(q.explanation_ar||'')}</p></div>${v13AbstractSteps(q)}${!ok&&de?`<div class="explanation-block"><strong>لماذا كان اختيارك مشتتًا؟</strong><p>${esc(typeof de==='string'?de:de.explanation||de.reason||'')}</p></div>`:''}`;}
    host.innerHTML=`<section class="feedback gcat-feedback ${ok?'good':'bad'}"><div class="answer-verdict ${ok?'correct':'incorrect'}">${ok?'✓ إجابتك صحيحة':'✕ إجابتك غير صحيحة'}</div><div class="answer-compare-grid"><div><span>اختيارك</span><strong>${esc(userText)}</strong></div><div class="reference"><span>الإجابة الصحيحة</span><strong>${esc(keyText)}</strong></div></div>${body}${trainingDisclaimerHTML()}</section>`;return;
  }
  if(item.kind==='pq10'||item.kind==='derailers'){
    const q=item.data,model=q.rewritten_answer,al=choiceAlignmentText(chosen,model);let selectedMeaning='';if(item.kind==='derailers'&&q.option_guidance?.[chosen])selectedMeaning=q.option_guidance[chosen].meaning||'';else selectedMeaning=al.d===0?'اختيارك مطابق للإجابة التدريبية المرجعية.':al.d===1?'اختيارك قريب جدًا من المرجع، والاختلاف في شدة الاستجابة بدرجة واحدة.':`اختيارك يبتعد ${al.d} درجات عن المرجع التدريبي.`;
    const measure=item.kind==='pq10'?q.measures:(q.analytic_axis||q.measures||q.source_domain),sub=q.subtrait||q.analytic_subtrait||'',healthy=item.kind==='derailers'&&q.healthy_expression?`<div class="behavior-poles"><div><span>السلوك المتزن</span><strong>${esc(q.healthy_expression)}</strong></div><div><span>النمط المعطّل المحتمل</span><strong>${esc(q.derailer_risk_expression||'')}</strong></div></div>`:'',intense=intensityExplanation(q);
    host.innerHTML=`<section class="feedback profile-feedback ${chosen===model?'good':''}"><div class="answer-compare-grid"><div><span>إجابتك</span><strong>${esc(chosen)}</strong></div><div class="reference"><span>الإجابة التدريبية المرجعية</span><strong>${esc(model)}</strong></div></div><div class="alignment-summary"><strong>${al.score}%</strong><span>${esc(al.label)}</span></div><div class="measured-box"><span>ما الذي يقيسه هذا السؤال؟</span><strong>${esc(measure)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div><div class="explanation-block"><strong>لماذا هذه الإجابة؟</strong><p>${esc(q.training_explanation||q.answer_basis||'')}</p></div><p><strong>قراءة اختيارك:</strong> ${esc(selectedMeaning)}</p>${healthy}${intense?`<details class="feedback-detail"><summary>${model==='محايد'?'لماذا الحياد هنا؟':'لماذا بهذه الشدة وليست إجابة أقوى؟'}</summary><p>${esc(intense)}</p></details>`:''}${likertOptionComparison(q,item.kind)}${trainingDisclaimerHTML()}</section>`;return;
  }
};

const V13_FINISH_BASE=finishSession;
finishSession=function(timedOut=false){
  const s=state.session;if(!s)return;const snapshot=JSON.parse(JSON.stringify(responseStore(s.mid,s.module,s.responseScope)||{})),meta={mid:s.mid,module:s.module,responseScope:s.responseScope,isReview:!!s.isReview,reviewLabel:s.reviewLabel||null},before=state.saved.history.length;const ret=V13_FINISH_BASE(timedOut);const h=state.saved.history[before];if(h&&h.module===meta.module){h.attemptId=h.attemptId||`A-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;h.responseSnapshot=snapshot;persist();}return ret;
};

function v13CaptureCore(e){
  const b=e.target?.closest?.('[data-action]');if(!b)return;const a=b.dataset.action;
  if(a==='submit-lead'){
    if(!state.session||state.session.module!=='leadership')return;e.stopImmediatePropagation?.();const item=state.session.items[state.session.index],store=responseStore(state.session.mid,state.session.module,state.session.responseScope),ratings=store[storageId(item)]||{},all=item.data.options.every(o=>ratings[o.response_id]!==undefined);if(!all){toast('قيّم التصرفات الأربعة أولًا');return;}if(state.session.mode==='training'){state.session.feedbackShown=true;v13SetLeadSubmitted(item,ratings);renderLeadership(item);}else nextItem();return;
  }
  if(a==='rate-lead'&&state.session?.module==='leadership'&&state.session.mode==='training'){
    const item=state.session.items[state.session.index],store=responseStore(state.session.mid,state.session.module,state.session.responseScope),ratings=store[storageId(item)]||{};if(v13LeadSubmitted(item,ratings)){e.stopImmediatePropagation?.();toast('تم تثبيت تقييمات هذا الموقف');return;}const rec=v13LeadMap()[v13LeadSubmissionKey(item)];if(rec&&rec.signature!==v13LeadSignature(item,ratings)){delete v13LeadMap()[v13LeadSubmissionKey(item)];persist();}
  }
}
document.addEventListener('click',v13CaptureCore,true);

/* v1.3 GCAT domain drill-down: all / quick / mistakes / favorites / topic */
const V13_GCAT_KIND_LABEL={numerical:'العددي',verbal:'اللفظي',abstract:'التجريدي'};
const V13_GCAT_KIND_ICON={numerical:'123',verbal:'Aa',abstract:'◇'};
function v13GCATDomainEntries(kind){return allGCATEntries(kind);}
function v13GCATDomainMistakeEntries(kind){
  const out=[],seen=new Set();for(const issue of unresolvedFor(null,'gcat')){const it=findItem(issue.mid,'gcat',issue.itemId);if(!it||it.kind!==kind)continue;const k=`${issue.mid}|${it.id}`;if(seen.has(k))continue;seen.add(k);out.push({mid:issue.mid,item:it});}return out;
}
function v13GCATDomainFavoriteEntries(kind){return favoriteEntries('gcat').filter(x=>x.item.kind===kind).map(x=>({mid:x.mid,item:x.item}));}
function v13GCATDomainTopics(kind){const counts={};for(const {item} of v13GCATDomainEntries(kind)){const t=topicOf(item);counts[t]=(counts[t]||0)+1;}return Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ar'));}
function v13StartGCATDomain(kind,mode){const all=v13GCATDomainEntries(kind),entries=mode==='quick'?v12Sample(all,14):all,label=`GCAT — ${V13_GCAT_KIND_LABEL[kind]} — ${mode==='quick'?'جلسة سريعة':'جميع الأسئلة'}`;startReviewSession('gcat',entries,label);}
function v13RenderGCATDomainHub(kind){
  state.session=null;state.ui={view:'gcat-domain-hub',module:'gcat',kind};setTitle(`GCAT — ${V13_GCAT_KIND_LABEL[kind]}`);const n=v13GCATDomainEntries(kind).length,m=v13GCATDomainMistakeEntries(kind).length,f=v13GCATDomainFavoriteEntries(kind).length,t=v13GCATDomainTopics(kind).length;
  const tile=(act,ic,title,desc,disabled=false)=>`<button class="training-choice-card" data-action="${act}" data-kind="${kind}" ${disabled?'disabled':''}><span class="training-choice-icon">${ic}</span><strong>${title}</strong><small>${desc}</small><span class="chev">‹</span></button>`;
  el('main').innerHTML=`<section class="page-intro"><span class="section-icon">${V13_GCAT_KIND_ICON[kind]}</span><div><h2>${V13_GCAT_KIND_LABEL[kind]}</h2><p>اختر طريقة التدريب. هذه الخيارات للتدريب والمراجعة فقط، ولا تغيّر امتحان GCAT الثابت 42 سؤالًا / 20 دقيقة.</p></div></section><div class="training-choice-grid domain-choice-grid">${tile('gcat-domain-all','▤','جميع الأسئلة',`${n} سؤالًا في هذا المجال`)}${tile('gcat-domain-quick','⚡','جلسة سريعة','14 سؤالًا عشوائيًا')}${tile('gcat-domain-mistakes','!','أخطائي فقط',m?`${m} سؤالًا يحتاج مراجعة`:'لا توجد أخطاء مفتوحة',!m)}${tile('gcat-domain-favorites','★','المفضلة',f?`${f} سؤالًا محفوظًا`:'لا توجد أسئلة محفوظة',!f)}${tile('gcat-domain-topics','☷','حسب الموضوع',`${t} موضوعًا داخل المجال`)}</div>`;
}
function v13RenderGCATDomainTopics(kind){
  state.session=null;state.ui={view:'gcat-domain-topics',module:'gcat',kind};setTitle(`GCAT — ${V13_GCAT_KIND_LABEL[kind]} — حسب الموضوع`);const topics=v13GCATDomainTopics(kind);
  el('main').innerHTML=`<section class="page-intro"><span class="section-icon">☷</span><div><h2>${V13_GCAT_KIND_LABEL[kind]} — حسب الموضوع</h2><p>اختر الفكرة التي تريد التدريب عليها.</p></div></section><div class="topic-chip-grid domain-topic-grid">${topics.map(([t,n])=>`<button class="topic-icon-chip" data-action="gcat-domain-topic-start" data-kind="${kind}" data-area="${esc(t)}"><strong>${esc(t)}</strong><small>${n} سؤالًا</small></button>`).join('')}</div>`;
}
renderGCATTrainingHub=function(){
  state.session=null;state.ui={view:'gcat-training',module:'gcat'};setTitle('GCAT — التدريب');const mistakes=unresolvedFor(null,'gcat').length,favs=favoriteEntries('gcat').length;
  const tile=(action,icon,title,desc,extra='')=>`<button class="training-choice-card" data-action="${action}" ${extra}><span class="training-choice-icon">${icon}</span><strong>${title}</strong><small>${desc}</small><span class="chev">‹</span></button>`;
  el('main').innerHTML=`<section class="page-intro gcat-training-head"><span class="section-icon">⌁</span><div><h2>GCAT — التدريب</h2><p>اختر مجال التدريب أو جلسة مختلطة. بعد اختيار المجال ستجد: جميع الأسئلة، جلسة سريعة، أخطائي، المفضلة، وحسب الموضوع.</p></div></section><div class="training-choice-grid">${tile('gcat-training-mixed','✦','تدريب مختلط عشوائي','42 سؤالًا متوازنًا: 14 عددي + 14 لفظي + 14 تجريدي')}${tile('gcat-domain-hub','123','العددي',`${gcatCount('numerical')} سؤالًا متاحًا`,'data-kind="numerical"')}${tile('gcat-domain-hub','Aa','اللفظي',`${gcatCount('verbal')} سؤالًا متاحًا`,'data-kind="verbal"')}${tile('gcat-domain-hub','◇','التجريدي',`${gcatCount('abstract')} سؤالًا متاحًا`,'data-kind="abstract"')}${tile('gcat-training-sims','M','تدريب حسب المحاكاة','اختر M1–M7 إذا أردت حزمة محددة')}${tile('gcat-training-mistakes','!','كل أخطاء GCAT',mistakes?`${mistakes} عنصرًا مفتوحًا`:'لا توجد أخطاء مفتوحة')}${tile('gcat-training-favorites','★','كل المفضلة',favs?`${favs} سؤالًا محفوظًا`:'لم تحفظ أسئلة بعد')}</div><button class="quick-review-card" data-action="quick-review"><span>⚡</span><div><strong>مراجعة سريعة قبل الامتحان</strong><small>أهم قواعد GCAT في 1–2 دقيقة</small></div><span class="chev">‹</span></button>`;
};

function v13DomainCapture(e){const b=e.target?.closest?.('[data-action]');if(!b)return;const a=b.dataset.action;if(!['gcat-domain-hub','gcat-domain-all','gcat-domain-quick','gcat-domain-mistakes','gcat-domain-favorites','gcat-domain-topics','gcat-domain-topic-start'].includes(a))return;e.stopImmediatePropagation?.();v12PushCurrent();const kind=b.dataset.kind;if(a==='gcat-domain-hub')return v13RenderGCATDomainHub(kind);if(a==='gcat-domain-all')return v13StartGCATDomain(kind,'all');if(a==='gcat-domain-quick')return v13StartGCATDomain(kind,'quick');if(a==='gcat-domain-mistakes')return startReviewSession('gcat',v13GCATDomainMistakeEntries(kind),`GCAT — ${V13_GCAT_KIND_LABEL[kind]} — أخطائي فقط`);if(a==='gcat-domain-favorites')return startReviewSession('gcat',v13GCATDomainFavoriteEntries(kind),`GCAT — ${V13_GCAT_KIND_LABEL[kind]} — المفضلة`);if(a==='gcat-domain-topics')return v13RenderGCATDomainTopics(kind);if(a==='gcat-domain-topic-start'){const entries=v13GCATDomainEntries(kind).filter(x=>topicOf(x.item)===b.dataset.area);return startReviewSession('gcat',entries,`GCAT — ${V13_GCAT_KIND_LABEL[kind]} — ${b.dataset.area}`);}}
document.addEventListener('click',v13DomainCapture,true);

const V13_RESTORE_BASE=v12Restore;
v12Restore=function(s){if(!s)return renderHome();if(s.view==='gcat-domain-hub')return v13RenderGCATDomainHub(s.kind);if(s.view==='gcat-domain-topics')return v13RenderGCATDomainTopics(s.kind);return V13_RESTORE_BASE(s);};

/* v1.3 diagnostic engine v2 */
const V13_GCAT_ADVICE={
 'متتاليات عددية':'ابدأ بالفروق، ثم فروق الفروق، ثم افحص الضرب أو التناوب أو التسلسل المتداخل. لا تعتمد قاعدة لا تفسر جميع الحدود.',
 'النسب وتقسيم الكميات':'حدد مجموع أجزاء النسبة وقيمة الجزء الواحد أولًا، وثبّت ترتيب أطراف النسبة قبل الربط بينها.',
 'النسب المئوية':'اسأل دائمًا: النسبة من ماذا؟ وحوّل الزيادة أو النقص إلى معامل ضرب، خصوصًا عند الرجوع إلى القيمة الأصلية.',
 'الربح والخسارة والأسعار':'حدد هل النسبة محسوبة من التكلفة أم سعر البيع، وتعامل مع الخصومات المتتابعة بالضرب لا بالجمع.',
 'السرعة والمسافة والزمن':'اكتب العلاقة سرعة = مسافة ÷ زمن، ووحّد الوحدات، واحسب متوسط السرعة من المسافة الكلية والزمن الكلي.',
 'المتوسط الحسابي':'حوّل المتوسط إلى مجموع أولًا: المجموع = المتوسط × العدد، ثم نفّذ الإضافة أو الحذف أو الدمج.',
 'مسائل الأعمار':'ثبّت الأعمار في زمن واحد، وتذكر أن فرق العمر ثابت بينما النسبة تتغير مع الزمن.',
 'الآلات والإنتاج':'فكر بالمعدل أو بوحدات العمل، واجمع المعدلات عند العمل معًا ولا تجمع الأزمنة.',
 'الكسور المتتابعة من الكميات':'تتبّع الكمية المتبقية بعد كل خطوة؛ الكسر الثاني غالبًا يطبق على الباقي لا على الأصل.',
 'أيام الأسبوع والاستدلال الزمني':'استخدم باقي القسمة على طول الدورة بدل العد خطوة بخطوة.',
 'المقارنة والترتيب العلاقاتي':'حوّل القيود إلى سلسلة أو مخطط صغير، ولا تفترض علاقة بين عنصرين لم يربطهما قيد.',
 'مرادفات':'اقرأ الكلمة داخل الجملة أولًا، ثم اختر المعنى الأقرب للسياق لا مجرد كلمة مألوفة.',
 'متضادات':'حدد المعنى الدقيق أولًا ثم ابحث عن ضده الحقيقي، لا عن كلمة مختلفة فقط.',
 'تناظر':'سمِّ العلاقة بين الزوج الأول بكلمات قصيرة، ثم طبّق العلاقة نفسها على الزوج الثاني.',
 'تصنيف':'ابحث عن الخاصية التي تجمع معظم العناصر بدقة، ثم حدد العنصر الذي لا يشاركها.',
 'ترتيب':'حوّل كل عبارة إلى علاقة اتجاهية واضحة، ثم ادمج العلاقات قبل اختيار الترتيب.',
 'استنتاج منطقي':'التزم بما يلزم منطقيًا من المعطيات فقط؛ لا تضف افتراضًا يبدو معقولًا لكنه غير مذكور.',
 'الدوران':'تتبع اتجاه الشكل مع الحفاظ على ترتيب أجزائه؛ الدوران لا يقلب البنية مرآويًا.',
 'الانعكاس':'راقب انقلاب ترتيب العناصر حول المحور؛ الانعكاس يختلف عن مجرد تدوير الشكل.',
 'التناظر':'حدد محور التناظر وافحص هل النصفان يطابق أحدهما الآخر حوله.',
 'الانتقال':'ثبّت مواقع العناصر ثم تتبع انتقال كل عنصر خطوة بخطوة، خاصة عند وجود عدة عناصر.',
 'التغيير العددي':'عد العناصر في كل إطار وابحث عن زيادة أو نقصان أو نمط عددي ثابت.',
 'التظليل':'افصل الشكل عن التعبئة؛ قد يبقى الشكل والموقع ثابتين بينما تتغير حالة الامتلاء فقط.',
 'التبديل':'راقب أي عنصرين يتبادلان المواقع أو الألوان دون أن تتغير بقية الخصائص.',
 'التناوب':'اختبر وجود قاعدتين تتناوبان بين الخطوات بدل محاولة إجبار كل الانتقالات على قاعدة واحدة.',
 'الدورات المتكررة':'حدد طول الدورة وابحث عن عودة الحالة الأولى بعد عدد ثابت من الخطوات.'
};
const V13_PROFILE_ADVICE={
 'التواصل والتأثير الفعال':'درّب نفسك على الإصغاء الكامل، تكييف الرسالة مع الجمهور، ثم التأكد من الفهم بدل الاكتفاء بإرسال الرسالة.',
 'المبادرة':'اسأل ما الخطوة التي يمكن اتخاذها الآن ضمن الصلاحية، وحدد مالك الإجراء والموعد بدل انتظار دفع خارجي.',
 'اتخاذ القرار وتحمل المسؤولية':'وازن بين كفاية المعلومات وسرعة الحسم، ثم تحمّل تبعة القرار وراجع أثره بدل تعليق القرار على الآخرين.',
 'القيادة الملهمة':'اربط المهمة بالهدف، وضّح التوقعات، وامنح الفريق مساحة ومسؤولية مع متابعة مناسبة.',
 'التفكير الاستراتيجي':'اربط المعلومات المتفرقة بالاتجاه طويل المدى والآثار اللاحقة، ولا تكتفِ بحل المشكلة القريبة.',
 'تطوير المهارات':'حوّل الملاحظات والأخطاء إلى فرص تعليم، وفوّض بطريقة تبني قدرة الآخرين لا تنقل العمل فقط.',
 'القدرة على التكيف':'عدّل الخطة عندما تتغير المعطيات، مع الحفاظ على الهدف والمعايير الأساسية.',
 'التحليل والتخطيط المنهجي':'حدد المطلوب، اجمع البيانات الكافية، خطط بخطوات واضحة ثم انتقل إلى التنفيذ دون إفراط في التحليل.'
};
const V13_DERAILER_ADVICE={
 'التنافسية المفرطة':'حوّل التركيز من المقارنة الشخصية إلى نجاح الفريق والنتيجة المشتركة، وافصل التقدير المهني عن الحاجة إلى هزيمة الآخرين.',
 'التحفظ':'حافظ على الحضور والتواصل خصوصًا تحت الضغط، واطلب المساعدة أو شارك المعلومة عندما يحتاج الفريق ذلك.',
 'التقلب':'راقب انتقال الانفعال إلى القرار، وأجّل رد الفعل القصير لا القرار الضروري، ثم ارجع للوقائع.',
 'التأثر والانفعال':'افصل النقد عن قيمة الذات، وراجع الوقائع قبل تفسير نوايا الآخرين أو اجترار الخطأ.',
 'التهور / ضعف الانضباط':'قبل القرار المهم افحص العواقب والبدائل الأساسية، ثم أغلق المهام المفتوحة وتابع الالتزامات.',
 'اعتماد مفرط':'اطلب المشورة عند الحاجة، لكن لا تجعل موافقة الآخرين شرطًا للحسم في قرار يقع ضمن صلاحيتك.',
 'المثالية الزائدة':'حدد مستوى جودة كافيًا للمهمة والوقت، واسمح بتعديل الخطة عندما تتغير المعطيات بدل انتظار الكمال.',
 'عدم الالتزام / الغرابة':'حافظ على الأعراف المهنية وقابلية تفسير القرار، وابتكر داخل إطار يمكن شرحه وتدقيقه وتنسيقه مع الفريق.'
};
const V13_LEAD_PATTERNS={
 harm_gate_miss:{title:'تفويت بوابة الضرر',advice:'قبل تقييم أي فائدة، اسأل أولًا: هل يخلق التصرف خطر سلامة أو مخالفة أو خداعًا أو إذلالًا أو ضررًا مباشرًا؟ إذا نعم فغالبًا يبقى عند 1.'},
 ineffective_action_overrated:{title:'رفع الإجراء الشكلي من 2 إلى 3 أو أعلى',advice:'وجود Action لا يعني تقدمًا. قبل منح 3 اسأل: بعد تنفيذ الفعل، هل تغيّر جوهر المشكلة فعلًا؟ التوثيق أو الاجتماع أو الإحالة وحدها قد تبقى 2.'},
 partial_action_overrated:{title:'رفع الحل الجزئي من 3 إلى 4',advice:'لا تمنح 4 لمجرد أن الاتجاه صحيح. 4 يحتاج أن يُرجّح حل النتيجة الأساسية؛ إذا بقيت فجوة كبيرة أو حل مؤقت فابقَ عند 3.'},
 partial_action_underrated:{title:'خفض التقدم الحقيقي من 3 إلى 2',advice:'إذا كان التصرف يضيف تقدمًا ملموسًا يمكن البناء عليه ولا يسبب ضررًا، فهو غالبًا 3 حتى لو لم يحل المشكلة كاملة.'},
 effective_action_underrated:{title:'خفض الحل القوي من 4 إلى 3',advice:'لا تشترط الكمال لمنح 4. إذا كان الفعل سيحقق النتيجة الأساسية وفجوة واحدة غير جوهرية هي الناقصة، فـ4 مناسبة.'},
 closure_gap_missed:{title:'منح 5 قبل اكتمال الإغلاق',advice:'5 تحتاج حلقة مكتملة: تنفيذ واضح ونقطة متابعة أو معيار نجاح. إذا بقيت فجوة مهمة في الإغلاق فغالبًا 4.'},
 complete_action_underrated:{title:'التشدد مع الحل المكتمل',advice:'إذا جمع الفعل السبب والدليل والكفاية والتنفيذ/الإغلاق بلا عيب جوهري، لا تخفضه لمجرد إمكانية إضافة تفاصيل تحسين صغيرة.'}
};
function v13ConfidenceLabel(score){return score>=80?'مرتفعة':score>=60?'متوسطة':'منخفضة';}
function v13Std(vals){if(!vals.length)return null;const m=average(vals);return Math.sqrt(vals.reduce((s,x)=>s+(x-m)**2,0)/vals.length);}
function v13ModuleConfidence(mid,module,scope){
  const items=resolveItems(mid,module),store=state.saved.responses?.[mid]?.[module]?.[scope]||{},answers=[];for(const it of items){const a=store[storageId(it)];if(a!==undefined)answers.push(a)}const completeness=percent(answers.length,items.length);if(module==='gcat'||module==='leadership')return{score:completeness,label:v13ConfidenceLabel(completeness),notes:[completeness<90?'الاستنتاج محدود لأن بعض البنود لم تُجب.':'التغطية عالية لأن معظم البنود مكتملة.']};
  const style=responseStyleAnalysis(answers),cross=crossSimulationConsistency(module,scope);let score=Math.round(completeness*.65+style.score*.35),notes=[];if(Number.isFinite(cross.score)&&cross.repeated_sources>=10){score=Math.round(completeness*.4+style.score*.2+cross.score*.4);notes.push(`ثبات الصياغات المتكررة: ${cross.score}% عبر ${cross.repeated_sources} فكرة.`)}else notes.push('الثقة لا تتجاوز المستوى المتوسط من محاكاة واحدة؛ ترتفع عندما يتكرر النمط عبر محاكاة أخرى.');if(style.warnings.length)notes.push(...style.warnings);if(cross.repeated_sources<10)score=Math.min(score,78);return{score,label:v13ConfidenceLabel(score),notes,completeness,style,cross};
}
function v13GCATDiagnostics(mid,scope){
  const items=resolveItems(mid,'gcat'),store=state.saved.responses?.[mid]?.gcat?.[scope]||{},topics={},domains={};for(const it of items){const u=store[storageId(it)],key=modelAnswer(it),t=topicOf(it);(topics[t]||={total:0,wrong:0,correct:0,kind:it.kind});topics[t].total++;(domains[it.kind]||={total:0,wrong:0,correct:0});domains[it.kind].total++;if(u===key){topics[t].correct++;domains[it.kind].correct++;}else{topics[t].wrong++;domains[it.kind].wrong++;}}
  for(const [t,v] of Object.entries(topics)){v.score=percent(v.correct,v.total);const prior=Object.values(state.saved.reviewItems||{}).filter(x=>x.module==='gcat'&&x.topic===t).reduce((s,x)=>s+(x.wrongCount||0),0);v.evidence=v.total+prior;v.confidence=v.evidence>=5?'مرتفعة':v.evidence>=3?'متوسطة':'منخفضة';v.advice=V13_GCAT_ADVICE[t]||'راجع طريقة الحل في هذا النوع وحدد الخطوة التي تكررت فيها الأخطاء قبل زيادة السرعة.';}
  const weak=Object.entries(topics).filter(([,v])=>v.wrong>0).sort((a,b)=>a[1].score-b[1].score||b[1].evidence-a[1].evidence).slice(0,6).map(([topic,v])=>({topic,...v})),strong=Object.entries(topics).sort((a,b)=>b[1].score-a[1].score||b[1].total-a[1].total).slice(0,4).map(([topic,v])=>({topic,...v}));return{topics,domains,weak,strong,confidence:v13ModuleConfidence(mid,'gcat',scope)};
}
function v13TraitDiagnostics(mid,module,scope){
  const items=resolveItems(mid,module),store=state.saved.responses?.[mid]?.[module]?.[scope]||{},groups={};for(const it of items){const q=it.data,a=store[storageId(it)];if(a===undefined)continue;const g=module==='pq10'?q.measures:(q.analytic_axis||q.source_domain),dir=normalizedDirectional(q,a),align=alignmentScore(q,a);(groups[g]||={direction:[],alignment:[],n:0});if(dir!==null)groups[g].direction.push(dir);if(align!==null)groups[g].alignment.push(align);groups[g].n++;}
  const cross=crossSimulationConsistency(module,scope);for(const [g,v] of Object.entries(groups)){v.directional=Math.round(average(v.direction)??50);v.alignmentScore=Math.round(average(v.alignment)??0);v.spread=Math.round(v13Std(v.direction)??0);if(module==='derailers')v.risk=Math.round(100-v.directional);const enough=v.n>=8,repeat=Number.isFinite(cross.score)&&cross.repeated_sources>=10;v.confidence=repeat&&cross.score>=80?'مرتفعة':enough?'متوسطة':'منخفضة';v.advice=module==='pq10'?(V13_PROFILE_ADVICE[g]||'راجع السلوكيات الفرعية التي أعطت النتيجة، وابحث عن نمط متكرر لا عن بند واحد.'):(V13_DERAILER_ADVICE[g]||'ركز على السلوك المتزن المقابل لهذا النمط، خصوصًا عند الضغط.');}
  const entries=Object.entries(groups);const weak=module==='pq10'?entries.sort((a,b)=>a[1].directional-b[1].directional).slice(0,4):entries.sort((a,b)=>(b[1].risk??0)-(a[1].risk??0)).slice(0,4);const strong=module==='pq10'?entries.slice().sort((a,b)=>b[1].directional-a[1].directional).slice(0,4):entries.slice().sort((a,b)=>(a[1].risk??0)-(b[1].risk??0)).slice(0,4);return{groups,weak:weak.map(([name,v])=>({name,...v})),strong:strong.map(([name,v])=>({name,...v})),confidence:v13ModuleConfidence(mid,module,scope)};
}
function v13LeadershipDiagnostics(mid,scope){
  const items=resolveItems(mid,'leadership'),store=state.saved.responses?.[mid]?.leadership?.[scope]||{},defs={
    harm_gate_miss:{opp:m=>m===1,miss:(u,m)=>m===1&&u>=2},ineffective_action_overrated:{opp:m=>m===2,miss:(u,m)=>m===2&&u>=3},partial_action_overrated:{opp:m=>m===3,miss:(u,m)=>m===3&&u>=4},partial_action_underrated:{opp:m=>m===3,miss:(u,m)=>m===3&&u<=2},effective_action_underrated:{opp:m=>m===4,miss:(u,m)=>m===4&&u<=3},closure_gap_missed:{opp:m=>m===4,miss:(u,m)=>m===4&&u===5},complete_action_underrated:{opp:m=>m===5,miss:(u,m)=>m===5&&u<=4}
  },stats=Object.fromEntries(Object.keys(defs).map(k=>[k,{count:0,opportunities:0}])),criteria={},boundaries={};let rated=0,exact=0,within1=0,over=0,under=0,delta=[];
  for(const it of items){const rr=store[storageId(it)]||{};for(const o of it.data.options){const u=rr[o.response_id],m=o.app_score;if(u===undefined)continue;rated++;const d=Math.abs(u-m);if(d===0)exact++;if(d<=1)within1++;if(u>m)over++;if(u<m)under++;delta.push(u-m);for(const [k,def] of Object.entries(defs)){if(def.opp(m))stats[k].opportunities++;if(def.miss(u,m))stats[k].count++;}const c=o.criterion;(criteria[c]||={pts:0,max:0,count:0});criteria[c].pts+=d===0?2:d===1?1:0;criteria[c].max+=2;criteria[c].count++;const b=o.boundary_tested||'غير محدد';(boundaries[b]||={pts:0,max:0,count:0});boundaries[b].pts+=d===0?2:d===1?1:0;boundaries[b].max+=2;boundaries[b].count++;}}
  const patterns=Object.entries(stats).map(([key,s])=>{const rate=percent(s.count,s.opportunities),base=V13_LEAD_PATTERNS[key];return{key,...s,rate,title:base.title,advice:base.advice,confidence:s.opportunities>=8&&s.count>=4?'مرتفعة':s.count>=2?'متوسطة':'منخفضة'};}).filter(x=>x.count>0).sort((a,b)=>b.rate-a.rate||b.count-a.count);for(const v of Object.values(criteria))v.score=percent(v.pts,v.max);for(const v of Object.values(boundaries))v.score=percent(v.pts,v.max);const md=delta.length?average(delta):0;return{rated,total:64,exactRate:percent(exact,rated),withinOne:percent(within1,rated),over,under,meanDelta:Math.round(md*100)/100,calibration:md>.25?'تميل عمومًا إلى رفع الدرجات':md<-.25?'تميل عمومًا إلى خفض الدرجات':'المعايرة العامة متوازنة',patterns,criteria,boundaries,confidence:{score:percent(rated,64),label:rated>=56?'مرتفعة':rated>=40?'متوسطة':'منخفضة'}};
}
function v13DiagnosticData(mid,module,scope){if(module==='gcat')return v13GCATDiagnostics(mid,scope);if(module==='pq10'||module==='derailers')return v13TraitDiagnostics(mid,module,scope);if(module==='leadership')return v13LeadershipDiagnostics(mid,scope);return null;}
function v13ConfidenceChip(c){if(!c)return'';return `<span class="confidence-chip confidence-${c.label==='مرتفعة'?'high':c.label==='متوسطة'?'medium':'low'}">الثقة: ${esc(c.label)}${Number.isFinite(c.score)?` · ${c.score}%`:''}</span>`;}
function v13DiagnosticHTML(mid,module,scope){
  const d=v13DiagnosticData(mid,module,scope);if(!d)return'';
  if(module==='gcat'){const weak=d.weak;return `<section class="analysis-panel"><div class="analysis-title"><div><small>تحليل نقاط الضعف</small><h3>ماذا تحتاج أن تقوّي؟</h3></div>${v13ConfidenceChip(d.confidence)}</div>${weak.length?`<div class="recommendation-list">${weak.map(w=>`<article><div class="rec-head"><strong>${esc(w.topic)}</strong><span>${w.score}% · ثقة ${w.confidence}</span></div><p>أخطأت في ${w.wrong} من ${w.total} في هذه المحاولة.</p><div class="advice-box"><b>كيف تتحسن:</b> ${esc(w.advice)}</div></article>`).join('')}</div>`:'<div class="positive-callout">لا توجد أخطاء في الموضوعات المقيمة في هذه المحاولة.</div>'}</section>`;}
  if(module==='pq10'||module==='derailers'){const isDer=module==='derailers';return `<section class="analysis-panel"><div class="analysis-title"><div><small>${isDer?'السلوك تحت الضغط':'النمط الظاهر من إجاباتك'}</small><h3>${isDer?'الأولى بالانتباه':'الجوانب الأولى بالتطوير'}</h3></div>${v13ConfidenceChip(d.confidence)}</div><div class="recommendation-list">${d.weak.map(w=>`<article><div class="rec-head"><strong>${esc(w.name)}</strong><span>${isDer?`مؤشر مخاطرة تدريبي ${w.risk}%`:`الميل الظاهر ${w.directional}%`} · ثقة ${w.confidence}</span></div><p>${isDer?'هذه ليست تشخيصًا؛ هي إشارة تدريبية مستنتجة من نمط إجابات البنود في هذا المحور.':profilePhrase(w.name,w.directional)}</p><div class="advice-box"><b>اقتراح عملي:</b> ${esc(w.advice)}</div></article>`).join('')}</div></section>`;}
  const pats=d.patterns.slice(0,5);return `<section class="analysis-panel"><div class="analysis-title"><div><small>تشخيص الحكم القيادي</small><h3>أين يتكرر الخلل؟</h3></div>${v13ConfidenceChip(d.confidence)}</div><div class="calibration-banner"><strong>${esc(d.calibration)}</strong><span>ضمن درجة واحدة: ${d.withinOne}% · تطابق تام: ${d.exactRate}%</span></div>${pats.length?`<div class="recommendation-list">${pats.map(p=>`<article><div class="rec-head"><strong>${esc(p.title)}</strong><span>${p.count}/${p.opportunities} · ${p.rate}% · ثقة ${p.confidence}</span></div><p>ظهر هذا النمط في ${p.count} من ${p.opportunities} فرصة يمكن أن يظهر فيها.</p><div class="advice-box"><b>ما الذي تعدله:</b> ${esc(p.advice)}</div></article>`).join('')}</div>`:'<div class="positive-callout">لم يظهر نمط خطأ متكرر في التصرفات المقيمة.</div>'}</section>`;
}

/* v1.3 universal "My Answers" */
function v13ResultFor(mid,module,scope){if(scope==='full_exam')return state.saved.fullResults?.[mid]?.[module]||null;return resultScopes(mid,module)?.[scope]||null;}
function v13StoreFor(mid,module,scope,attemptId=null){if(attemptId){const h=state.saved.history.find(x=>x.attemptId===attemptId);if(h?.responseSnapshot)return h.responseSnapshot;}return state.saved.responses?.[mid]?.[module]?.[scope]||{};}
function v13GCATAnswerCard(item,user,index){const key=modelAnswer(item),ok=user===key,q=item.data,question=item.kind==='abstract'?q.prompt_ar:q.question,visual=item.kind==='abstract'?v13AbstractPatternHTML(q):'',selectedVisual=item.kind==='abstract'&&user?`<div class="answer-visual-pair"><div><span>اختيارك ${esc(user)}</span>${q.svg_inline?.options?.[user]||''}</div><div class="correct-answer-visual"><span>الصحيح ${esc(key)}</span>${q.svg_inline?.options?.[key]||''}</div></div>`:'';let explain=item.kind==='numerical'?q.explanation:item.kind==='verbal'?q.explanation:q.explanation_ar;let extra=item.kind==='numerical'&&q.fast_method?`<p><strong>الطريقة الأسرع:</strong> ${esc(q.fast_method)}</p>`:item.kind==='verbal'&&q.shortcut?`<p><strong>مفتاح سريع:</strong> ${esc(q.shortcut)}</p>`:item.kind==='abstract'?v13AbstractSteps(q):'';return `<article class="answer-review-card ${ok?'answer-ok':'answer-wrong'}"><div class="answer-review-head"><span>#${index}</span><strong>${moduleName(item.kind)}</strong><span class="${ok?'correct':'incorrect'}">${ok?'صحيحة':'غير صحيحة'}</span></div><div class="answer-question">${esc(question)}</div>${visual}${selectedVisual}<div class="answer-compare-grid"><div><span>إجابتك</span><strong>${esc(v13GCATAnswerText(item,user))}</strong></div><div class="reference"><span>الإجابة الصحيحة</span><strong>${esc(v13GCATAnswerText(item,key))}</strong></div></div><div class="explanation-block"><strong>الشرح</strong><p>${esc(explain||'')}</p>${extra}</div></article>`;}
function v13LikertAnswerCard(item,user,index){const q=item.data,model=q.rewritten_answer,al=user===undefined?null:choiceAlignmentText(user,model),measure=item.kind==='pq10'?q.measures:(q.analytic_axis||q.source_domain),sub=q.subtrait||q.analytic_subtrait||'';return `<article class="answer-review-card ${al?.d===0?'answer-ok':al&&al.d>=2?'answer-wrong':''}"><div class="answer-review-head"><span>#${index}</span><strong>${item.kind==='pq10'?'PQ10':'السلوكيات المعطلة'}</strong>${al?`<span>${al.score}% توافق</span>`:''}</div><div class="answer-question">${esc(q.rewritten_question)}</div><div class="answer-compare-grid"><div><span>إجابتك</span><strong>${esc(user??'غير مجاب')}</strong></div><div class="reference"><span>الإجابة التدريبية المرجعية</span><strong>${esc(model)}</strong></div></div><div class="measured-box"><span>ما الذي يقيسه؟</span><strong>${esc(measure||'')}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div><div class="explanation-block"><strong>التفسير</strong><p>${esc(q.training_explanation||q.answer_basis||'')}</p></div>${trainingDisclaimerHTML()}</article>`;}
function v13LeadershipAnswerCard(item,ratings,index){const q=item.data;return `<article class="answer-review-card leadership-answer-card"><div class="answer-review-head"><span>الموقف ${index}</span><strong>${esc(q.title)}</strong></div><div class="scenario-stem">${esc(q.stem)}</div><div class="measured-box"><span>ما الذي يقيسه الموقف؟</span><strong>${esc(q.app_training?.criterion_ar||CRITERION_AR[q.criterion]||q.criterion)}</strong><small>${esc(q.app_training?.what_it_measures||'')}</small></div><div class="lead-answer-list">${q.options.map((o,i)=>{const u=ratings?.[o.response_id],m=o.app_score,mt=u!==undefined?v13LeadMatch(u,m):{label:'غير مجاب',cls:'review'},tf=o.training_feedback||{};return `<section class="lead-answer-review"><div class="lead-action-number">${i+1}</div><p>${esc(o.text)}</p><div class="answer-compare-grid"><div><span>إجابتك</span><strong>${u!==undefined?`${u} — ${RATING_LABELS[u]}`:'غير مجاب'}</strong></div><div class="reference"><span>الدرجة المرجعية</span><strong>${m} — ${esc(RATING_LABELS[m])}</strong></div></div><span class="match-status ${mt.cls}">${mt.label}</span><div class="explanation-block"><strong>لماذا هذه الدرجة؟</strong><p>${esc(tf.why_this_rating||o.app_score_reason||'')}</p></div><details class="feedback-detail"><summary>لماذا ليست أعلى أو أقل؟</summary><p>${esc(tf.full_explanation||o.explanation||'')}</p></details>${trainingDisclaimerHTML()}</section>`}).join('')}</div></article>`;}
function v13ItemDiff(item,user){if(item.kind==='leadership')return item.data.options.some(o=>user?.[o.response_id]!==o.app_score);return user!==modelAnswer(item);}
function renderMyAnswers(mid,module,scope='exam',filter='all',attemptId=null){
  state.session=null;state.ui={view:'my-answers',simId:mid,module,scope,filter,attemptId};setTitle(`${mid} — إجاباتي — ${moduleName(module)}`);const items=resolveItems(mid,module),store=v13StoreFor(mid,module,scope,attemptId),shown=items.map((item,i)=>({item,i:i+1,user:store[storageId(item)]})).filter(x=>filter==='all'||v13ItemDiff(x.item,x.user)),cards=shown.map(x=>x.item.kind==='leadership'?v13LeadershipAnswerCard(x.item,x.user,x.i):['numerical','verbal','abstract'].includes(x.item.kind)?v13GCATAnswerCard(x.item,x.user,x.i):v13LikertAnswerCard(x.item,x.user,x.i)).join('');
  el('main').innerHTML=`<section class="answers-hero"><div><small>${mid} · ${modeName(scope)}</small><h2>إجاباتي والتفسير</h2><p>راجع السؤال وإجابتك والمرجع والتفسير في مكان واحد.</p></div><span class="answer-count">${shown.length}/${items.length}</span></section><div class="segmented answers-filter"><button class="${filter==='all'?'active':''}" data-action="answers-filter" data-filter="all" data-sim="${mid}" data-module="${module}" data-scope="${scope}">الكل</button><button class="${filter==='diff'?'active':''}" data-action="answers-filter" data-filter="diff" data-sim="${mid}" data-module="${module}" data-scope="${scope}">الاختلافات فقط</button></div><section class="answers-export-bar"><button class="btn primary" data-action="share-answers" data-sim="${mid}" data-module="${module}" data-scope="${scope}">مشاركة ملف إجاباتي</button><button class="btn" data-action="export-answers-html" data-sim="${mid}" data-module="${module}" data-scope="${scope}">تقرير كامل</button><button class="btn" data-action="export-answers-csv" data-sim="${mid}" data-module="${module}" data-scope="${scope}">CSV</button><button class="btn" data-action="export-answers-json" data-sim="${mid}" data-module="${module}" data-scope="${scope}">JSON</button><button class="btn" data-action="print-report">حفظ PDF / طباعة</button></section><div class="answers-list">${cards||'<div class="empty">لا توجد عناصر ضمن هذا الفلتر.</div>'}</div>`;
}
function renderFullAnswers(mid,scope='full_exam',filter='all'){state.session=null;state.ui={view:'my-answers-full',simId:mid,scope,filter};setTitle(`${mid} — إجاباتي الكاملة`);const sections=MODULES.map(m=>{const items=resolveItems(mid,m),store=v13StoreFor(mid,m,scope),shown=items.map((item,i)=>({item,i:i+1,user:store[storageId(item)]})).filter(x=>filter==='all'||v13ItemDiff(x.item,x.user));return `<section class="full-answer-section"><h2>${moduleName(m)}</h2>${shown.map(x=>x.item.kind==='leadership'?v13LeadershipAnswerCard(x.item,x.user,x.i):['numerical','verbal','abstract'].includes(x.item.kind)?v13GCATAnswerCard(x.item,x.user,x.i):v13LikertAnswerCard(x.item,x.user,x.i)).join('')||'<div class="empty">لا توجد اختلافات.</div>'}</section>`}).join('');el('main').innerHTML=`<section class="answers-hero"><div><small>${mid}</small><h2>إجاباتي في المحاكاة الشاملة</h2><p>جميع الأقسام مع الإجابات والتفسير.</p></div></section><div class="segmented answers-filter"><button class="${filter==='all'?'active':''}" data-action="answers-full-filter" data-filter="all" data-sim="${mid}" data-scope="${scope}">الكل</button><button class="${filter==='diff'?'active':''}" data-action="answers-full-filter" data-filter="diff" data-sim="${mid}" data-scope="${scope}">الاختلافات فقط</button></div><section class="answers-export-bar"><button class="btn primary" data-action="share-full-answers" data-sim="${mid}" data-scope="${scope}">مشاركة الملف الكامل</button><button class="btn" data-action="export-full-html" data-sim="${mid}" data-scope="${scope}">تصدير التقرير الكامل</button><button class="btn" data-action="print-report">حفظ PDF / طباعة</button></section>${sections}`;}

function v13AnswerRows(mid,module,scope){const items=resolveItems(mid,module),store=v13StoreFor(mid,module,scope),rows=[];for(const [i,item] of items.entries()){const q=item.data,u=store[storageId(item)];if(item.kind==='leadership'){for(const o of q.options){rows.push({index:i+1,module:moduleName(module),kind:item.kind,question:q.stem,option:o.text,user:u?.[o.response_id]??'',reference:o.app_score,reference_label:RATING_LABELS[o.app_score],measure:o.training_feedback?.criterion_ar||q.app_training?.criterion_ar||'',explanation:o.training_feedback?.full_explanation||o.explanation||''});}}else rows.push({index:i+1,module:moduleName(module),kind:item.kind,question:item.kind==='abstract'?q.prompt_ar:q.rewritten_question||q.question||'',user:u??'',reference:modelAnswer(item),measure:topicOf(item),explanation:item.kind==='numerical'?q.explanation:item.kind==='verbal'?q.explanation:item.kind==='abstract'?q.explanation_ar:q.training_explanation||q.answer_basis||''});}return rows;}
function v13ExportPayload(mid,module,scope){return{app_version:APP_VERSION,exported_at:new Date().toISOString(),simulation:mid,module,mode:scope,result:v13ResultFor(mid,module,scope),analysis:v13DiagnosticData(mid,module,scope),answers:v13AnswerRows(mid,module,scope),notice:'المراجع والتفسيرات تدريبية وليست إجابات رسمية معتمدة.'};}
function v13EscapeCSV(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function v13RowsCSV(rows){const keys=['index','module','kind','question','option','user','reference','reference_label','measure','explanation'];return '\ufeff'+[keys.join(','),...rows.map(r=>keys.map(k=>v13EscapeCSV(r[k])).join(','))].join('\n');}
function v13DiagnosticReportHTML(module,a){if(!a)return'<p>لا توجد بيانات كافية للتحليل.</p>';if(module==='gcat')return `<div class="analysis"><h3>أهم نقاط المراجعة</h3>${a.weak?.length?`<ul>${a.weak.map(w=>`<li><b>${esc(w.topic)}</b>: ${w.score}% — ${esc(w.advice)}</li>`).join('')}</ul>`:'<p>لا توجد أخطاء مسجلة في الموضوعات المقيمة.</p>'}</div>`;if(module==='pq10'||module==='derailers')return `<div class="analysis"><h3>${module==='pq10'?'الجوانب الأولى بالتطوير':'الأنماط الأولى بالانتباه'}</h3><ul>${(a.weak||[]).map(w=>`<li><b>${esc(w.name)}</b> — ثقة ${esc(w.confidence)}: ${esc(w.advice)}</li>`).join('')}</ul><p><b>الثقة في التحليل:</b> ${esc(a.confidence?.label||'—')}</p></div>`;return `<div class="analysis"><h3>تشخيص الحكم القيادي</h3><p><b>${esc(a.calibration||'')}</b> — التطابق التام ${a.exactRate??0}%، وضمن درجة واحدة ${a.withinOne??0}%.</p>${a.patterns?.length?`<ul>${a.patterns.slice(0,5).map(x=>`<li><b>${esc(x.title)}</b>: ${x.count}/${x.opportunities} (${x.rate}%) — ${esc(x.advice)}</li>`).join('')}</ul>`:'<p>لم يظهر نمط خطأ متكرر.</p>'}</div>`;}
function v13ReportHTML(mid,module,scope,full=false,includeAnswers=true){const modules=full?MODULES:[module],title=full?`${mid} — إجاباتي وتحليلي الكامل`:`${mid} — ${moduleName(module)} — ${includeAnswers?'إجاباتي وتحليلي':'تقريري المختصر'}`;const blocks=modules.map(m=>{const p=v13ExportPayload(mid,m,scope),headline=p.result?resultHeadline(m,p.result):'لا توجد نتيجة';return `<section><h2>${esc(moduleName(m))}</h2><div class="summary"><b>النتيجة:</b> ${esc(headline)}</div>${v13DiagnosticReportHTML(m,p.analysis)}${includeAnswers?p.answers.map(r=>`<article><h3>${r.index}. ${esc(r.question)}</h3>${r.option?`<p><b>التصرف:</b> ${esc(r.option)}</p>`:''}<p><b>إجابتك:</b> ${esc(r.user||'غير مجاب')}</p><p><b>${m==='pq10'||m==='derailers'?'الإجابة التدريبية المرجعية':'المرجع'}:</b> ${esc(r.reference??'—')} ${esc(r.reference_label||'')}</p><p><b>المجال/المعيار:</b> ${esc(r.measure||'')}</p><p><b>الشرح:</b> ${esc(r.explanation||'')}</p>${m==='pq10'||m==='derailers'||m==='leadership'?'<p class="notice small">تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.</p>':''}</article>`).join(''):''}</section>`}).join('');return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>body{font-family:Arial,Tahoma,sans-serif;max-width:900px;margin:auto;padding:28px;line-height:1.75;color:#172033}h1{border-bottom:3px solid #a97e34;padding-bottom:12px}h2{margin-top:34px;color:#8f2031}.summary,.analysis{background:#f6f7f8;border-radius:12px;padding:12px;margin:10px 0}.analysis li{margin:7px 0}article{border:1px solid #ddd;border-radius:12px;padding:14px;margin:10px 0;break-inside:avoid}.notice{color:#b42332;background:#fff0f1;padding:10px;border-radius:8px}.small{font-size:12px}@media print{body{padding:0}}</style><body><h1>${esc(title)}</h1><p>تاريخ التصدير: ${esc(new Date().toLocaleString('ar-AE'))}</p><p class="notice">تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.</p>${blocks}</body></html>`;}
function v13Download(name,content,type){const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);return blob;}
async function v13ShareFile(name,content,type,title){const blob=new Blob([content],{type}),file=new File([blob],name,{type});try{if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title,files:[file]});return;}v13Download(name,blob,type);toast('المشاركة المباشرة غير مدعومة؛ تم تجهيز الملف للتنزيل والمشاركة.');}catch(e){if(e?.name!=='AbortError'){v13Download(name,blob,type);toast('تعذرت المشاركة المباشرة؛ تم تجهيز الملف للتنزيل.');}}}

reportActions=function(mid,module='full',scope='exam'){if(module==='full')return `<section class="result-actions-card"><h3>إجاباتي ومشاركتي</h3><div class="btn-row"><button class="btn primary" data-action="answers-full" data-sim="${mid}" data-scope="${scope}">إجاباتي والتفسير</button><button class="btn" data-action="export-summary-full" data-sim="${mid}" data-scope="${scope}">تقرير مختصر</button><button class="btn" data-action="share-full-answers" data-sim="${mid}" data-scope="${scope}">مشاركة الملف الكامل</button><button class="btn" data-action="print-report">حفظ PDF / طباعة</button></div></section>`;return `<section class="result-actions-card"><h3>إجاباتي ومشاركتي</h3><div class="btn-row"><button class="btn primary" data-action="answers-view" data-sim="${mid}" data-module="${module}" data-scope="${scope}">إجاباتي والتفسير</button><button class="btn" data-action="export-summary-html" data-sim="${mid}" data-module="${module}" data-scope="${scope}">تقرير مختصر</button><button class="btn" data-action="share-answers" data-sim="${mid}" data-module="${module}" data-scope="${scope}">مشاركة ملف إجاباتي</button><button class="btn" data-action="print-report">حفظ PDF / طباعة</button></div></section>`;};

function v13SummaryCards(mid,module,r,scope){if(module==='gcat')return `<div class="result-summary-grid"><div><span>النتيجة</span><strong>${r.score}%</strong></div><div><span>الصحيح</span><strong>${r.correct}/${r.total}</strong></div>${Object.entries(r.domains||{}).map(([k,v])=>`<div><span>${moduleName(k)}</span><strong>${v.score}%</strong></div>`).join('')}</div>`;if(module==='pq10')return `<div class="result-summary-grid"><div><span>مدى التوافق مع النموذج التدريبي</span><strong>${r.alignment}%</strong></div><div><span>البنود المجابة</span><strong>${r.answered}/${r.total}</strong></div></div>`;if(module==='derailers')return `<div class="result-summary-grid"><div><span>التوافق التدريبي الآمن</span><strong>${r.safety}%</strong></div><div><span>الابتعاد التدريبي</span><strong>${r.risk}%</strong></div></div>`;return `<div class="result-summary-grid"><div><span>دقة الحكم</span><strong>${r.accuracy}%</strong></div><div><span>تطابق تام</span><strong>${r.exact_match}%</strong></div><div><span>رفعت التقييم</span><strong>${r.overrated}</strong></div><div><span>خفضت التقييم</span><strong>${r.underrated}</strong></div></div>`;}
renderResult=function(mid,module,r,timedOut=false){state.session=null;state.ui={view:'result',simId:mid,module,mode:r.responseScope||r.mode};setTitle(`${mid} — نتيجة ${moduleName(module)}`);const scope=r.responseScope||r.mode||'training',reviewCount=unresolvedFor(mid,module).length,breakdown=module==='gcat'?compactBreakdown('الأداء حسب المجال',r.domains,moduleName):module==='pq10'?compactBreakdown('التوافق حسب الكفاءة',r.groups):module==='derailers'?compactBreakdown('التوافق حسب الفئة',r.groups):compactBreakdown('الأداء حسب المعيار',r.criteria,k=>CRITERION_AR[k]||k)+compactBreakdown('دقة الحدود',r.boundaries||{});el('main').innerHTML=`<section class="results-new-hero"><div><span class="mode-pill ${scope==='exam'?'exam':'training'}">${modeName(scope)}</span><h2>${moduleName(module)}</h2><p>${resultInterpretation(module)}</p></div><div class="hero-score">${metricValue(module,r)}%</div></section>${v13SummaryCards(mid,module,r,scope)}${breakdown}${v13DiagnosticHTML(mid,module,scope)}${module==='pq10'||module==='derailers'?`<section class="card"><h3>التحليل المتكامل للشخصية والسلوك تحت الضغط</h3><p>يظهر عندما تكون إجابات PQ10 والسلوكيات المعطلة متوفرة في النمط نفسه، مع تقدير الثقة في الاستنتاج.</p><button class="btn" data-action="profile-report" data-sim="${mid}" data-scope="${scope}">فتح التحليل المتقدم</button></section>`:''}${reviewCount?`<section class="card"><h3>الأولى بالمراجعة</h3><p>لديك ${reviewCount} عنصرًا مفتوحًا في دفتر الأخطاء.</p><button class="btn primary" data-action="train-mistakes" data-sim="${mid}" data-module="${module}">تدرب على أخطائي فقط</button></section>`:''}${scope==='exam'?comparisonHTML(mid,module,'exam',r):''}${reportActions(mid,module,scope)}<div class="btn-row"><button class="btn" data-action="open-sim" data-sim="${mid}">العودة للمحاكاة</button><button class="btn" data-action="restart" data-sim="${mid}" data-module="${module}" data-mode="${r.mode||'training'}">إعادة المحاولة</button></div>`;};
renderFullRunResult=function(mid){state.session=null;const all=state.saved.fullResults?.[mid]||{},g=all.gcat,p=all.pq10,d=all.derailers,l=all.leadership;state.ui={view:'full-result',simId:mid,module:null,mode:'exam'};setTitle(`${mid} — النتيجة الشاملة`);el('main').innerHTML=`<section class="results-new-hero"><div><span class="mode-pill exam">محاكاة شاملة</span><h2>${mid}</h2><p>كل قسم يُفسّر بمقياسه الخاص، ولا تُدمج المقاييس المختلفة في درجة شخصية واحدة.</p></div></section><div class="result-summary-grid"><div><span>GCAT</span><strong>${g?.score??'—'}%</strong></div><div><span>PQ10</span><strong>${p?.alignment??'—'}%</strong></div><div><span>السلوكيات المعطلة</span><strong>${d?.safety??'—'}%</strong></div><div><span>الحكم القيادي</span><strong>${l?.accuracy??'—'}%</strong></div></div>${g?v13DiagnosticHTML(mid,'gcat','full_exam'):''}${p&&d?`<section class="card"><h3>تحليل الشخصية والسلوك تحت الضغط</h3><button class="btn primary" data-action="profile-report" data-sim="${mid}" data-scope="full_exam">فتح التحليل المتقدم</button></section>`:''}${l?v13DiagnosticHTML(mid,'leadership','full_exam'):''}${reportActions(mid,'full','full_exam')}<div class="btn-row"><button class="btn" data-action="open-sim" data-sim="${mid}">العودة للمحاكاة</button><button class="btn" data-action="restart-full" data-sim="${mid}">إعادة المحاكاة الشاملة</button></div>`;};

function v13AnswersCapture(e){const b=e.target?.closest?.('[data-action]');if(!b)return;const a=b.dataset.action;if(!['answers-view','answers-filter','answers-full','answers-full-filter','export-answers-html','export-answers-csv','export-answers-json','share-answers','export-summary-html','export-full-html','export-summary-full','share-full-answers'].includes(a))return;e.stopImmediatePropagation?.();if(['answers-view','answers-full'].includes(a))v12PushCurrent();const mid=b.dataset.sim,module=b.dataset.module,scope=b.dataset.scope||'exam';if(a==='answers-view')return renderMyAnswers(mid,module,scope,'all');if(a==='answers-filter')return renderMyAnswers(mid,module,scope,b.dataset.filter||'all');if(a==='answers-full')return renderFullAnswers(mid,scope,'all');if(a==='answers-full-filter')return renderFullAnswers(mid,scope,b.dataset.filter||'all');if(a==='export-summary-html')return v13Download(`${mid}-${module}-summary.html`,v13ReportHTML(mid,module,scope,false,false),'text/html;charset=utf-8');if(a==='export-summary-full')return v13Download(`${mid}-full-summary.html`,v13ReportHTML(mid,'full',scope,true,false),'text/html;charset=utf-8');if(a==='export-answers-html')return v13Download(`${mid}-${module}-answers.html`,v13ReportHTML(mid,module,scope,false),'text/html;charset=utf-8');if(a==='export-answers-json')return v13Download(`${mid}-${module}-answers.json`,JSON.stringify(v13ExportPayload(mid,module,scope),null,2),'application/json;charset=utf-8');if(a==='export-answers-csv')return v13Download(`${mid}-${module}-answers.csv`,v13RowsCSV(v13AnswerRows(mid,module,scope)),'text/csv;charset=utf-8');if(a==='share-answers')return v13ShareFile(`${mid}-${module}-answers.html`,v13ReportHTML(mid,module,scope,false),'text/html',`${mid} — ${moduleName(module)} — إجاباتي`);if(a==='export-full-html')return v13Download(`${mid}-full-answers.html`,v13ReportHTML(mid,'full',scope,true),'text/html;charset=utf-8');if(a==='share-full-answers')return v13ShareFile(`${mid}-full-answers.html`,v13ReportHTML(mid,'full',scope,true),'text/html',`${mid} — إجاباتي الكاملة`);}
document.addEventListener('click',v13AnswersCapture,true);

const V13_RESTORE_2=v12Restore;
v12Restore=function(s){if(!s)return renderHome();if(s.view==='my-answers')return renderMyAnswers(s.simId,s.module,s.scope,s.filter||'all',s.attemptId||null);if(s.view==='my-answers-full')return renderFullAnswers(s.simId,s.scope,s.filter||'all');return V13_RESTORE_2(s);};


/* === v1.3 final diagnostic + export polish === */
V13_LEAD_PATTERNS.ineffective_action_overrated.advice='وجود إجراء لا يعني وجود تقدم. قبل منح 3 اسأل: بعد تنفيذ الفعل، هل تغيّر جوهر المشكلة فعلًا؟ التوثيق أو الاجتماع أو الإحالة وحدها قد تبقى عند 2.';

function v13MiniInsight(title,name,value,note,cls=''){
  return `<article class="insight-card ${cls}"><small>${esc(title)}</small><strong>${esc(name||'—')}</strong>${value!==undefined&&value!==null?`<bdi dir="ltr">${esc(String(value))}</bdi>`:''}${note?`<p>${esc(note)}</p>`:''}</article>`;
}
function v13RankedObject(obj,labeler=x=>x){
  return Object.entries(obj||{}).map(([k,v])=>({key:k,name:labeler(k),score:Number(v?.score??v??0),count:v?.count??null})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score);
}
v13DiagnosticHTML=function(mid,module,scope){
  const d=v13DiagnosticData(mid,module,scope);if(!d)return'';
  if(module==='gcat'){
    const strong=d.strong?.filter(x=>x.total>=1).slice(0,2)||[],weak=d.weak?.slice(0,5)||[];
    const insights=`<div class="diagnostic-highlight-grid">${strong.length?v13MiniInsight('الأقوى في هذه المحاولة',strong[0].topic,`${strong[0].score}%`,`${strong[0].correct} صحيحة من ${strong[0].total}`,'positive'):''}${weak.length?v13MiniInsight('الأولى بالمراجعة',weak[0].topic,`${weak[0].score}%`,`${weak[0].wrong} خطأ من ${weak[0].total}`,'attention'):v13MiniInsight('الأولى بالمراجعة','لا توجد أخطاء مسجلة','100%','استمر على نفس طريقة الحل.','positive')}</div>`;
    return `<section class="analysis-panel"><div class="analysis-title"><div><small>تحليل الأداء</small><h3>أين أنت قوي وما الذي يحتاج تقوية؟</h3></div>${v13ConfidenceChip(d.confidence)}</div>${insights}${weak.length?`<div class="recommendation-list">${weak.map(w=>`<article><div class="rec-head"><strong>${esc(w.topic)}</strong><span>${w.score}% · ثقة ${w.confidence}</span></div><p>أخطأت في ${w.wrong} من ${w.total} في هذه المحاولة.</p><div class="advice-box"><b>كيف تتحسن:</b> ${esc(w.advice)}</div></article>`).join('')}</div>`:'<div class="positive-callout">لا توجد أخطاء في الموضوعات المقيمة في هذه المحاولة.</div>'}</section>`;
  }
  if(module==='pq10'||module==='derailers'){
    const isDer=module==='derailers',strong=d.strong?.[0],weak=d.weak?.[0];
    const strongValue=strong?(isDer?`${strong.risk}% مخاطرة تدريبية`:`${strong.directional}%`):null,weakValue=weak?(isDer?`${weak.risk}% مخاطرة تدريبية`:`${weak.directional}%`):null;
    const insights=`<div class="diagnostic-highlight-grid">${strong?v13MiniInsight(isDer?'الأكثر اتزانًا في هذه المحاولة':'الأكثر ظهورًا نحو النموذج التدريبي',strong.name,strongValue,`الثقة: ${strong.confidence}`,'positive'):''}${weak?v13MiniInsight(isDer?'الأولى بالانتباه':'الأولى بالتطوير',weak.name,weakValue,`الثقة: ${weak.confidence}`,'attention'):''}</div>`;
    return `<section class="analysis-panel"><div class="analysis-title"><div><small>${isDer?'السلوك تحت الضغط':'النمط الظاهر من إجاباتك'}</small><h3>${isDer?'مواطن الاتزان والانتباه':'أبرز الجوانب وما يحتاج تطويرًا'}</h3></div>${v13ConfidenceChip(d.confidence)}</div>${insights}<div class="recommendation-list">${(d.weak||[]).map(w=>`<article><div class="rec-head"><strong>${esc(w.name)}</strong><span>${isDer?`مؤشر مخاطرة تدريبي ${w.risk}%`:`الميل الظاهر ${w.directional}%`} · ثقة ${w.confidence}</span></div><p>${isDer?'هذه إشارة تدريبية من نمط الإجابات وليست تشخيصًا نفسيًا.':profilePhrase(w.name,w.directional)}</p><div class="advice-box"><b>اقتراح عملي:</b> ${esc(w.advice)}</div></article>`).join('')}</div></section>`;
  }
  const pats=d.patterns.slice(0,5),cr=v13RankedObject(d.criteria,k=>CRITERION_AR[k]||k),br=v13RankedObject(d.boundaries,k=>k),best=cr[0],review=cr[cr.length-1],weakBoundary=br[br.length-1],overRate=percent(d.over,d.rated),underRate=percent(d.under,d.rated);
  const insights=`<div class="diagnostic-highlight-grid">${best?v13MiniInsight('أقوى معيار',best.name,`${best.score}%`,'أقرب معايرة إلى المرجع في هذه المحاولة.','positive'):''}${review?v13MiniInsight('الأولى بالمراجعة',review.name,`${review.score}%`,'ابدأ بالمواقف المرتبطة بهذا المعيار.','attention'):''}${weakBoundary?v13MiniInsight('أضعف حد بين درجتين',weakBoundary.name,`${weakBoundary.score}%`,'راجع الفرق الوظيفي بين الدرجتين.','attention'):''}</div>`;
  return `<section class="analysis-panel"><div class="analysis-title"><div><small>تشخيص الحكم القيادي</small><h3>أين يتكرر الخلل وكيف تعدله؟</h3></div>${v13ConfidenceChip(d.confidence)}</div><div class="calibration-banner"><strong>${esc(d.calibration)}</strong><span>ضمن درجة واحدة: ${d.withinOne}% · تطابق تام: ${d.exactRate}% · رفعت ${overRate}% · خفضت ${underRate}%</span></div>${insights}${pats.length?`<div class="recommendation-list">${pats.map(p=>`<article><div class="rec-head"><strong>${esc(p.title)}</strong><span>${p.count}/${p.opportunities} · ${p.rate}% · ثقة ${p.confidence}</span></div><p>ظهر هذا النمط في ${p.count} من ${p.opportunities} فرصة يمكن أن يظهر فيها.</p><div class="advice-box"><b>ما الذي تعدله:</b> ${esc(p.advice)}</div></article>`).join('')}</div>`:'<div class="positive-callout">لم يظهر نمط خطأ متكرر في التصرفات المقيمة.</div>'}</section>`;
};

function v13ChosenDistractor(q,kind,user,key){if(!user||user===key)return'';if(kind==='numerical'){const d=q.distractor_analysis?.[user]||q.distractor_analysis?.find?.(x=>x.option===user);return typeof d==='string'?d:(d?.explanation||d?.reason||'');}if(kind==='abstract'){const d=q.distractor_explanations?.[user];return typeof d==='string'?d:(d?.explanation||d?.reason||'');}return'';}
v13AnswerRows=function(mid,module,scope){
  const items=resolveItems(mid,module),store=v13StoreFor(mid,module,scope),rows=[];
  for(const [i,item] of items.entries()){
    const q=item.data,u=store[storageId(item)];
    if(item.kind==='leadership'){
      for(const o of q.options){const tf=o.training_feedback||{},uv=u?.[o.response_id];rows.push({index:i+1,module:moduleName(module),kind:item.kind,question:q.stem,scenario_title:q.title,option:o.text,user:uv??'',user_label:uv?RATING_LABELS[uv]:'',reference:o.app_score,reference_label:RATING_LABELS[o.app_score],measure:tf.criterion_ar||q.app_training?.criterion_ar||'',why:tf.why_this_rating||o.app_score_reason||'',explanation:tf.full_explanation||o.explanation||'',boundary:tf.boundary_tested||''});}
    }else{
      const key=modelAnswer(item),question=item.kind==='abstract'?q.prompt_ar:q.rewritten_question||q.question||'',base={index:i+1,module:moduleName(module),kind:item.kind,question,user:u??'',reference:key,measure:topicOf(item)};
      if(['numerical','verbal','abstract'].includes(item.kind)){base.user_display=v13GCATAnswerText(item,u);base.reference_display=v13GCATAnswerText(item,key);base.explanation=item.kind==='numerical'?q.explanation:item.kind==='verbal'?q.explanation:q.explanation_ar;base.fast_method=item.kind==='numerical'?q.fast_method||'':item.kind==='verbal'?q.shortcut||'':'';base.steps=item.kind==='abstract'?(q.logical_steps||[]):[];base.distractor_explanation=v13ChosenDistractor(q,item.kind,u,key);}
      else{base.explanation=q.training_explanation||q.answer_basis||'';base.subtrait=q.subtrait||q.analytic_subtrait||'';if(item.kind==='derailers'){base.healthy_expression=q.healthy_expression||'';base.risk_expression=q.derailer_risk_expression||'';base.choice_meaning=q.option_guidance?.[u]?.meaning||'';}}
      rows.push(base);
    }
  }
  return rows;
};

function v13ReportAbstractVisual(q,user,key){
  const pattern=v13AbstractPatternHTML(q),uv=user&&q.svg_inline?.options?.[user]?q.svg_inline.options[user]:'',kv=key&&q.svg_inline?.options?.[key]?q.svg_inline.options[key]:'';
  return `${pattern}<div class="report-visual-pair">${uv?`<div><b>اختيارك ${esc(user)}</b>${uv}</div>`:''}${kv?`<div class="correct"><b>الإجابة الصحيحة ${esc(key)}</b>${kv}</div>`:''}</div>`;
}
function v13ReportAnswerBlocks(mid,module,scope){
  const items=resolveItems(mid,module),store=v13StoreFor(mid,module,scope);return items.map((item,i)=>{
    const q=item.data,u=store[storageId(item)];
    if(item.kind==='leadership')return `<article class="report-answer"><h3>الموقف ${i+1}: ${esc(q.title||'')}</h3><p>${esc(q.stem)}</p><p class="measure"><b>ما الذي يقيسه؟</b> ${esc(q.app_training?.criterion_ar||CRITERION_AR[q.criterion]||q.criterion)} — ${esc(q.app_training?.what_it_measures||'')}</p>${q.options.map((o,j)=>{const uv=u?.[o.response_id],m=o.app_score,tf=o.training_feedback||{},mt=uv!==undefined?v13LeadMatch(uv,m):{label:'غير مجاب'};return `<section class="report-subanswer"><h4>التصرف ${j+1}: ${esc(o.text)}</h4><div class="report-compare"><div><small>إجابتك</small><b>${uv!==undefined?`${uv} — ${esc(RATING_LABELS[uv])}`:'غير مجاب'}</b></div><div class="correct"><small>الدرجة المرجعية</small><b>${m} — ${esc(RATING_LABELS[m])}</b></div></div><p><b>مدى التطابق:</b> ${esc(mt.label)}</p><p><b>لماذا هذه الدرجة؟</b> ${esc(tf.why_this_rating||o.app_score_reason||'')}</p><p><b>لماذا ليست أعلى أو أقل؟</b> ${esc(tf.full_explanation||o.explanation||'')}</p>${tf.boundary_tested?`<p><b>الحد الذي يختبره التصرف:</b> ${esc(tf.boundary_tested)}</p>`:''}<p class="notice small">تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.</p></section>`}).join('')}</article>`;
    const key=modelAnswer(item),isG=['numerical','verbal','abstract'].includes(item.kind);if(isG){const ok=u===key,question=item.kind==='abstract'?q.prompt_ar:q.question;let extra='';if(item.kind==='numerical'){extra=`<p><b>الشرح:</b> ${esc(q.explanation||'')}</p>${q.fast_method?`<p><b>الطريقة الأسرع:</b> ${esc(q.fast_method)}</p>`:''}`;}else if(item.kind==='verbal'){extra=`<p><b>الشرح:</b> ${esc(q.explanation||'')}</p>${q.shortcut?`<p><b>المفتاح السريع:</b> ${esc(q.shortcut)}</p>`:''}`;}else{extra=`<p><b>الفكرة والحل:</b> ${esc(q.explanation_ar||'')}</p>${q.logical_steps?.length?`<ol>${q.logical_steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}`;}const dist=v13ChosenDistractor(q,item.kind,u,key);return `<article class="report-answer"><h3>${i+1}. ${esc(question)}</h3>${item.kind==='abstract'?v13ReportAbstractVisual(q,u,key):''}<div class="report-compare"><div><small>إجابتك</small><b>${esc(v13GCATAnswerText(item,u))}</b></div><div class="correct"><small>الإجابة الصحيحة</small><b>${esc(v13GCATAnswerText(item,key))}</b></div></div><p class="${ok?'ok':'bad'}"><b>${ok?'إجابتك صحيحة.':'إجابتك غير صحيحة.'}</b></p>${extra}${dist?`<p><b>لماذا كان اختيارك مشتتًا؟</b> ${esc(dist)}</p>`:''}<p class="notice small">تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.</p></article>`;}
    const model=q.rewritten_answer,al=u===undefined?null:choiceAlignmentText(u,model),measure=item.kind==='pq10'?q.measures:(q.analytic_axis||q.source_domain),sub=q.subtrait||q.analytic_subtrait||'',choice=item.kind==='derailers'?q.option_guidance?.[u]?.meaning||'':'';return `<article class="report-answer"><h3>${i+1}. ${esc(q.rewritten_question)}</h3><div class="report-compare"><div><small>إجابتك</small><b>${esc(u??'غير مجاب')}</b></div><div class="correct"><small>الإجابة التدريبية المرجعية</small><b>${esc(model)}</b></div></div>${al?`<p><b>مدى التوافق مع النموذج التدريبي:</b> ${al.score}% — ${esc(al.label)}</p>`:''}<p class="measure"><b>ما الذي يقيسه؟</b> ${esc(measure||'')}${sub?` — ${esc(sub)}`:''}</p><p><b>التفسير:</b> ${esc(q.training_explanation||q.answer_basis||'')}</p>${choice?`<p><b>قراءة اختيارك:</b> ${esc(choice)}</p>`:''}${item.kind==='derailers'&&q.healthy_expression?`<p><b>السلوك المتزن:</b> ${esc(q.healthy_expression)}</p><p><b>النمط المعطل المحتمل:</b> ${esc(q.derailer_risk_expression||'')}</p>`:''}<p class="notice small">تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.</p></article>`;
  }).join('');
}

v13DiagnosticReportHTML=function(module,a){
  if(!a)return'<p>لا توجد بيانات كافية للتحليل.</p>';
  if(module==='gcat')return `<div class="analysis"><h3>تحليل الأداء</h3>${a.strong?.[0]?`<p><b>الأقوى:</b> ${esc(a.strong[0].topic)} (${a.strong[0].score}%).</p>`:''}${a.weak?.[0]?`<p><b>الأولى بالمراجعة:</b> ${esc(a.weak[0].topic)} (${a.weak[0].score}%).</p>`:''}${a.weak?.length?`<ul>${a.weak.map(w=>`<li><b>${esc(w.topic)}</b>: ${w.score}% — ${esc(w.advice)}</li>`).join('')}</ul>`:'<p>لا توجد أخطاء مسجلة في الموضوعات المقيمة.</p>'}</div>`;
  if(module==='pq10'||module==='derailers')return `<div class="analysis"><h3>${module==='pq10'?'النمط السلوكي الظاهر':'السلوكيات الأولى بالانتباه تحت الضغط'}</h3>${a.strong?.[0]?`<p><b>${module==='pq10'?'الأكثر ظهورًا نحو النموذج التدريبي':'الأكثر اتزانًا'}:</b> ${esc(a.strong[0].name)}.</p>`:''}<ul>${(a.weak||[]).map(w=>`<li><b>${esc(w.name)}</b> — ثقة ${esc(w.confidence)}: ${esc(w.advice)}</li>`).join('')}</ul><p><b>الثقة في التحليل:</b> ${esc(a.confidence?.label||'—')}. الثقة تصف كفاية واتساق البيانات ولا تعني الصدق أو الكذب.</p></div>`;
  const cr=v13RankedObject(a.criteria,k=>CRITERION_AR[k]||k),br=v13RankedObject(a.boundaries,k=>k);return `<div class="analysis"><h3>تشخيص الحكم القيادي</h3><p><b>${esc(a.calibration||'')}</b> — التطابق التام ${a.exactRate??0}%، وضمن درجة واحدة ${a.withinOne??0}%.</p>${cr[0]?`<p><b>أقوى معيار:</b> ${esc(cr[0].name)} (${cr[0].score}%).</p>`:''}${cr.length?`<p><b>الأولى بالمراجعة:</b> ${esc(cr[cr.length-1].name)} (${cr[cr.length-1].score}%).</p>`:''}${br.length?`<p><b>أضعف حد:</b> ${esc(br[br.length-1].name)} (${br[br.length-1].score}%).</p>`:''}${a.patterns?.length?`<ul>${a.patterns.slice(0,5).map(x=>`<li><b>${esc(x.title)}</b>: ${x.count}/${x.opportunities} (${x.rate}%) — ${esc(x.advice)}</li>`).join('')}</ul>`:'<p>لم يظهر نمط خطأ متكرر.</p>'}</div>`;
};

v13ReportHTML=function(mid,module,scope,full=false,includeAnswers=true){
  const modules=full?MODULES:[module],title=full?`${mid} — إجاباتي وتحليلي الكامل`:`${mid} — ${moduleName(module)} — ${includeAnswers?'إجاباتي وتحليلي':'تقريري المختصر'}`;
  const blocks=modules.map(m=>{const p=v13ExportPayload(mid,m,scope),headline=p.result?resultHeadline(m,p.result):'لا توجد نتيجة';return `<section><h2>${esc(moduleName(m))}</h2><div class="summary"><b>النتيجة:</b> ${esc(headline)}</div>${v13DiagnosticReportHTML(m,p.analysis)}${includeAnswers?v13ReportAnswerBlocks(mid,m,scope):''}</section>`}).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:Arial,Tahoma,sans-serif;max-width:960px;margin:auto;padding:28px;line-height:1.8;color:#172033;background:#faf8f3}h1{border-bottom:3px solid #a97e34;padding-bottom:12px}h2{margin-top:34px;color:#8f2031}.summary,.analysis{background:#f0ede7;border-radius:12px;padding:14px;margin:10px 0}.analysis li{margin:7px 0}.report-answer{background:#fff;border:1px solid #ddd4c5;border-radius:14px;padding:16px;margin:14px 0;break-inside:avoid}.report-subanswer{border-top:1px solid #e5e0d7;padding:14px 0}.report-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}.report-compare>div{border:1px solid #ddd;border-radius:10px;padding:10px}.report-compare .correct{background:#edf8f0;border-color:#9bcbaa}.report-compare small{display:block;color:#667085}.notice{color:#b42332;background:#fff0f1;border:1px solid #efc1c6;padding:10px;border-radius:8px}.small{font-size:12px}.measure{background:#edf3ff;padding:10px;border-radius:9px}.ok{color:#287145}.bad{color:#b42332}.abstract-direction-note{background:#fff8e8;border:1px solid #ead6a4;border-radius:10px;padding:8px;text-align:center}.abstract-flow{display:flex;direction:ltr;align-items:center;justify-content:center;gap:6px;overflow:hidden}.abstract-cell{position:relative}.abstract-cell svg,.report-visual-pair svg{width:90px;height:90px}.flow-arrow{font-size:24px;color:#a97e34}.frame-index{position:absolute;z-index:2;background:#172033;color:white;border-radius:20px;padding:1px 7px;font-size:11px}.missing-box{width:90px;height:90px;border:3px dashed #a97e34;display:grid;place-items:center;font-size:30px}.abstract-matrix{display:grid;direction:ltr;gap:6px;width:max-content;margin:10px auto}.matrix-2{grid-template-columns:repeat(2,90px)}.matrix-3{grid-template-columns:repeat(3,82px)}.matrix-3 svg,.matrix-3 .missing-box{width:82px;height:82px}.abstract-relation{direction:ltr}.relation-row{display:flex;align-items:center;justify-content:center;gap:8px;margin:8px}.report-visual-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.report-visual-pair>div{border:1px solid #ddd;border-radius:10px;padding:8px;text-align:center}.report-visual-pair .correct{background:#edf8f0}@media(max-width:600px){body{padding:12px}.report-compare,.report-visual-pair{grid-template-columns:1fr}.abstract-cell svg{width:70px;height:70px}.missing-box{width:70px;height:70px}.matrix-2{grid-template-columns:repeat(2,70px)}.matrix-3{grid-template-columns:repeat(3,64px)}.matrix-3 svg,.matrix-3 .missing-box{width:64px;height:64px}}@media print{body{padding:0;background:#fff}}</style><body><h1>${esc(title)}</h1><p>تاريخ التصدير: ${esc(new Date().toLocaleString('ar-AE'))}</p><p class="notice">تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.</p>${blocks}</body></html>`;
};


/* === v1.4 semantic clarity + explanation + sharing upgrade === */
function v14TeachingHTML(q,kind){
  const x=q.app_explanation_v2;if(!x)return'';
  const steps=(x.steps||[]).map((s,i)=>`<li><span class="step-no">${i+1}</span><span>${esc(s)}</span></li>`).join('');
  return `<section class="teaching-explanation"><div class="teach-idea"><span>الفكرة</span><strong>${esc(x.idea||'')}</strong></div>${steps?`<div class="teach-steps"><h5>الحل خطوة بخطوة</h5><ol>${steps}</ol></div>`:''}${x.conclusion?`<div class="teach-conclusion"><strong>${esc(x.conclusion)}</strong></div>`:''}</section>`;
}

// Abstract stem rendering: visual meaning without cluttering numbers/letters.
v13FrameCell=function(svg,label,extra=''){return `<div class="abstract-cell ${extra}"><div class="svg-frame">${svg}</div></div>`;};
v13MissingCell=function(label='?'){return `<div class="abstract-cell missing-cell" aria-label="الخانة المطلوبة"><div class="missing-box">?</div></div>`;};
v13AbstractPatternHTML=function(q){
  const fs=q.svg_inline?.frames||[],fmt=q.question_format||'sequence';
  if(fmt==='odd_one')return `<div class="abstract-direction-note"><strong>المطلوب:</strong> قارن الخيارات وابحث عن الخيار الوحيد الذي يكسر العلاقة المشتركة.</div>`;
  if(!fs.length)return'';
  if(fmt==='sequence'){
    const cells=[];fs.forEach((s)=>{cells.push(v13FrameCell(s,''));cells.push('<span class="flow-arrow" aria-hidden="true">→</span>')});cells.push(v13MissingCell('?'));
    return `<div class="abstract-direction-note"><strong>اتجاه النمط:</strong> من اليسار إلى اليمين <bdi dir="ltr">→</bdi></div><div class="abstract-flow frames-${fs.length}" dir="ltr">${cells.join('')}</div>`;
  }
  if(fmt==='matrix'){
    const cols=fs.length===8?3:2,cells=fs.map(s=>v13FrameCell(s,'')).join('')+v13MissingCell('?');
    return `<div class="abstract-direction-note"><strong>المطلوب:</strong> أكمل الخانة الفارغة. اقرأ الصفوف من اليسار إلى اليمين، وتحقق من القاعدة عموديًا أيضًا.</div><div class="abstract-matrix matrix-${cols}" dir="ltr">${cells}</div>`;
  }
  if(fmt==='analogy'||fmt==='transformation'){
    const title=fmt==='analogy'?'العلاقة البصرية':'قاعدة التحويل';
    return `<div class="abstract-direction-note"><strong>${title}:</strong> العلاقة في الصف الأول هي نفسها المطلوبة في الصف الثاني.</div><div class="abstract-relation" dir="ltr"><div class="relation-row">${v13FrameCell(fs[0],'')}<span class="flow-arrow" aria-label="يتحول إلى">→</span>${v13FrameCell(fs[1],'')}</div><div class="relation-row">${v13FrameCell(fs[2],'')}<span class="flow-arrow" aria-label="يتحول إلى">→</span>${v13MissingCell('?')}</div></div>`;
  }
  return `<div class="abstract-flow" dir="ltr">${fs.map(s=>v13FrameCell(s,'')).join('<span class="flow-arrow">→</span>')}</div>`;
};

renderAbstract=function(item){
  const q=item.data,store=responseStore(state.session.mid,state.session.module,state.session.responseScope),chosen=store[storageId(item)];
  const opts='ABCDEF'.split('').map((l,i)=>`<button class="abstract-option ${v13GCATClass(item,l,chosen)}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${l}" aria-label="الخيار ${i+1}" aria-pressed="${chosen===l?'true':'false'}" ${state.session.mode==='training'&&chosen!==undefined?'disabled':''}>${q.svg_inline?.options?.[l]||`<div>${esc(q['option_'+l])}</div>`}</button>`).join('');
  const fmtAr={sequence:'تسلسل',matrix:'مصفوفة',analogy:'علاقة',transformation:'تحويل',odd_one:'الشكل المختلف'}[q.question_format]||'تجريدي';
  el('questionHost').innerHTML=`<article class="question-card abstract-question v14-abstract">${questionToolbar(item)}<span class="pill">تجريدي · ${fmtAr}</span><div class="question-text">${esc(q.prompt_ar)}</div>${v13AbstractPatternHTML(q)}<div class="abstract-options unlabeled-options">${opts}</div><div id="feedbackHost"></div>${v13SessionNavHTML(item)}</article>`;
  if(state.session.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
};

const V14_FEEDBACK_PREV=showTrainingFeedback;
showTrainingFeedback=function(item,chosen){
  if(item.kind==='numerical'){
    const host=el('feedbackHost');if(!host)return;const q=item.data,key=q.correct_answer,ok=chosen===key,userText=v13GCATAnswerText(item,chosen),keyText=v13GCATAnswerText(item,key);
    let dist='';if(!ok&&q.distractor_analysis){const d=q.distractor_analysis[chosen]||q.distractor_analysis?.find?.(x=>x.option===chosen);if(d)dist=`<div class="explanation-block"><strong>لماذا كان اختيارك غير مناسب؟</strong><p>${esc(typeof d==='string'?d:d.explanation||d.reason||'')}</p></div>`;}
    host.innerHTML=`<section class="feedback gcat-feedback ${ok?'good':'bad'}"><div class="answer-verdict ${ok?'correct':'incorrect'}">${ok?'✓ إجابتك صحيحة':'✕ إجابتك غير صحيحة'}</div><div class="answer-compare-grid"><div><span>اختيارك</span><strong>${esc(userText)}</strong></div><div class="reference"><span>الإجابة الصحيحة</span><strong>${esc(keyText)}</strong></div></div>${v14TeachingHTML(q,'numerical')}${q.fast_method?`<div class="fast-method"><strong>الطريقة الأسرع</strong><p>${esc(q.fast_method)}</p></div>`:''}${dist}${trainingDisclaimerHTML()}</section>`;return;
  }
  if(item.kind==='abstract'){
    const host=el('feedbackHost');if(!host)return;const q=item.data,key=q.correct_option,ok=chosen===key,de=q.distractor_explanations?.[chosen],uv=q.svg_inline?.options?.[chosen]||'',kv=q.svg_inline?.options?.[key]||'';
    host.innerHTML=`<section class="feedback gcat-feedback ${ok?'good':'bad'}"><div class="answer-verdict ${ok?'correct':'incorrect'}">${ok?'✓ إجابتك صحيحة':'✕ إجابتك غير صحيحة'}</div><div class="abstract-answer-compare"><div class="${ok?'correct-answer-visual':'wrong-answer-visual'}"><span>اختيارك</span>${uv}</div><div class="correct-answer-visual"><span>الإجابة الصحيحة</span>${kv}</div></div>${v14TeachingHTML(q,'abstract')}${!ok&&de?`<div class="explanation-block"><strong>لماذا كان اختيارك غير مناسب؟</strong><p>${esc(typeof de==='string'?de:de.explanation||de.reason||'')}</p></div>`:''}${trainingDisclaimerHTML()}</section>`;return;
  }
  return V14_FEEDBACK_PREV(item,chosen);
};

// Reports: share is primary for both short and full human-readable reports.
reportActions=function(mid,module='full',scope='exam'){
  if(module==='full')return `<section class="result-actions-card"><h3>إجاباتي ومشاركتي</h3><div class="btn-row"><button class="btn primary" data-action="answers-full" data-sim="${mid}" data-scope="${scope}">إجاباتي والتفسير</button><button class="btn" data-action="share-summary-full" data-sim="${mid}" data-scope="${scope}">مشاركة التقرير المختصر</button><button class="btn" data-action="share-full-answers" data-sim="${mid}" data-scope="${scope}">مشاركة التقرير الكامل</button><button class="btn ghost" data-action="print-report">حفظ PDF / طباعة</button></div></section>`;
  return `<section class="result-actions-card"><h3>إجاباتي ومشاركتي</h3><div class="btn-row"><button class="btn primary" data-action="answers-view" data-sim="${mid}" data-module="${module}" data-scope="${scope}">إجاباتي والتفسير</button><button class="btn" data-action="share-summary-html" data-sim="${mid}" data-module="${module}" data-scope="${scope}">مشاركة التقرير المختصر</button><button class="btn" data-action="share-answers" data-sim="${mid}" data-module="${module}" data-scope="${scope}">مشاركة التقرير الكامل</button><button class="btn ghost" data-action="print-report">حفظ PDF / طباعة</button></div></section>`;
};

const V14_RENDER_MY_PREV=renderMyAnswers;
renderMyAnswers=function(mid,module,scope='exam',filter='all',attemptId=null){
  V14_RENDER_MY_PREV(mid,module,scope,filter,attemptId);
  const bar=document.querySelector('.answers-export-bar');if(bar)bar.innerHTML=`<button class="btn primary" data-action="share-answers" data-sim="${mid}" data-module="${module}" data-scope="${scope}">مشاركة التقرير الكامل</button><button class="btn" data-action="share-summary-html" data-sim="${mid}" data-module="${module}" data-scope="${scope}">مشاركة التقرير المختصر</button><button class="btn" data-action="export-answers-csv" data-sim="${mid}" data-module="${module}" data-scope="${scope}">CSV</button><button class="btn" data-action="export-answers-json" data-sim="${mid}" data-module="${module}" data-scope="${scope}">JSON</button><button class="btn ghost" data-action="print-report">حفظ PDF / طباعة</button>`;
};
const V14_RENDER_FULL_PREV=renderFullAnswers;
renderFullAnswers=function(mid,scope='full_exam',filter='all'){
  V14_RENDER_FULL_PREV(mid,scope,filter);
  const bar=document.querySelector('.answers-export-bar');if(bar)bar.innerHTML=`<button class="btn primary" data-action="share-full-answers" data-sim="${mid}" data-scope="${scope}">مشاركة التقرير الكامل</button><button class="btn" data-action="share-summary-full" data-sim="${mid}" data-scope="${scope}">مشاركة التقرير المختصر</button><button class="btn ghost" data-action="print-report">حفظ PDF / طباعة</button>`;
};

function v14ShareCapture(e){
  const b=e.target?.closest?.('[data-action]');if(!b)return;const a=b.dataset.action;if(!['share-summary-html','share-summary-full'].includes(a))return;
  e.stopImmediatePropagation?.();const mid=b.dataset.sim,module=b.dataset.module,scope=b.dataset.scope||'exam';
  if(a==='share-summary-html')return v13ShareFile(`${mid}-${module}-summary.html`,v13ReportHTML(mid,module,scope,false,false),'text/html',`${mid} — ${moduleName(module)} — التقرير المختصر`);
  if(a==='share-summary-full')return v13ShareFile(`${mid}-full-summary.html`,v13ReportHTML(mid,'full',scope,true,false),'text/html',`${mid} — التقرير المختصر`);
}
document.addEventListener('click',v14ShareCapture,true);


// v1.4: native Share Sheet is the primary and only automatic action for report sharing.
v13ShareFile=async function(name,content,type,title){
  const blob=new Blob([content],{type}),file=new File([blob],name,{type});
  try{
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title,files:[file]});return true;}
    if(navigator.share){await navigator.share({title,text:'تم إنشاء التقرير داخل التطبيق. افتح التطبيق على جهاز يدعم مشاركة الملفات لإرسال الملف كاملًا.'});return false;}
    toast('المشاركة المباشرة غير مدعومة في هذا المتصفح. لم يتم تنزيل أي ملف تلقائيًا.');return false;
  }catch(e){if(e?.name!=='AbortError')toast('تعذرت المشاركة. لم يتم تنزيل أي ملف تلقائيًا.');return false;}
};


/* ============================================================================
   v1.5 — premium UI layer
   Presentation only. Question resolution, answer storage, scoring, analysis
   and export all continue to run through the existing v1.0–v1.4 functions;
   this layer re-renders the screens that carry the product's first impression:
   home, simulation selection, the question screen, results and progress.
   ========================================================================== */

/* --- Inline icon set (no external dependency, inherits currentColor) ------- */
const P5_ICON_PATHS={
  home:'<path d="M4 10.6 12 4l8 6.6V19a1.4 1.4 0 0 1-1.4 1.4h-3.7v-5.6h-5.8v5.6H5.4A1.4 1.4 0 0 1 4 19z"/>',
  guide:'<path d="M4.2 5.6A2.4 2.4 0 0 1 6.6 3.2H19.8v13.2H6.6a2.4 2.4 0 0 0-2.4 2.4z"/><path d="M4.2 19a2.4 2.4 0 0 1 2.4-2.4H19.8v4.2H6.6A2.4 2.4 0 0 1 4.2 19z"/>',
  training:'<path d="m15.4 4.2 4.4 4.4L8.7 19.7l-5.1 1 1-5.1z"/><path d="m13.2 6.4 4.4 4.4"/>',
  simulation:'<path d="m12 3 8.6 4.6L12 12.2 3.4 7.6z"/><path d="m3.4 12 8.6 4.6 8.6-4.6"/><path d="m3.4 16.4 8.6 4.6 8.6-4.6"/>',
  review:'<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.4"/>',
  results:'<path d="M5 20.2V11.4"/><path d="M12 20.2V4.2"/><path d="M19 20.2v-6.4"/>',
  trend:'<path d="m3.8 15.4 5-5 3.6 3.6 7.8-7.8"/><path d="M20.2 6.2h-4.6"/><path d="M20.2 6.2v4.6"/>',
  clock:'<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 1.9"/>',
  list:'<path d="M9.2 6.2h10.6"/><path d="M9.2 12h10.6"/><path d="M9.2 17.8h10.6"/><path d="M4.6 6.2h.02"/><path d="M4.6 12h.02"/><path d="M4.6 17.8h.02"/>',
  check:'<path d="m5 12.6 4.6 4.6L19 6.8"/>',
  checkCircle:'<circle cx="12" cy="12" r="8.4"/><path d="m8.4 12.2 2.6 2.6 4.8-5"/>',
  close:'<path d="m6.4 6.4 11.2 11.2"/><path d="M17.6 6.4 6.4 17.6"/>',
  play:'<path d="M8.4 5.4v13.2L19 12z"/>',
  refresh:'<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20.2 4.4v4.4h-4.4"/>',
  trophy:'<path d="M7.4 4.2h9.2v4.6a4.6 4.6 0 1 1-9.2 0z"/><path d="M7.4 6h-3v1.4a3 3 0 0 0 3 3"/><path d="M16.6 6h3v1.4a3 3 0 0 1-3 3"/><path d="M12 13.4v3.4"/><path d="M8.6 20.2h6.8"/>',
  alert:'<path d="M12 4.4 20.6 19.6H3.4z"/><path d="M12 10.2v3.8"/><path d="M12 17h.02"/>',
  star:'<path d="m12 4.2 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.6-.8z"/>',
  chevron:'<path d="m14.4 6.2-6 5.8 6 5.8"/>',
  spark:'<path d="M12 3.4v3.4"/><path d="M12 17.2v3.4"/><path d="M3.4 12h3.4"/><path d="M17.2 12h3.4"/><path d="m6 6 2.4 2.4"/><path d="m15.6 15.6 2.4 2.4"/><path d="M18 6l-2.4 2.4"/><path d="M8.4 15.6 6 18"/><circle cx="12" cy="12" r="3"/>',
  user:'<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
  shield:'<path d="M12 3.4 19 6v6.2c0 4-2.9 7-7 8.4-4.1-1.4-7-4.4-7-8.4V6z"/>',
  grid:'<rect x="4.2" y="4.2" width="6.4" height="6.4" rx="1.6"/><rect x="13.4" y="4.2" width="6.4" height="6.4" rx="1.6"/><rect x="4.2" y="13.4" width="6.4" height="6.4" rx="1.6"/><rect x="13.4" y="13.4" width="6.4" height="6.4" rx="1.6"/>',
  bolt:'<path d="M13.2 3.4 5.8 13.6h5.4l-.8 7 7.4-10.2h-5.4z"/>',
  download:'<path d="M12 4.2v10"/><path d="m8 10.6 4 3.8 4-3.8"/><path d="M5 19.4h14"/>',
  flag:'<path d="M6.2 20.8V4.2"/><path d="M6.2 5.2h11.4l-2 3.6 2 3.6H6.2z"/>',
  circle:'<circle cx="12" cy="12" r="8.4"/>',
  arrowUp:'<path d="M12 19.4V5"/><path d="m6.6 10.4 5.4-5.4 5.4 5.4"/>',
  book:'<path d="M4.4 4.6h6a3 3 0 0 1 3 3v12a2.4 2.4 0 0 0-2.4-2.4h-6.6z"/><path d="M19.6 4.6h-6a3 3 0 0 0-3 3v12a2.4 2.4 0 0 1 2.4-2.4h6.6z"/>',
  contrast:'<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>'
};
function p5Icon(name,cls=''){
  const d=P5_ICON_PATHS[name]||P5_ICON_PATHS.circle;
  return `<svg class="p5-ico${cls?' '+cls:''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}
function p5Badge(name,cls=''){return `<span class="p5-badge${cls?' '+cls:''}">${p5Icon(name)}</span>`;}
function p5Head(icon,title,desc=''){
  return `<header class="p5-head">${p5Badge(icon)}<div class="p5-head-text"><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div></header>`;
}
function p5SectionTitle(title,note=''){
  return `<div class="p5-section"><h3>${esc(title)}</h3>${note?`<span>${esc(note)}</span>`:''}</div>`;
}

/* --- Shared descriptors --------------------------------------------------- */
const P5_MODULE_META={
  gcat:{icon:'spark',count:42,unit:'سؤالًا',examTime:'20 دقيقة',trainTime:'غير موقّت'},
  pq10:{icon:'user',count:144,unit:'بندًا',examTime:'غير موقّت',trainTime:'غير موقّت'},
  derailers:{icon:'alert',count:60,unit:'بندًا',examTime:'غير موقّت',trainTime:'غير موقّت'},
  leadership:{icon:'shield',count:16,unit:'موقفًا',examTime:'45 دقيقة',trainTime:'غير موقّت'}
};
function p5ModuleIcon(module){return P5_MODULE_META[module]?.icon||'list';}
function p5ModuleTime(module,mode){const m=P5_MODULE_META[module];if(!m)return'';return mode==='exam'?m.examTime:m.trainTime;}

/* --- Unfinished attempts (resume) ---------------------------------------- */
function p5ActiveSessions(){
  const metas=state.saved?.sessionMeta||{},out=[];
  for(const meta of Object.values(metas)){
    if(!meta||meta.status!=='active'||!meta.mid||!meta.module)continue;
    out.push(meta);
  }
  return out.sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
}
function p5SessionProgress(meta){
  const items=resolveItems(meta.mid,meta.module);
  if(!items.length)return null;
  const store=responseStore(meta.mid,meta.module,meta.responseScope||'training');
  const done=items.filter(it=>itemComplete(meta.module,it,store)).length;
  return {done,total:items.length,pct:percent(done,items.length)};
}
function p5ResumeAttrs(meta){
  if(meta.responseScope==='full_exam')return `data-action="full-run" data-sim="${esc(meta.mid)}"`;
  return `data-action="start" data-sim="${esc(meta.mid)}" data-module="${esc(meta.module)}" data-mode="${esc(meta.mode||'training')}"`;
}
function p5ResumeCard(){
  const meta=p5ActiveSessions()[0];
  if(!meta)return'';
  let progress=null;
  try{progress=p5SessionProgress(meta)}catch{progress=null}
  const scope=meta.responseScope||meta.mode||'training';
  const detail=progress?`أنجزت ${progress.done} من ${progress.total} · ${progress.pct}%`:'محفوظة على هذا الجهاز';
  return `<button class="p5-resume" ${p5ResumeAttrs(meta)}>
    ${p5Badge('play')}
    <span class="p5-resume-text">
      <small>استكمال المحاولة السابقة</small>
      <strong>${esc(meta.mid)} · ${esc(moduleName(meta.module))} — ${esc(modeName(scope))}</strong>
      <em>${esc(detail)}</em>
    </span>
    ${p5Icon('chevron')}
  </button>`;
}

/* --- Home ----------------------------------------------------------------- */
function p5Tile(icon,title,desc,action,extra=''){
  return `<button class="p5-tile" data-action="${action}" ${extra}>${p5Badge(icon,'brand')}<span class="p5-spacer"></span><strong>${esc(title)}</strong><small>${esc(desc)}</small></button>`;
}
function p5LinkRow(icon,title,desc,action,extra=''){
  return `<button class="p5-linkrow" data-action="${action}" ${extra}>${p5Badge(icon)}<span><strong>${esc(title)}</strong><small>${esc(desc)}</small></span>${p5Icon('chevron')}</button>`;
}
function p5InstallCardHTML(){
  if(isStandalone())return'';
  return p5LinkRow('download','تثبيت التطبيق',isIOS()?'إضافة إلى الشاشة الرئيسية':'تجربة أسرع ووصول مباشر من الشاشة الرئيسية','install-app');
}
renderHome=function(){
  state.session=null;state.ui={view:'home',simId:null,module:null,mode:null};
  setTitle('الرئيسية');
  const readiness=trainingReadiness();
  const openIssues=readiness.unresolved;
  el('main').innerHTML=`<section class="p5-hero">
    <div class="p5-kicker">${p5Icon('spark')} الإصدار <bdi dir="ltr">${APP_VERSION}</bdi></div>
    <h2>مرحبًا بك في منصة التقييمات التجريبية</h2>
    <p>تدرّب، اختبر نفسك، وراجع نقاط ضعفك.</p>
    <div class="p5-hero-stats">
      <div><strong>${readiness.score}%</strong><span>جاهزية التدريب</span></div>
      <div><strong>${readiness.coverage}%</strong><span>إنجاز الاختبارات</span></div>
      <div><strong>${openIssues}</strong><span>مراجعات مفتوحة</span></div>
    </div>
  </section>
  ${p5ResumeCard()}
  <div class="p5-tiles">
    <button class="p5-tile feature" data-action="orientation-home">${p5Badge('guide','lg')}<span class="p5-tile-body"><strong>قبل أن تبدأ</strong><small>دليل فهم الأسئلة والامتحان — اعرف ما الذي تبحث عنه قبل أول محاولة</small></span>${p5Icon('chevron')}</button>
    ${p5Tile('training','التدريب','شرح وتصحيح بعد كل إجابة','training-home')}
    ${p5Tile('simulation','المحاكاة','سبع محاكاة واختبارات كاملة','simulation-home')}
    ${p5Tile('review','المراجعة الذكية','أخطاؤك ونقاط ضعفك','review-home')}
    ${p5Tile('results','تقدمي ونتائجي','محاولاتك وتحليلك المتقدم','results-home')}
  </div>
  ${p5SectionTitle('وصول سريع')}
  ${p5LinkRow('bolt','مراجعة سريعة قبل الامتحان','أهم النقاط في دقيقة إلى دقيقتين','quick-review')}
  ${openIssues?p5LinkRow('alert','دفتر الأخطاء',`${openIssues} عنصرًا مفتوحًا للمراجعة`,'mistakes-home'):''}
  ${p5InstallCardHTML()}
  <p class="p5-note">«جاهزية التدريب» مؤشر إنجاز ومراجعة داخل التطبيق، وليست درجة سيكومترية أو معيارًا للتوظيف.</p>`;
  updateMobileNav();
};

/* --- Simulation hub and detail ------------------------------------------- */
function p5SimStatus(mid){
  const p=simProgress(mid),full=fullRunStatus(mid);
  const hasActive=p5ActiveSessions().some(m=>m.mid===mid);
  if(full.done||p.done>=4)return{label:'مكتملة',icon:'checkCircle',cls:'done'};
  if(hasActive||full.started||p.done>0)return{label:'قيد التنفيذ',icon:'clock',cls:'active'};
  return{label:'لم تبدأ',icon:'circle',cls:'new'};
}
function p5StatusChip(st){return `<span class="p5-status ${st.cls}">${p5Icon(st.icon)}${esc(st.label)}</span>`;}
function p5MetaList(entries){
  const rows=entries.filter(Boolean).map(([icon,text,strong])=>`<li>${p5Icon(icon)}${strong?`<b>${esc(strong)}</b> `:''}${esc(text)}</li>`).join('');
  return rows?`<ul class="p5-meta">${rows}</ul>`:'';
}
function p5SimLatest(mid){
  let best=null;
  for(const m of MODULES){
    const r=latestModuleResult(mid,m,'exam');
    if(!r)continue;
    const v=metricValue(m,r);
    if(v==null)continue;
    if(!best||v>best.value)best={module:m,value:v};
  }
  return best;
}
renderSimulationHub=function(){
  state.session=null;state.ui={view:'simulation-hub'};setTitle('المحاكاة');
  const sims=state.master.simulations.map(sim=>{
    const mid=sim.master_simulation_id,p=simProgress(mid),st=p5SimStatus(mid),latest=p5SimLatest(mid);
    return `<article class="p5-simcard">
      <div class="p5-simcard-head">
        ${p5Badge('simulation','brand')}
        <div><span class="p5-simcard-id"><bdi dir="ltr">${esc(mid)}</bdi></span><h3>${esc(sim.title_ar)}</h3></div>
        ${p5StatusChip(st)}
      </div>
      ${p5MetaList([['list','عنصرًا','262'],['grid','أقسام','4'],latest?['trophy',`أفضل نتيجة — ${moduleName(latest.module)}`,latest.value+'%']:null])}
      <div class="progress" role="progressbar" aria-label="نسبة الإنجاز" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><span style="width:${p.pct}%"></span></div>
      <div class="p5-progress-line"><span>الإنجاز</span><b class="numeric-ltr" dir="ltr">${p.done}/4 · ${p.pct}%</b></div>
      <button class="btn ${st.cls==='active'?'primary':''}" data-action="open-sim" data-sim="${esc(mid)}">${st.cls==='new'?'ابدأ المحاكاة':st.cls==='done'?'عرض المحاكاة':'متابعة المحاكاة'}</button>
    </article>`;
  }).join('');
  el('main').innerHTML=`${p5Head('simulation','المحاكاة','اختر محاكاة، ثم اختر التدريب أو الاختبار أو المحاكاة الشاملة أو قسمًا واحدًا.')}
  ${p5ResumeCard()}
  ${p5SectionTitle('المحاكاة المتاحة',`${state.master.simulations.length} محاكاة`)}
  <div class="p5-simlist">${sims}</div>`;
};
renderSimulation=function(mid){
  const sim=state.master.simulations.find(s=>s.master_simulation_id===mid);
  if(!sim)return renderSimulationHub();
  state.session=null;state.ui={view:'simulation',simId:mid};setTitle(sim.title_ar);
  const fst=fullRunStatus(mid),p=simProgress(mid),st=p5SimStatus(mid);
  const fullDesc=fst.done?'عرض نتيجة المحاكاة الشاملة':fst.started?`متابعة — اكتمل ${fst.finished} من 4 أقسام`:'جميع الأقسام بالتتابع';
  const mode=(icon,title,desc,attrs)=>`<button class="p5-tile" ${attrs}>${p5Badge(icon,'brand')}<span class="p5-spacer"></span><strong>${esc(title)}</strong><small>${esc(desc)}</small></button>`;
  const sections=MODULES.map(m=>{
    const meta=P5_MODULE_META[m],r=latestModuleResult(mid,m,'exam'),v=r?metricValue(m,r):null;
    return `<div class="p5-compare-row"><span>${p5Icon(meta.icon)} ${esc(moduleName(m))}</span><b class="numeric-ltr" dir="ltr">${meta.count}</b><i>${v==null?'—':v+'%'}</i></div>`;
  }).join('');
  el('main').innerHTML=`${p5Head('simulation',sim.title_ar,'اختر الوضع الذي يناسبك وابدأ الآن.')}
  <div class="p5-stats">
    <div class="p5-stat"><span>الحالة</span><strong style="font-size:var(--fs-md)">${esc(st.label)}</strong></div>
    <div class="p5-stat"><span>الأقسام المكتملة</span><strong class="numeric-ltr" dir="ltr">${p.done}/4</strong></div>
    <div class="p5-stat"><span>إجمالي العناصر</span><strong class="numeric-ltr" dir="ltr">262</strong></div>
    <div class="p5-stat"><span>المحاكاة الشاملة</span><strong style="font-size:var(--fs-md)">${fst.done?'مكتملة':fst.started?'قيد التنفيذ':'لم تبدأ'}</strong></div>
  </div>
  ${p5SectionTitle('اختر وضع المحاكاة')}
  <div class="p5-tiles">
    ${mode('training','وضع التدريب','تصحيح وشرح فوري بعد الإجابة',`data-action="section-picker" data-sim="${esc(mid)}" data-mode="training"`)}
    ${mode('flag','وضع الامتحان','بدون تلميحات أو تصحيح أثناء الحل',`data-action="section-picker" data-sim="${esc(mid)}" data-mode="exam"`)}
    ${mode('simulation','المحاكاة الشاملة',fullDesc,`data-action="full-run" data-sim="${esc(mid)}"`)}
    ${mode('grid','محاكاة قسم واحد','اختر قسمًا واحدًا للتدريب أو الاختبار',`data-action="section-picker" data-sim="${esc(mid)}" data-mode="both"`)}
  </div>
  ${p5SectionTitle('الأقسام المشمولة','العناصر · آخر نتيجة')}
  <div class="p5-compare">${sections}</div>`;
};
renderSectionPicker=function(mid,mode='both'){
  state.session=null;state.ui={view:'section-picker',simId:mid,mode};setTitle(`${mid} — اختر القسم`);
  const title=mode==='training'?'وضع التدريب':mode==='exam'?'وضع الامتحان':'محاكاة قسم واحد';
  const desc=mode==='exam'?'لن تظهر تلميحات أو تصنيفات أو شروحات أثناء الحل.':mode==='training'?'يظهر التصحيح والشرح بعد تثبيت كل إجابة.':'اختر القسم الذي تريد البدء به.';
  const cards=MODULES.map(m=>{
    const meta=P5_MODULE_META[m];
    const scopes=mode==='both'?['training','exam']:[mode];
    const status=(()=>{
      for(const sc of scopes){
        const sm=state.saved.sessionMeta?.[scopeKey(mid,m,sc)];
        if(sm?.status==='active')return{label:'قيد التنفيذ',icon:'clock',cls:'active'};
      }
      if(scopes.every(sc=>resultScopes(mid,m)?.[sc]))return{label:'مكتملة',icon:'checkCircle',cls:'done'};
      if(scopes.some(sc=>resultScopes(mid,m)?.[sc]))return{label:'قيد التنفيذ',icon:'clock',cls:'active'};
      return{label:'لم تبدأ',icon:'circle',cls:'new'};
    })();
    const buttons=scopes.map((sc,i)=>`<button class="btn ${i===scopes.length-1?'primary':''}" data-action="start" data-sim="${esc(mid)}" data-module="${esc(m)}" data-mode="${sc}">${moduleLaunchLabel(mid,m,sc)}</button>`).join('');
    return `<article class="p5-simcard">
      <div class="p5-simcard-head">${p5Badge(meta.icon,'brand')}<div><h3>${esc(moduleName(m))}</h3></div>${p5StatusChip(status)}</div>
      ${p5MetaList([['list',meta.unit,String(meta.count)],['clock',p5ModuleTime(m,mode==='both'?'exam':mode),'']])}
      <div class="btn-row">${buttons}</div>
    </article>`;
  }).join('');
  el('main').innerHTML=`${p5Head(mode==='training'?'training':mode==='exam'?'flag':'grid',title,desc)}
  <div class="p5-simlist">${cards}</div>`;
};

/* --- Question screen ------------------------------------------------------ */
const P5_UI={navOpen:false};
let P5_TIMER=null;
function p5AnsweredMap(){
  const s=state.session;if(!s)return[];
  const store=responseStore(s.mid,s.module,s.responseScope);
  return s.items.map(it=>itemComplete(s.module,it,store));
}
function p5QuestionNavHTML(map){
  const s=state.session;if(!s)return{toggle:'',panel:''};
  const answered=map.filter(Boolean).length;
  const toggle=`<button class="p5-navtoggle" data-action="p5-qnav-toggle" aria-expanded="${P5_UI.navOpen?'true':'false'}">${p5Icon('grid')}<span class="p5-nav-count numeric-ltr" dir="ltr">${answered}/${map.length}</span><span class="p5-navtoggle-label">${P5_UI.navOpen?'إخفاء الخريطة':'خريطة الأسئلة'}</span></button>`;
  if(!P5_UI.navOpen)return{toggle,panel:''};
  const dots=map.map((done,i)=>`<button class="p5-qdot ${i===s.index?'current':done?'answered':''}" data-action="p5-goto" data-index="${i}" aria-current="${i===s.index?'true':'false'}" aria-label="السؤال ${i+1}${done?' — تمت الإجابة':' — لم تتم الإجابة'}"><span class="numeric-ltr" dir="ltr">${i+1}</span></button>`).join('');
  const panel=`<section class="p5-qnav" aria-label="خريطة الأسئلة">
    <div class="p5-qnav-grid">${dots}</div>
    <div class="p5-qnav-legend">
      <span><i class="p5-key current"></i> السؤال الحالي</span>
      <span><i class="p5-key answered"></i> تمت الإجابة</span>
      <span><i class="p5-key"></i> لم تتم الإجابة</span>
    </div>
    <button class="btn" data-action="p5-finish">${p5Icon('flag')} ${s.mode==='exam'?'إنهاء الاختبار وتسليمه':s.isReview?'إنهاء المراجعة':'إنهاء الجلسة الآن'}</button>
  </section>`;
  return{toggle,panel};
}
renderSession=function(){
  const s=state.session;if(!s)return renderHome();
  const item=s.items[s.index],n=s.items.length;
  state.ui={view:'session',simId:s.mid,module:s.module,mode:s.mode};
  setTitle(s.isReview?`${s.reviewLabel} — ${moduleName(s.module)}`:`${moduleName(s.module)} — ${sessionModeLabel(s)}`);
  const progress=Math.round((s.index+1)/n*100);
  const map=p5AnsweredMap(),nav=p5QuestionNavHTML(map);
  const modeCls=s.isReview?'':s.mode==='exam'?'exam':'training';
  el('main').innerHTML=`<div class="session-wrap ${s.mode==='exam'?'clean-session':'training-session'}">
    <div class="p5-sessionbar">
      <div class="p5-sessionbar-left">
        <span class="p5-mode ${modeCls}">${p5Icon(s.mode==='exam'?'flag':'training')}${esc(sessionModeLabel(s))}</span>
        <span class="p5-counter numeric-ltr" dir="ltr" aria-label="السؤال ${s.index+1} من ${n}">${p5Icon('list')}<b class="p5-pos">${s.index+1}</b> / <b>${n}</b></span>
      </div>
      <div class="p5-sessionbar-right"><div class="timer-controls"><div id="timerSlot"></div></div>${nav.toggle}</div>
    </div>
    <div class="p5-track" role="progressbar" aria-label="تقدم الجلسة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
    ${nav.panel}
    <div id="questionHost"></div>
  </div>`;
  renderItem(item);tickTimer();updateMobileNav();
};
/* The answer handlers re-render only the question host, so the session bar
   is refreshed in place rather than by re-rendering the whole screen. */
function p5SyncSessionBar(){
  const s=state.session;
  if(!s||typeof document.querySelector!=='function')return;
  const map=p5AnsweredMap(),answered=map.filter(Boolean).length;
  const count=document.querySelector('.p5-nav-count');
  if(count)count.textContent=`${answered}/${map.length}`;
  const pos=document.querySelector('.p5-counter .p5-pos');
  if(pos)pos.textContent=String(s.index+1);
  const track=document.querySelector('.p5-track>span');
  if(track)track.style.width=Math.round((s.index+1)/s.items.length*100)+'%';
  if(P5_UI.navOpen&&typeof document.querySelectorAll==='function'){
    document.querySelectorAll('.p5-qdot').forEach((dot,i)=>{
      dot.classList.toggle('current',i===s.index);
      dot.classList.toggle('answered',!!map[i]&&i!==s.index);
    });
  }
}
const P5_RENDER_ITEM_BASE=renderItem;
renderItem=function(item){P5_RENDER_ITEM_BASE(item);p5SyncSessionBar();};

/* Single timer chain: each re-render cancels the previous tick instead of
   stacking one interval per rendered question. */
tickTimer=function(){
  if(P5_TIMER!==null){clearTimeout(P5_TIMER);P5_TIMER=null;}
  const s=state.session,slot=el('timerSlot');
  if(!slot||!s?.deadline){if(slot)slot.innerHTML='';return;}
  const remaining=Math.max(0,s.deadline-Date.now()),sec=Math.floor(remaining/1000),
        min=Math.floor(sec/60),ss=String(sec%60).padStart(2,'0'),
        cls=sec<=60?'danger':sec<=300?'warn':'';
  slot.innerHTML=`<span class="pill timer ${cls} numeric-ltr" dir="ltr">${min}:${ss}</span>`;
  const sk=scopeKey(s.mid,s.module,s.responseScope),meta=state.saved.sessionMeta[sk]||{},shown=new Set(meta.alertsShown||[]);
  for(const [threshold,label] of [[600,'10 دقائق'],[300,'5 دقائق'],[60,'دقيقة واحدة']]){
    if(sec<=threshold&&sec>0&&!shown.has(threshold)){shown.add(threshold);meta.alertsShown=[...shown];state.saved.sessionMeta[sk]=meta;persist();toast(`تنبيه: تبقى ${label}`)}
  }
  if(remaining<=0){finishSession(true);return;}
  P5_TIMER=setTimeout(tickTimer,1000);
};

/* --- Results -------------------------------------------------------------- */
function p5MetricValue(v){
  if(v==null)return null;
  if(typeof v==='object')return typeof v.score==='number'?v.score:null;
  return typeof v==='number'?v:null;
}
function p5Breakdown(module,r){
  if(module==='gcat')return{title:'الأداء حسب المجال',data:r.domains,label:k=>moduleName(k)};
  if(module==='pq10')return{title:'التوافق حسب الكفاءة',data:r.groups,label:k=>k};
  if(module==='derailers')return{title:'التوافق حسب الفئة',data:r.groups,label:k=>k};
  if(module==='leadership')return{title:'الأداء حسب المعيار',data:r.criteria,label:k=>CRITERION_AR[k]||k};
  return{title:'التفصيل',data:null,label:k=>k};
}
function p5BarTone(v){return v>=80?'good':v>=60?'':v>=40?'warn':'bad';}
function p5BarsHTML(title,data,labeler){
  if(!data)return'';
  const rows=Object.entries(data).map(([k,v])=>({k,v:p5MetricValue(v)})).filter(x=>x.v!=null);
  if(!rows.length)return'';
  rows.sort((a,b)=>b.v-a.v);
  return `<section class="p5-panel"><div class="p5-panel-head">${p5Icon('results')}<h3>${esc(title)}</h3></div>
    <div class="p5-bars">${rows.map(x=>`<div class="p5-bar-row">
      <div class="p5-bar-head"><span>${esc(labeler(x.k))}</span><b class="numeric-ltr" dir="ltr">${x.v}%</b></div>
      <div class="p5-bar"><span class="${p5BarTone(x.v)}" style="width:${Math.max(2,Math.min(100,x.v))}%"></span></div>
    </div>`).join('')}</div></section>`;
}
function p5StrengthsHTML(module,r){
  const b=p5Breakdown(module,r);
  if(!b.data)return'';
  const rows=Object.entries(b.data).map(([k,v])=>({k,v:p5MetricValue(v)})).filter(x=>x.v!=null);
  if(rows.length<2)return'';
  rows.sort((a,b2)=>b2.v-a.v);
  const strong=rows.filter(x=>x.v>=70).slice(0,3);
  const weak=rows.slice().reverse().filter(x=>x.v<70).slice(0,3);
  const li=(list,empty)=>list.length?`<ul>${list.map(x=>`<li><span>${esc(b.label(x.k))}</span><b class="numeric-ltr" dir="ltr">${x.v}%</b></li>`).join('')}</ul>`:`<p class="p5-empty">${esc(empty)}</p>`;
  return `<div class="p5-split">
    <section class="p5-panel good"><div class="p5-panel-head">${p5Icon('arrowUp')}<h3>نقاط القوة</h3></div>${li(strong,'لا يوجد مجال بلغ 70% في هذه المحاولة بعد.')}</section>
    <section class="p5-panel attention"><div class="p5-panel-head">${p5Icon('alert')}<h3>يحتاج تحسين</h3></div>${li(weak,'لا يوجد مجال دون 70% في هذه المحاولة.')}</section>
  </div>`;
}
function p5ScoreCard(module,r,scope){
  const v=metricValue(module,r);
  const label=module==='gcat'?'النتيجة':module==='pq10'?'التوافق':module==='derailers'?'التوافق الآمن':'دقة الحكم';
  return `<section class="p5-scorecard">
    <div class="p5-scorecard-body">
      <span class="p5-mode ${scope==='training'?'training':'exam'}">${p5Icon(scope==='training'?'training':'flag')}${esc(modeName(scope))}</span>
      <h2>${esc(moduleName(module))}</h2>
      <p>${esc(resultInterpretation(module))}</p>
    </div>
    <div class="p5-ring" style="--p:${Math.max(0,Math.min(100,v??0))}" role="img" aria-label="${esc(label)} ${v??0}%">
      <span class="p5-ring-inner"><span class="numeric-ltr" dir="ltr">${v??'—'}%</span><small>${esc(label)}</small></span>
    </div>
  </section>`;
}
function p5ResultStats(module,r){
  const cells=[];
  if(module==='gcat'){
    const wrong=Math.max(0,(r.total??0)-(r.correct??0));
    cells.push(['إجابات صحيحة',`${r.correct}/${r.total}`,'good'],['إجابات خاطئة',String(wrong),wrong?'bad':'']);
    for(const [k,v] of Object.entries(r.domains||{})){const s=p5MetricValue(v);if(s!=null)cells.push([moduleName(k),s+'%','']);}
  }else if(module==='pq10'){
    cells.push(['التوافق مع النموذج التدريبي',r.alignment+'%',''],['البنود المجابة',`${r.answered}/${r.total}`,'']);
  }else if(module==='derailers'){
    cells.push(['التوافق الآمن',r.safety+'%','good'],['الابتعاد التدريبي',r.risk+'%','']);
  }else{
    cells.push(['دقة الحكم',r.accuracy+'%',''],['تطابق تام',r.exact_match+'%','good'],['رفعت التقييم',String(r.overrated),''],['خفضت التقييم',String(r.underrated),'']);
  }
  return `<div class="p5-stats">${cells.map(([s,v,cls])=>`<div class="p5-stat"><span>${esc(s)}</span><strong class="${cls} numeric-ltr" dir="ltr">${esc(v)}</strong></div>`).join('')}</div>`;
}
function p5CrossSimHTML(mid,module,scope){
  const rows=[];
  for(const sim of state.master.simulations){
    const id=sim.master_simulation_id;
    const r=scope==='full_exam'?state.saved.fullResults?.[id]?.[module]:resultScopes(id,module)[scope];
    if(!r)continue;
    const v=metricValue(module,r);
    if(v==null)continue;
    rows.push({id,v,current:id===mid});
  }
  if(rows.length<2)return'';
  const avg=Math.round(rows.reduce((s,x)=>s+x.v,0)/rows.length);
  rows.sort((a,b)=>b.v-a.v);
  return `<section class="p5-panel"><div class="p5-panel-head">${p5Icon('trend')}<h3>مقارنة أداء ${esc(moduleName(module))} بين المحاكاة</h3></div>
    <div class="p5-compare">${rows.map(x=>{
      const d=x.v-avg;
      return `<div class="p5-compare-row ${x.current?'current':''}"><span><bdi dir="ltr">${esc(x.id)}</bdi>${x.current?' · هذه المحاولة':''}</span><b class="numeric-ltr" dir="ltr">${x.v}%</b><i class="${d>0?'up':d<0?'down':''} numeric-ltr" dir="ltr">${d>0?'+':''}${d}</i></div>`;
    }).join('')}</div>
    <p class="p5-empty" style="margin-top:var(--sp-3)">المتوسط عبر ${rows.length} محاكاة: <b class="numeric-ltr" dir="ltr">${avg}%</b></p>
  </section>`;
}
renderResult=function(mid,module,r,timedOut=false){
  state.session=null;state.ui={view:'result',simId:mid,module,mode:r.responseScope||r.mode};
  setTitle(`${mid} — نتيجة ${moduleName(module)}`);
  const scope=r.responseScope||r.mode||'training',reviewCount=unresolvedFor(mid,module).length;
  const b=p5Breakdown(module,r);
  const extraBreakdown=module==='leadership'?p5BarsHTML('دقة الحدود',r.boundaries||{},k=>k):'';
  el('main').innerHTML=`${timedOut?`<div class="new-user-note"><span>${p5Icon('clock')}</span><div>انتهى الوقت وتم تسليم المحاولة تلقائيًا.</div></div>`:''}
  ${p5ScoreCard(module,r,scope)}
  ${p5ResultStats(module,r)}
  ${p5StrengthsHTML(module,r)}
  ${p5SectionTitle('التفصيل')}
  ${p5BarsHTML(b.title,b.data,b.label)}
  ${extraBreakdown}
  ${v13DiagnosticHTML(mid,module,scope)}
  ${p5CrossSimHTML(mid,module,scope)}
  ${scope==='exam'?comparisonHTML(mid,module,'exam',r):''}
  ${module==='pq10'||module==='derailers'?`<section class="card"><h3>التحليل المتكامل للشخصية والسلوك تحت الضغط</h3><p class="small muted">يظهر عندما تكون إجابات PQ10 والسلوكيات المعطلة متوفرة في النمط نفسه، مع تقدير الثقة في الاستنتاج.</p><button class="btn" data-action="profile-report" data-sim="${esc(mid)}" data-scope="${scope}">فتح التحليل المتقدم</button></section>`:''}
  ${p5SectionTitle('مراجعة الإجابات')}
  <div class="p5-tiles">
    <button class="p5-tile feature" data-action="answers-view" data-sim="${esc(mid)}" data-module="${esc(module)}" data-scope="${scope}">${p5Badge('book','lg')}<span class="p5-tile-body"><strong>إجاباتي والتفسير</strong><small>السؤال، إجابتك، الإجابة المرجعية والشرح في مكان واحد</small></span>${p5Icon('chevron')}</button>
    <button class="p5-tile feature" data-action="p5-answers-diff" data-sim="${esc(mid)}" data-module="${esc(module)}" data-scope="${scope}">${p5Badge('alert','lg')}<span class="p5-tile-body"><strong>مراجعة الأخطاء فقط</strong><small>اعرض العناصر التي اختلفت فيها عن الإجابة المرجعية</small></span>${p5Icon('chevron')}</button>
  </div>
  ${reviewCount?`<section class="card"><h3>الأولى بالمراجعة</h3><p class="small muted">لديك ${reviewCount} عنصرًا مفتوحًا في دفتر الأخطاء.</p><button class="btn primary" data-action="train-mistakes" data-sim="${esc(mid)}" data-module="${esc(module)}">تدرب على أخطائي فقط</button></section>`:''}
  ${reportActions(mid,module,scope)}
  <div class="btn-row"><button class="btn" data-action="open-sim" data-sim="${esc(mid)}">العودة للمحاكاة</button><button class="btn" data-action="restart" data-sim="${esc(mid)}" data-module="${esc(module)}" data-mode="${esc(r.mode||'training')}">إعادة المحاولة</button></div>`;
};

/* --- Progress dashboard --------------------------------------------------- */
function p5ProgressStats(scope){
  const hs=filteredAttempts(scope);
  const vals=hs.map(h=>historyMetric(h)).filter(v=>typeof v==='number');
  const completedSims=state.master.simulations.filter(s=>{
    const id=s.master_simulation_id;
    return MODULES.every(m=>scope==='full_exam'?state.saved.fullResults?.[id]?.[m]:resultScopes(id,m)?.[scope]);
  }).length;
  const last=hs.slice().sort((a,b)=>new Date(b.at)-new Date(a.at))[0];
  return {
    attempts:hs.length,
    completedSims,
    average:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null,
    best:vals.length?Math.max(...vals):null,
    last:last?historyMetric(last):null,
    lastAt:last?last.at:null
  };
}
function p5ModuleAverages(scope){
  const out={};
  for(const h of filteredAttempts(scope)){
    const v=historyMetric(h);
    if(typeof v!=='number')continue;
    (out[h.module]||=[]).push(v);
  }
  const rows={};
  for(const [m,vals] of Object.entries(out))rows[m]=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  return rows;
}
function p5SparkHTML(vals){
  if(!vals.length)return'';
  const max=Math.max(100,...vals);
  return `<div class="p5-spark">${vals.map((v,i)=>`<i class="${i===vals.length-1?'last':''}" style="height:${Math.max(8,Math.round(v/max*100))}%"></i>`).join('')}</div>
  <div class="p5-spark-labels">${vals.map(v=>`<span dir="ltr">${v}%</span>`).join('')}</div>`;
}
renderResultsHome=function(view=state.settings.resultView||'latest',scope=state.settings.resultScope||'exam'){
  state.session=null;state.settings.resultView=view;state.settings.resultScope=scope;persistSettings();
  state.ui={view:'results',resultView:view,resultScope:scope};
  setTitle('نتائجي وتقدمي');
  const hs=filteredAttempts(scope),grouped={};
  for(const h of hs){const k=`${h.sim}|${h.module}`;(grouped[k]||=[]).push(h)}
  const stats=p5ProgressStats(scope),averages=p5ModuleAverages(scope);
  const issues=Object.values(state.saved.reviewItems||{}).filter(x=>!x.resolved).length;
  let content='';
  if(view==='latest'){
    const latest=Object.values(grouped).map(a=>a.sort((x,y)=>new Date(y.at)-new Date(x.at))[0]).sort((a,b)=>new Date(b.at)-new Date(a.at));
    content=latest.length?`<div class="p5-compare">${latest.map(h=>`<div class="p5-compare-row"><span><bdi dir="ltr">${esc(h.sim)}</bdi> · ${esc(moduleName(h.module))}<br><small class="muted">${esc(formatDate(h.at))}</small></span><b class="numeric-ltr" dir="ltr">${historyMetric(h)}%</b><i></i></div>`).join('')}</div>`:'<div class="empty">لا توجد محاولات في هذا النمط بعد.</div>';
  }
  if(view==='best'){
    const best=Object.values(grouped).map(a=>a.sort((x,y)=>historyMetric(y)-historyMetric(x))[0]).sort((a,b)=>historyMetric(b)-historyMetric(a));
    content=best.length?`<div class="p5-compare">${best.map((h,i)=>`<div class="p5-compare-row ${i===0?'current':''}"><span>${i===0?p5Icon('trophy'):''} <bdi dir="ltr">${esc(h.sim)}</bdi> · ${esc(moduleName(h.module))}</span><b class="numeric-ltr" dir="ltr">${historyMetric(h)}%</b><i>أفضل</i></div>`).join('')}</div>`:'<div class="empty">لا توجد محاولات في هذا النمط بعد.</div>';
  }
  if(view==='trend'){
    const cards=Object.entries(grouped).map(([k,a])=>{
      a.sort((x,y)=>new Date(x.at)-new Date(y.at));
      const vals=a.slice(-5).map(x=>historyMetric(x));
      const [mid,m]=k.split('|');
      const delta=vals.length>1?vals[vals.length-1]-vals[0]:null;
      return `<article class="p5-trend-card"><div class="p5-trend-head"><strong><bdi dir="ltr">${esc(mid)}</bdi> · ${esc(moduleName(m))}</strong><span class="numeric-ltr" dir="ltr">${delta==null?'محاولة واحدة':(delta>0?'+':'')+delta}</span></div>${p5SparkHTML(vals)}</article>`;
    }).join('');
    content=cards||'<div class="empty">تحتاج محاولتين أو أكثر لعرض التطور.</div>';
  }
  const analysable=state.master.simulations.filter(s=>state.saved.responses?.[s.master_simulation_id]?.pq10?.[scope]&&state.saved.responses?.[s.master_simulation_id]?.derailers?.[scope]);
  el('main').innerHTML=`${p5Head('results','تقدمي ونتائجي','تابع تطورك عبر الوقت، واعرض التدريب والاختبار والمحاكاة الشاملة كلًا على حدة.')}
  <div class="filter-block">
    <div class="segmented">${[['exam','الاختبار'],['training','التدريب'],['full_exam','المحاكاة الشاملة']].map(([k,l])=>`<button class="${scope===k?'active':''}" data-action="results-scope" data-scope="${k}">${l}</button>`).join('')}</div>
  </div>
  <div class="p5-dash">
    <div class="p5-stat"><span>محاكاة مكتملة</span><strong class="numeric-ltr" dir="ltr">${stats.completedSims}/${state.master.simulations.length}</strong></div>
    <div class="p5-stat"><span>متوسط النتائج</span><strong class="numeric-ltr" dir="ltr">${stats.average==null?'—':stats.average+'%'}</strong></div>
    <div class="p5-stat"><span>أفضل نتيجة</span><strong class="good numeric-ltr" dir="ltr">${stats.best==null?'—':stats.best+'%'}</strong></div>
    <div class="p5-stat"><span>آخر نتيجة</span><strong class="numeric-ltr" dir="ltr">${stats.last==null?'—':stats.last+'%'}</strong></div>
  </div>
  ${Object.keys(averages).length?p5BarsHTML('متوسط الأداء حسب النوع',averages,k=>moduleName(k)):''}
  ${issues?`<section class="p5-panel attention" style="margin-top:var(--sp-4)"><div class="p5-panel-head">${p5Icon('alert')}<h3>يحتاج إعادة مراجعة</h3></div><p class="p5-empty">${issues} عنصرًا مفتوحًا في دفتر الأخطاء عبر المحاكاة المختلفة.</p><div class="btn-row"><button class="btn primary" data-action="mistakes-home">فتح دفتر الأخطاء</button><button class="btn" data-action="train-mistakes">تدرب على أخطائي</button></div></section>`:''}
  ${p5SectionTitle('المحاولات',`${stats.attempts} محاولة في هذا النمط`)}
  <div class="filter-block">
    <div class="segmented secondary">${[['latest','آخر محاولة'],['best','أفضل محاولة'],['trend','التطور عبر الوقت']].map(([k,l])=>`<button class="${view===k?'active':''}" data-action="results-view" data-view="${k}">${l}</button>`).join('')}</div>
  </div>
  ${content}
  ${analysable.length?`<section class="card" style="margin-top:var(--sp-4)"><h3>التحليل السلوكي المتقدم</h3><p class="small muted">يحلل نمط الشخصية والسلوكيات المعطلة ويعطي مستوى ثقة في الاستنتاج.</p><div class="btn-row">${analysable.map(s=>`<button class="btn primary" data-action="profile-report" data-sim="${esc(s.master_simulation_id)}" data-scope="${scope}">${esc(s.master_simulation_id)}</button>`).join('')}</div></section>`:''}
  <div class="data-actions"><button class="btn" data-action="export-data">تصدير بياناتي</button><button class="btn danger" data-action="reset-all">مسح بياناتي</button></div>`;
};

/* --- Actions introduced by this layer ------------------------------------- */
function p5Capture(e){
  const b=e.target?.closest?.('[data-action]');
  if(!b)return;
  const a=b.dataset.action;
  if(!['p5-qnav-toggle','p5-goto','p5-finish','p5-answers-diff'].includes(a))return;
  e.stopImmediatePropagation?.();
  if(a==='p5-qnav-toggle'){P5_UI.navOpen=!P5_UI.navOpen;return renderSession();}
  if(a==='p5-goto'){
    const s=state.session;if(!s)return;
    const i=Number(b.dataset.index);
    if(!Number.isFinite(i)||i<0||i>=s.items.length||i===s.index)return;
    s.index=i;s.feedbackShown=false;return renderSession();
  }
  if(a==='p5-finish'){
    const s=state.session;if(!s)return;
    const left=unansweredCount();
    if(left>0&&!confirm(`لديك ${left} عنصرًا غير مجاب. هل تريد الإنهاء الآن؟`))return;
    P5_UI.navOpen=false;
    return finishSession();
  }
  if(a==='p5-answers-diff'){
    v12PushCurrent();
    return renderMyAnswers(b.dataset.sim,b.dataset.module,b.dataset.scope||'exam','diff');
  }
}
document.addEventListener('click',p5Capture,true);

/* --- Application chrome: swap the text glyphs for the icon set ------------ */
function p5UpgradeChrome(){
  const swap=(id,icon)=>{const n=el(id);if(n&&'innerHTML' in n)n.innerHTML=p5Icon(icon);};
  swap('homeBtn','home');
  swap('backBtn','chevron');
  swap('themeBtn','contrast');
  const nav=el('mobileNav');
  if(!nav||typeof nav.querySelectorAll!=='function')return;
  const icons={'home':'home','review-home':'review','mistakes-home':'alert','results-home':'results'};
  nav.querySelectorAll('[data-action]').forEach(btn=>{
    const glyph=btn.querySelector?.('[aria-hidden]');
    if(glyph)glyph.innerHTML=p5Icon(icons[btn.dataset.action]||'circle');
  });
}
p5UpgradeChrome();

/* --- Icon parity for the screens that still ship glyph placeholders ------
   Several hubs (training, orientation, GCAT drill-downs) build their tiles
   from single-character placeholders. Rather than duplicate those renderers
   and their copy, the glyphs are upgraded in place to the same icon set the
   rest of the interface uses, once per render. */
const P5_GLYPH_ICONS={
  '\u25a4':'guide','\u270e':'training','\u2637':'simulation','\u25ce':'review','\u25a5':'results',
  '\u21e9':'download','\u2301':'spark','\u25c9':'user','\u25b3':'alert','\u265f':'shield',
  '\u25b0':'simulation','\u26a1':'bolt','\u25f7':'clock','\u2726':'star','\u2713':'check',
  '\u2302':'home','!':'alert','\u2691':'flag','\u25a3':'grid'
};
const P5_ICON_SLOTS='.section-icon,.mode-icon,.guide-round,.sim-icon,.guide-icon,.home-icon,'+
  '.install-symbol,.sim-big-icon,.training-choice-icon,.onboarding-icon,.topic-icon-chip,'+
  '.new-user-note>span:first-child,.quick-review-card>span:first-child';
function p5UpgradeGlyphs(root){
  if(!root||typeof root.querySelectorAll!=='function')return;
  root.querySelectorAll(P5_ICON_SLOTS).forEach(slot=>{
    if(slot.querySelector('svg'))return;
    const name=P5_GLYPH_ICONS[(slot.textContent||'').trim()];
    if(name)slot.innerHTML=p5Icon(name);
  });
}
function p5WatchMain(){
  const main=el('main');
  if(!main||typeof MutationObserver!=='function'||typeof main.querySelectorAll!=='function')return;
  p5UpgradeGlyphs(main);
  new MutationObserver(()=>p5UpgradeGlyphs(main)).observe(main,{childList:true,subtree:true});
}
p5WatchMain();
