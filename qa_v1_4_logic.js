const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=__dirname, elems=new Map(), local={};
function fakeEl(id=''){
  if(elems.has(id))return elems.get(id);
  const x={id,innerHTML:'',textContent:'',dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},style:{},setAttribute(){},removeAttribute(){},addEventListener(){},querySelectorAll(){return[]},querySelector(){return null},closest(){return null},appendChild(){},remove(){},click(){},focus(){}};
  elems.set(id,x);return x;
}
const document={body:{classList:{toggle(){},add(){},remove(){}}},getElementById:fakeEl,addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},createElement:()=>fakeEl('created')};
const navigator={userAgent:'QA',serviceWorker:{register:()=>Promise.resolve()},standalone:false,share:async()=>true,canShare:()=>true};
const window={matchMedia:()=>({matches:false}),navigator,document,addEventListener(){},print(){},confirm:()=>true};
const ctx={console,TextDecoder,TextEncoder,Blob,File:globalThis.File||class File extends Blob{constructor(bits,name,opts){super(bits,opts);this.name=name;}},URL,Date,Intl,Math,JSON,Set,Map,Object,Array,String,Number,Boolean,RegExp,
 localStorage:{getItem:k=>local[k]??null,setItem:(k,v)=>local[k]=String(v),removeItem:k=>delete local[k]},navigator,window,document,confirm:()=>true,setTimeout:()=>0,clearTimeout(){},fetch:async()=>{throw new Error('fetch disabled')},crypto:globalThis.crypto};
ctx.globalThis=ctx;ctx.window.window=ctx.window;
let code=fs.readFileSync(path.join(ROOT,'app.js'),'utf8').replace(/\bboot\(\);/g,'/* boot disabled in QA */');
code+=`\n;globalThis.__T={APP_VERSION,state,validateRuntime,resolveItems,startSession,responseStore,storageId,renderAbstract,renderGCATText,showTrainingFeedback,v13AbstractPatternHTML,v14TeachingHTML,reportActions,v13ReportHTML,v13ShareFile,modelAnswer};`;
vm.createContext(ctx);vm.runInContext(code,ctx,{filename:'app.js'});const T=ctx.__T;
const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'data',f),'utf8'));
T.state.master=read('assessment_master_v1.json');
T.state.banks={gcat_abstract:read('gcat-abstract-100-balanced-7sim.json'),gcat_numerical:read('gcat_numerical_100_selected_7mocks.json'),gcat_verbal:read('gcat_verbal_100_selected_7mocks.json'),pq10:read('personality_pq10_7_simulations_1008_ar_v9_app_ready.json'),derailers:read('derailers_7_simulations_420_ar_v6_app_ready.json'),leadership:read('leadership_sjt_master_v5_6_app_ready_double_checked.json')};
const tests=[];function ok(name,cond,detail=''){tests.push({name,pass:!!cond,detail});if(!cond)console.error('FAIL',name,detail)}
T.validateRuntime();ok('runtime master validation',true);
ok('app version 1.4.0',T.APP_VERSION==='1.4.0',T.APP_VERSION);
for(let i=1;i<=7;i++){const mid='M'+i;ok(`${mid} GCAT 42`,T.resolveItems(mid,'gcat').length===42);ok(`${mid} abstract 14`,T.resolveItems(mid,'gcat').filter(x=>x.kind==='abstract').length===14);}
const allAbs=[];for(let i=1;i<=7;i++)allAbs.push(...T.resolveItems('M'+i,'gcat').filter(x=>x.kind==='abstract'));
const ids=new Set(allAbs.map(x=>x.id));
for(const q of ['Q001','Q003','Q030','Q061','Q152'])ok(`replacement ${q} active`,ids.has(q));
for(const q of ['S3Q21','S1Q42','S4Q04','S2Q17','S4Q18'])ok(`ambiguous ${q} removed`,!ids.has(q));
ok('all replacements are non-clock four-plus elements',allAbs.filter(x=>['Q001','Q003','Q030','Q061','Q152'].includes(x.id)).every(x=>!x.data.is_clock_question&&x.data.shapes_per_frame>=4));
ok('all abstract explanations structured',allAbs.every(x=>x.data.app_explanation_v2?.idea&&x.data.app_explanation_v2?.steps?.length>=2&&x.data.app_explanation_v2?.conclusion));
const allNum=[];for(let i=1;i<=7;i++)allNum.push(...T.resolveItems('M'+i,'gcat').filter(x=>x.kind==='numerical'));
// unique numerical items across seven mocks are 98
const numUni=[...new Map(allNum.map(x=>[x.id,x])).values()];
ok('98 numerical items',numUni.length===98,String(numUni.length));
ok('all numerical explanations structured',numUni.every(x=>x.data.app_explanation_v2?.idea&&x.data.app_explanation_v2?.steps?.length>=2&&x.data.app_explanation_v2?.conclusion));
ok('all numerical fast methods preserved',numUni.every(x=>!!x.data.fast_method));

