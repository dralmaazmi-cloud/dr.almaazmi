/* ============================================================================
   ui.js — presentation layer v2
   ----------------------------------------------------------------------------
   app.js is the assessment engine: question resolution, answer storage,
   scoring, analysis, exports and the session state machine. This file owns
   everything the user sees. It replaces the engine's screen renderers by
   reassigning the same global function names, and keeps the engine's
   content renderers (abstract patterns, teaching explanations, leadership
   feedback, answer cards, diagnostics, guides) as-is, dressed by styles.css.

   Contract kept with the engine:
   - #main, #questionHost, #feedbackHost, #timerSlot, #pageTitle, #toast,
     #homeBtn, #backBtn, #themeBtn, #fontBtn, #mobileNav, #appDialog
   - every data-action the engine's click handlers understand
   - state.ui view keys consumed by v12Restore
   ========================================================================== */

const UI_VERSION='2.0';

/* --- 0. Icons ------------------------------------------------------------- */
const UI_ICONS={
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
  contrast:'<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>',
  text:'<path d="M5 18.5 10.2 5.5h1.6L17 18.5"/><path d="M7.2 13.4h7.6"/><path d="M19.5 18.5V11"/>',
  info:'<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.2"/><path d="M12 7.8h.02"/>',
  map:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9.4 4v16"/><path d="M14.6 4v16"/><path d="M4 9.4h16"/><path d="M4 14.6h16"/>',
  share:'<path d="M12 4v11"/><path d="m8.2 7.8 3.8-3.8 3.8 3.8"/><path d="M5 12.6v5.2a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2v-5.2"/>',
  layers:'<path d="m12 3 8.6 4.6L12 12.2 3.4 7.6z"/><path d="m3.4 12 8.6 4.6 8.6-4.6"/>',
  compass:'<circle cx="12" cy="12" r="8.4"/><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z"/>'
};
function ico(name,cls=''){
  return `<svg class="ico${cls?' '+cls:''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${UI_ICONS[name]||UI_ICONS.circle}</svg>`;
}
function avatar(name,tone='',size=''){return `<span class="avatar${tone?' '+tone:''}${size?' '+size:''}">${ico(name)}</span>`;}
function textAvatar(text,tone=''){return `<span class="avatar${tone?' '+tone:''}"><b class="num">${esc(text)}</b></span>`;}

/* --- 1. Small building blocks -------------------------------------------- */
function pageHead(title,desc='',actions=''){
  return `<header class="page-head"><div><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}</header>`;
}
function sectionTitle(title,link=''){return `<div class="section"><h3>${esc(title)}</h3>${link}</div>`;}
function badge(text,tone='',icon=''){return `<span class="badge${tone?' '+tone:''}">${icon?ico(icon):''}${esc(text)}</span>`;}
function listRow({icon='circle',tone='',text=null,title,sub='',end='',attrs='',cls='',meter=null}){
  const lead=text!=null?textAvatar(text,tone):avatar(icon,tone);
  const body=`<span class="row-body"><strong>${title}</strong>${sub?`<small>${sub}</small>`:''}${meter!=null?`<span class="meter thin" style="margin-top:8px"><span style="width:${meter}%"></span></span>`:''}</span>`;
  const tail=`<span class="row-end">${end||ico('chevron','chev')}</span>`;
  if(attrs)return `<button class="row ${cls}" ${attrs}>${lead}${body}${tail}</button>`;
  return `<div class="row static ${cls}">${lead}${body}${end?`<span class="row-end">${end}</span>`:''}</div>`;
}
function stat(label,value,tone='',note=''){return `<div class="stat"><span>${esc(label)}</span><strong class="${tone} num">${value}</strong>${note?`<small>${esc(note)}</small>`:''}</div>`;}
function metricTone(v){return v>=80?'good':v>=60?'':v>=40?'warn':'bad';}
function barsPanel(title,entries,icon='results'){
  if(!entries.length)return'';
  return `<section class="panel"><div class="panel-head">${ico(icon)}<h3>${esc(title)}</h3></div><div class="bars">${entries.map(e=>`<div class="bar-row"><div class="bar-head"><span>${esc(e.label)}</span><b class="num">${e.value}%</b></div><div class="meter"><span class="${metricTone(e.value)}" style="width:${Math.max(2,Math.min(100,e.value))}%"></span></div></div>`).join('')}</div></section>`;
}
function metricOf(v){if(v==null)return null;if(typeof v==='object')return typeof v.score==='number'?v.score:null;return typeof v==='number'?v:null;}
function entriesOf(obj,labeler=k=>k){return Object.entries(obj||{}).map(([k,v])=>({label:labeler(k),value:metricOf(v)})).filter(x=>x.value!=null).sort((a,b)=>b.value-a.value);}
function emptyState(icon,title,sub='',action=''){return `<div class="empty">${avatar(icon,'','lg')}<strong>${esc(title)}</strong>${sub?`<span>${esc(sub)}</span>`:''}${action}</div>`;}

/* --- 2. Module descriptors ------------------------------------------------ */
const UI_MODULES={
  gcat:{icon:'spark',tone:'info',count:42,unit:'سؤالًا',examTime:'20 دقيقة',trainTime:'غير موقّت',blurb:'القدرات الإدراكية: عددي ولفظي وتجريدي'},
  pq10:{icon:'user',tone:'accent',count:144,unit:'بندًا',examTime:'غير موقّت',trainTime:'غير موقّت',blurb:'استبيان الشخصية القيادية'},
  derailers:{icon:'alert',tone:'warn',count:60,unit:'بندًا',examTime:'غير موقّت',trainTime:'غير موقّت',blurb:'السلوكيات المعطلة تحت الضغط'},
  leadership:{icon:'shield',tone:'good',count:16,unit:'موقفًا',examTime:'45 دقيقة',trainTime:'غير موقّت',blurb:'الحكم على المواقف القيادية'}
};
const UI_TOTAL_ITEMS=Object.values(UI_MODULES).reduce((s,m)=>s+m.count,0);
function moduleIcon(m){return UI_MODULES[m]?.icon||'list';}
function moduleTone(m){return UI_MODULES[m]?.tone||'';}
function moduleTime(m,mode){const d=UI_MODULES[m];return d?(mode==='exam'?d.examTime:d.trainTime):'';}

function activeSessions(){
  return Object.values(state.saved?.sessionMeta||{})
    .filter(m=>m&&m.status==='active'&&m.mid&&m.module)
    .sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
}
function sessionProgress(meta){
  try{
    const items=resolveItems(meta.mid,meta.module);if(!items.length)return null;
    const store=responseStore(meta.mid,meta.module,meta.responseScope||'training');
    const done=items.filter(it=>itemComplete(meta.module,it,store)).length;
    return{done,total:items.length,pct:percent(done,items.length)};
  }catch{return null}
}
function resumeAttrs(meta){
  if(meta.responseScope==='full_exam')return `data-action="full-run" data-sim="${esc(meta.mid)}"`;
  return `data-action="start" data-sim="${esc(meta.mid)}" data-module="${esc(meta.module)}" data-mode="${esc(meta.mode||'training')}"`;
}
function resumeCard(meta=activeSessions()[0]){
  if(!meta)return'';
  const p=sessionProgress(meta),scope=meta.responseScope||meta.mode||'training';
  return `<button class="resume" ${resumeAttrs(meta)}>
    ${avatar('play')}
    <span>
      <small>استكمال المحاولة السابقة</small>
      <strong><bdi>${esc(meta.mid)}</bdi> · ${esc(moduleName(meta.module))} — ${esc(modeName(scope))}</strong>
      <em>${p?`أنجزت ${p.done} من ${p.total}`:'محفوظة على هذا الجهاز'}</em>
      ${p?`<span class="meter thin"><span style="width:${p.pct}%"></span></span>`:''}
    </span>
    ${ico('chevron','chev')}
  </button>`;
}
function simStatus(mid){
  const p=simProgress(mid),full=fullRunStatus(mid);
  const active=activeSessions().some(m=>m.mid===mid);
  if(full.done||p.done>=4)return{label:'مكتملة',tone:'good',icon:'checkCircle',key:'done'};
  if(active||full.started||p.done>0)return{label:'قيد التنفيذ',tone:'warn',icon:'clock',key:'active'};
  return{label:'لم تبدأ',tone:'',icon:'circle',key:'new'};
}
function simBest(mid){
  let best=null;
  for(const m of MODULES){const r=latestModuleResult(mid,m,'exam');if(!r)continue;const v=metricValue(m,r);if(v==null)continue;if(!best||v>best.value)best={module:m,value:v};}
  return best;
}

/* --- 3. Shell: navigation, chrome, transitions ---------------------------- */
const UI_NAV_OF_VIEW={
  home:'home',onboarding:'home',
  'simulation-hub':'simulation',simulation:'simulation','section-picker':'simulation','full-result':'simulation',result:'simulation',
  'training-hub':'training','training-module':'training','gcat-training':'training','gcat-training-sims':'training','gcat-training-topics':'training','gcat-domain-hub':'training','gcat-domain-topics':'training',
  review:'review',mistakes:'review',favorites:'review','review-result':'review','quick-review':'review',
  results:'results','profile-report':'results','my-answers':'results','my-answers-full':'results',
  orientation:'orientation',guide:'orientation'
};
updateMobileNav=function(){
  const isSession=!!state.session,body=document.body;
  body.classList.toggle('session-active',isSession);
  body.classList.toggle('exam-clean',isSession&&state.session.mode==='exam');
  body.classList.toggle('training-mode',isSession&&state.session.mode==='training');
  body.classList.toggle('onboarding-active',state.ui?.view==='onboarding');
  const key=isSession?null:(UI_NAV_OF_VIEW[state.ui?.view||'home']||null);
  if(typeof document.querySelectorAll==='function'){
    document.querySelectorAll('[data-nav]').forEach(btn=>{
      const on=btn.dataset.nav===key;btn.classList.toggle('active',on);
      if(on)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
    });
  }
  const inst=el('railInstall');if(inst&&'hidden' in inst)inst.hidden=isStandalone();
};
function uiChrome(){
  const put=(id,name)=>{const n=el(id);if(n&&'innerHTML' in n)n.innerHTML=ico(name);};
  put('homeBtn','home');put('backBtn','chevron');put('themeBtn','contrast');
  if(typeof document.querySelectorAll!=='function')return;
  document.querySelectorAll('[data-icon]').forEach(n=>{n.innerHTML=ico(n.dataset.icon);});
  document.querySelectorAll('[data-proxy]').forEach(n=>n.addEventListener('click',()=>el(n.dataset.proxy)?.click()));
  let ticking=false;
  window.addEventListener('scroll',()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{document.body.classList.toggle('scrolled',window.scrollY>4);ticking=false;});},{passive:true});
}
/* Legacy content renderers still emit single-character glyphs inside their
   icon slots; they are upgraded to the icon set once per render. */
