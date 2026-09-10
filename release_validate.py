#!/usr/bin/env python3
import json, hashlib, os, re, subprocess, sys
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'data'
checks=[]

def add(name, ok, detail=None, blocking=True):
    checks.append({'name':name,'status':'PASS' if ok else 'FAIL','detail':detail,'blocking':blocking})

def sha256(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def loadj(p):
    with open(p,encoding='utf-8') as f:return json.load(f)

# Syntax and dynamic logic tests
p=subprocess.run(['node','--check','app.js'],cwd=ROOT,text=True,capture_output=True)
add('JavaScript syntax',p.returncode==0,(p.stderr or p.stdout).strip() or 'node --check PASS')
p=subprocess.run(['node','qa_v1_2_logic.js'],cwd=ROOT,text=True,capture_output=True)
logic_ok=p.returncode==0 and '"status": "PASS"' in p.stdout
add('v1.2 logic regression',logic_ok,p.stdout.strip()[-1200:] if p.stdout else p.stderr.strip())

# JSON parse
json_files=[ROOT/'manifest.webmanifest',DATA/'assessment_master_v1.json',
 DATA/'gcat-abstract-100-balanced-7sim.json',DATA/'gcat_numerical_100_selected_7mocks.json',DATA/'gcat_verbal_100_selected_7mocks.json',
 DATA/'personality_pq10_7_simulations_1008_ar_v9_app_ready.json',DATA/'derailers_7_simulations_420_ar_v6_app_ready.json',
 DATA/'leadership_sjt_master_v5_6_app_ready_double_checked.json',
 DATA/'guides/gcat-concepts-guide.json',DATA/'guides/podium-personality-derailers-guide.json',DATA/'guides/leadership-sjt-orientation-v2.json']
parsed={}
for fp in json_files:
    try: parsed[str(fp.relative_to(ROOT))]=loadj(fp); add(f'JSON valid: {fp.relative_to(ROOT)}',True)
    except Exception as e: add(f'JSON valid: {fp.relative_to(ROOT)}',False,str(e))

master=parsed.get('data/assessment_master_v1.json')
if master:
    # Verify master itself unchanged from authoritative source if present
    src=Path('/mnt/data/assessment_master_v1.json')
    if src.exists(): add('Assessment Master unchanged',sha256(DATA/src.name)==sha256(src),sha256(DATA/src.name))
    # Bank SHA against master + external authoritative files if present
    for k,spec in master['bank_registry'].items():
        fp=DATA/spec['filename']; got=sha256(fp); exp=spec['sha256']
        add(f'Bank SHA matches master: {k}',got==exp,f'{got}')
        original=Path('/mnt/data')/spec['filename']
        if original.exists(): add(f'Bundled bank byte-identical to authoritative: {k}',sha256(original)==got)
    add('Master canonical simulations M1-M7',master.get('canonical_simulation_ids')==[f'M{i}' for i in range(1,8)])
    flow_ok=True; flow=[]
    for s in master.get('simulations',[]):
        e=s.get('expected_user_flow_counts',{})
        ok=(e.get('gcat_questions')==42 and e.get('pq10_items')==144 and e.get('derailers_items')==60 and e.get('leadership_scenarios')==16 and e.get('leadership_action_ratings')==64)
        flow_ok &= ok; flow.append([s.get('master_simulation_id'),e])
    add('Per-simulation flow counts 42/144/60/16/64',flow_ok)

# Bank detailed readiness
pq=parsed.get('data/personality_pq10_7_simulations_1008_ar_v9_app_ready.json')
if pq:
    qs=[q for s in pq['simulations'] for q in s['questions']]
    comps={q.get('measures') for q in qs}
    add('PQ10 records 1008',len(qs)==1008)
    add('PQ10 training explanation on every record',sum(bool(q.get('training_explanation')) for q in qs)==1008)
    add('PQ10 eight competencies',len(comps)==8,sorted(comps))

der=parsed.get('data/derailers_7_simulations_420_ar_v6_app_ready.json')
if der:
    qs=[q for s in der['simulations'] for q in s['questions']]
    add('Derailers records 420',len(qs)==420)
    add('Derailers training explanation on every record',sum(bool(q.get('training_explanation')) for q in qs)==420)
    add('Derailers option guidance on every record',sum(bool(q.get('option_guidance')) for q in qs)==420)
    add('Derailers primary six domains',len({q.get('source_domain') for q in qs})==6)
    add('Derailers eight analytic axes',len({q.get('analytic_axis') for q in qs})==8)

lead=parsed.get('data/leadership_sjt_master_v5_6_app_ready_double_checked.json')
if lead:
    sc=[q for s in lead['simulations'] for q in s['scenarios']]
    opts=[o for q in sc for o in q['options']]
    add('Leadership 112 scenarios',len(sc)==112)
    add('Leadership 448 independently rated actions',len(opts)==448 and all(o.get('app_score') in range(1,6) for o in opts))
    add('Leadership app_training on every scenario',sum(bool(q.get('app_training')) for q in sc)==112)
    add('Leadership training_feedback on every action',sum(bool(o.get('training_feedback')) for o in opts)==448)
    diffs=[o.get('response_id') for o in opts if o.get('final_score')!=o.get('app_score')]
    add('Leadership intended final_score/app_score delta only',diffs==['S6-16-د'],diffs)

# Manifest and SW
manifest=parsed.get('manifest.webmanifest')
if manifest:
    add('PWA manifest name updated',manifest.get('name')=='منصة التدريب والمحاكاة')
    add('PWA standalone display',manifest.get('display')=='standalone')
    add('PWA RTL Arabic',manifest.get('lang')=='ar' and manifest.get('dir')=='rtl')
    add('PWA production palette',manifest.get('theme_color')=='#a97e34' and manifest.get('background_color')=='#f6f1e8')

sw=(ROOT/'sw.js').read_text(encoding='utf-8')
asset_section=re.search(r'const ASSETS=\[(.*?)\];',sw,re.S)
assets=[]
if asset_section: assets=re.findall(r"['\"]([^'\"]+)['\"]",asset_section.group(1))
missing=[]
for a in assets:
    if a=='./': continue
    if not (ROOT/a).exists(): missing.append(a)
add('Service-worker cache list resolves',bool(assets) and not missing,{'asset_count':len(assets),'missing':missing})
add('Service-worker includes three orientation guides',all('data/guides/'+x in assets for x in ['gcat-concepts-guide.json','podium-personality-derailers-guide.json','leadership-sjt-orientation-v2.json']))
add('Service-worker cache bumped to v1.2','assessment-trainer-v1-2-navigation-gcat' in sw)

# Icons
for name,size in [('icon-192.png',(192,192)),('icon-512.png',(512,512)),('apple-touch-icon.png',(180,180))]:
    fp=ROOT/'icons'/name
    try: dims=Image.open(fp).size; add(f'Icon dimensions {name}',dims==size,str(dims))
    except Exception as e: add(f'Icon dimensions {name}',False,str(e))

# Feature contract static checks
app=(ROOT/'app.js').read_text(encoding='utf-8')
css=(ROOT/'styles.css').read_text(encoding='utf-8')
html=(ROOT/'index.html').read_text(encoding='utf-8')
features={
 'App version 1.2.0': "APP_VERSION = '1.2.0'" in app,
 'Red training disclaimer exact wording': "تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية." in app and '.training-disclaimer' in css and '#b22232' in css,
 'Orientation hub': 'function renderOrientationHub' in app and 'دليل فهم الأسئلة والامتحان' in app,
 'Quick review 1-2 minutes': 'مراجعة سريعة قبل الامتحان' in app and '1–2 دقيقة' in app,
 'Smart PWA install': 'beforeinstallprompt' in app and 'function installApp' in app and 'إضافة إلى الشاشة الرئيسية' in app,
 'Five-circle rating UI': 'function likertCirclesHTML' in app and 'function leadershipCirclesHTML' in app and '.rating-circle' in css,
 'Rating touch targets >=44 CSS hardening': 'min-width:44px' in css and 'min-height:44px' in css,
 'Measure shown after answer': 'ما الذي يقيسه هذا السؤال؟' in app,
 'Leadership four-option detailed feedback': 'لماذا ليست أعلى أو أقل؟' in app and 'training_feedback' in app,
 'Reference-answer terminology for PQ10/Derailers': 'الإجابة التدريبية المرجعية' in app and 'مدى التوافق مع النموذج التدريبي' in app,
 'Exam clean mode': 'exam-clean' in app and '.exam-clean .mobile-nav' in css,
 'Home confirmation during session': 'هل تريد حفظ المحاولة والعودة إلى الصفحة الرئيسية؟' in app,
 'Result filters': 'آخر محاولة' in app and 'أفضل محاولة' in app and 'التطور عبر الوقت' in app,
 'Local data export': 'function exportData' in app and 'تصدير بياناتي' in app,
 'Local data clear': 'مسح بياناتي' in app,
 'Three-screen onboarding': "renderOnboarding" in app and '1 من 3' not in app, # dynamic step+1 of 3 expected
 'Advanced profile engine': 'function profileReportData' in app and 'function confidenceAnalysis' in app and 'function synthesizeProfile' in app,
 'Confidence high/medium/low': "'مرتفعة'" in app and "'متوسطة'" in app and "'منخفضة'" in app,
 'No dishonesty accusation': 'لا تعني أن المستخدم غير صادق' in app,
 'Leadership diagnostics': 'function leadershipDiagnostics' in app and 'تميل إلى رفع تقييم الإجراءات الشكلية' in app,
 'Review-idea link intentionally postponed': 'راجع الفكرة' not in app,
 'Home icon globally present': 'id="homeBtn"' in html and 'aria-label="الصفحة الرئيسية"' in html,
 'Back icon globally present': 'id="backBtn"' in html and 'aria-label="الرجوع إلى الصفحة السابقة"' in html,
 'Back preserves active session': 'هل تريد حفظ المحاولة والعودة إلى الصفحة السابقة؟' in app and 'function goBack' in app,
 'GCAT training icon hub': 'function renderGCATTrainingHub' in app and 'تدريب مختلط عشوائي' in app and 'العددي فقط' in app and 'اللفظي فقط' in app and 'التجريدي فقط' in app,
 'GCAT random balanced mode': "kind==='mixed'" in app and "14),...v12Sample(allGCATEntries('verbal'),14)" in app,
 'GCAT training topic picker': 'function renderGCATTopicPicker' in app,
 'GCAT training by simulation icon grid': 'function renderGCATSimulationTraining' in app and 'gcat-sim-icon-grid' in css,
}
for n,ok in features.items(): add(n,ok)

# First-use exact three slides by inspecting slides literals
slides=re.search(r'const slides=\[(.*?)\];',app,re.S)
add('Onboarding contains exactly three slides',bool(slides) and slides.group(1).count("{icon:")==3)

# Design reference set
refs=['home_reference.png','orientation_reference.png','simulation_hub_reference.png','simulation_detail_reference.png','gcat_exam_reference.png','likert_training_reference.png','leadership_training_reference.png','results_reference.png']
add('Eight design-reference mockups bundled',all((ROOT/'design_reference'/x).exists() for x in refs),[x for x in refs if not (ROOT/'design_reference'/x).exists()])

# Source/examples optional refs from user screenshots
src_examples=ROOT/'design_reference/source_examples'
add('Source screenshot examples retained',src_examples.exists() and len(list(src_examples.glob('*.png')))>=5,{'count':len(list(src_examples.glob('*.png'))) if src_examples.exists() else 0},blocking=False)

# Scientific safety/copy
add('No cross-section composite promoted','cross_section_composite_score' not in app or 'disabled' in json.dumps(master.get('scoring_and_reporting_policy',{})) if master else True,blocking=False)
add('Training scope disclaimer in UI','للتدريب والتطوير الذاتي' in html and 'لا يُستخدم كاختبار معياري' in html)

blocking_failed=[c for c in checks if c['blocking'] and c['status']=='FAIL']
nonblocking_failed=[c for c in checks if not c['blocking'] and c['status']=='FAIL']
report={
 'release':'podium365_trainer_app_v1.2_update',
 'app_version':'1.2.0',
 'status':'PASS' if not blocking_failed else 'FAIL',
 'release_decision':'RELEASE_CANDIDATE_READY' if not blocking_failed else 'HOLD_FOR_REPAIR',
 'blocking_errors':len(blocking_failed),
 'nonblocking_notes_failed':len(nonblocking_failed),
 'checks_total':len(checks),
 'checks_passed':sum(c['status']=='PASS' for c in checks),
 'checks':checks,
 'visual_qa':{
   'design_reference_set':'bundled',
   'static_render_snapshots':'qa_screenshots/ (supporting only)',
   'limitation':'The local environment blocks reliable Chromium localhost visual navigation. Static renders were used as supporting inspection, but they are not pixel-accurate because the renderer lacks parts of modern CSS. Repeat live-browser screenshot comparison after deployment/on a real iPhone and desktop browser.',
   'blocking':False
 },
 'scientific_scope':'PQ10, Derailers, and Leadership outputs are training/self-development interpretations from the supplied keyed banks. The profile/confidence engine is not a normed psychometric diagnosis and does not infer dishonesty.',
 'postponed_feature':'راجع الفكرة — intentionally not implemented until orientation coverage is complete.'
}
with open(ROOT/'QA_REPORT_V1_2.json','w',encoding='utf-8') as f: json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps({'status':report['status'],'release_decision':report['release_decision'],'checks_total':report['checks_total'],'checks_passed':report['checks_passed'],'blocking_errors':report['blocking_errors'],'failed':[c['name'] for c in blocking_failed]},ensure_ascii=False,indent=2))
sys.exit(0 if not blocking_failed else 1)
