'use client';
import {useEffect,useMemo,useState} from 'react';
import {Bell,Check,Download,Share2,Smartphone} from 'lucide-react';
import {supabase} from '@/lib/supabase';

function urlBase64ToUint8Array(base64String:string){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}

export default function AppExperience({userId,mode='player'}:{userId:string,mode?:'player'|'admin'}){
  const [standalone,setStandalone]=useState(false);
  const [ios,setIos]=useState(false);
  const [prompt,setPrompt]=useState<any>(null);
  const [pushState,setPushState]=useState<'hidden'|'ready'|'enabled'|'denied'|'busy'>('hidden');
  const [toast,setToast]=useState('');
  const vapid=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BOWVR8ZWS-jwRCaDXdU6SnWS_iGCzZoBBBAt9Rl9yedmxS05rYpHbi5OuiXwo07lgjtS3knjG8rUsHAfY490sfs';

  useEffect(()=>{
    const nav:any=navigator;
    const isStandalone=window.matchMedia('(display-mode: standalone)').matches||Boolean(nav.standalone);
    const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    setStandalone(isStandalone);setIos(isiOS);
    if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}
    const onPrompt=(e:any)=>{e.preventDefault();setPrompt(e)};
    window.addEventListener('beforeinstallprompt',onPrompt);
    if(vapid&&'Notification' in window&&'serviceWorker' in navigator){
      if(Notification.permission==='denied')setPushState('denied');
      else navigator.serviceWorker.ready.then(async reg=>{
        const existing=await reg.pushManager.getSubscription();setPushState(existing?'enabled':'ready');
      }).catch(()=>setPushState('hidden'));
    }
    return()=>window.removeEventListener('beforeinstallprompt',onPrompt);
  },[vapid]);

  const install=async()=>{
    if(prompt){await prompt.prompt();await prompt.userChoice;setPrompt(null);setStandalone(true);return}
    if(ios){setToast('On iPhone: tap Share, then Add to Home Screen.');setTimeout(()=>setToast(''),4500)}
  };

  const enablePush=async()=>{
    if(!vapid||pushState==='busy')return;setPushState('busy');
    try{
      const permission=await Notification.requestPermission();if(permission!=='granted'){setPushState(permission==='denied'?'denied':'ready');return}
      const reg=await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(vapid)});
      const json:any=sub.toJSON();
      const {error}=await supabase.from('push_subscriptions').upsert({user_id:userId,endpoint:sub.endpoint,p256dh:json.keys?.p256dh,auth_secret:json.keys?.auth,platform:/iphone|ipad|ipod/i.test(navigator.userAgent)?'ios':'web',device_label:navigator.platform||null,enabled:true},{onConflict:'endpoint'});
      if(error)throw error;
      await supabase.from('notification_preferences').upsert({user_id:userId});
      setPushState('enabled');setToast('Notifications enabled');setTimeout(()=>setToast(''),1800);
    }catch{setPushState('ready');setToast('Could not enable notifications yet');setTimeout(()=>setToast(''),2200)}
  };

  if(standalone&&pushState==='hidden')return null;
  return <section className="card pad app-experience">
    <div className="section-kicker">{mode==='admin'?'DJM ADMIN APP':'DJM PLAYER APP'}</div>
    {!standalone&&<div className="app-setting-row"><div className="list-icon"><Smartphone size={18}/></div><div className="list-copy"><strong>{mode==='admin'?'Keep DJM Admin on your phone':'Keep DJM Player on your phone'}</strong><span>Open it like an app, without hunting for the link.</span></div><button className="btn btn-quiet btn-sm" onClick={install}>{prompt?<><Download size={14}/> Install</>:ios?<><Share2 size={14}/> How</>:<><Download size={14}/> Install</>}</button></div>}
    {standalone&&<div className="app-setting-row"><div className="list-icon"><Check size={18}/></div><div className="list-copy"><strong>Installed</strong><span>DJM Player is running as a standalone app.</span></div></div>}
    {pushState!=='hidden'&&<div className="app-setting-row"><div className="list-icon"><Bell size={18}/></div><div className="list-copy"><strong>DJM notifications</strong><span>{pushState==='enabled'?'This device can receive DJM alerts.':pushState==='denied'?'Notifications are blocked in your device settings.':mode==='admin'?'Get notified when a player messages DJM or a check-in needs attention.':'Get notified when DJM needs something from you.'}</span></div>{pushState==='enabled'?<span className="pill pill-green">On</span>:pushState!=='denied'&&<button className="btn btn-quiet btn-sm" onClick={enablePush} disabled={pushState==='busy'}>{pushState==='busy'?'Enabling…':'Enable'}</button>}</div>}
    {toast&&<div className="toast">{toast}</div>}
  </section>
}