const UI_GLYPHS={'▤':'guide','✎':'training','☷':'simulation','◎':'review','▥':'results','⇩':'download','⌁':'spark','◉':'user','△':'alert','♟':'shield','▰':'simulation','⚡':'bolt','◷':'clock','✦':'star','✓':'check','⌂':'home','!':'alert','⚑':'flag','▣':'grid','◇':'grid','M':'layers'};
const UI_GLYPH_SLOTS='.section-icon,.mode-icon,.guide-round,.sim-icon,.guide-icon,.home-icon,.install-symbol,.sim-big-icon,.training-choice-icon,.onboarding-icon,.new-user-note>span:first-child,.quick-review-card>span:first-child';
let uiViewKey='';
function uiAfterRender(main){
  main.querySelectorAll(UI_GLYPH_SLOTS).forEach(slot=>{
    if(slot.querySelector('svg'))return;
    const name=UI_GLYPHS[(slot.textContent||'').trim()];
    if(name)slot.innerHTML=ico(name);
  });
  const key=JSON.stringify([state.ui?.view,state.ui?.simId,state.ui?.module,state.ui?.kind,state.ui?.guide,state.session?state.session.index:null]);
  if(key!==uiViewKey){
    uiViewKey=key;
    window.scrollTo({top:0,behavior:'instant'});
    main.classList.remove('view-enter');void main.offsetWidth;main.classList.add('view-enter');
  }
}
function uiWatchMain(){
  const main=el('main');
  if(!main||typeof MutationObserver!=='function'||typeof main.querySelectorAll!=='function')return;
  new MutationObserver(records=>{
    if(records.some(r=>r.target===main))uiAfterRender(main);
    else main.querySelectorAll(UI_GLYPH_SLOTS).forEach(slot=>{if(!slot.querySelector('svg')){const name=UI_GLYPHS[(slot.textContent||'').trim()];if(name)slot.innerHTML=ico(name);}});
  }).observe(main,{childList:true,subtree:true});
}

/* --- 4. Dialogs and toast ------------------------------------------------- */
function uiDialogSupported(){return typeof HTMLDialogElement==='function'&&typeof document.createElement==='function';}
function uiDialogEl(cls=''){
  let d=el('appDialog');
  if(!d){d=document.createElement('dialog');d.id='appDialog';document.body.appendChild(d);}
  d.className=`dialog ${cls}`;
  return d;
}
function uiConfirm({title,text,ok='تأكيد',cancel='إلغاء',danger=false}){
  if(!uiDialogSupported())return Promise.resolve(confirm(`${title}\n${text}`));
  return new Promise(resolve=>{
    const d=uiDialogEl();
    d.innerHTML=`<form method="dialog" class="dialog-panel" role="alertdialog" aria-labelledby="dlgTitle"><h3 id="dlgTitle">${esc(title)}</h3><p>${esc(text)}</p><div class="dialog-actions"><button class="btn" value="cancel" type="submit">${esc(cancel)}</button><button class="btn ${danger?'danger':'primary'}" value="ok" type="submit" autofocus>${esc(ok)}</button></div></form>`;
    d.onclose=()=>{const v=d.returnValue;d.returnValue='';resolve(v==='ok');};
    d.onclick=e=>{if(e.target===d)d.close('cancel');};
    d.showModal();
  });
}
function uiSheet(title,html,cls='sheet'){
  if(!uiDialogSupported())return null;
  const d=uiDialogEl(cls);
  d.innerHTML=`<div class="dialog-panel"><div class="dialog-head"><h3>${esc(title)}</h3><button class="icon-btn" data-action="close-dialog" aria-label="إغلاق">${ico('close')}</button></div><div class="dialog-body">${html}</div></div>`;
  d.onclose=null;d.onclick=e=>{if(e.target===d)d.close();};
  d.showModal();
  const panel=d.querySelector('.dialog-panel');if(panel){panel.tabIndex=-1;panel.focus({preventScroll:true});}
  return d;
}
showInfoDialog=function(title,html){uiSheet(title,html,'');};
toast=function(msg){
  const t=el('toast');if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2400);
};

/* --- 5. Loading state ----------------------------------------------------- */
let uiBanksLoaded=0;
function uiSplash(note='جارٍ تجهيز المنصة…',pct=null){
  const main=el('main');if(!main)return;
  main.innerHTML=`<div class="splash"><span class="brand-mark" aria-hidden="true"></span><h2>منصة التدريب والمحاكاة</h2><p id="splashNote">${esc(note)}</p><div class="meter"><span id="splashBar" style="width:${pct==null?12:pct}%"></span></div></div>`;
}
function uiSplashProgress(){
  const total=Object.keys(state.master?.bank_registry||{}).length||6;
  const note=el('splashNote'),bar=el('splashBar');
  if(note)note.textContent=`تحميل بنوك الأسئلة ${uiBanksLoaded}/${total}`;
  if(bar&&bar.style)bar.style.width=`${Math.round(12+uiBanksLoaded/total*88)}%`;
}
const UI_LOAD_VERIFIED=loadVerifiedJSON;
loadVerifiedJSON=async function(url,hash){const r=await UI_LOAD_VERIFIED(url,hash);uiBanksLoaded++;uiSplashProgress();return r;};

/* --- 6. Onboarding -------------------------------------------------------- */
renderOnboarding=function(step=0){
  state.session=null;state.ui={view:'onboarding',step};setTitle('مرحبًا بك');
  const slides=[
    {icon:'guide',title:'افهم الاختبار قبل أن تبدأ',text:'من «قبل أن تبدأ» تتعرف على طبيعة الأسئلة وما الذي يقيسه كل قسم قبل أول تدريب أو محاكاة.'},
    {icon:'training',title:'التدريب غير الامتحان',text:'في التدريب يظهر التصحيح والشرح بعد كل إجابة. في الامتحان تختفي التلميحات والتصنيفات حتى التسليم.'},
    {icon:'shield',title:'تقدمك محفوظ على هذا الجهاز',text:'الإجابات والمحاولات والمفضلة ودفتر الأخطاء تُحفظ محليًا، ويمكنك الخروج والعودة من حيث توقفت.'}
  ];
  const i=Math.max(0,Math.min(step,2)),s=slides[i];
  el('main').innerHTML=`<section class="onboarding">${avatar(s.icon,'solid','lg')}<div class="small muted">${i+1} من 3</div><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="dots">${slides.map((_,k)=>`<span class="${k===i?'active':''}"></span>`).join('')}</div><div class="btn-row"><button class="btn ghost" data-action="finish-onboarding">تخطي</button><button class="btn primary" data-action="${i<2?'next-onboarding':'finish-onboarding'}" data-step="${i+1}">${i<2?'التالي':'ابدأ الآن'}</button></div></section>`;
  updateMobileNav();
};

/* --- 7. Home -------------------------------------------------------------- */
function nextStep(){
  const active=activeSessions()[0];
  if(active){const p=sessionProgress(active);return{icon:'play',tone:'accent',title:'أكمل محاولتك الحالية',sub:`${moduleName(active.module)} · ${active.mid}${p?` · ${p.pct}%`:''}`,attrs:resumeAttrs(active)};}
  const attempts=(state.saved.history||[]).filter(h=>!h.review).length;
  if(!attempts)return{icon:'guide',tone:'info',title:'ابدأ بفهم الاختبار',sub:'دليل قصير يشرح طبيعة الأسئلة وما الذي يقيسه كل قسم',attrs:'data-action="orientation-home"'};
  const weak=MODULES.map(weakestForModule).filter(Boolean).sort((a,b)=>a.score-b.score)[0];
  if(weak&&weak.score<70){
    const area=weak.module==='leadership'?(CRITERION_AR[weak.area]||weak.area):moduleName(weak.area)!==weak.area?moduleName(weak.area):weak.area;
    return{icon:'review',tone:'warn',title:`تدرّب على أضعف مجال: ${area}`,sub:`${moduleName(weak.module)} · آخر نتيجة ${weak.score}%`,attrs:`data-action="train-weakness" data-module="${esc(weak.module)}" data-sim="${esc(weak.mid)}" data-area="${esc(weak.area)}"`};
  }
  const next=state.master.simulations.find(s=>simStatus(s.master_simulation_id).key==='new');
  if(next)return{icon:'simulation',tone:'',title:`ابدأ ${next.title_ar}`,sub:'محاكاة جديدة لم تبدأها بعد',attrs:`data-action="open-sim" data-sim="${esc(next.master_simulation_id)}"`};
  return{icon:'results',tone:'good',title:'راجع تقدمك',sub:'كل المحاكاة مكتملة — قارن نتائجك عبر الوقت',attrs:'data-action="results-home"'};
}
renderHome=function(){
  state.session=null;state.ui={view:'home',simId:null,module:null,mode:null};setTitle('الرئيسية');
  const r=trainingReadiness(),sims=state.master.simulations,started=sims.filter(s=>simStatus(s.master_simulation_id).key!=='new').length;
  const hs=(state.saved.history||[]).filter(h=>!h.review).sort((a,b)=>new Date(b.at)-new Date(a.at));
  const last=hs[0],lastMetric=last?historyMetric(last):null;
  const active=activeSessions()[0],step=nextStep();
  el('main').innerHTML=`<div class="home-grid"><div>
  <section class="hero-panel">
    <div class="eyebrow">منصة التدريب والمحاكاة · الإصدار <bdi dir="ltr">${UI_VERSION}</bdi></div>
    <h2>تدرّب، اختبر نفسك، وراجع نقاط ضعفك</h2>
    <p>سبع محاكاة كاملة لاختبارات GCAT وPQ10 والسلوكيات المعطلة والحكم القيادي، مع تصحيح وشرح في وضع التدريب وتحليل مفصّل بعد كل محاولة.</p>
    <div class="hero-cta"><button class="btn light" data-action="simulation-home">${ico('simulation')} ابدأ محاكاة</button><button class="btn" data-action="training-home">${ico('training')} تدريب مع شرح</button></div>
    <div class="hero-kpis"><div><strong class="num">${r.score}%</strong><span>جاهزية التدريب</span></div><div><strong class="num">${started}/${sims.length}</strong><span>محاكاة بدأتها</span></div><div><strong class="num">${lastMetric==null?'—':lastMetric+'%'}</strong><span>آخر نتيجة</span></div></div>
  </section>
  ${active?resumeCard(active):''}
  ${sectionTitle('الأقسام الرئيسية')}
  <div class="entry-grid">
    <button class="entry" data-action="simulation-home">${avatar('simulation','solid')}<strong>المحاكاة</strong><small>اختبار كامل بشروط الامتحان أو تدريب قسم واحد</small><span class="entry-meta">${ico('layers')} ${sims.length} محاكاة · ${UI_TOTAL_ITEMS} عنصرًا</span></button>
    <button class="entry" data-action="training-home">${avatar('training','info')}<strong>التدريب</strong><small>تصحيح وشرح بعد كل إجابة، وتدريب حسب الموضوع</small><span class="entry-meta">${ico('spark')} أربعة أقسام</span></button>
    <button class="entry" data-action="review-home">${avatar('review','warn')}<strong>المراجعة الذكية</strong><small>أخطاؤك المتكررة وأضعف المجالات في محاولاتك</small><span class="entry-meta">${ico('alert')} ${r.unresolved} عنصرًا مفتوحًا</span></button>
    <button class="entry" data-action="results-home">${avatar('results','good')}<strong>النتائج والتقدم</strong><small>محاولاتك وتحليلها ومقارنتها عبر الوقت</small><span class="entry-meta">${ico('trend')} ${hs.length} محاولة</span></button>
  </div>
  </div><aside class="home-side">
  ${sectionTitle('الخطوة التالية')}
  <button class="next-step row" ${step.attrs}>${avatar(step.icon,step.tone)}<span class="row-body"><strong>${esc(step.title)}</strong><small>${esc(step.sub)}</small></span>${ico('chevron','chev')}</button>
  ${sectionTitle('وصول سريع')}
  <div class="list">
    ${listRow({icon:'guide',tone:'info',title:'قبل أن تبدأ',sub:'دليل فهم الأسئلة والامتحان',attrs:'data-action="orientation-home"'})}
    ${listRow({icon:'bolt',tone:'warn',title:'مراجعة سريعة قبل الامتحان',sub:'أهم النقاط في دقيقة إلى دقيقتين',attrs:'data-action="quick-review"'})}
    ${r.unresolved?listRow({icon:'alert',tone:'bad',title:'دفتر الأخطاء',sub:`${r.unresolved} عنصرًا يحتاج مراجعة`,attrs:'data-action="mistakes-home"'}):''}
    ${isStandalone()?'':listRow({icon:'download',title:'تثبيت التطبيق',sub:isIOS()?'إضافة إلى الشاشة الرئيسية':'تجربة أسرع ووصول مباشر',attrs:'data-action="install-app"'})}
  </div>
  <p class="small muted" style="margin-top:16px">«جاهزية التدريب» مؤشر إنجاز ومراجعة داخل التطبيق، وليست درجة سيكومترية أو معيارًا للتوظيف.</p>
  </aside></div>`;
  updateMobileNav();
};

