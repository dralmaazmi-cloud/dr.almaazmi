#!/usr/bin/env python3
import json, hashlib, re, subprocess, sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parent; DATA=ROOT/'data'; checks=[]
def add(name,ok,detail=None,blocking=True): checks.append({'name':name,'status':'PASS' if ok else 'FAIL','detail':detail,'blocking':blocking})
def sha256(p):
 h=hashlib.sha256();
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def loadj(p): return json.load(open(p,encoding='utf-8'))
# Syntax + regression
p=subprocess.run(['node','--check','app.js'],cwd=ROOT,text=True,capture_output=True); add('JavaScript syntax',p.returncode==0,(p.stderr or p.stdout).strip() or 'PASS')
p=subprocess.run(['node','qa_v1_3_logic.js'],cwd=ROOT,text=True,capture_output=True); add('v1.3 full logic regression',p.returncode==0 and '"status": "PASS"' in p.stdout,p.stdout[-1500:] if p.stdout else p.stderr[-1500:])
# JSON parse
files=['manifest.webmanifest','data/assessment_master_v1.json','data/gcat-abstract-100-balanced-7sim.json','data/gcat_numerical_100_selected_7mocks.json','data/gcat_verbal_100_selected_7mocks.json','data/personality_pq10_7_simulations_1008_ar_v9_app_ready.json','data/derailers_7_simulations_420_ar_v6_app_ready.json','data/leadership_sjt_master_v5_6_app_ready_double_checked.json','data/guides/gcat-concepts-guide.json','data/guides/podium-personality-derailers-guide.json','data/guides/leadership-sjt-orientation-v2.json']
parsed={}
for name in files:
 try: parsed[name]=loadj(ROOT/name); add('JSON valid: '+name,True)
 except Exception as e: add('JSON valid: '+name,False,str(e))
master=parsed.get('data/assessment_master_v1.json')
if master:
 src=Path('/mnt/data/assessment_master_v1.json')
 if src.exists(): add('Assessment Master byte-identical',sha256(ROOT/'data/assessment_master_v1.json')==sha256(src))
 for k,spec in master['bank_registry'].items():
  fp=DATA/spec['filename']; got=sha256(fp); add('Bank hash matches master: '+k,got==spec['sha256'],got)
  original=Path('/mnt/data')/spec['filename'];
  if original.exists(): add('Bank byte-identical to authoritative: '+k,sha256(original)==got)
 add('Canonical M1-M7',master.get('canonical_simulation_ids')==[f'M{i}' for i in range(1,8)])
# Data richness
pq=parsed.get('data/personality_pq10_7_simulations_1008_ar_v9_app_ready.json'); der=parsed.get('data/derailers_7_simulations_420_ar_v6_app_ready.json'); lead=parsed.get('data/leadership_sjt_master_v5_6_app_ready_double_checked.json'); ab=parsed.get('data/gcat-abstract-100-balanced-7sim.json')
if pq:
 qs=[q for s in pq['simulations'] for q in s['questions']]; add('PQ10 1008 explanations',len(qs)==1008 and all(q.get('training_explanation') for q in qs)); add('PQ10 eight competencies',len({q.get('measures') for q in qs})==8)
if der:
 qs=[q for s in der['simulations'] for q in s['questions']]; add('Derailers 420 explanations/guidance',len(qs)==420 and all(q.get('training_explanation') and q.get('option_guidance') for q in qs)); add('Derailers 6 source domains + 8 axes',len({q.get('source_domain') for q in qs})==6 and len({q.get('analytic_axis') for q in qs})==8)
if lead:
 sc=[q for s in lead['simulations'] for q in s['scenarios']]; opts=[o for q in sc for o in q['options']]; add('Leadership 112/448 with feedback',len(sc)==112 and len(opts)==448 and all(o.get('training_feedback') for o in opts)); add('Leadership app score 1-5',all(o.get('app_score') in range(1,6) for o in opts)); add('Leadership only intended historical score delta',[o.get('response_id') for o in opts if o.get('final_score')!=o.get('app_score')]==['S6-16-د'])
if ab:
 qs=[q for q in ab['questions'] if q.get('assignment_status')=='used']; add('Abstract 98 active all have LTR direction',len(qs)==98 and all(q.get('reading_direction')=='left_to_right' for q in qs)); add('Abstract format coverage',set(q.get('question_format') for q in qs)=={'sequence','matrix','analogy','transformation','odd_one'}); add('Matrix frame counts compatible with explicit grid',all(len(q.get('svg_inline',{}).get('frames',[])) in (3,8) for q in qs if q.get('question_format')=='matrix'))
