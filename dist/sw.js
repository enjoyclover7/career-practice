const CACHE='career-practice-e8bca087c21c';
const SHELL=['./','./index.html','./app.js','./cloud.js','./progress.js','./learning.js','./styles.css','./data.json','./config.json','./favicon.svg','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('career-practice-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never intercept Supabase, credentials, or other third-party requests.
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const isShell=SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname);
  if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(cache=>cache.match(new URL('./index.html',self.registration.scope))).then(saved=>saved||fetch(event.request)));
  else if(isShell)event.respondWith(caches.open(CACHE).then(async cache=>{const saved=await cache.match(event.request,{ignoreSearch:true});if(saved)return saved;const fresh=await fetch(event.request);if(fresh.ok)await cache.put(event.request,fresh.clone());return fresh;}));
});