/* --- 8. Simulations ------------------------------------------------------- */
renderSimulationHub=function(){
  state.session=null;state.ui={view:'simulation-hub'};setTitle('المحاكاة');
  const rows=state.master.simulations.map((sim,i)=>{
    const mid=sim.master_simulation_id,p=simProgress(mid),st=simStatus(mid),best=simBest(mid);
    const sub=`${p.done}/4 أقسام مكتملة${best?` · أفضل نتيجة ${best.value}% (${moduleName(best.module)})`:''}`;
    return listRow({text:mid,tone:st.key==='done'?'good':st.key==='active'?'warn':'',title:esc(sim.title_ar),sub,end:badge(st.label,st.tone,st.icon)+ico('chevron','chev'),attrs:`data-action="open-sim" data-sim="${esc(mid)}"`,meter:p.pct,cls:'sim-row'});
  }).join('');
  el('main').innerHTML=`${pageHead('المحاكاة','سبع محاكاة كاملة. كل محاكاة تضم GCAT وPQ10 والسلوكيات المعطلة والحكم القيادي — تدريبًا أو اختبارًا أو محاكاة شاملة بالتتابع.')}
  ${resumeCard()}
  <div class="callout info">${ico('info')}<div><strong>المحاكاة الشاملة</strong> تعرض الأقسام الأربعة بالتتابع بشروط الامتحان (${UI_TOTAL_ITEMS} عنصرًا)، و<strong>محاكاة قسم واحد</strong> تتيح تدريب قسم بعينه أو اختباره مستقلًا.</div></div>
  ${sectionTitle('المحاكاة المتاحة',`<span class="muted small">${state.master.simulations.length} محاكاة</span>`)}
  <div class="list">${rows}</div>`;
};
renderSimulation=function(mid){
  const sim=state.master.simulations.find(s=>s.master_simulation_id===mid);if(!sim)return renderSimulationHub();
  state.session=null;state.ui={view:'simulation',simId:mid};setTitle(sim.title_ar);
  const fst=fullRunStatus(mid),p=simProgress(mid),st=simStatus(mid);
  const fullSub=fst.done?'عرض نتيجة المحاكاة الشاملة':fst.started?`متابعة — اكتمل ${fst.finished} من 4 أقسام`:'الأقسام الأربعة بالتتابع بشروط الامتحان';
  const sections=MODULES.map(m=>{const d=UI_MODULES[m],r=latestModuleResult(mid,m,'exam'),v=r?metricValue(m,r):null;return `<div class="section-line">${avatar(d.icon,d.tone)}<span>${esc(moduleName(m))}</span><b class="num">${d.count} ${d.unit}</b><i class="num ${v==null?'muted':''}">${v==null?'—':v+'%'}</i></div>`;}).join('');
  el('main').innerHTML=`${pageHead(sim.title_ar,'اختر الوضع الذي يناسبك. تقدمك يُحفظ تلقائيًا ويمكنك المتابعة لاحقًا.',badge(st.label,st.tone,st.icon))}
  <div class="stat-grid" style="margin-bottom:24px">${stat('الأقسام المكتملة',`${p.done}/4`)}${stat('إجمالي العناصر',String(UI_TOTAL_ITEMS))}${stat('المحاكاة الشاملة',fst.done?'مكتملة':fst.started?'قيد التنفيذ':'لم تبدأ')}${stat('نسبة الإنجاز',p.pct+'%')}</div>
  <div class="sim-detail-grid"><div>
  ${sectionTitle('اختر الوضع')}
  <div class="list mode-list">
    ${listRow({icon:'training',tone:'info',title:'وضع التدريب',sub:'تصحيح وشرح فوري بعد كل إجابة — بلا مؤقت',attrs:`data-action="section-picker" data-sim="${esc(mid)}" data-mode="training"`})}
    ${listRow({icon:'flag',tone:'warn',title:'وضع الامتحان',sub:'بلا تلميحات أو تصحيح أثناء الحل، مع مؤقت في GCAT والحكم القيادي',attrs:`data-action="section-picker" data-sim="${esc(mid)}" data-mode="exam"`})}
    ${listRow({icon:'simulation',tone:'solid',title:'المحاكاة الشاملة',sub:fullSub,attrs:`data-action="full-run" data-sim="${esc(mid)}"`})}
    ${listRow({icon:'grid',title:'محاكاة قسم واحد',sub:'اختر قسمًا واحدًا للتدريب أو الاختبار',attrs:`data-action="section-picker" data-sim="${esc(mid)}" data-mode="both"`})}
  </div></div><div>
  ${sectionTitle('الأقسام المشمولة','<span class="muted small">العناصر · آخر نتيجة اختبار</span>')}
  <div class="section-table">${sections}</div>
  </div></div>`;
};
renderSectionPicker=function(mid,mode='both'){
  state.session=null;state.ui={view:'section-picker',simId:mid,mode};setTitle(`${mid} — اختر القسم`);
  const title=mode==='training'?'وضع التدريب':mode==='exam'?'وضع الامتحان':'محاكاة قسم واحد';
  const desc=mode==='exam'?'لن تظهر تلميحات أو تصنيفات أو شروحات أثناء الحل.':mode==='training'?'يظهر التصحيح والشرح بعد تثبيت كل إجابة.':'اختر القسم، ثم اختر التدريب أو الاختبار.';
  const cards=MODULES.map(m=>{
    const d=UI_MODULES[m],scopes=mode==='both'?['training','exam']:[mode];
    let st={label:'لم تبدأ',tone:'',icon:'circle'};
    if(scopes.some(sc=>state.saved.sessionMeta?.[scopeKey(mid,m,sc)]?.status==='active'))st={label:'قيد التنفيذ',tone:'warn',icon:'clock'};
    else if(scopes.every(sc=>resultScopes(mid,m)?.[sc]))st={label:'مكتملة',tone:'good',icon:'checkCircle'};
    else if(scopes.some(sc=>resultScopes(mid,m)?.[sc]))st={label:'قيد التنفيذ',tone:'warn',icon:'clock'};
    const buttons=scopes.map((sc,i)=>`<button class="btn ${i===scopes.length-1?'primary':''}" data-action="start" data-sim="${esc(mid)}" data-module="${esc(m)}" data-mode="${sc}">${moduleLaunchLabel(mid,m,sc)}</button>`).join('');
    return `<article class="card"><div style="display:flex;align-items:center;gap:12px">${avatar(d.icon,d.tone)}<div style="flex:1;min-width:0"><h3 style="margin:0">${esc(moduleName(m))}</h3><ul class="meta"><li>${ico('list')}<b>${d.count}</b> ${d.unit}</li><li>${ico('clock')}${moduleTime(m,mode==='both'?'exam':mode)}</li></ul></div>${badge(st.label,st.tone,st.icon)}</div><div class="btn-row">${buttons}</div></article>`;
  }).join('');
  el('main').innerHTML=`${pageHead(title,desc)}<div class="grid">${cards}</div>`;
};

