const CACHE='liftlog-training-v27';
const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
const SHELL=['/','/index.html','/config.js','/device-store.js','/mobile-logger.js','/insights.js','/progress.js','/icons/touch-180.png','/icons/lift-192.png','/icons/lift-512.png','/manifest.webmanifest','/barbell.svg','/barbell-scene.js','/icon.svg','/training.js','/training.css','/interface-effects.js','/sessions.js','/sync.js','/substitutions.js','/schedule.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.all([cache.addAll(SHELL),cache.add(SDK).catch(()=>{})])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('liftlog-training-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  const shell=url.origin===location.origin && (SHELL.includes(url.pathname)||event.request.mode==='navigate');
  if(event.request.method!=='GET'||(!shell&&url.href!==SDK))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=event.request.mode==='navigate'?'/index.html':url.href===SDK?SDK:url.pathname;
    const cached=await cache.match(key);
    if(cached)return cached;
    const response=await fetch(event.request);
    if(response.ok)await cache.put(key,response.clone());
    return response;
  })());
});