// Abstract visual contracts
const seq=allAbs.find(x=>x.data.question_format==='sequence');T.state.session={mid:seq.sourceMid,module:'gcat',mode:'training',responseScope:'training',items:[seq],index:0};T.renderAbstract(seq);let h=fakeEl('questionHost').innerHTML;
ok('sequence arrows + missing box',h.includes('flow-arrow')&&h.includes('missing-box'));
ok('sequence frame numbers visually removed',!h.includes('frame-index'));
ok('abstract option letters visually removed',!h.includes('option-label'));
const rel=allAbs.find(x=>['analogy','transformation'].includes(x.data.question_format));T.state.session={mid:rel.sourceMid,module:'gcat',mode:'training',responseScope:'training',items:[rel],index:0};T.renderAbstract(rel);h=fakeEl('questionHost').innerHTML;
ok('analogy/transformation has two relation rows',(h.match(/relation-row/g)||[]).length===2);
ok('analogy/transformation only pair arrows',(h.match(/flow-arrow/g)||[]).length===2);
const mat=allAbs.find(x=>x.data.question_format==='matrix'&&(x.data.svg_inline?.frames||[]).length===8);T.state.session={mid:mat.sourceMid,module:'gcat',mode:'training',responseScope:'training',items:[mat],index:0};T.renderAbstract(mat);h=fakeEl('questionHost').innerHTML;
ok('3x3 matrix + missing cell',h.includes('matrix-3')&&h.includes('missing-box'));

// Numerical feedback structure
const num=numUni[0];T.state.saved={responses:{},results:{},fullResults:{},history:[],favorites:[],sessionMeta:{},reviewItems:{}};T.state.session={mid:num.sourceMid,module:'gcat',mode:'training',responseScope:'training',items:[num],index:0};const ns=T.responseStore(num.sourceMid,'gcat','training');ns[T.storageId(num)]=num.data.correct_answer;T.renderGCATText(num);const nf=fakeEl('feedbackHost').innerHTML;
ok('numerical feedback has idea',nf.includes('الفكرة'));
ok('numerical feedback step-by-step',nf.includes('الحل خطوة بخطوة')&&(nf.match(/step-no/g)||[]).length>=2);
ok('numerical feedback fast method',nf.includes('الطريقة الأسرع'));

// Abstract feedback structure + visual answer comparison
const aq=allAbs.find(x=>x.id==='Q003');T.state.session={mid:aq.sourceMid,module:'gcat',mode:'training',responseScope:'training',items:[aq],index:0};const as=T.responseStore(aq.sourceMid,'gcat','training');as[T.storageId(aq)]=aq.data.correct_option;T.renderAbstract(aq);const af=fakeEl('feedbackHost').innerHTML;
ok('abstract feedback has step-by-step',af.includes('الحل خطوة بخطوة')&&(af.match(/step-no/g)||[]).length>=3);
ok('abstract feedback compares visuals not letters',af.includes('abstract-answer-compare')&&af.includes('الإجابة الصحيحة'));

const ra=T.reportActions('M1','gcat','exam');ok('result buttons share short report',ra.includes('مشاركة التقرير المختصر')&&ra.includes('share-summary-html'));ok('result buttons share full report',ra.includes('مشاركة التقرير الكامل')&&ra.includes('share-answers'));ok('human result actions do not advertise download',!ra.includes('تنزيل')&&!ra.includes('تقرير مختصر</button>'));
const rep=T.v13ReportHTML('M1','gcat','training',false,true);ok('readable report retains training disclaimer',rep.includes('هذا اجتهاد تدريبي وليس إجابة رسمية'));
const failed=tests.filter(x=>!x.pass);console.log(JSON.stringify({status:failed.length?'FAIL':'PASS',tests:tests.length,failed},null,2));process.exit(failed.length?1:0);