/* --- 9. Training, orientation, review ------------------------------------- */
renderTrainingHub=function(){
  state.session=null;state.ui={view:'training-hub'};setTitle('التدريب');
  const rows=MODULES.map(m=>{const d=UI_MODULES[m],open=unresolvedFor(null,m).length;return listRow({icon:d.icon,tone:d.tone,title:moduleName(m),sub:`${d.blurb}${open?` · ${open} خطأ مفتوح`:''}`,attrs:`data-action="training-module" data-module="${m}"`});}).join('');
  el('main').innerHTML=`${pageHead('التدريب','اختر القسم ثم المحاكاة. لا يظهر ما يقيسه السؤال إلا بعد تثبيت إجابتك، ثم يظهر الشرح كاملًا.')}
  <div class="list">${rows}</div>
  ${sectionTitle('قبل الامتحان')}
  <div class="list">${listRow({icon:'bolt',tone:'warn',title:'مراجعة سريعة',sub:'أهم القواعد في دقيقة إلى دقيقتين',attrs:'data-action="quick-review"'})}</div>`;
};
const UI_TRAINING_MODULE_BASE=renderTrainingModule;
renderTrainingModule=function(module){
  if(module==='gcat')return renderGCATTrainingHub();
  state.session=null;state.ui={view:'training-module',module};setTitle(`التدريب — ${moduleName(module)}`);
  const d=UI_MODULES[module];
  const rows=state.master.simulations.map((sim,i)=>{
    const mid=sim.master_simulation_id,meta=state.saved.sessionMeta?.[scopeKey(mid,module,'training')],r=resultScopes(mid,module).training;
    const st=meta?.status==='active'?badge('قيد التنفيذ','warn','clock'):r?badge(resultHeadline(module,r),'good','checkCircle'):badge('لم يبدأ','','circle');
    return listRow({text:String(i+1),title:esc(sim.title_ar),sub:`${d.count} ${d.unit} · ${d.trainTime}`,end:st+ico('chevron','chev'),attrs:`data-action="start" data-sim="${esc(mid)}" data-module="${esc(module)}" data-mode="training"`});
  }).join('');
  el('main').innerHTML=`${pageHead(`التدريب — ${moduleName(module)}`,d.blurb,`<button class="btn" data-action="review-home">${ico('review')} حسب الموضوع</button>`)}<div class="list">${rows}</div>`;
};
renderGCATTrainingHub=function(){
  state.session=null;state.ui={view:'gcat-training',module:'gcat'};setTitle('GCAT — التدريب');
  const mistakes=unresolvedFor(null,'gcat').length,favs=favoriteEntries('gcat').length;
  el('main').innerHTML=`${pageHead('GCAT — التدريب','اختر مجالًا أو جلسة مختلطة. التدريب غير موقّت ويعرض التصحيح والشرح بعد إجابتك، ولا يغيّر امتحان GCAT الثابت (42 سؤالًا / 20 دقيقة).')}
  <div class="list">
    ${listRow({icon:'bolt',tone:'solid',title:'تدريب مختلط عشوائي',sub:'42 سؤالًا متوازنًا: 14 عددي + 14 لفظي + 14 تجريدي',attrs:'data-action="gcat-training-mixed"'})}
    ${listRow({text:'123',tone:'info',title:'العددي',sub:`${gcatCount('numerical')} سؤالًا متاحًا`,attrs:'data-action="gcat-domain-hub" data-kind="numerical"'})}
    ${listRow({text:'Aa',tone:'info',title:'اللفظي',sub:`${gcatCount('verbal')} سؤالًا متاحًا`,attrs:'data-action="gcat-domain-hub" data-kind="verbal"'})}
    ${listRow({icon:'grid',tone:'info',title:'التجريدي',sub:`${gcatCount('abstract')} سؤالًا متاحًا`,attrs:'data-action="gcat-domain-hub" data-kind="abstract"'})}
  </div>
  ${sectionTitle('مسارات أخرى')}
  <div class="list">
    ${listRow({icon:'layers',title:'تدريب حسب المحاكاة',sub:'اختر حزمة M1–M7 محددة',attrs:'data-action="gcat-training-sims"'})}
    ${listRow({icon:'alert',tone:'bad',title:'كل أخطاء GCAT',sub:mistakes?`${mistakes} عنصرًا مفتوحًا`:'لا توجد أخطاء مفتوحة',attrs:'data-action="gcat-training-mistakes"'})}
    ${listRow({icon:'star',tone:'warn',title:'كل المفضلة',sub:favs?`${favs} سؤالًا محفوظًا`:'لم تحفظ أسئلة بعد',attrs:'data-action="gcat-training-favorites"'})}
    ${listRow({icon:'bolt',tone:'warn',title:'مراجعة سريعة قبل الامتحان',sub:'أهم قواعد GCAT في 1–2 دقيقة',attrs:'data-action="quick-review"'})}
  </div>`;
};
v13RenderGCATDomainHub=function(kind){
  state.session=null;state.ui={view:'gcat-domain-hub',module:'gcat',kind};setTitle(`GCAT — ${V13_GCAT_KIND_LABEL[kind]}`);
  const n=v13GCATDomainEntries(kind).length,m=v13GCATDomainMistakeEntries(kind).length,f=v13GCATDomainFavoriteEntries(kind).length,t=v13GCATDomainTopics(kind).length;
  const row=(act,icon,tone,title,sub,disabled=false)=>listRow({icon,tone,title,sub,attrs:`data-action="${act}" data-kind="${kind}" ${disabled?'disabled':''}`});
  el('main').innerHTML=`${pageHead(`GCAT — ${V13_GCAT_KIND_LABEL[kind]}`,'اختر طريقة التدريب. هذه الخيارات للتدريب والمراجعة فقط، ولا تغيّر امتحان GCAT الثابت.')}
  <div class="list">
    ${row('gcat-domain-all','list','info','جميع الأسئلة',`${n} سؤالًا في هذا المجال`)}
    ${row('gcat-domain-quick','bolt','solid','جلسة سريعة','14 سؤالًا عشوائيًا')}
    ${row('gcat-domain-mistakes','alert','bad','أخطائي فقط',m?`${m} سؤالًا يحتاج مراجعة`:'لا توجد أخطاء مفتوحة',!m)}
    ${row('gcat-domain-favorites','star','warn','المفضلة',f?`${f} سؤالًا محفوظًا`:'لا توجد أسئلة محفوظة',!f)}
    ${row('gcat-domain-topics','grid','','حسب الموضوع',`${t} موضوعًا داخل المجال`)}
  </div>`;
};
renderOrientationHub=function(){
  state.session=null;state.ui={view:'orientation'};setTitle('قبل أن تبدأ');
  el('main').innerHTML=`${pageHead('قبل أن تبدأ','دليل فهم الأسئلة والامتحان. اختر القسم الذي تريد فهمه قبل أول تدريب.')}
  <div class="callout info">${ico('info')}<div><strong>جديد هنا؟</strong> ابدأ بهذا الدليل أولًا، ثم جرّب وضع التدريب قبل الامتحان.</div></div>
  ${sectionTitle('الأدلة')}
  <div class="list">
    ${listRow({icon:'spark',tone:'info',title:'القدرات الإدراكية GCAT',sub:'فهم أفكار العددي واللفظي والتجريدي وطريقة الحل',attrs:'data-action="open-guide" data-guide="gcat"'})}
    ${listRow({icon:'user',tone:'accent',title:'الشخصية والسلوكيات المعطلة',sub:'كيف تفهم اتجاه العبارة وما الذي تقيسه',attrs:'data-action="open-guide" data-guide="profile"'})}
    ${listRow({icon:'shield',tone:'good',title:'الحكم على المواقف القيادية',sub:'كيف تقيّم فعالية التصرف من 1 إلى 5',attrs:'data-action="open-guide" data-guide="leadership"'})}
  </div>
  ${sectionTitle('قبل الامتحان')}
  <div class="list">${listRow({icon:'bolt',tone:'warn',title:'المراجعة السريعة',sub:'ملخص 1–2 دقيقة قبل الامتحان',attrs:'data-action="quick-review"'})}</div>`;
};
renderReviewHome=function(){
  state.ui={view:'review',simId:null,module:null};setTitle('المراجعة الذكية');
  const r=trainingReadiness(),weak=MODULES.map(weakestForModule).filter(Boolean).sort((a,b)=>a.score-b.score);
  const weakRows=weak.map(w=>{const area=w.module==='leadership'?(CRITERION_AR[w.area]||w.area):moduleName(w.area)!==w.area?moduleName(w.area):w.area;return listRow({icon:moduleIcon(w.module),tone:w.score<50?'bad':'warn',title:esc(area),sub:`${moduleName(w.module)} · ${w.mid} · أقل نتيجة ${w.score}%`,end:`<span class="btn mini soft">تدرّب</span>`,attrs:`data-action="train-weakness" data-module="${esc(w.module)}" data-sim="${esc(w.mid)}" data-area="${esc(w.area)}"`});}).join('');
  el('main').innerHTML=`${pageHead('المراجعة الذكية','تركّز على أخطائك المتكررة وأضعف المجالات في آخر اختباراتك، دون خلط درجات الأقسام المختلفة.',badge(`جاهزية ${r.score}%`,'primary'))}
  <div class="list">
    ${listRow({icon:'alert',tone:'bad',title:'دفتر الأخطاء',sub:r.unresolved?`${r.unresolved} عنصرًا مفتوحًا يحتاج مراجعة`:'لا توجد أخطاء مفتوحة',attrs:'data-action="mistakes-home"'})}
    ${listRow({icon:'star',tone:'warn',title:'المفضلة',sub:state.saved.favorites.length?`${state.saved.favorites.length} سؤالًا محفوظًا`:'لم تحفظ أسئلة بعد',attrs:'data-action="favorites-home"'})}
  </div>
  ${sectionTitle('أضعف المجالات المكتشفة')}
  ${weakRows?`<div class="list">${weakRows}</div>`:emptyState('review','لا توجد نتائج كافية بعد','أكمل اختبارًا واحدًا على الأقل كي نحدد نقاط الضعف.')}
  ${sectionTitle('التدريب حسب الموضوع')}
  <div class="topic-catalog">${topicTrainingHTML()}</div>`;
};
renderMistakes=function(){
  state.ui={view:'mistakes',simId:null,module:null};setTitle('دفتر الأخطاء');
  const all=Object.values(state.saved.reviewItems||{}),open=all.filter(x=>!x.resolved),resolved=all.filter(x=>x.resolved);
  const byModule=MODULES.map(m=>[m,open.filter(x=>x.module===m).length]).filter(([,n])=>n);
  const rows=byModule.map(([m,n])=>listRow({icon:moduleIcon(m),tone:moduleTone(m),title:moduleName(m),sub:`${n} عنصرًا يحتاج مراجعة`,end:'<span class="btn mini soft">تدرّب</span>',attrs:`data-action="train-mistakes" data-module="${m}"`})).join('');
  const table=open.slice().sort((a,b)=>new Date(b.lastAt)-new Date(a.lastAt)).slice(0,120).map(x=>`<tr><td><bdi dir="ltr">${esc(x.mid)}</bdi></td><td>${esc(moduleName(x.module))}</td><td>${esc(x.topic)}</td><td>${esc(x.preview).slice(0,100)}</td><td class="num">${x.wrongCount}</td></tr>`).join('');
  el('main').innerHTML=`${pageHead('دفتر الأخطاء','كل عنصر أخطأت فيه يبقى هنا حتى تجيب عنه صحيحًا في إعادة التدريب.')}
  <div class="stat-grid" style="margin-bottom:24px">${stat('مفتوح',String(open.length),open.length?'bad':'')}${stat('محسوم بعد إعادة التدريب',String(resolved.length),'good')}</div>
  ${rows?`<div class="list">${rows}</div>`:emptyState('checkCircle','لا توجد أخطاء مفتوحة','كل ما أخطأت فيه سابقًا تمت مراجعته.')}
  ${table?`${sectionTitle('آخر العناصر')}<section class="card table-wrap"><table class="table"><thead><tr><th>المحاكاة</th><th>القسم</th><th>الموضوع</th><th>العنصر</th><th>التكرار</th></tr></thead><tbody>${table}</tbody></table></section>`:''}`;
};
renderFavorites=function(){
  state.ui={view:'favorites',simId:null,module:null};setTitle('المفضلة');
  const entries=favoriteEntries(),counts=MODULES.map(m=>[m,entries.filter(x=>x.module===m).length]).filter(([,n])=>n);
  const rows=counts.map(([m,n])=>listRow({icon:moduleIcon(m),tone:moduleTone(m),title:moduleName(m),sub:`${n} عنصرًا محفوظًا`,end:'<span class="btn mini soft">تدرّب</span>',attrs:`data-action="train-favorites" data-module="${m}"`})).join('');
  const table=entries.map(x=>`<tr><td><bdi dir="ltr">${esc(x.mid)}</bdi></td><td>${esc(moduleName(x.module))}</td><td>${esc(topicOf(x.item))}</td><td>${esc(previewOf(x.item)).slice(0,120)}</td></tr>`).join('');
  el('main').innerHTML=`${pageHead('المفضلة','الأسئلة والمواقف التي حفظتها للعودة إليها بسرعة.')}
  ${rows?`<div class="list">${rows}</div>`:emptyState('star','لم تحفظ أي سؤال بعد','اضغط النجمة أعلى أي سؤال أثناء التدريب لحفظه هنا.')}
  ${table?`${sectionTitle('العناصر المحفوظة')}<section class="card table-wrap"><table class="table"><thead><tr><th>المحاكاة</th><th>القسم</th><th>الموضوع</th><th>السؤال/الموقف</th></tr></thead><tbody>${table}</tbody></table></section>`:''}`;
};

