const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=__dirname;
const elems=new Map();
function fakeEl(id=''){
  if(elems.has(id)) return elems.get(id);
  const x={id,innerHTML:'',textContent:'',dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},style:{},setAttribute(){},removeAttribute(){},addEventListener(){},querySelectorAll(){return[]},closest(){return null},appendChild(){},remove(){},click(){},focus(){}};
  elems.set(id,x);return x;
}
const local={};
const ctx={console,TextDecoder,TextEncoder,Blob,URL,Date,Intl,Math,JSON,Set,Map,Object,Array,String,Number,Boolean,RegExp,
  localStorage:{getItem:k=>local[k]??null,setItem:(k,v)=>local[k]=String(v),removeItem:k=>delete local[k]},
  navigator:{userAgent:'QA',serviceWorker:{register:()=>Promise.resolve()},standalone:false},
  window:{matchMedia:()=>({matches:false}),navigator:{standalone:false},addEventListener(){},print(){},confirm:()=>true},
  document:{body:{classList:{toggle(){},add(){},remove(){}}},getElementById:fakeEl,addEventListener(){},createElement:()=>fakeEl('created')},
  confirm:()=>true,setTimeout:()=>0,clearTimeout(){},fetch:async()=>{throw new Error('fetch disabled in QA')},crypto:globalThis.crypto
};
ctx.globalThis=ctx;ctx.window.window=ctx.window;ctx.window.document=ctx.document;
let code=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
code=code.replace(/boot\(\);\s*$/m,'');
// Export selected bindings from the same lexical scope.
code += `\n;globalThis.__T={APP_VERSION,state,validateRuntime,resolveItems,modelAnswer,renderHome,renderSimulation,renderSimulationHub,renderTrainingHub,renderTrainingModule,renderGCATTrainingHub,renderGCATSimulationTraining,renderGCATTopicPicker,allGCATEntries,startGCATFocused,v12PushCurrent,goBack,renderOrientationHub,renderQuickReview,startSession,startReviewSession,responseStore,storageId,renderGCATText,renderAbstract,renderLikert,showTrainingFeedback,renderLeadership,showLeadershipFeedback,profileReportData,leadershipDiagnostics,normalizedDirectional,alignmentScore,LIKERT,CRITERION_AR,handleClick,confidenceAnalysis,filteredAttempts,renderResultsHome,v13AbstractPatternHTML,v13RenderGCATDomainHub,v13GCATDomainEntries,v13GCATDomainMistakeEntries,v13GCATDomainFavoriteEntries,v13GCATDomainTopics,v13StartGCATDomain,v13RenderGCATDomainTopics,v13GCATDiagnostics,v13TraitDiagnostics,v13LeadershipDiagnostics,v13DiagnosticHTML,renderMyAnswers,renderFullAnswers,v13AnswerRows,v13ExportPayload,v13ReportHTML,v13RowsCSV};`;
vm.createContext(ctx);vm.runInContext(code,ctx,{filename:'app.js'});const T=ctx.__T;
function read(f){return JSON.parse(fs.readFileSync(path.join(ROOT,'data',f),'utf8'))}
T.state.master=read('assessment_master_v1.json');
T.state.banks={
  gcat_abstract:read('gcat-abstract-100-balanced-7sim.json'),
  gcat_numerical:read('gcat_numerical_100_selected_7mocks.json'),
  gcat_verbal:read('gcat_verbal_100_selected_7mocks.json'),
  pq10:read('personality_pq10_7_simulations_1008_ar_v9_app_ready.json'),
  derailers:read('derailers_7_simulations_420_ar_v6_app_ready.json'),
  leadership:read('leadership_sjt_master_v5_6_app_ready_double_checked.json')
};
T.state.guides={gcat:read('guides/gcat-concepts-guide.json'),profile:read('guides/podium-personality-derailers-guide.json'),leadership:read('guides/leadership-sjt-orientation-v2.json')};
const tests=[];function ok(name,cond,detail=''){tests.push({name,pass:!!cond,detail});if(!cond)console.error('FAIL',name,detail)}
T.validateRuntime();ok('runtime master validation',true);
for(let i=1;i<=7;i++){const mid='M'+i;ok(`${mid} GCAT count`,T.resolveItems(mid,'gcat').length===42);ok(`${mid} PQ10 count`,T.resolveItems(mid,'pq10').length===144);ok(`${mid} Derailers count`,T.resolveItems(mid,'derailers').length===60);ok(`${mid} Leadership count`,T.resolveItems(mid,'leadership').length===16);}
T.renderHome();ok('home has orientation',fakeEl('main').innerHTML.includes('دليل فهم الأسئلة والامتحان'));ok('home has install',fakeEl('main').innerHTML.includes('تثبيت التطبيق'));ok('home has simulation',fakeEl('main').innerHTML.includes('المحاكاة'));
T.renderSimulation('M1');const simHTML=fakeEl('main').innerHTML;ok('simulation has four modes',['وضع التدريب','وضع الامتحان','المحاكاة الشاملة','محاكاة قسم واحد'].every(x=>simHTML.includes(x)));ok('simulation counts correct',simHTML.includes('144')&&simHTML.includes('60')&&simHTML.includes('16')&&simHTML.includes('42'));
T.renderOrientationHub();ok('orientation has three guides',['القدرات الإدراكية GCAT','الشخصية والسلوكيات المعطلة','الحكم على المواقف القيادية'].every(x=>fakeEl('main').innerHTML.includes(x)));
T.renderQuickReview();ok('quick review contains fixed GCAT timer',fakeEl('main').innerHTML.includes('42 سؤالًا خلال 20 دقيقة'));
// Exam clean flow: selecting does not auto-advance; previous/next navigation remains explicit.
T.state.saved={responses:{},results:{},fullResults:{},history:[],favorites:[],sessionMeta:{},reviewItems:{}};T.startSession('M1','gcat','exam',false);let examItem=T.state.session.items[0],examId=T.storageId(examItem),examKey=examItem.data.correct_answer;const click=(dataset)=>T.handleClick({target:{closest:()=>({dataset})}});click({action:'answer-gcat',id:examId,answer:examKey});ok('GCAT exam selection stays on current question',T.state.session.index===0);ok('GCAT exam has explicit previous/next',fakeEl('questionHost').innerHTML.includes('السابق')&&fakeEl('questionHost').innerHTML.includes('التالي'));click({action:'next'});ok('GCAT exam next advances explicitly',T.state.session.index===1);click({action:'prev'});ok('GCAT exam previous works',T.state.session.index===0);
// PQ training: measure hidden pre-answer, shown post-answer with disclaimer.
T.state.saved={responses:{},results:{},fullResults:{},history:[],favorites:[],sessionMeta:{},reviewItems:{}};
T.startSession('M1','pq10','training',false);let item=T.state.session.items[0];let qh=fakeEl('questionHost').innerHTML;ok('PQ measure hidden before answer',!qh.includes(item.data.measures));const pstore=T.responseStore('M1','pq10','training');pstore[T.storageId(item)]=item.data.rewritten_answer;T.renderLikert(item);ok('PQ five-circle control',(fakeEl('questionHost').innerHTML.match(/rating-circle/g)||[]).length>=5);ok('PQ measure shown after answer',fakeEl('feedbackHost').innerHTML.includes('ما الذي يقيسه هذا السؤال؟')&&fakeEl('feedbackHost').innerHTML.includes(item.data.measures));ok('PQ training disclaimer',fakeEl('feedbackHost').innerHTML.includes('هذا اجتهاد تدريبي وليس إجابة رسمية'));ok('PQ reference wording',fakeEl('feedbackHost').innerHTML.includes('الإجابة التدريبية المرجعية'));
// Derailers feedback includes axis and choice reading.
T.state.session=null;T.startSession('M1','derailers','training',false);item=T.state.session.items[0];const dstore=T.responseStore('M1','derailers','training');dstore[T.storageId(item)]=item.data.rewritten_answer;T.renderLikert(item);ok('Derailer axis shown after answer',fakeEl('feedbackHost').innerHTML.includes(item.data.analytic_axis));ok('Derailer choice reading',fakeEl('feedbackHost').innerHTML.includes('قراءة اختيارك'));
// Leadership per-option feedback.
T.state.session=null;T.startSession('M1','leadership','training',false);item=T.state.session.items[0];const lstore=T.responseStore('M1','leadership','training');lstore[T.storageId(item)]={};for(const o of item.data.options)lstore[T.storageId(item)][o.response_id]=o.app_score;T.state.session.feedbackShown=true;T.renderLeadership(item);const lf=fakeEl('questionHost').innerHTML+fakeEl('feedbackHost').innerHTML;ok('Leadership all four option explanations',(lf.match(/لماذا هذه الدرجة؟/g)||[]).length===4);ok('Leadership why not higher lower',(lf.match(/لماذا ليست الدرجة أعلى أو أقل؟/g)||[]).length===4);ok('Leadership criterion shown post submit',lf.includes('ما الذي يقيسه هذا الموقف؟'));ok('Leadership disclaimers per option',(lf.match(/هذا اجتهاد تدريبي وليس إجابة رسمية/g)||[]).length>=4);
// Advanced profile engine with ideal M1 answers.
T.state.saved.responses.M1=T.state.saved.responses.M1||{};for(const m of ['pq10','derailers']){T.state.saved.responses.M1[m]=T.state.saved.responses.M1[m]||{};T.state.saved.responses.M1[m].exam={};for(const it of T.resolveItems('M1',m))T.state.saved.responses.M1[m].exam[T.storageId(it)]=it.data.rewritten_answer;}
let pr=T.profileReportData('M1','exam');ok('profile has 8 PQ competence groups',Object.keys(pr.pq.groups).length===8,Object.keys(pr.pq.groups).join(','));ok('profile has derailer analytic groups',Object.keys(pr.der.groups).length>=6);ok('single simulation confidence not falsely high',pr.confidence.label!=='مرتفعة',JSON.stringify(pr.confidence));ok('model-key answers do not create false dishonesty claim',!pr.confidence.notes.some(x=>x.includes('مبالغة إيجابية')));
// Explicit exaggerated desirable-extreme pattern should lower confidence and be described cautiously.
for(const m of ['pq10','derailers']){for(const it of T.resolveItems('M1',m)){const mi=T.LIKERT.indexOf(it.data.rewritten_answer);if(mi>2)T.state.saved.responses.M1[m].exam[T.storageId(it)]=T.LIKERT[4];else if(mi<2)T.state.saved.responses.M1[m].exam[T.storageId(it)]=T.LIKERT[0];}}
let exaggerated=T.profileReportData('M1','exam');ok('exaggerated desirable extremes detected',exaggerated.confidence.notes.some(x=>x.includes('مبالغة إيجابية')),JSON.stringify(exaggerated.confidence));ok('exaggerated desirable extremes can lower confidence',exaggerated.confidence.label==='منخفضة',JSON.stringify(exaggerated.confidence));
// Repeated consistent forms across M1/M2 can raise confidence when response style is not exaggerated.
T.state.saved.responses.M2={};for(const m of ['pq10','derailers']){T.state.saved.responses.M2[m]={exam:{}};for(const it of T.resolveItems('M2',m))T.state.saved.responses.M2[m].exam[T.storageId(it)]=it.data.rewritten_answer;}
let repeated=T.profileReportData('M1','exam');ok('cross-simulation consistency is computed',repeated.confidence.consistency!==null&&repeated.confidence.repeated_sources>=10,JSON.stringify(repeated.confidence));
// Distinct response pattern must lower directional profile.
const firstMeasure=T.resolveItems('M1','pq10')[0].data.measures;const ideal=T.state.saved.responses.M1.pq10.exam;const idealScore=pr.pq.groups[firstMeasure].directional;for(const it of T.resolveItems('M1','pq10')){const mi=T.LIKERT.indexOf(it.data.rewritten_answer);ideal[T.storageId(it)]=mi>2?T.LIKERT[0]:mi<2?T.LIKERT[4]:T.LIKERT[2];}
let pr2=T.profileReportData('M1','exam');ok('profile distinguishes opposite answer pattern',pr2.pq.groups[firstMeasure].directional<idealScore,`${pr2.pq.groups[firstMeasure].directional} < ${idealScore}`);
// Leadership diagnostics: perfect ratings produce no error pattern.
T.state.saved.responses.M1.leadership=T.state.saved.responses.M1.leadership||{};T.state.saved.responses.M1.leadership.exam={};for(const it of T.resolveItems('M1','leadership')){T.state.saved.responses.M1.leadership.exam[T.storageId(it)]={};for(const o of it.data.options)T.state.saved.responses.M1.leadership.exam[T.storageId(it)][o.response_id]=o.app_score;}
let ld=T.leadershipDiagnostics('M1','exam');ok('leadership diagnostic perfect has no patterns',ld.patterns.length===0);ok('leadership diagnostic confidence high at 64/64',ld.confidence==='مرتفعة');
T.state.saved.history=[{at:new Date().toISOString(),sim:'M1',module:'gcat',responseScope:'exam',result:{score:80}},{at:new Date().toISOString(),sim:'M1',module:'gcat',responseScope:'training',result:{score:55}}];ok('results filters keep training/exam separate',T.filteredAttempts('exam').length===1&&T.filteredAttempts('training').length===1);T.renderResultsHome('latest','exam');ok('results exam view does not label training scope',!fakeEl('main').innerHTML.includes('55%'));

