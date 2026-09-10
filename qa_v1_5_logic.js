/* QA — v1.5 premium UI layer.
   Renders every screen this layer replaced and asserts that the structure,
   the state information the user asked to see, and the existing behaviour
   (scoring, navigation actions, exports) are all still produced. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=__dirname,elems=new Map(),local={};
function fakeEl(id=''){
  if(elems.has(id))return elems.get(id);
  const x={id,innerHTML:'',textContent:'',dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},style:{},setAttribute(){},removeAttribute(){},addEventListener(){},querySelectorAll(){return[]},querySelector(){return null},closest(){return null},appendChild(){},remove(){},click(){},focus(){}};
  elems.set(id,x);return x;
}
const document={body:{classList:{toggle(){},add(){},remove(){}}},getElementById:fakeEl,addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},createElement:()=>fakeEl('created')};
const navigator={userAgent:'QA',serviceWorker:{register:()=>Promise.resolve()},standalone:false,share:async()=>true,canShare:()=>true};
const window={matchMedia:()=>({matches:false}),navigator,document,addEventListener(){},print(){},confirm:()=>true};
const ctx={console,TextDecoder,TextEncoder,Blob,File:globalThis.File||class File extends Blob{constructor(b,n,o){super(b,o);this.name=n;}},URL,Date,Intl,Math,JSON,Set,Map,Object,Array,String,Number,Boolean,RegExp,
  localStorage:{getItem:k=>local[k]??null,setItem:(k,v)=>local[k]=String(v),removeItem:k=>delete local[k]},
  navigator,window,document,confirm:()=>true,setTimeout:()=>0,clearTimeout(){},fetch:async()=>{throw new Error('fetch disabled')},crypto:globalThis.crypto};
ctx.globalThis=ctx;ctx.window.window=ctx.window;
let code=fs.readFileSync(path.join(ROOT,'app.js'),'utf8').replace(/\bboot\(\);/g,'/* boot disabled in QA */');
code+=`\n;globalThis.__T={state,MODULES,renderHome,renderSimulationHub,renderSimulation,renderSectionPicker,renderSession,renderResult,renderResultsHome,startSession,finishSession,resolveItems,responseStore,storageId,calculateResult,p5ActiveSessions,p5SimStatus,P5_UI,p5Icon,p5BarsHTML,p5StrengthsHTML,p5CrossSimHTML,persist,emptySaved};`;
vm.createContext(ctx);vm.runInContext(code,ctx,{filename:'app.js'});
const T=ctx.__T;
const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'data',f),'utf8'));
T.state.master=read('assessment_master_v1.json');
T.state.banks={gcat_abstract:read('gcat-abstract-100-balanced-7sim.json'),gcat_numerical:read('gcat_numerical_100_selected_7mocks.json'),gcat_verbal:read('gcat_verbal_100_selected_7mocks.json'),pq10:read('personality_pq10_7_simulations_1008_ar_v9_app_ready.json'),derailers:read('derailers_7_simulations_420_ar_v6_app_ready.json'),leadership:read('leadership_sjt_master_v5_6_app_ready_double_checked.json')};
T.state.saved=T.emptySaved();

const tests=[];
function ok(name,cond,detail=''){tests.push({name,pass:!!cond,detail});if(!cond)console.error('FAIL',name,detail)}
const main=()=>fakeEl('main').innerHTML;
const host=()=>fakeEl('questionHost').innerHTML;

/* ---- Home ---------------------------------------------------------------- */
T.renderHome();
let h=main();
ok('home renders hero',h.includes('p5-hero'));
ok('home exposes training entry',h.includes('data-action="training-home"'));
ok('home exposes simulation entry',h.includes('data-action="simulation-home"'));
ok('home exposes results/progress entry',h.includes('data-action="results-home"'));
ok('home exposes smart review entry',h.includes('data-action="review-home"'));
ok('home exposes orientation entry',h.includes('data-action="orientation-home"'));
ok('home exposes quick review entry',h.includes('data-action="quick-review"'));
ok('home has no resume card with clean state',!h.includes('p5-resume'));
ok('home uses svg icon system',h.includes('<svg class="p5-ico'));
ok('home keeps the readiness disclaimer',h.includes('ليست درجة سيكومترية'));