/* --- 10. Session ------------------------------------------------------------ */
let uiTimer=null;
function answeredMap(){const s=state.session;if(!s)return[];const store=responseStore(s.mid,s.module,s.responseScope);return s.items.map(it=>itemComplete(s.module,it,store));}
function sessionNav(item,{nextEnabled=null,nextAction='next',nextLabel=null}={}){
  const s=state.session;if(!s)return'';
  const last=s.index===s.items.length-1;
  if(nextEnabled===null)nextEnabled=s.mode==='exam'||v13CurrentAnswered(item);
  if(!nextLabel)nextLabel=last?(s.mode==='exam'?'إنهاء الاختبار':s.isReview?'إنهاء المراجعة':'إنهاء التدريب'):'التالي';
  return `<nav class="session-nav question-pagination" aria-label="التنقل بين الأسئلة"><button class="btn ghost prev-question" data-action="prev" ${s.index===0?'disabled':''}>${ico('chevron')} السابق</button><span class="question-position num" dir="ltr">${s.index+1} / ${s.items.length}</span><button class="btn primary next-question" data-action="${nextAction}" ${nextEnabled?'':'disabled'}>${esc(nextLabel)} ${last?ico('flag'):'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.6 6.2 6 5.8-6 5.8"/></svg>'}</button></nav>`;
}
function questionKind(item){
  const q=item.data;
  if(item.kind==='numerical')return{label:'عددي',icon:'spark'};
  if(item.kind==='verbal')return{label:'لفظي',icon:'spark'};
  if(item.kind==='abstract'){const f={sequence:'تسلسل',matrix:'مصفوفة',analogy:'علاقة',transformation:'تحويل',odd_one:'الشكل المختلف'}[q.question_format]||'';return{label:`تجريدي${f?' · '+f:''}`,icon:'grid'};}
  if(item.kind==='pq10')return{label:'الشخصية — PQ10',icon:'user'};
  if(item.kind==='derailers')return{label:'السلوكيات المعطلة',icon:'alert'};
  return{label:'موقف قيادي',icon:'shield'};
}
questionToolbar=function(item){
  const k=questionKind(item);
  const src=state.session?.isReview?`<span class="badge"><bdi dir="ltr">${esc(currentSourceMid(item))}</bdi></span>`:'';
  const fav=state.session?.mode==='exam'?'':(()=>{const on=isFavorite(item);return `<button class="icon-btn ${on?'fav-active':''}" data-action="toggle-favorite" aria-label="${on?'إزالة من المفضلة':'إضافة إلى المفضلة'}" aria-pressed="${on?'true':'false'}">${ico('star')}</button>`;})();
  return `<div class="question-toolbar"><div class="question-kind">${badge(k.label,'',k.icon)}${src}</div>${fav}</div>`;
};
renderSession=function(){
  const s=state.session;if(!s)return renderHome();
  const item=s.items[s.index],n=s.items.length;
  state.ui={view:'session',simId:s.mid,module:s.module,mode:s.mode};
  setTitle(s.isReview?`${s.reviewLabel}`:`${moduleName(s.module)} — ${sessionModeLabel(s)}`);
  const map=answeredMap(),answered=map.filter(Boolean).length,progress=Math.round((s.index+1)/n*100);
  el('main').innerHTML=`<div class="session">
    <div class="exam-bar">
      <div class="exam-bar-start"><span class="mode-pill ${s.isReview?'':s.mode==='exam'?'exam':'training'}">${ico(s.mode==='exam'?'flag':'training')}${esc(sessionModeLabel(s))}</span><span class="exam-pos">السؤال <b class="num" id="uiPos">${s.index+1}</b> من <b class="num">${n}</b></span></div>
      <div class="exam-bar-end"><div id="timerSlot"></div><button class="map-btn" data-action="ui-map" aria-haspopup="dialog">${ico('map')}<span id="uiAnswered" class="num" dir="ltr">${answered}/${n}</span></button></div>
      <div class="exam-track" aria-hidden="true"><span id="uiTrack" style="width:${progress}%"></span></div>
    </div>
    <div id="questionHost"></div>
  </div>`;
  renderItem(item);tickTimer();updateMobileNav();
};
function syncSessionBar(){
  const s=state.session;if(!s||typeof document.querySelector!=='function')return;
  const map=answeredMap();
  const a=el('uiAnswered');if(a)a.textContent=`${map.filter(Boolean).length}/${map.length}`;
  const p=el('uiPos');if(p)p.textContent=String(s.index+1);
  const t=el('uiTrack');if(t&&t.style)t.style.width=Math.round((s.index+1)/s.items.length*100)+'%';
}
const UI_RENDER_ITEM=renderItem;
renderItem=function(item){UI_RENDER_ITEM(item);syncSessionBar();};

