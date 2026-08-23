self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text()||''}}
  const title=data.title||'DJM Player';
  const options={
    body:data.body||'DJM has an update for you.',
    icon:'/icon-192.png',
    badge:'/icon-192.png',
    tag:data.tag||'djm-player',
    data:{url:data.url||'/inbox'},
    renotify:Boolean(data.renotify)
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'/inbox',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if(client.url===url&&'focus' in client)return client.focus()}
    return self.clients.openWindow?self.clients.openWindow(url):undefined;
  }));
});
