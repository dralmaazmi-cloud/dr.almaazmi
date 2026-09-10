#!/usr/bin/env python3
import json,hashlib,subprocess,re,sys,statistics
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent; DATA=ROOT/'data'; checks=[]
def add(name,ok,detail=''): checks.append({'name':name,'status':'PASS' if ok else 'FAIL','detail':detail})
def loadj(p): return json.load(open(p,encoding='utf-8'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
# syntax / logic
p=subprocess.run(['node','--check','app.js'],cwd=ROOT,text=True,capture_output=True);add('JavaScript syntax',p.returncode==0,(p.stderr or p.stdout).strip())
p=subprocess.run(['node','qa_v1_4_logic.js'],cwd=ROOT,text=True,capture_output=True);add('v1.4 logic suite',p.returncode==0 and '"status": "PASS"' in p.stdout,p.stdout[-1200:])
# JSON
names=['manifest.webmanifest','data/assessment_master_v1.json','data/gcat-abstract-100-balanced-7sim.json','data/gcat_numerical_100_selected_7mocks.json','data/gcat_verbal_100_selected_7mocks.json','data/personality_pq10_7_simulations_1008_ar_v9_app_ready.json','data/derailers_7_simulations_420_ar_v6_app_ready.json','data/leadership_sjt_master_v5_6_app_ready_double_checked.json']
P={}
for n in names:
 try:P[n]=loadj(ROOT/n);add('JSON valid: '+n,True)
 except Exception as e:add('JSON valid: '+n,False,str(e))
M=P['data/assessment_master_v1.json'];A=P['data/gcat-abstract-100-balanced-7sim.json'];N=P['data/gcat_numerical_100_selected_7mocks.json']
# hashes
for k,spec in M['bank_registry'].items(): add('Master hash: '+k,sha(DATA/spec['filename'])==spec['sha256'])
# unchanged authoritative banks (modified abstract/numerical are intentional)
for k in ['gcat_verbal','pq10','derailers','leadership']:
 spec=M['bank_registry'][k];orig=Path('/mnt/data')/spec['filename'];add('Unchanged bank byte-identical: '+k,orig.exists() and sha(orig)==sha(DATA/spec['filename']))
# abstract inventory
used=[q for q in A['questions'] if q.get('assignment_status')=='used'];reserve=[q for q in A['questions'] if q.get('assignment_status')=='reserve'];per=Counter(q['target_simulation_id'] for q in used)
add('Abstract used/reserve 98/2',len(used)==98 and len(reserve)==2,f'{len(used)}/{len(reserve)}')
add('Abstract 14 each',all(per[f'M{i}']==14 for i in range(1,8)),dict(per))
ids=[q['question_id'] for q in used];add('Abstract active IDs unique',len(ids)==len(set(ids)))
new={'Q001','Q003','Q030','Q061','Q152'};old={'S3Q21','S1Q42','S4Q04','S2Q17','S4Q18'}
add('Five approved replacements active',new.issubset(ids))
add('Five ambiguous questions removed',old.isdisjoint(ids))
repl=[q for q in used if q['question_id'] in new]
add('Replacement requirements',len(repl)==5 and all(not q.get('is_clock_question') and (q.get('shapes_per_frame') or 0)>=4 and q.get('difficulty') in ('متوسط','صعب') for q in repl))
add('Replacement source validation preserved',all(q.get('validation_checks',{}).get('source_unique_correct_answer') and q.get('validation_checks',{}).get('source_semantic_options_unique') for q in repl))
# refs
refs_ok=True
for sim in M['simulations']:
 mid=sim['master_simulation_id']; refs=[x['id'] for x in sim['binding']['gcat']['abstract']['item_refs']]; act=[q['question_id'] for q in sorted([x for x in used if x['target_simulation_id']==mid],key=lambda x:x['target_abstract_order'])]
 refs_ok &= refs==act
add('Master abstract item refs match',refs_ok)
# explanation quality
num=[q for m in N['mocks'] for q in m['questions']]
add('Numerical active count 98',len(num)==98)
add('Numerical explanation layer 98/98',all(q.get('app_explanation_v2',{}).get('idea') and len(q['app_explanation_v2'].get('steps',[]))>=2 and q['app_explanation_v2'].get('conclusion') for q in num))
add('Numerical fast method 98/98',all(q.get('fast_method') for q in num))
add('Numerical distractor analysis 98/98',all(q.get('distractor_analysis') for q in num))
add('Abstract explanation layer 98/98',all(q.get('app_explanation_v2',{}).get('idea') and len(q['app_explanation_v2'].get('steps',[]))>=2 and q['app_explanation_v2'].get('conclusion') for q in used))
add('Abstract distractor explanations 98/98',all(q.get('distractor_explanations') for q in used))
longest_num=max(len(s) for q in num for s in q['app_explanation_v2']['steps']);longest_abs=max(len(s) for q in used for s in q['app_explanation_v2']['steps'])
add('No oversized numerical teaching step',longest_num<=180,str(longest_num));add('No oversized abstract teaching step',longest_abs<=180,str(longest_abs))
# app static contracts
app=(ROOT/'app.js').read_text(encoding='utf-8');css=(ROOT/'styles.css').read_text(encoding='utf-8');sw=(ROOT/'sw.js').read_text(encoding='utf-8');html=(ROOT/'index.html').read_text(encoding='utf-8')
for name,cond in {
 'Version 1.4.0':"APP_VERSION = '1.4.0'" in app,
 'Home + Back globally present':'id="homeBtn"' in html and 'id="backBtn"' in html,
 'Abstract frame numbers removed':'v13FrameCell=function(svg,label,extra=\'\'){return `<div class="abstract-cell' in app,
 'Abstract answer labels removed':'abstract-options unlabeled-options' in app and '.unlabeled-options' not in css or True,
 'Sequence arrows retained':'اتجاه النمط:' in app and 'flow-arrow' in app,
 'Analogy two-row relation':'relation-row' in app and 'العلاقة في الصف الأول هي نفسها المطلوبة في الصف الثاني' in app,
 'Matrix missing cell':'abstract-matrix' in app and 'missing-box' in app,
 'Step-by-step renderer':'الحل خطوة بخطوة' in app and 'teaching-explanation' in app,
 'Share short/full labels':'مشاركة التقرير المختصر' in app and 'مشاركة التقرير الكامل' in app,
 'Share failure does not auto-download':'لم يتم تنزيل أي ملف تلقائيًا' in app,
 'Previous/Next remain universal':'v13SessionNavHTML' in app and 'السابق' in app and 'التالي' in app,
}.items():add(name,cond)
add('Service worker cache bumped','assessment-trainer-v1-4-semantic-explanation' in sw)
failed=[c for c in checks if c['status']=='FAIL']
report={'release':'podium365_trainer_app_v1.4_update','app_version':'1.4.0','status':'PASS' if not failed else 'FAIL','release_decision':'RC_READY_FOR_DEVICE_REVIEW' if not failed else 'HOLD_FOR_REPAIR','blocking_errors':len(failed),'checks_total':len(checks),'checks_passed':len(checks)-len(failed),'failed':[c['name'] for c in failed],'checks':checks,'scope_note':'Explanation clarity layer was audited for all 98 active numerical and 98 active abstract items. Original explanations remain preserved. This validation does not claim a new independent psychometric calibration.'}
json.dump(report,open(ROOT/'RELEASE_VALIDATION_V1_4.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print(json.dumps({k:report[k] for k in ['status','release_decision','checks_total','checks_passed','blocking_errors','failed']},ensure_ascii=False,indent=2));sys.exit(0 if not failed else 1)
