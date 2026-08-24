'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import Brand from './Brand';
import { supabase } from '@/lib/supabase';
export function useAdmin(){
 const [state,setState]=useState<any>({user:null,profile:null,loading:true});const router=useRouter();
 useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/sign-in');return}const {data:profile}=await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();if(!profile||!['admin','scout'].includes(profile.role)){router.replace('/home');return}setState({user,profile,loading:false})})()},[]);return state;
}
export function AdminShell({children}:{children:React.ReactNode}){const router=useRouter();return <div className="admin-shell"><div className="admin-head"><div className="container admin-top"><Brand/><div className="row"><span className="pill pill-dark">DJM ADMIN</span><button className="icon-btn" onClick={async()=>{await supabase.auth.signOut();router.replace('/sign-in')}}><LogOut size={17}/></button></div></div></div>{children}</div>}
