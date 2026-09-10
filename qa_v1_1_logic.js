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
code += `\n;globalThis.__T={state,validateRuntime,resolveItems,renderHome,renderSimulation,renderSimulationHub,renderTrainingHub,renderOrientationHub,renderQuickReview,startSession,responseStore,storageId,renderLikert,showTrainingFeedback,renderLeadership,showLeadershipFeedback,profileReportData,leadershipDiagnostics,normalizedDirectional,alignmentScore,LIKERT,CRITERION_AR,handleClick,confidenceAnalysis,filteredAttempts,renderResultsHome};`;
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
T.state.session=null;T.startSession('M1','leadership','training',false);item=T.state.session.items[0];const lstore=T.responseStore('M1','leadership','training');lstore[T.storageId(item)]={};for(const o of item.data.options)lstore[T.storageId(item)][o.response_id]=o.app_score;T.state.session.feedbackShown=true;T.renderLeadership(item);const lf=fakeEl('feedbackHost').innerHTML;ok('Leadership all four option explanations',(lf.match(/لماذا هذه الدرجة؟/g)||[]).length===4);ok('Leadership why not higher lower',(lf.match(/لماذا ليست أعلى أو أقل؟/g)||[]).length===4);ok('Leadership criterion shown post submit',lf.includes('ما الذي يقيسه هذا الموقف؟'));ok('Leadership disclaimers per option',(lf.match(/هذا اجتهاد تدريبي وليس إجابة رسمية/g)||[]).length===4);
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
const failed=tests.filter(x=>!x.pass);console.log(JSON.stringify({status:failed.length?'FAIL':'PASS',tests:tests.length,failed},null,2));process.exit(failed.length?1:0);