renderGCATText=function(item){
  const s=state.session,q=item.data,store=responseStore(s.mid,s.module,s.responseScope),chosen=store[storageId(item)];
  const opts=item.kind==='numerical'?q.options.map(x=>({letter:x.label,text:x.text})):q.options.map((x,i)=>({letter:'ABCDEF'[i],text:x}));
  const locked=s.mode==='training'&&chosen!==undefined;
  const html=opts.map(o=>`<button class="option-btn ${v13GCATClass(item,o.letter,chosen)}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${o.letter}" aria-pressed="${chosen===o.letter?'true':'false'}" ${locked?'disabled':''}><span class="option-label">${o.letter}</span><span>${esc(o.text)}</span></button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card">${questionToolbar(item)}<div class="question-text">${esc(q.question)}</div><div class="options" role="group" aria-label="الخيارات">${html}</div><div id="feedbackHost"></div></article>${sessionNav(item)}`;
  if(locked)showTrainingFeedback(item,chosen);
};
renderAbstract=function(item){
  const s=state.session,q=item.data,store=responseStore(s.mid,s.module,s.responseScope),chosen=store[storageId(item)];
  const locked=s.mode==='training'&&chosen!==undefined;
  const opts='ABCDEF'.split('').map((l,i)=>`<button class="abstract-option ${v13GCATClass(item,l,chosen)}" data-action="answer-gcat" data-id="${esc(storageId(item))}" data-answer="${l}" aria-label="الخيار ${i+1}" aria-pressed="${chosen===l?'true':'false'}" ${locked?'disabled':''}>${q.svg_inline?.options?.[l]||`<div>${esc(q['option_'+l])}</div>`}</button>`).join('');
  el('questionHost').innerHTML=`<article class="question-card abstract-question v14-abstract">${questionToolbar(item)}<div class="question-text">${esc(q.prompt_ar)}</div>${v13AbstractPatternHTML(q)}<div class="abstract-options unlabeled-options" role="group" aria-label="الخيارات">${opts}</div><div id="feedbackHost"></div></article>${sessionNav(item)}`;
  if(locked)showTrainingFeedback(item,chosen);
};
renderLikert=function(item){
  const s=state.session,q=item.data,store=responseStore(s.mid,s.module,s.responseScope),chosen=store[storageId(item)];
  el('questionHost').innerHTML=`<article class="question-card likert-question">${questionToolbar(item)}<div class="question-text likert">${esc(q.rewritten_question)}</div>${likertCirclesHTML(item,chosen)}<div id="feedbackHost"></div></article>${sessionNav(item)}`;
  if(s.mode==='training'&&chosen!==undefined)showTrainingFeedback(item,chosen);
};
renderLeadership=function(item){
  const s=state.session,q=item.data,store=responseStore(s.mid,s.module,s.responseScope),ratings=store[storageId(item)]||{};
  const submitted=v13LeadSubmitted(item,ratings),allDone=q.options.every(o=>ratings[o.response_id]!==undefined);
  const actions=q.options.map((o,i)=>{const val=ratings[o.response_id];return `<section class="lead-action ${submitted?'reviewed':''}"><div class="lead-action-number num">${i+1}</div><p>${esc(o.text)}</p>${leadershipCirclesHTML(item,o,val)}${submitted?v13LeadFeedbackCard(q,o,i,val):''}</section>`;}).join('');
  const measure=submitted?`<section class="scenario-measure"><span>ما الذي يقيسه هذا الموقف؟</span><strong>${esc(q.app_training?.criterion_ar||CRITERION_AR[q.criterion]||q.criterion)}</strong><p>${esc(q.app_training?.what_it_measures||'')}</p></section>`:'';
  let footer;
  if(s.mode==='training')footer=`${!submitted?`<div class="confirm-lead-row"><button class="btn primary" data-action="submit-lead" ${allDone?'':'disabled'}>${ico('check')} تأكيد تقييم التصرفات</button></div>`:''}`;
  const nav=s.mode==='training'?sessionNav(item,{nextEnabled:submitted}):sessionNav(item,{nextEnabled:allDone,nextAction:'submit-lead'});
  el('questionHost').innerHTML=`<article class="question-card leadership-question">${questionToolbar(item)}<h3>${esc(q.title)}</h3><div class="scenario-stem">${esc(q.stem)}</div>${measure}<div class="lead-instruction">قيّم مدى فعالية كل تصرف من التصرفات التالية</div><div class="lead-actions">${actions}</div>${footer||''}</article>${nav}`;
};
showLeadershipFeedback=function(item){renderLeadership(item);};

/* One timer chain — every re-render cancels the previous tick. Thresholds,
   alerts and auto-submit are the engine's rules, reproduced verbatim. */
tickTimer=function(){
  if(uiTimer!==null){clearTimeout(uiTimer);uiTimer=null;}
  const s=state.session,slot=el('timerSlot');
  if(!slot||!s?.deadline){if(slot)slot.innerHTML='';return;}
  const remaining=Math.max(0,s.deadline-Date.now()),sec=Math.floor(remaining/1000),min=Math.floor(sec/60),ss=String(sec%60).padStart(2,'0'),cls=sec<=60?'danger':sec<=300?'warn':'';
  slot.innerHTML=`<span class="timer ${cls}" dir="ltr" aria-label="الوقت المتبقي">${ico('clock')}${min}:${ss}</span>`;
  const sk=scopeKey(s.mid,s.module,s.responseScope),meta=state.saved.sessionMeta[sk]||{},shown=new Set(meta.alertsShown||[]);
  for(const [threshold,label] of [[600,'10 دقائق'],[300,'5 دقائق'],[60,'دقيقة واحدة']]){
    if(sec<=threshold&&sec>0&&!shown.has(threshold)){shown.add(threshold);meta.alertsShown=[...shown];state.saved.sessionMeta[sk]=meta;persist();toast(`تنبيه: تبقى ${label}`)}
  }
  if(remaining<=0){finishSession(true);return;}
  uiTimer=setTimeout(tickTimer,1000);
};

/* Question map — a sheet listing every item with its state */
function openQuestionMap(){
  const s=state.session;if(!s)return;
  const map=answeredMap(),answered=map.filter(Boolean).length;
  const dots=map.map((done,i)=>`<button class="qdot ${i===s.index?'current':done?'answered':''}" data-action="ui-goto" data-index="${i}" aria-current="${i===s.index?'true':'false'}" aria-label="السؤال ${i+1}${done?' — تمت الإجابة':' — بلا إجابة'}"><span dir="ltr">${i+1}</span></button>`).join('');
  const finishLabel=s.mode==='exam'?'إنهاء الاختبار وتسليمه':s.isReview?'إنهاء المراجعة':'إنهاء التدريب الآن';
  uiSheet('خريطة الأسئلة',`<div class="qmap-summary"><span>تمت الإجابة عن <b class="num">${answered}</b> من <b class="num">${map.length}</b></span><span>${map.length-answered?`<b class="num">${map.length-answered}</b> بلا إجابة`:'اكتملت الإجابات'}</span></div><div class="qmap-grid">${dots}</div><div class="qmap-legend"><span><i class="qkey current"></i> الحالي</span><span><i class="qkey answered"></i> تمت الإجابة</span><span><i class="qkey"></i> بلا إجابة</span></div><button class="btn ${s.mode==='exam'?'primary':''} block" data-action="ui-finish">${ico('flag')} ${finishLabel}</button>`);
}

/* --- 11. Results ------------------------------------------------------------ */
function breakdownOf(module,r){
  if(module==='gcat')return{title:'الأداء حسب المجال',entries:entriesOf(r.domains,k=>moduleName(k))};
  if(module==='pq10')return{title:'التوافق حسب الكفاءة',entries:entriesOf(r.groups)};
  if(module==='derailers')return{title:'التوافق حسب الفئة',entries:entriesOf(r.groups)};
  if(module==='leadership')return{title:'الأداء حسب المعيار',entries:entriesOf(r.criteria,k=>CRITERION_AR[k]||k)};
  return{title:'التفصيل',entries:[]};
}
function verdictOf(module,v){
  if(v==null)return'';
  if(module==='gcat'||module==='leadership')return v>=85?'أداء ممتاز — حافظ على المستوى.':v>=70?'أداء جيد — راجع المجالات الأضعف.':v>=50?'أداء متوسط — يحتاج تدريبًا موجّهًا.':'يحتاج تدريبًا مركّزًا قبل المحاولة التالية.';
  return v>=80?'توافق مرتفع مع النموذج التدريبي.':v>=60?'توافق متوسط — راجع الكفاءات الأقل.':'توافق منخفض — راجع الشروحات جيدًا.';
}
function metricLabel(module){return module==='gcat'?'النتيجة':module==='pq10'?'التوافق':module==='derailers'?'التوافق الآمن':'دقة الحكم';}
function scoreHero(module,r,scope,title=moduleName(module)){
  const v=metricValue(module,r),tone=v==null?'':metricTone(v);
  return `<section class="score-hero"><div><span class="mode-pill ${scope==='training'?'training':'exam'}">${ico(scope==='training'?'training':'flag')}${esc(modeName(scope))}</span><h2>${esc(title)}</h2><p>${esc(resultInterpretation(module))}</p>${v!=null?`<div class="verdict">${esc(verdictOf(module,v))}</div>`:''}</div><div class="ring ${tone}" style="--p:${Math.max(0,Math.min(100,v??0))}" role="img" aria-label="${esc(metricLabel(module))} ${v??0}%"><div><strong class="num">${v??'—'}%</strong><small>${esc(metricLabel(module))}</small></div></div></section>`;
}
function resultStats(module,r){
  const cells=[];
  if(module==='gcat'){const wrong=Math.max(0,(r.total??0)-(r.correct??0));cells.push(['إجابات صحيحة',`${r.correct}/${r.total}`,'good'],['إجابات خاطئة',String(wrong),wrong?'bad':'']);for(const e of entriesOf(r.domains,k=>moduleName(k)))cells.push([e.label,e.value+'%','']);}
  else if(module==='pq10')cells.push(['التوافق مع النموذج التدريبي',r.alignment+'%',''],['البنود المجابة',`${r.answered}/${r.total}`,'']);
  else if(module==='derailers')cells.push(['التوافق الآمن',r.safety+'%','good'],['الابتعاد التدريبي',r.risk+'%','']);
  else cells.push(['دقة الحكم',r.accuracy+'%',''],['تطابق تام',r.exact_match+'%','good'],['رفعت التقييم',String(r.overrated),''],['خفضت التقييم',String(r.underrated),'']);
  return `<div class="stat-grid" style="margin-bottom:16px">${cells.map(([l,v,t])=>stat(l,v,t)).join('')}</div>`;
}
function strengthsPanel(module,r){
  const b=breakdownOf(module,r);if(b.entries.length<2)return'';
  const strong=b.entries.filter(x=>x.value>=70).slice(0,3),weak=b.entries.slice().reverse().filter(x=>x.value<70).slice(0,3);
  const li=(list,empty)=>list.length?`<ul class="plain">${list.map(x=>`<li><span>${esc(x.label)}</span><b class="num">${x.value}%</b></li>`).join('')}</ul>`:`<p class="empty-line">${esc(empty)}</p>`;
  return `<div class="split"><section class="panel good"><div class="panel-head">${ico('arrowUp')}<h3>نقاط القوة</h3></div>${li(strong,'لا يوجد مجال بلغ 70% في هذه المحاولة بعد.')}</section><section class="panel attention"><div class="panel-head">${ico('alert')}<h3>يحتاج تحسينًا</h3></div>${li(weak,'لا يوجد مجال دون 70% في هذه المحاولة.')}</section></div>`;
}
function crossSimPanel(mid,module,scope){
  const rows=[];
  for(const sim of state.master.simulations){const id=sim.master_simulation_id;const r=scope==='full_exam'?state.saved.fullResults?.[id]?.[module]:resultScopes(id,module)[scope];if(!r)continue;const v=metricValue(module,r);if(v==null)continue;rows.push({id,v,current:id===mid});}
  if(rows.length<2)return'';
  const avg=Math.round(rows.reduce((s,x)=>s+x.v,0)/rows.length);rows.sort((a,b)=>b.v-a.v);
  return `<section class="panel"><div class="panel-head">${ico('trend')}<h3>مقارنة ${esc(moduleName(module))} بين المحاكاة</h3></div><div class="compare">${rows.map(x=>{const d=x.v-avg;return `<div class="compare-row ${x.current?'current':''}"><span><bdi dir="ltr">${esc(x.id)}</bdi>${x.current?' <small>هذه المحاولة</small>':''}</span><b class="num">${x.v}%</b><i class="${d>0?'up':d<0?'down':''} num">${d>0?'+':''}${d}</i></div>`;}).join('')}</div><p class="empty-line" style="margin-top:12px">المتوسط عبر ${rows.length} محاكاة: <b class="num">${avg}%</b></p></section>`;
}
renderResult=function(mid,module,r,timedOut=false){
  state.session=null;state.ui={view:'result',simId:mid,module,mode:r.responseScope||r.mode};setTitle(`${mid} — نتيجة ${moduleName(module)}`);
  const scope=r.responseScope||r.mode||'training',reviewCount=unresolvedFor(mid,module).length,b=breakdownOf(module,r);
  const boundaries=module==='leadership'?barsPanel('دقة الحدود',entriesOf(r.boundaries||{}),'shield'):'';
  el('main').innerHTML=`${timedOut?`<div class="callout warn" style="margin-bottom:16px">${ico('clock')}<div>انتهى الوقت وتم تسليم المحاولة تلقائيًا.</div></div>`:''}
  ${scoreHero(module,r,scope)}
  ${resultStats(module,r)}
  ${strengthsPanel(module,r)}
  <div class="results-grid"><div>
  ${sectionTitle('التفصيل')}
  ${barsPanel(b.title,b.entries)}
  ${boundaries}
  ${v13DiagnosticHTML(mid,module,scope)}
  ${crossSimPanel(mid,module,scope)}
  ${scope==='exam'?comparisonHTML(mid,module,'exam',r):''}
  ${module==='pq10'||module==='derailers'?`<section class="card" style="margin-top:12px"><h3>التحليل المتكامل للشخصية والسلوك تحت الضغط</h3><p class="small muted">يظهر عندما تكون إجابات PQ10 والسلوكيات المعطلة متوفرة في النمط نفسه، مع تقدير الثقة في الاستنتاج.</p><div class="btn-row"><button class="btn" data-action="profile-report" data-sim="${esc(mid)}" data-scope="${scope}">فتح التحليل المتقدم</button></div></section>`:''}
  </div><aside>
  ${sectionTitle('الخطوة التالية')}
  <div class="list action-list">
    ${listRow({icon:'alert',tone:'bad',title:'مراجعة الأخطاء',sub:'العناصر التي اختلفت فيها عن الإجابة المرجعية',attrs:`data-action="ui-answers-diff" data-sim="${esc(mid)}" data-module="${esc(module)}" data-scope="${scope}"`})}
    ${listRow({icon:'book',tone:'info',title:'إجاباتي والتفسير',sub:'كل سؤال مع إجابتك والمرجع والشرح',attrs:`data-action="answers-view" data-sim="${esc(mid)}" data-module="${esc(module)}" data-scope="${scope}"`})}
    ${reviewCount?listRow({icon:'review',tone:'warn',title:'تدرّب على أخطائي فقط',sub:`${reviewCount} عنصرًا مفتوحًا في دفتر الأخطاء`,attrs:`data-action="train-mistakes" data-sim="${esc(mid)}" data-module="${esc(module)}"`}):''}
    ${listRow({icon:'refresh',title:'إعادة المحاولة',sub:'تبدأ محاولة جديدة ويبقى سجل المحاولات السابقة',attrs:`data-action="restart" data-sim="${esc(mid)}" data-module="${esc(module)}" data-mode="${esc(r.mode||'training')}"`})}
    ${listRow({icon:'simulation',title:'العودة إلى المحاكاة',sub:mid,attrs:`data-action="open-sim" data-sim="${esc(mid)}"`})}
  </div>
  ${sectionTitle('التقرير والمشاركة')}
  ${reportActions(mid,module,scope)}
  </aside></div>`;
};
renderFullRunResult=function(mid){
  state.session=null;const all=state.saved.fullResults?.[mid]||{},g=all.gcat,p=all.pq10,d=all.derailers,l=all.leadership;
  state.ui={view:'full-result',simId:mid,module:null,mode:'exam'};setTitle(`${mid} — النتيجة الشاملة`);
  const cell=(m,r,v)=>`<div class="stat">${avatar(moduleIcon(m),moduleTone(m))}<span style="margin-top:10px">${esc(moduleName(m))}</span><strong class="num ${v==null?'muted':metricTone(v)}">${v==null?'—':v+'%'}</strong><small>${r?esc(metricLabel(m)):'لم يكتمل'}</small></div>`;
  el('main').innerHTML=`<section class="score-hero"><div><span class="mode-pill exam">${ico('flag')}محاكاة شاملة</span><h2>${esc(mid)}</h2><p>كل قسم يُفسَّر بمقياسه الخاص، ولا تُدمج المقاييس المختلفة في درجة شخصية واحدة.</p></div>${avatar('simulation','solid','lg')}</section>
  <div class="stat-grid" style="margin-bottom:16px">${cell('gcat',g,g?.score)}${cell('pq10',p,p?.alignment)}${cell('derailers',d,d?.safety)}${cell('leadership',l,l?.accuracy)}</div>
  <div class="results-grid"><div>
  ${g?v13DiagnosticHTML(mid,'gcat','full_exam'):''}
  ${l?v13DiagnosticHTML(mid,'leadership','full_exam'):''}
  ${p&&d?`<section class="card"><h3>تحليل الشخصية والسلوك تحت الضغط</h3><p class="small muted">تحليل متكامل مبني على PQ10 والسلوكيات المعطلة مع تقدير الثقة.</p><div class="btn-row"><button class="btn primary" data-action="profile-report" data-sim="${esc(mid)}" data-scope="full_exam">فتح التحليل المتقدم</button></div></section>`:''}
  </div><aside>
  ${sectionTitle('الخطوة التالية')}
  <div class="list action-list">
    ${listRow({icon:'book',tone:'info',title:'إجاباتي والتفسير',sub:'الأقسام الأربعة في تقرير واحد',attrs:`data-action="answers-full" data-sim="${esc(mid)}" data-scope="full_exam"`})}
    ${listRow({icon:'refresh',title:'إعادة المحاكاة الشاملة',sub:'تبدأ من جديد ويبقى سجل المحاولات',attrs:`data-action="restart-full" data-sim="${esc(mid)}"`})}
    ${listRow({icon:'simulation',title:'العودة إلى المحاكاة',sub:mid,attrs:`data-action="open-sim" data-sim="${esc(mid)}"`})}
  </div>
  ${sectionTitle('التقرير والمشاركة')}
  ${reportActions(mid,'full','full_exam')}
  </aside></div>`;
};

/* --- 12. Progress dashboard ----------------------------------------------- */
function progressStats(scope){
  const hs=filteredAttempts(scope),vals=hs.map(historyMetric).filter(v=>typeof v==='number');
  const completedSims=state.master.simulations.filter(s=>{const id=s.master_simulation_id;return MODULES.every(m=>scope==='full_exam'?state.saved.fullResults?.[id]?.[m]:resultScopes(id,m)?.[scope]);}).length;
  const last=hs.slice().sort((a,b)=>new Date(b.at)-new Date(a.at))[0];
  return{attempts:hs.length,completedSims,average:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null,best:vals.length?Math.max(...vals):null,last:last?historyMetric(last):null,lastAt:last?.at||null};
}
function moduleAverages(scope){
  const acc={};for(const h of filteredAttempts(scope)){const v=historyMetric(h);if(typeof v==='number')(acc[h.module]||=[]).push(v);}
  return Object.entries(acc).map(([m,vals])=>({label:moduleName(m),value:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)})).sort((a,b)=>b.value-a.value);
}
function sparkline(vals){
  if(!vals.length)return'';const max=Math.max(100,...vals);
  return `<div class="spark">${vals.map((v,i)=>`<i class="${i===vals.length-1?'last':''}" style="height:${Math.max(8,Math.round(v/max*100))}%"></i>`).join('')}</div><div class="spark-labels">${vals.map(v=>`<span dir="ltr">${v}%</span>`).join('')}</div>`;
}
renderResultsHome=function(view=state.settings.resultView||'latest',scope=state.settings.resultScope||'exam'){
  state.session=null;state.settings.resultView=view;state.settings.resultScope=scope;persistSettings();
  state.ui={view:'results',resultView:view,resultScope:scope};setTitle('النتائج والتقدم');
  const hs=filteredAttempts(scope),grouped={};for(const h of hs){const k=`${h.sim}|${h.module}`;(grouped[k]||=[]).push(h)}
  const st=progressStats(scope),avgs=moduleAverages(scope),issues=Object.values(state.saved.reviewItems||{}).filter(x=>!x.resolved).length,active=activeSessions();
  let content='';
  if(view==='latest'){const latest=Object.values(grouped).map(a=>a.sort((x,y)=>new Date(y.at)-new Date(x.at))[0]).sort((a,b)=>new Date(b.at)-new Date(a.at));content=latest.length?`<div class="compare">${latest.map(h=>`<div class="compare-row"><span><bdi dir="ltr">${esc(h.sim)}</bdi> · ${esc(moduleName(h.module))}<small>${esc(formatDate(h.at))}</small></span><b class="num">${historyMetric(h)}%</b><i></i></div>`).join('')}</div>`:emptyState('results','لا توجد محاولات في هذا النمط بعد','ابدأ محاكاة أو تدريبًا لتظهر نتائجك هنا.');}
  if(view==='best'){const best=Object.values(grouped).map(a=>a.sort((x,y)=>historyMetric(y)-historyMetric(x))[0]).sort((a,b)=>historyMetric(b)-historyMetric(a));content=best.length?`<div class="compare">${best.map((h,i)=>`<div class="compare-row ${i===0?'current':''}"><span>${i===0?ico('trophy'):''} <bdi dir="ltr">${esc(h.sim)}</bdi> · ${esc(moduleName(h.module))}</span><b class="num">${historyMetric(h)}%</b><i>أفضل</i></div>`).join('')}</div>`:emptyState('trophy','لا توجد محاولات في هذا النمط بعد');}
  if(view==='trend'){const cards=Object.entries(grouped).map(([k,a])=>{a.sort((x,y)=>new Date(x.at)-new Date(y.at));const vals=a.slice(-5).map(historyMetric);const [mid,m]=k.split('|');const delta=vals.length>1?vals[vals.length-1]-vals[0]:null;return `<article class="trend-card"><div class="trend-head"><strong><bdi dir="ltr">${esc(mid)}</bdi> · ${esc(moduleName(m))}</strong><span class="num">${delta==null?'محاولة واحدة':(delta>0?'+':'')+delta}</span></div>${sparkline(vals)}</article>`;}).join('');content=cards?`<div class="trend-list">${cards}</div>`:emptyState('trend','تحتاج محاولتين أو أكثر لعرض التطور');}
  const analysable=state.master.simulations.filter(s=>state.saved.responses?.[s.master_simulation_id]?.pq10?.[scope]&&state.saved.responses?.[s.master_simulation_id]?.derailers?.[scope]);
  const pending=active.slice(0,3).map(m=>{const p=sessionProgress(m);return listRow({icon:'play',tone:'accent',title:`${esc(m.mid)} · ${esc(moduleName(m.module))}`,sub:`${modeName(m.responseScope||m.mode)}${p?` · أنجزت ${p.done} من ${p.total}`:''}`,attrs:resumeAttrs(m)});}).join('');
  el('main').innerHTML=`${pageHead('النتائج والتقدم','تابع تطورك عبر الوقت. الاختبار والتدريب والمحاكاة الشاملة تُعرض كلٌّ على حدة.')}
  <div class="filter-block"><div class="segmented" role="tablist">${[['exam','الاختبار'],['training','التدريب'],['full_exam','المحاكاة الشاملة']].map(([k,l])=>`<button role="tab" aria-selected="${scope===k}" class="${scope===k?'active':''}" data-action="results-scope" data-scope="${k}">${l}</button>`).join('')}</div></div>
  <div class="stat-grid" style="margin-bottom:16px">${stat('محاكاة مكتملة',`${st.completedSims}/${state.master.simulations.length}`)}${stat('متوسط النتائج',st.average==null?'—':st.average+'%')}${stat('أفضل نتيجة',st.best==null?'—':st.best+'%','good')}${stat('آخر نتيجة',st.last==null?'—':st.last+'%','',st.lastAt?formatDate(st.lastAt):'')}</div>
  <div class="results-grid"><div>
  ${avgs.length?barsPanel('متوسط الأداء حسب النوع',avgs):''}
  ${sectionTitle('المحاولات',`<span class="muted small">${st.attempts} محاولة</span>`)}
  <div class="filter-block"><div class="segmented" role="tablist">${[['latest','آخر محاولة'],['best','أفضل محاولة'],['trend','التطور عبر الوقت']].map(([k,l])=>`<button role="tab" aria-selected="${view===k}" class="${view===k?'active':''}" data-action="results-view" data-view="${k}">${l}</button>`).join('')}</div></div>
  ${content}
  </div><aside>
  ${pending?`${sectionTitle('محاولات غير مكتملة')}<div class="list">${pending}</div>`:''}
  ${issues?`${sectionTitle('يحتاج إعادة مراجعة')}<div class="list">${listRow({icon:'alert',tone:'bad',title:'دفتر الأخطاء',sub:`${issues} عنصرًا مفتوحًا عبر المحاكاة المختلفة`,attrs:'data-action="mistakes-home"'})}${listRow({icon:'review',tone:'warn',title:'تدرّب على أخطائي',sub:'جلسة مراجعة من العناصر المفتوحة',attrs:'data-action="train-mistakes"'})}</div>`:''}
  ${analysable.length?`${sectionTitle('التحليل السلوكي المتقدم')}<div class="list">${analysable.map(s=>listRow({icon:'user',tone:'accent',title:`تحليل ${esc(s.master_simulation_id)}`,sub:'نمط الشخصية والسلوكيات المعطلة مع مستوى الثقة',attrs:`data-action="profile-report" data-sim="${esc(s.master_simulation_id)}" data-scope="${scope}"`})).join('')}</div>`:''}
  </aside></div>
  <div class="data-actions"><button class="btn" data-action="export-data">${ico('download')} تصدير بياناتي</button><button class="btn danger" data-action="reset-all">مسح بياناتي</button></div>`;
};

