'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import PublicProfile from '@/components/PublicProfile';
import { supabase } from '@/lib/supabase';

export default function PublicPlayerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    let active = true;

    void supabase.functions
      .invoke('player-profile-public', {
        body: { slug },
      })
      .then(({ data: response, error }) => {
        if (!active) return;
        if (error) {
          setData(null);
          return;
        }
        setData(response?.data || null);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (data === undefined) {
    return (
      <div className="center">
        <div className="loader" />
      </div>
    );
  }

  if (!data?.profile) {
    return (
      <div className="center">
        <div className="card pad-lg" style={{ textAlign: 'center' }}>
          <h2>Profile unavailable.</h2>
          <p className="muted">
            This Player Profile is not currently published.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PublicProfile
      profile={data.profile}
      agency={data.agency}
    />
  );
}
