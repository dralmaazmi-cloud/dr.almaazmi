const CACHE='assessment-trainer-v1-5-premium-ui';
const ASSETS=[
  './','index.html','styles.css','app.js','manifest.webmanifest',
  'icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png',
  'data/assessment_master_v1.json',
  'data/gcat-abstract-100-balanced-7sim.json',
  'data/gcat_numerical_100_selected_7mocks.json',
  'data/gcat_verbal_100_selected_7mocks.json',
  'data/personality_pq10_7_simulations_1008_ar_v9_app_ready.json',
  'data/derailers_7_simulations_420_ar_v6_app_ready.json',
  'data/leadership_sjt_master_v5_6_app_ready_double_checked.json',
  'data/guides/gcat-concepts-guide.json',
  'data/guides/podium-personality-derailers-guide.json',
  'data/guides/leadership-sjt-orientation-v2.json'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;}))));
