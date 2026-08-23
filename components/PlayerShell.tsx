'use client';
import { useEffect,useState } from 'react';
import { usePathname,useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home,MessageCircle,Activity,UserRound,LogOut } from 'lucide-react';
import Brand from './Brand';
import { supabase } from '@/lib/supabase';

export type PlayerCtx={user:any;profile:any;player:any;privateInfo:any;openRequests:any[];latestCheckin:any;loading:boolean;refresh:()=>Promise<void>};

export function usePlayerContext():PlayerCtx{
  const [state,setState]=useState<any>({user:null,profile:null,player:null,privateInfo:null,openRequests:[],latestCheckin:null,loading:true});
  const router=useRouter();
  const load=async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace('/sign-in');setState((s:any)=>({...s,loading:false}));return}
    const [{data:profile},{data:players}]=await Promise.all([
      supabase.from('profiles').select('*').eq('id',user.id).maybeSingle(),
      supabase.from('players').select('*').eq('user_id',user.id).limit(1)
    ]);
    if(profile?.role==='admin'||profile?.role==='scout'){router.replace('/admin');return}
    const player=players?.[0];
    if(!player){setState({user,profile,player:null,privateInfo:null,openRequests:[],latestCheckin:null,loading:false});return}
    const [{data:priv},{data:req},{data:checks}]=await Promise.all([
      supabase.from('player_private').select('*').eq('player_id',player.id).maybeSingle(),
      supabase.from('player_requests').select('*').eq('player_id',player.id).neq('status','completed').order('created_at',{ascending:false}),
      supabase.from('weekly_checkins').select('*').eq('player_id',player.id).order('week_start',{ascending:false}).limit(1)
    ]);
    const actionable=(req||[]).filter((r:any)=>r.status==='open'&&r.request_type!=='message'&&r.request_type!=='signal');setState({user,profile,player,privateInfo:priv,openRequests:actionable,latestCheckin:checks?.[0]||null,loading:false});
  };
  useEffect(()=>{load()},[]);
  return {...state,refresh:load};
}

export function PlayerShell({children,inboxCount=0}:{children:React.ReactNode,inboxCount?:number}){
  const path=usePathname();
  const router=useRouter();
  const nav=[['/home','Home',Home],['/inbox','Inbox',MessageCircle],['/check-in','Check-in',Activity],['/profile','Profile',UserRound]] as const;
  return <div className="screen">
    <div className="header-glass no-print"><div className="container topbar topbar-min"><Brand/><button className="icon-btn" aria-label="Sign out" onClick={async()=>{await supabase.auth.signOut();router.replace('/sign-in')}}><LogOut size={17}/></button></div></div>
    {children}
    <nav className="bottom-nav no-print" aria-label="Player navigation">
      {nav.map(([href,label,Icon])=><Link key={href} href={href} className={`nav-item ${path===href?'active':''} ${href==='/inbox'&&inboxCount?'nav-badge':''}`}><Icon size={20}/><span>{label}</span>{href==='/inbox'&&inboxCount>0&&<em/>}</Link>)}
    </nav>
  </div>
}

export function LoadingScreen(){return <div className="center"><div className="loader"/></div>}
