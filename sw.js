// Service worker för STRAFFSPARK: visar push-notiser när spelet är stängt.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("push",e=>{
  let j={};try{j=e.data?e.data.json():{}}catch(x){}
  const d=j.data||j.notification||j;
  e.waitUntil(self.registration.showNotification(d.title||"STRAFFSPARK",{
    body:d.body||"DIN TUR ATT SPELA",
    icon:"icon-192.png",
    tag:d.tag||"turn",
    renotify:true,
    data:{hash:d.hash||""}
  }));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const h=(e.notification.data&&e.notification.data.hash)||"";
  const url=self.registration.scope+(h?"#"+h:"");
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{
    for(const c of cs){if(c.url.startsWith(self.registration.scope)&&"focus"in c){c.navigate(url).catch(()=>{});return c.focus()}}
    return self.clients.openWindow(url);
  }));
});
