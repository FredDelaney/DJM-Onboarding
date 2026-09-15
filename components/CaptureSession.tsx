'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function CaptureSession({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [returnPath, setReturnPath] = useState('/tell');
  useEffect(() => {
    let active = true;
    setReturnPath(window.location.pathname + window.location.search);
    void supabase.auth.getSession().then(({data}) => { if(active) setSignedIn(Boolean(data.session)); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event,session) => setSignedIn(Boolean(session)));
    return () => { active=false; subscription.unsubscribe(); };
  }, []);
  if(signedIn === null) return <p role="status">Opening Capture...</p>;
  if(!signedIn) return <p><Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in to open your update</Link></p>;
  return children;
}