// v1.2 navigation + GCAT focused training
T.state.session=null;T.renderTrainingHub();T.renderTrainingModule('gcat');let gh=fakeEl('main').innerHTML;
ok('GCAT training page is icon based',['تدريب مختلط عشوائي','العددي','اللفظي','التجريدي','تدريب حسب المحاكاة','كل أخطاء GCAT','كل المفضلة'].every(x=>gh.includes(x)));
ok('GCAT active pool is 98 per domain',T.allGCATEntries('numerical').length===98&&T.allGCATEntries('verbal').length===98&&T.allGCATEntries('abstract').length===98,`${T.allGCATEntries('numerical').length}/${T.allGCATEntries('verbal').length}/${T.allGCATEntries('abstract').length}`);
T.state.saved={responses:{},results:{},fullResults:{},history:[],favorites:[],sessionMeta:{},reviewItems:{}};T.state.session=null;T.startGCATFocused('mixed');
let kinds=T.state.session.items.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{});ok('GCAT mixed random is 42 balanced',T.state.session.items.length===42&&kinds.numerical===14&&kinds.verbal===14&&kinds.abstract===14,JSON.stringify(kinds));ok('GCAT mixed has no duplicates',new Set(T.state.session.items.map(x=>x.kind+'|'+x.id)).size===42);
T.state.session=null;T.v13RenderGCATDomainHub('numerical');ok('GCAT domain hub has five requested modes',['جميع الأسئلة','جلسة سريعة','أخطائي فقط','المفضلة','حسب الموضوع'].every(x=>fakeEl('main').innerHTML.includes(x)));ok('GCAT numerical all count shown',fakeEl('main').innerHTML.includes('98 سؤالًا'));
T.state.session=null;T.v13StartGCATDomain('numerical','all');ok('GCAT numerical all is 98',T.state.session.items.length===98&&T.state.session.items.every(x=>x.kind==='numerical'));
T.state.session=null;T.v13StartGCATDomain('verbal','quick');ok('GCAT verbal quick is 14',T.state.session.items.length===14&&T.state.session.items.every(x=>x.kind==='verbal'));
T.state.session=null;T.v13StartGCATDomain('abstract','quick');ok('GCAT abstract quick is 14',T.state.session.items.length===14&&T.state.session.items.every(x=>x.kind==='abstract'));
T.state.session=null;T.renderGCATTopicPicker();ok('GCAT topic page includes all three domains',['العددي','اللفظي','التجريدي'].every(x=>fakeEl('main').innerHTML.includes(x)));
T.state.session=null;T.renderGCATSimulationTraining();ok('GCAT simulation training is grid M1-M7',['M1','M2','M3','M4','M5','M6','M7'].every(x=>fakeEl('main').innerHTML.includes(x)));
T.state.saved={responses:{},results:{},fullResults:{},history:[],favorites:[],sessionMeta:{},reviewItems:{}};T.state.session=null;T.startSession('M1','gcat','exam',false);ok('GCAT exam remains fixed 42 items',T.state.session.items.length===42);ok('GCAT exam remains fixed 20 minutes',Math.round((T.state.session.deadline-T.state.session.startedAt)/60000)===20,`${T.state.session.deadline-T.state.session.startedAt}`);
T.state.session=null;T.renderHome();T.v12PushCurrent();T.renderTrainingHub();T.goBack();ok('Back restores previous page',fakeEl('main').innerHTML.includes('دليل فهم الأسئلة والامتحان'));