/* ---- Resume card appears once an attempt is in progress ------------------ */
T.startSession('M1','gcat','exam',false);
ok('session started',!!T.state.session&&T.state.session.items.length===42);
const store=T.responseStore('M1','gcat','exam');
const items=T.state.session.items;
store[T.storageId(items[0])]=items[0].data.correct_answer||'A';
store[T.storageId(items[1])]=items[1].data.correct_answer||'A';
T.persist();
const sessionBackup=T.state.session;
T.state.session=null;
T.renderHome();h=main();
ok('home shows resume card for an active attempt',h.includes('p5-resume')&&h.includes('استكمال المحاولة السابقة'));
ok('resume card targets the saved module',h.includes('data-action="start"')&&h.includes('data-module="gcat"'));
ok('resume card reports progress',/أنجزت\s*2\s*من\s*42/.test(h));
ok('active session detected',T.p5ActiveSessions().length===1);

/* ---- Simulation hub ------------------------------------------------------ */
T.renderSimulationHub();h=main();
ok('hub lists all seven simulations',(h.match(/data-action="open-sim"/g)||[]).length===7);
ok('hub shows a status chip',h.includes('p5-status'));
ok('hub marks the started simulation as in progress',h.includes('قيد التنفيذ'));
ok('hub shows item counts',h.includes('262'));
ok('hub shows completion percentage',h.includes('p5-progress-line'));

/* ---- Simulation detail --------------------------------------------------- */
T.renderSimulation('M1');h=main();
ok('detail keeps the four modes',h.includes('data-mode="training"')&&h.includes('data-mode="exam"')&&h.includes('data-action="full-run"')&&h.includes('data-mode="both"'));
ok('detail lists the included sections',h.includes('GCAT')&&h.includes('PQ10')&&h.includes('الحكم القيادي'));

/* ---- Section picker ------------------------------------------------------ */
T.renderSectionPicker('M1','exam');h=main();
ok('picker shows question counts',h.includes('42')&&h.includes('144')&&h.includes('60')&&h.includes('16'));
ok('picker shows timing',h.includes('20 دقيقة')&&h.includes('45 دقيقة'));
ok('picker starts every module',(h.match(/data-action="start"/g)||[]).length===4);
ok('picker shows per-module status',h.includes('p5-status'));

/* ---- Question screen ----------------------------------------------------- */
T.state.session=sessionBackup;
T.renderSession();h=main();
ok('session bar shows the mode',h.includes('p5-mode'));
ok('session bar shows the position',h.includes('p5-counter'));
ok('session keeps the timer slot',h.includes('id="timerSlot"'));
ok('session keeps the question host',h.includes('id="questionHost"'));
ok('session shows a progress track',h.includes('p5-track'));
ok('session offers the question map',h.includes('data-action="p5-qnav-toggle"'));
ok('question map reports answered count',h.includes('>2/42<')||/2\/42/.test(h));
ok('question renders options',host().includes('option-btn'));
ok('question keeps prev/next navigation',host().includes('data-action="prev"')&&host().includes('data-action="next"'));

/* ---- Question map panel -------------------------------------------------- */
T.P5_UI.navOpen=true;T.renderSession();h=main();
ok('map lists every question',(h.match(/data-action="p5-goto"/g)||[]).length===42);
ok('map marks the current question',h.includes('p5-qdot current'));
ok('map marks answered questions',h.includes('p5-qdot answered'));
ok('map offers finish',h.includes('data-action="p5-finish"'));
T.P5_UI.navOpen=false;

