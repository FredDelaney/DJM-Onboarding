'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PublicProfile from '@/components/PublicProfile';
import JourneyStatus from '@/components/JourneyStatus';
import { supabase } from '@/lib/supabase';
import { readWithDeadline } from '@/lib/read-with-deadline';

export default function PublicPlayerProfilePage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const [data, setData] = useState<any>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setData(undefined);
    setFailed(false);
    if (!slug) {
      setData(null);
      return;
    }
    void (async () => {
      try {
        const { data: response, error } = await readWithDeadline(
          supabase.functions.invoke('player-profile-public', { body: { slug } }),
        );
        if (error || response?.error || !response ||
            !Object.prototype.hasOwnProperty.call(response, 'data') ||
            (response.data !== null && !response.data?.profile)) {
          throw new Error('Unable to load the public profile');
        }
        if (active) setData(response.data);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; };
  }, [slug, attempt]);

  if (failed) {
    return <div className="center"><JourneyStatus kind="error"
      title="We could not load this profile."
      description="Please try again. A failed request does not mean the link is unavailable."
      onRetry={() => setAttempt(value => value + 1)} /></div>;
  }
  if (data === undefined) {
    return <div className="center"><JourneyStatus kind="loading"
      title="Loading player profile."
      description="Getting the information approved for this link." /></div>;
  }
  if (!data?.profile) {
    return <div className="center"><div className="card pad-lg" style={{ textAlign: 'center' }}>
      <h2>Profile unavailable.</h2>
      <p className="muted">This Player Profile is not currently published.</p>
    </div></div>;
  }
  return <PublicProfile profile={data.profile} agency={data.agency} />;
}