/* --- 13. Confirmation flows (in-app dialogs replace window.confirm) -------- */
/* The engine bound #homeBtn/#backBtn to its own functions by reference, so
   those listeners are swapped for the dialog-based versions below. */
const UI_ENGINE_REQUEST_HOME=requestHome,UI_ENGINE_GO_BACK=goBack;
requestHome=async function(){
  if(state.session){const ok=await uiConfirm({title:'حفظ المحاولة والخروج؟',text:'سيُحفظ تقدمك على هذا الجهاز ويمكنك المتابعة لاحقًا من حيث توقفت.',ok:'حفظ وخروج',cancel:'البقاء'});if(!ok)return;persist();state.session=null;toast('تم حفظ التقدم');}
  renderHome();
};
goBack=async function(){
  if(state.session){const ok=await uiConfirm({title:'حفظ المحاولة والرجوع؟',text:'سيُحفظ تقدمك على هذا الجهاز ويمكنك المتابعة لاحقًا من حيث توقفت.',ok:'حفظ ورجوع',cancel:'البقاء'});if(!ok)return;persist();state.session=null;toast('تم حفظ التقدم');}
  const target=V12_NAV_STACK.pop();if(target)return v12Restore(target);
  const u=state.ui||{};
  if(u.view==='guide')return renderOrientationHub();
  if(u.view==='training-module'||u.view==='gcat-training')return renderTrainingHub();
  if(u.view==='gcat-training-sims'||u.view==='gcat-training-topics')return renderGCATTrainingHub();
  if(u.view==='gcat-domain-hub')return renderGCATTrainingHub();
  if(u.view==='gcat-domain-topics')return v13RenderGCATDomainHub(u.kind);
  if(u.view==='simulation')return renderSimulationHub();
  if(u.view==='section-picker')return renderSimulation(u.simId);
  if(u.view==='result'||u.view==='full-result')return renderSimulation(u.simId);
  return renderHome();
};
nextItem=async function(){
  const s=state.session;if(!s)return;
  if(s.index>=s.items.length-1){
    if(s.mode==='exam'){const n=unansweredCount();if(n>0){const ok=await uiConfirm({title:'تسليم الاختبار؟',text:`لديك ${n} عنصرًا بلا إجابة. يمكنك العودة إليها من خريطة الأسئلة قبل التسليم.`,ok:'تسليم الآن',cancel:'العودة للأسئلة'});if(!ok)return;}}
    return finishSession();
  }
  s.index++;s.feedbackShown=false;renderSession();
};
startFullRun=async function(mid){
  if(fullRunStatus(mid).started)return startSession(mid,'gcat','exam',true);
  const ok=await uiConfirm({title:'بدء المحاكاة الشاملة',text:'أربعة أقسام بالتتابع: GCAT (42 سؤالًا، 20 دقيقة)، PQ10 (144 بندًا)، السلوكيات المعطلة (60 بندًا)، ثم الحكم القيادي (16 موقفًا، 45 دقيقة). يُحفظ تقدمك تلقائيًا ويمكنك الخروج والعودة لاحقًا.',ok:'ابدأ المحاكاة',cancel:'ليس الآن'});
  if(!ok)return;
  return startSession(mid,'gcat','exam',true);
};
resetModule=async function(mid,module,mode='training'){
  const ok=await uiConfirm({title:'إعادة هذا القسم؟',text:'ستُحذف إجابات المحاولة الحالية فقط، ويبقى سجل المحاولات السابقة كما هو.',ok:'إعادة المحاولة',cancel:'إلغاء',danger:true});
  if(!ok)return;
  const responseScope=responseScopeFor(mode,false);
  if(state.saved.responses?.[mid]?.[module])delete state.saved.responses[mid][module][responseScope];
  if(state.saved.results?.[mid]?.[module])delete state.saved.results[mid][module][responseScope];
  delete state.saved.sessionMeta[scopeKey(mid,module,responseScope)];
  persist();startSession(mid,module,mode,false);
};
resetFullRun=async function(mid){
  const ok=await uiConfirm({title:'إعادة المحاكاة الشاملة؟',text:'ستُمسح إجابات المحاولة الشاملة الحالية، ويبقى سجل المحاولات السابقة كما هو.',ok:'إعادة المحاكاة',cancel:'إلغاء',danger:true});
  if(!ok)return;
  for(const m of MODULES){if(state.saved.responses?.[mid]?.[m])delete state.saved.responses[mid][m].full_exam;delete state.saved.sessionMeta[scopeKey(mid,m,'full_exam')]}
  delete state.saved.fullResults[mid];persist();startSession(mid,'gcat','exam',true);
};

