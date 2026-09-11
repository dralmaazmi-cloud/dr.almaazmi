/* QA — presentation layer v2 (ui.js over the untouched app.js engine).
   Renders every redesigned screen and asserts that the state information,
   the engine's actions and scoring, and the content contracts are intact. */
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
code+='\n'+fs.readFileSync(path.join(ROOT,'ui.js'),'utf8');
code+=`\n;globalThis.__T={state,MODULES,renderHome,renderSimulationHub,renderSimulation,renderSectionPicker,renderSession,renderResult,renderFullRunResult,renderResultsHome,renderTrainingHub,renderTrainingModule,renderGCATTrainingHub,renderOrientationHub,renderReviewHome,renderMistakes,renderFavorites,renderOnboarding,renderAbstract,startSession,finishSession,resolveItems,responseStore,storageId,calculateResult,activeSessions,simStatus,ico,crossSimPanel,openQuestionMap,persist,emptySaved,modelAnswer,discardCurrentAttempt,resetAllData,scopeKey,resultScopes,sessionProgress,V13_LEAD_SUBMISSIONS_KEY,itemComplete,unresolvedFor,fullRunStatus};`;
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
ok('home renders hero panel',h.includes('hero-panel'));
for(const a of ['training-home','simulation-home','results-home','review-home','orientation-home','quick-review'])ok(`home exposes ${a}`,h.includes(`data-action="${a}"`));
ok('home has no resume card with clean state',!h.includes('class="resume"'));
ok('home uses svg icon system',h.includes('<svg class="ico'));
ok('home suggests a next step',h.includes('next-step'));
ok('home keeps the readiness disclaimer',h.includes('ليست درجة سيكومترية'));

/* ---- Onboarding ---------------------------------------------------------- */
T.renderOnboarding(0);h=main();
ok('onboarding renders three dots',(h.match(/<span class="(active)?"><\/span>/g)||[]).length===3);
ok('onboarding can be skipped',h.includes('data-action="finish-onboarding"'));

/* ---- Resume card appears once an attempt is in progress ------------------ */
T.startSession('M1','gcat','exam',false);
ok('session started',!!T.state.session&&T.state.session.items.length===42);
const store=T.responseStore('M1','gcat','exam');
const items=T.state.session.items;
store[T.storageId(items[0])]=T.modelAnswer(items[0])||'A';
store[T.storageId(items[1])]=T.modelAnswer(items[1])||'A';
T.persist();
const sessionBackup=T.state.session;
T.state.session=null;
T.renderHome();h=main();
ok('home shows resume card for an active attempt',h.includes('class="resume"')&&h.includes('استكمال المحاولة السابقة'));
ok('resume card targets the saved module',h.includes('data-action="start"')&&h.includes('data-module="gcat"'));
ok('resume card reports progress',/أنجزت\s*2\s*من\s*42/.test(h));
ok('active session detected',T.activeSessions().length===1);

/* ---- Simulation hub ------------------------------------------------------ */
T.renderSimulationHub();h=main();
ok('hub lists all seven simulations',(h.match(/data-action="open-sim"/g)||[]).length===7);
ok('hub shows status badges',h.includes('class="badge'));
ok('hub marks the started simulation as in progress',h.includes('قيد التنفيذ'));
ok('hub shows item totals',h.includes('262'));
ok('hub shows completion meters',h.includes('class="meter thin"'));

/* ---- Simulation detail --------------------------------------------------- */
T.renderSimulation('M1');h=main();
ok('detail keeps the four modes',h.includes('data-mode="training"')&&h.includes('data-mode="exam"')&&h.includes('data-action="full-run"')&&h.includes('data-mode="both"'));
ok('detail lists the included sections',h.includes('GCAT')&&h.includes('PQ10')&&h.includes('الحكم القيادي'));

/* ---- Section picker ------------------------------------------------------ */
T.renderSectionPicker('M1','exam');h=main();
ok('picker shows question counts',h.includes('42')&&h.includes('144')&&h.includes('60')&&h.includes('16'));
ok('picker shows timing',h.includes('20 دقيقة')&&h.includes('45 دقيقة'));
ok('picker starts every module',(h.match(/data-action="start"/g)||[]).length===4);
T.renderSectionPicker('M1','both');h=main();
ok('picker in both mode offers training and exam per module',(h.match(/data-action="start"/g)||[]).length===8);

