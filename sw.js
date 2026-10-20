const CACHE='skorskal-omr-v5';
const FILES=['./index.html','./style.css?v=20261020-keys2','./app.js?v=20261020-keys2','./vision.js','./workbook.js','./template.json','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/sheet-preview.png','./Skorskal_A4_OMR_40.pdf'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('skorskal-omr-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const isCode=event.request.mode==='navigate'||/\.(?:js|css|html)$/i.test(url.pathname);
  if(isCode){
    event.respondWith(fetch(new Request(event.request,{cache:'no-store'})).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
      return response;
    }).catch(()=>caches.match(event.request)));
  }else{
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
      return response;
    })));
  }
});