# Static contract
app=(ROOT/'app.js').read_text(encoding='utf-8'); css=(ROOT/'styles.css').read_text(encoding='utf-8'); html=(ROOT/'index.html').read_text(encoding='utf-8'); sw=(ROOT/'sw.js').read_text(encoding='utf-8')
features={
 'App version 1.3.0':"APP_VERSION = '1.3.0'" in app,
 'Global Home + Back':'id="homeBtn"' in html and 'id="backBtn"' in html,
 'Previous + Next universal':'function v13SessionNavHTML' in app and 'السابق' in app and 'التالي' in app,
 'Abstract explicit arrows':'abstract-flow' in app and 'flow-arrow' in app and 'اتجاه النمط' in app,
 'Abstract missing box':'missing-box' in app and 'الخانة الفارغة' in app,
 'Abstract matrix 2x2/3x3':'abstract-matrix' in app and '.abstract-matrix.matrix-2' in css and '.abstract-matrix.matrix-3' in css,
 'Abstract relation layout':'abstract-relation' in app and 'relation-row' in app,
 'GCAT wrong red/correct green':'wrong-option' in app and 'correct-option' in app and '.option-btn.wrong-option' in css,
 'GCAT explicit verdict':'إجابتك غير صحيحة' in app and 'إجابتك صحيحة' in app and 'الإجابة الصحيحة' in app,
 'GCAT domain five-mode hub':all(x in app for x in ['جميع الأسئلة','جلسة سريعة','أخطائي فقط','المفضلة','حسب الموضوع']),
 'GCAT all-domain 98 source':'function v13StartGCATDomain' in app and "mode==='quick'?v12Sample(all,14):all" in app,
 'GCAT exam unchanged 20 minutes':'return 20*60*1000' in app,
 'PQ/Der measure post-answer':'ما الذي يقيسه هذا السؤال؟' in app and 'الإجابة التدريبية المرجعية' in app,
 'Leadership inline per-action review':'inline-lead-feedback' in app and 'لماذا ليست الدرجة أعلى أو أقل؟' in app,
 'Leadership diagnostic rates':'function v13LeadershipDiagnostics' in app and 'opportunities' in app and 'ما الذي تعدله' in app,
 'Confidence engine':'function v13ModuleConfidence' in app and 'ثقة' in app,
 'Universal My Answers':'function renderMyAnswers' in app and 'إجاباتي والتفسير' in app,
 'Full-run My Answers':'function renderFullAnswers' in app,
 'Readable full report export':'function v13ReportHTML' in app and 'تقرير مختصر' in app,
 'CSV and JSON answer export':'export-answers-csv' in app and 'export-answers-json' in app,
 'Share file via native share sheet':'navigator.share' in app and 'files:[file]' in app,
 'Training disclaimer exact':'تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.' in app,
 'Exam clean mode':'exam-clean' in app and '.exam-clean .mobile-nav' in css,
 'Review idea remains postponed':'راجع الفكرة' not in app,
}
for n,v in features.items(): add(n,v)
# SW
assets=[]; m=re.search(r'const ASSETS=\[(.*?)\];',sw,re.S)
if m: assets=re.findall(r"['\"]([^'\"]+)['\"]",m.group(1))
add('Service worker assets resolve',bool(assets) and all(a=='./' or (ROOT/a).exists() for a in assets)); add('Service worker v1.3 cache','assessment-trainer-v1-3' in sw)
# Icons
for name,size in [('icon-192.png',(192,192)),('icon-512.png',(512,512)),('apple-touch-icon.png',(180,180))]:
 try:add('Icon '+name,Image.open(ROOT/'icons'/name).size==size)
 except Exception as e:add('Icon '+name,False,str(e))
# Design refs
refs=['home_reference.png','orientation_reference.png','simulation_hub_reference.png','simulation_detail_reference.png','gcat_exam_reference.png','likert_training_reference.png','leadership_training_reference.png','results_reference.png']; add('Design references bundled',all((ROOT/'design_reference'/x).exists() for x in refs))
blocking=[c for c in checks if c['blocking'] and c['status']=='FAIL']; report={'release':'podium365_trainer_app_v1.3_update','app_version':'1.3.0','status':'PASS' if not blocking else 'FAIL','release_decision':'RELEASE_CANDIDATE_READY' if not blocking else 'HOLD_FOR_REPAIR','blocking_errors':len(blocking),'checks_total':len(checks),'checks_passed':sum(c['status']=='PASS' for c in checks),'failed':[c['name'] for c in blocking],'checks':checks,'scientific_scope':'تحليلات PQ10 وDerailers وLeadership تدريبية مستنتجة من البنوك المزودة وليست تشخيصًا نفسيًا معياريًا. مستوى الثقة يصف اتساق وكفاية البيانات ولا يعني الصدق أو الكذب.','postponed_feature':'راجع الفكرة — مؤجل حتى اكتمال تغطية ملفات Orientation.'}
json.dump(report,open(ROOT/'QA_REPORT_V1_3.json','w',encoding='utf-8'),ensure_ascii=False,indent=2);print(json.dumps({k:report[k] for k in ['status','release_decision','checks_total','checks_passed','blocking_errors','failed']},ensure_ascii=False,indent=2));sys.exit(0 if not blocking else 1)