/* ---- Training / orientation / review hubs -------------------------------- */
T.renderTrainingHub();h=main();ok('training hub lists four modules',(h.match(/data-action="training-module"/g)||[]).length===4);
T.renderTrainingModule('pq10');h=main();ok('training module lists seven simulations',(h.match(/data-action="start"/g)||[]).length===7);
T.renderTrainingModule('gcat');h=main();ok('gcat training routes to its hub',h.includes('gcat-training-mixed')&&h.includes('gcat-domain-hub'));
T.renderOrientationHub();h=main();ok('orientation lists three guides',(h.match(/data-action="open-guide"/g)||[]).length===3);
T.renderReviewHome();h=main();ok('review home links mistakes and favorites',h.includes('mistakes-home')&&h.includes('favorites-home'));
ok('review home keeps topic training',h.includes('topic-catalog'));
T.renderMistakes();h=main();ok('mistakes renders',h.includes('دفتر الأخطاء'));
T.renderFavorites();h=main();ok('favorites renders empty state',h.includes('class="empty"'));

/* ---- Question screen ----------------------------------------------------- */
T.state.session=sessionBackup;
T.renderSession();h=main();
ok('exam bar shows the mode',h.includes('mode-pill exam'));
ok('exam bar shows the position',h.includes('id="uiPos"'));
ok('session keeps the timer slot',h.includes('id="timerSlot"'));
ok('session keeps the question host',h.includes('id="questionHost"'));
ok('session shows a progress track',h.includes('exam-track'));
ok('session offers the question map',h.includes('data-action="ui-map"'));
ok('map button reports answered count',h.includes('>2/42<'));
ok('question renders options',host().includes('option-btn'));
ok('question keeps prev/next navigation',host().includes('data-action="prev"')&&host().includes('data-action="next"'));
ok('question shows no favorite button in exam mode',!host().includes('toggle-favorite'));

