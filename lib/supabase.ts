'use client';
import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xogoigaaskmuspiehkba.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_6hsUuNGMGMxecHXNv2xtiw_GIwRJJsU';
export const supabase = createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export const publicFile = (bucket:string,path?:string|null) => path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : '';
export const fmtDate = (d?:string|null) => d ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d)) : '—';
export const weekStartISO = () => { const d=new Date(); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); };