/* ---- Scoring is untouched ------------------------------------------------ */
for(const it of items)store[T.storageId(it)]=it.data.correct_answer||(it.data.options&&it.data.options[0]&&(it.data.options[0].label||'A'))||'A';
const scored=T.calculateResult('M1','gcat','exam');
ok('scoring still produces a score',typeof scored.score==='number');
ok('scoring still produces domains',!!scored.domains&&Object.keys(scored.domains).length>=3);
ok('scoring counts all 42 items',scored.total===42);

/* ---- Result screen ------------------------------------------------------- */
T.state.session=null;
T.renderResult('M1','gcat',{...scored,mode:'exam',responseScope:'exam'});h=main();
ok('result shows a score ring',h.includes('p5-ring'));
ok('result shows correct and incorrect counts',h.includes('إجابات صحيحة')&&h.includes('إجابات خاطئة'));
ok('result shows per-domain bars',h.includes('p5-bar-row'));
ok('result shows strengths and gaps',h.includes('نقاط القوة')&&h.includes('يحتاج تحسين'));
ok('result links to my answers',h.includes('data-action="answers-view"'));
ok('result links to mistakes only',h.includes('data-action="p5-answers-diff"'));
ok('result keeps the export actions',h.includes('data-action="print-report"'));
ok('result keeps retry and back',h.includes('data-action="restart"')&&h.includes('data-action="open-sim"'));

/* ---- Cross-simulation comparison ---------------------------------------- */
T.state.saved.results.M1={gcat:{exam:{...scored,mode:'exam',responseScope:'exam'}}};
T.state.saved.results.M2={gcat:{exam:{...scored,score:55,mode:'exam',responseScope:'exam'}}};
const cross=T.p5CrossSimHTML('M1','gcat','exam');
ok('cross-simulation comparison appears with two data points',cross.includes('p5-compare-row')&&cross.includes('M2'));
ok('single data point produces no comparison',T.p5CrossSimHTML('M1','leadership','exam')==='');

/* ---- Progress dashboard -------------------------------------------------- */
T.state.saved.history.push({at:new Date().toISOString(),sim:'M1',module:'gcat',mode:'exam',responseScope:'exam',result:scored});
T.state.saved.history.push({at:new Date(Date.now()-8.64e7).toISOString(),sim:'M2',module:'gcat',mode:'exam',responseScope:'exam',result:{...scored,score:55}});
T.renderResultsHome('latest','exam');h=main();
ok('dashboard shows completed simulations',h.includes('محاكاة مكتملة'));
ok('dashboard shows the average',h.includes('متوسط النتائج'));
ok('dashboard shows the best result',h.includes('أفضل نتيجة'));
ok('dashboard shows the last result',h.includes('آخر نتيجة'));
ok('dashboard shows performance by type',h.includes('متوسط الأداء حسب النوع'));
ok('dashboard keeps the scope filter',h.includes('data-action="results-scope"'));
ok('dashboard keeps the view filter',h.includes('data-action="results-view"'));
ok('dashboard keeps data export and reset',h.includes('data-action="export-data"')&&h.includes('data-action="reset-all"'));
T.renderResultsHome('trend','exam');h=main();
ok('trend view draws a sparkline',h.includes('p5-spark'));
T.renderResultsHome('best','exam');h=main();
ok('best view highlights the top attempt',h.includes('p5-compare-row current'));

/* ---- Likert and leadership screens still render -------------------------- */
T.startSession('M1','pq10','training',false);T.renderSession();
ok('pq10 session renders circle scale',host().includes('circle-scale'));
T.state.session=null;
T.startSession('M1','leadership','training',false);T.renderSession();
ok('leadership session renders the four actions',(host().match(/class="lead-action /g)||[]).length===4);
T.state.session=null;

const failed=tests.filter(t=>!t.pass);
const report={status:failed.length?'FAIL':'PASS',tests:tests.length,failed};
fs.writeFileSync(path.join(ROOT,'QA_REPORT_V1_5.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(failed.length?1:0);
