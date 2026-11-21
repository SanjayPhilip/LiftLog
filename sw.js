const CACHE='liftlog-training-v22';
const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
const SHELL=['/','/index.html','/config.js','/manifest.webmanifest','/barbell.svg','/icon.svg','/training.js','/training.css','/sessions.js','/sync.js','/substitutions.js','/schedule.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.all([cache.addAll(SHELL),cache.add(SDK).catch(()=>{})])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('liftlog-training-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||(url.origin!==location.origin&&url.href!==SDK))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&(SHELL.includes(url.pathname)||url.href===SDK)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async()=>{
    const cached=await caches.match(event.request);if(cached)return cached;
    if(event.request.mode==='navigate')return (await caches.match('/index.html'))||Response.error();
    return Response.error();
  }));
});