(function rebindChrome(){
  const home=el('homeBtn'),back=el('backBtn');
  if(home?.removeEventListener){home.removeEventListener('click',UI_ENGINE_REQUEST_HOME);home.addEventListener('click',()=>requestHome());}
  if(back?.removeEventListener){back.removeEventListener('click',UI_ENGINE_GO_BACK);back.addEventListener('click',()=>goBack());}
})();

/* --- 14. Actions owned by this layer ------------------------------------- */
function uiCapture(e){
  const b=e.target?.closest?.('[data-action]');if(!b)return;
  const a=b.dataset.action;
  if(!['ui-map','ui-goto','ui-finish','ui-answers-diff','reset-all'].includes(a))return;
  e.stopImmediatePropagation?.();
  if(a==='ui-map')return openQuestionMap();
  if(a==='ui-goto'){const s=state.session;el('appDialog')?.close?.();if(!s)return;const i=Number(b.dataset.index);if(!Number.isFinite(i)||i<0||i>=s.items.length||i===s.index)return;s.index=i;s.feedbackShown=false;return renderSession();}
  if(a==='ui-finish'){el('appDialog')?.close?.();const s=state.session;if(!s)return;const left=unansweredCount();if(left>0)return uiConfirm({title:s.mode==='exam'?'تسليم الاختبار؟':'إنهاء الجلسة؟',text:`لديك ${left} عنصرًا بلا إجابة. هل تريد الإنهاء الآن؟`,ok:'إنهاء الآن',cancel:'العودة'}).then(ok=>{if(ok)finishSession()});return finishSession();}
  if(a==='ui-answers-diff'){v12PushCurrent();return renderMyAnswers(b.dataset.sim,b.dataset.module,b.dataset.scope||'exam','diff');}
  if(a==='reset-all'){return uiConfirm({title:'مسح جميع البيانات؟',text:'سيُحذف كل ما هو محفوظ على هذا الجهاز: الإجابات والنتائج والمفضلة ودفتر الأخطاء. لا يمكن التراجع عن هذا الإجراء.',ok:'مسح الكل',cancel:'إلغاء',danger:true}).then(ok=>{if(ok){state.saved=emptySaved();persist();toast('تم مسح البيانات');renderResultsHome();}});}
}
document.addEventListener('click',uiCapture,true);

/* --- 15. PWA update notice -------------------------------------------------- */
if('serviceWorker' in navigator&&navigator.serviceWorker?.addEventListener){
  let hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController){hadController=true;return;}
    if(state.session)return;
    toast('تم تحديث التطبيق — أعد التحميل لتطبيق النسخة الجديدة');
  });
}

/* --- 16. Boot glue ------------------------------------------------------------ */
uiChrome();
uiWatchMain();
if(!state.master){uiSplash();}
else if(state.ui?.view==='onboarding')renderOnboarding(state.ui.step||0);
else if(!state.session)v12Restore(state.ui);
