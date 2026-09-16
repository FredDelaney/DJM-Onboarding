'use client';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function CaptureSession({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [returnPath, setReturnPath] = useState('/tell');
  useEffect(() => {
    let active = true;
    setReturnPath(window.location.pathname + window.location.search);
    void supabase.auth.getSession().then(({data}) => { if(active) setUserId(data.session?.user.id ?? null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event,session) => setUserId(session?.user.id ?? null));
    return () => { active=false; subscription.unsubscribe(); };
  }, []);
  if(userId === undefined) return <p role="status">Opening Capture...</p>;
  if(!userId) return <p><Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in to open your update</Link></p>;
  return <Fragment key={userId}>{children}</Fragment>;
}