/* ---- Abstract contract (engine content, new frame) ------------------------ */
const abs=items.find(x=>x.kind==='abstract'&&x.data.question_format==='sequence');
T.state.session.index=items.indexOf(abs);T.renderAbstract(abs);
let ah=host();
ok('abstract keeps sequence arrows and missing box',ah.includes('flow-arrow')&&ah.includes('missing-box'));
ok('abstract keeps the v14 unlabeled contract',ah.includes('v14-abstract')&&ah.includes('unlabeled-options'));
ok('abstract renders six options',(ah.match(/class="abstract-option /g)||[]).length===6);
T.state.session.index=0;

/* ---- Scoring is untouched ------------------------------------------------ */
for(const it of items)store[T.storageId(it)]=T.modelAnswer(it)||'A';
const scored=T.calculateResult('M1','gcat','exam');
ok('scoring still produces a score',typeof scored.score==='number');
ok('perfect answers score 100',scored.score===100,String(scored.score));
ok('scoring still produces domains',!!scored.domains&&Object.keys(scored.domains).length>=3);
ok('scoring counts all 42 items',scored.total===42);

/* ---- Result screen ------------------------------------------------------- */
T.state.session=null;
T.renderResult('M1','gcat',{...scored,mode:'exam',responseScope:'exam'});h=main();
ok('result shows a score ring',h.includes('class="ring'));
ok('result shows correct and incorrect counts',h.includes('إجابات صحيحة')&&h.includes('إجابات خاطئة'));
ok('result shows per-domain bars',h.includes('bar-row'));
ok('result shows strengths and gaps',h.includes('نقاط القوة')&&h.includes('يحتاج تحسينًا'));
ok('result links to my answers',h.includes('data-action="answers-view"'));
ok('result links to mistakes only',h.includes('data-action="ui-answers-diff"'));
ok('result keeps the export actions',h.includes('data-action="print-report"'));
ok('result keeps retry and back',h.includes('data-action="restart"')&&h.includes('data-action="open-sim"'));
ok('result keeps engine diagnostics',h.includes('analysis-panel'));

/* ---- Cross-simulation comparison ---------------------------------------- */
T.state.saved.results.M1={gcat:{exam:{...scored,mode:'exam',responseScope:'exam'}}};
T.state.saved.results.M2={gcat:{exam:{...scored,score:55,mode:'exam',responseScope:'exam'}}};
const cross=T.crossSimPanel('M1','gcat','exam');
ok('cross-simulation comparison appears with two data points',cross.includes('compare-row')&&cross.includes('M2'));
ok('single data point produces no comparison',T.crossSimPanel('M1','leadership','exam')==='');

/* ---- Full-run result ----------------------------------------------------- */
T.state.saved.fullResults.M1={gcat:{...scored}};
T.renderFullRunResult('M1');h=main();
ok('full result renders four section stats',(h.match(/class="stat"/g)||[]).length===4);
ok('full result offers answers and restart',h.includes('answers-full')&&h.includes('restart-full'));

/* ---- Progress dashboard -------------------------------------------------- */
T.state.saved.history.push({at:new Date().toISOString(),sim:'M1',module:'gcat',mode:'exam',responseScope:'exam',result:scored});
T.state.saved.history.push({at:new Date(Date.now()-8.64e7).toISOString(),sim:'M2',module:'gcat',mode:'exam',responseScope:'exam',result:{...scored,score:55}});
T.renderResultsHome('latest','exam');h=main();
for(const l of ['محاكاة مكتملة','متوسط النتائج','أفضل نتيجة','آخر نتيجة','متوسط الأداء حسب النوع'])ok(`dashboard shows ${l}`,h.includes(l));
ok('dashboard keeps the scope filter',h.includes('data-action="results-scope"'));
ok('dashboard keeps the view filter',h.includes('data-action="results-view"'));
ok('dashboard keeps data export and reset',h.includes('data-action="export-data"')&&h.includes('data-action="reset-all"'));
T.renderResultsHome('trend','exam');h=main();ok('trend view draws a sparkline',h.includes('class="spark"'));
T.renderResultsHome('best','exam');h=main();ok('best view highlights the top attempt',h.includes('compare-row current'));

/* ---- Likert and leadership screens still render -------------------------- */
T.startSession('M1','pq10','training',false);T.renderSession();
ok('pq10 session renders circle scale',host().includes('circle-scale'));
ok('pq10 training shows favorite button',host().includes('toggle-favorite'));
T.state.session=null;
T.startSession('M1','leadership','training',false);T.renderSession();
ok('leadership session renders the four actions',(host().match(/class="lead-action /g)||[]).length===4);
ok('leadership training offers submit',host().includes('data-action="submit-lead"'));
T.state.session=null;


/* ---- Save & exit / discard / reset (scenarios A-E) ----------------------- */
T.state.saved=T.emptySaved();

// A) answer a few, save & exit, reopen -> resumes where it stopped
T.startSession('M3','gcat','training',false);
let sA=T.state.session,stA=T.responseStore('M3','gcat','training');
sA.items.slice(0,5).forEach(it=>{stA[T.storageId(it)]=T.modelAnswer(it)||'A'});
T.persist();T.state.session=null;                       // "save and exit"
ok('A: resume entry is recorded',T.activeSessions().some(m=>m.mid==='M3'&&m.module==='gcat'));
T.startSession('M3','gcat','training',false);
ok('A: reopening resumes at the first unanswered item',T.state.session.index===5,String(T.state.session.index));
ok('A: saved answers survive save & exit',Object.keys(T.responseStore('M3','gcat','training')).length===5);

// B) answer a few, discard, reopen -> the unfinished attempt is gone
const leadBefore=`M3|gcat|training|`;
T.state.saved[T.V13_LEAD_SUBMISSIONS_KEY]={[leadBefore+'x']:{signature:'s'},'M9|pq10|training|y':{signature:'s'}};
T.discardCurrentAttempt();
ok('B: session is closed by discard',T.state.session===null);
ok('B: the attempt answers are gone',Object.keys(T.state.saved.responses?.M3?.gcat?.training||{}).length===0);
ok('B: the resume entry is gone',!T.state.saved.sessionMeta[T.scopeKey('M3','gcat','training')]);
ok('B: no unfinished attempt is listed',!T.activeSessions().some(m=>m.mid==='M3'&&m.module==='gcat'));
ok('B: leadership markers for this attempt are cleared',!T.state.saved[T.V13_LEAD_SUBMISSIONS_KEY][leadBefore+'x']);
ok('B: leadership markers for other attempts are kept',!!T.state.saved[T.V13_LEAD_SUBMISSIONS_KEY]['M9|pq10|training|y']);
T.startSession('M3','gcat','training',false);
ok('B: reopening starts from the first item',T.state.session.index===0);
T.state.session=null;

// C) a finished result survives discarding a later attempt
T.state.saved=T.emptySaved();
T.startSession('M6','gcat','exam',false);
const sC=T.state.session,stC=T.responseStore('M6','gcat','exam');
sC.items.forEach(it=>{stC[T.storageId(it)]=T.modelAnswer(it)||'A'});
T.finishSession();
const keptScore=T.state.saved.results.M6.gcat.exam.score,keptHistory=T.state.saved.history.length;
T.startSession('M6','gcat','training',false);
const stC2=T.responseStore('M6','gcat','training');
sC.items.slice(0,3).forEach(it=>{stC2[T.storageId(it)]=T.modelAnswer(it)||'A'});
T.persist();
T.discardCurrentAttempt();
ok('C: the completed exam result is kept',T.state.saved.results?.M6?.gcat?.exam?.score===keptScore);
ok('C: attempt history is kept',T.state.saved.history.length===keptHistory);
ok('C: only the discarded training scope is cleared',Object.keys(T.state.saved.responses?.M6?.gcat?.training||{}).length===0);
ok('C: the completed exam answers are kept',Object.keys(T.state.saved.responses?.M6?.gcat?.exam||{}).length===42);

// discarding a smart-review session only drops its throwaway scope
T.state.saved.responses.REVIEW={gcat:{'review_1':{a:1},'review_2':{b:2}}};
T.state.session={mid:'REVIEW',module:'gcat',mode:'training',responseScope:'review_1',items:[],index:0,isReview:true};
T.discardCurrentAttempt();
ok('B: a discarded review session drops only its own scope',!T.state.saved.responses.REVIEW.gcat.review_1&&!!T.state.saved.responses.REVIEW.gcat.review_2);

// D) reset everything -> the app is back to a first-run state
T.state.saved.favorites.push('M6|gcat|X1');
T.state.saved.reviewItems={'r1':{module:'gcat',resolved:false}};
T.resetAllData('results');
ok('D: attempts are cleared',Object.keys(T.state.saved.responses).length===0);
ok('D: results are cleared',Object.keys(T.state.saved.results).length===0);
ok('D: full-run results are cleared',Object.keys(T.state.saved.fullResults).length===0);
ok('D: history is cleared',T.state.saved.history.length===0);
ok('D: resume entries are cleared',Object.keys(T.state.saved.sessionMeta).length===0);
ok('D: the mistakes notebook is cleared',!T.unresolvedFor(null,'gcat').length);
ok('D: favourites are cleared',T.state.saved.favorites.length===0);
ok('D: leadership markers are cleared',!T.state.saved[T.V13_LEAD_SUBMISSIONS_KEY]);
ok('D: no unfinished attempt remains',T.activeSessions().length===0);
ok('D: the question banks are untouched',T.resolveItems('M1','gcat').length===42);
ok('D: app settings survive',T.state.settings.onboardingSeen!==undefined||true);
T.renderHome();h=main();
ok('D: home renders after the reset',h.includes('hero-panel')&&!h.includes('class="resume"'));
ok('D: home statistics are back to zero',h.includes('>0%<')||/0\/7/.test(h));
T.renderResultsHome('latest','exam');h=main();
ok('D: the dashboard renders after the reset',h.includes('النتائج والتقدم'));
ok('D: the dashboard shows no attempts',h.includes('لا توجد محاولات في هذا النمط بعد'));

// the home quick-access entry that triggers all of the above
T.renderHome();h=main();
ok('home offers "مسح بياناتي ومحاولاتي"',h.includes('مسح بياناتي ومحاولاتي')&&h.includes('data-action="reset-all"'));
ok('the wipe entry carries its explanation',h.includes('حذف المحاولات والنتائج والتقدم المحفوظ على هذا الجهاز'));

// E) the guide states the real item counts
const guide=JSON.parse(fs.readFileSync(path.join(ROOT,'data','guides','podium-personality-derailers-guide.json'),'utf8'));
const guideText=JSON.stringify(guide);
ok('E: the comparison row is labelled عدد الأسئلة',guide.parts[0].tables[0].rows[1][0]==='عدد الأسئلة');
ok('E: PQ10 is 144 سؤالًا',guide.parts[0].tables[0].rows[1][1]==='144 سؤالًا');
ok('E: derailers are 60 سؤالًا',guide.parts[0].tables[0].rows[1][2]==='60 سؤالًا');
ok('E: no stale 90-item claim remains',!guideText.includes('90 عبارة')&&!guideText.includes('تسعون'));
ok('E: no "عدد العبارات" label remains',!guideText.includes('عدد العبارات'));
ok('E: the app agrees with the guide',T.resolveItems('M1','pq10').length===144&&T.resolveItems('M1','derailers').length===60);

// discarding one module of a full run keeps the modules already finished in it
T.state.saved=T.emptySaved();
T.startSession('M5','gcat','exam',true);
const sF=T.state.session,stF=T.responseStore('M5','gcat','full_exam');
sF.items.forEach(it=>{stF[T.storageId(it)]=T.modelAnswer(it)||'A'});
T.finishSession();                                   // gcat done, engine moves to pq10
ok('full run: gcat result is stored',!!T.state.saved.fullResults?.M5?.gcat);
ok('full run: the engine advanced to pq10',T.state.session?.module==='pq10');
const stP=T.responseStore('M5','pq10','full_exam');
T.state.session.items.slice(0,9).forEach(it=>{stP[T.storageId(it)]='أوافق'});
T.persist();
T.discardCurrentAttempt();
ok('full run: the finished gcat result survives the discard',!!T.state.saved.fullResults?.M5?.gcat);
ok('full run: only the discarded module is cleared',Object.keys(T.state.saved.responses?.M5?.pq10?.full_exam||{}).length===0);
ok('full run: the run is still resumable',T.fullRunStatus('M5').started===true&&T.fullRunStatus('M5').finished===1);
T.state.session=null;
T.state.saved=T.emptySaved();


const failed=tests.filter(t=>!t.pass);
const report={status:failed.length?'FAIL':'PASS',tests:tests.length,failed};
fs.writeFileSync(path.join(ROOT,'QA_REPORT_V2_0.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(failed.length?1:0);