// v1.3 critical abstract clarity, GCAT feedback, diagnostics, answers/export.
ok('app version 1.3.0',T.APP_VERSION==='1.3.0',T.APP_VERSION);
T.state.saved={responses:{},results:{},fullResults:{},history:[],favorites:[],sessionMeta:{},reviewItems:{}};T.state.session=null;T.startSession('M1','gcat','training',false);
const seq=T.state.session.items.find(x=>x.kind==='abstract'&&x.data.question_format==='sequence');T.state.session.items=[seq];T.state.session.index=0;T.renderAbstract(seq);let ah=fakeEl('questionHost').innerHTML;ok('abstract sequence shows explicit LTR direction',ah.includes('اتجاه النمط')&&ah.includes('من اليسار إلى اليمين'));ok('abstract sequence shows arrows and missing box',ah.includes('flow-arrow')&&ah.includes('missing-box'));
const mat=T.resolveItems('M1','gcat').find(x=>x.kind==='abstract'&&x.data.question_format==='matrix');T.state.session.items=[mat];T.state.session.index=0;T.renderAbstract(mat);ah=fakeEl('questionHost').innerHTML;ok('abstract matrix renders real matrix',ah.includes('abstract-matrix')&&ah.includes('missing-box'));ok('abstract matrix says empty cell',ah.includes('الخانة الفارغة'));
// Edge-case visual contracts: four-frame sequences and the single 8-frame matrix.
const allAbs=[];for(let z=1;z<=7;z++)allAbs.push(...T.resolveItems('M'+z,'gcat').filter(x=>x.kind==='abstract'));
const seq4=allAbs.find(x=>x.data.question_format==='sequence'&&(x.data.visual_frames||[]).length===4);ok('abstract 4-frame sequence exists',!!seq4);const seq4h=seq4?T.v13AbstractPatternHTML(seq4.data):'';ok('abstract 4-frame sequence keeps arrows and target',seq4h.includes('frames-4')&&(seq4h.match(/flow-arrow/g)||[]).length===4&&seq4h.includes('missing-box'));
const mat8=allAbs.find(x=>x.data.question_format==='matrix'&&(x.data.visual_frames||[]).length===8);ok('abstract 8-frame matrix exists',!!mat8);const mat8h=mat8?T.v13AbstractPatternHTML(mat8.data):'';ok('abstract 8-frame matrix is 3x3 with missing cell',mat8h.includes('matrix-3')&&(mat8h.match(/abstract-cell/g)||[]).length===9&&mat8h.includes('missing-box'));
let contractOK=true;for(const ai of allAbs){const f=ai.data.question_format,h=T.v13AbstractPatternHTML(ai.data);if(f==='sequence'&&(!h.includes('flow-arrow')||!h.includes('missing-box')))contractOK=false;if(f==='matrix'&&(!h.includes('abstract-matrix')||!h.includes('missing-box')))contractOK=false;if((f==='analogy'||f==='transformation')&&((h.match(/relation-row/g)||[]).length!==2||!h.includes('missing-box')))contractOK=false;}ok('all 98 active abstract items satisfy layout contract',contractOK&&allAbs.length===98,String(allAbs.length));
const rel=T.resolveItems('M1','gcat').find(x=>x.kind==='abstract'&&['analogy','transformation'].includes(x.data.question_format));T.state.session.items=[rel];T.state.session.index=0;T.renderAbstract(rel);ah=fakeEl('questionHost').innerHTML;ok('abstract relation has two rows', (ah.match(/relation-row/g)||[]).length===2&&ah.includes('missing-box'));
// Wrong GCAT answer must identify user selection and correct selection and color both.
T.state.session=null;T.startSession('M1','gcat','training',false);const gi=T.state.session.items[0],key=gi.data.correct_answer,wrong='ABCDEF'.split('').find(x=>x!==key),gs=T.responseStore('M1','gcat','training');gs[T.storageId(gi)]=wrong;T.renderGCATText(gi);const gf=fakeEl('feedbackHost').innerHTML,gq=fakeEl('questionHost').innerHTML;ok('GCAT wrong verdict explicit',gf.includes('إجابتك غير صحيحة')&&gf.includes('اختيارك')&&gf.includes('الإجابة الصحيحة'));ok('GCAT wrong answer red correct green',gq.includes('wrong-option')&&gq.includes('correct-option'));ok('GCAT training always previous/next',gq.includes('السابق')&&gq.includes('التالي'));
// Correct GCAT verdict.
const gi2=T.state.session.items[1];T.state.session.index=1;gs[T.storageId(gi2)]=T.modelAnswer?T.modelAnswer(gi2):gi2.data.correct_answer; // fallback not exported
// Leadership v2 diagnostics with deliberate token-action overrating.
T.state.saved.responses.M1=T.state.saved.responses.M1||{};T.state.saved.responses.M1.leadership={exam:{}};for(const it of T.resolveItems('M1','leadership')){T.state.saved.responses.M1.leadership.exam[T.storageId(it)]={};for(const o of it.data.options)T.state.saved.responses.M1.leadership.exam[T.storageId(it)][o.response_id]=o.app_score===2?3:o.app_score;}
let ld2=T.v13LeadershipDiagnostics('M1','exam');const pat=ld2.patterns.find(x=>x.key==='ineffective_action_overrated');ok('leadership diagnostic detects overrating 2 to 3',!!pat&&pat.count>0&&pat.rate>0,JSON.stringify(pat));ok('leadership diagnostic provides recommendation',!!pat&&pat.advice.includes('وجود إجراء'));
// Universal answers page and export.
T.state.saved.results.M1=T.state.saved.results.M1||{};T.state.saved.results.M1.leadership={exam:{accuracy:50,exact_match:20,overrated:10,underrated:0,rated:64,total:64,criteria:{},boundaries:{},responseScope:'exam',mode:'exam'}};T.renderMyAnswers('M1','leadership','exam','all');let my=fakeEl('main').innerHTML;ok('My Answers shows user/reference/explanations',my.includes('إجاباتي والتفسير')&&my.includes('الدرجة المرجعية')&&my.includes('لماذا هذه الدرجة؟'));ok('My Answers has share and exports',my.includes('مشاركة ملف إجاباتي')&&my.includes('CSV')&&my.includes('JSON')&&my.includes('حفظ PDF / طباعة'));
const report=T.v13ReportHTML('M1','leadership','exam',false,true);ok('readable export contains analysis and answers',report.includes('تشخيص الحكم القيادي')&&report.includes('لماذا هذه الدرجة؟')&&!report.includes('<pre>'));
const abstractReport=T.v13ReportHTML('M1','gcat','training',false,true);ok('abstract export preserves visual question structure',abstractReport.includes('abstract-flow')&&abstractReport.includes('missing-box')&&abstractReport.includes('<svg'));
ok('exported training report keeps disclaimer',abstractReport.includes('تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.'));
const diag=T.v13DiagnosticHTML('M1','leadership','exam');ok('result diagnostic shows weakness rate and advice',diag.includes('أين يتكرر الخلل')&&diag.includes('ما الذي تعدله'));
// Top navigation is globally present in HTML shell.
const indexHTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');ok('global Home and Back controls',indexHTML.includes('id="homeBtn"')&&indexHTML.includes('id="backBtn"'));

const failed=tests.filter(x=>!x.pass);console.log(JSON.stringify({status:failed.length?'FAIL':'PASS',tests:tests.length,failed},null,2));process.exit(failed.length?1:0);
