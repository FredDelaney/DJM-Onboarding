'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PublicProfile from '@/components/PublicProfile';
import JourneyStatus from '@/components/JourneyStatus';
import { supabase } from '@/lib/supabase';
import { readWithDeadline } from '@/lib/read-with-deadline';

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;
  const [data, setData] = useState<any>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setData(undefined);
    setFailed(false);
    if (!token) {
      setData(null);
      return;
    }
    void (async () => {
      try {
        const { data: response, error } = await readWithDeadline(
          supabase.functions.invoke('club-share-public', { body: { token } }),
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
  }, [token, attempt]);

  if (failed) {
    return <div className="center"><JourneyStatus kind="error"
      title="We could not load this club link."
      description="Please try again. A failed request does not mean the link is unavailable."
      onRetry={() => setAttempt(value => value + 1)} /></div>;
  }
  if (data === undefined) {
    return <div className="center"><JourneyStatus kind="loading"
      title="Loading club link."
      description="Getting the information approved for this link." /></div>;
  }
  if (!data?.profile) {
    return <div className="center"><div className="card pad-lg" style={{ textAlign: 'center' }}>
      <h2>This club link is unavailable.</h2>
      <p className="muted">It may have expired or been withdrawn by the representing agency.</p>
    </div></div>;
  }
  return <PublicProfile profile={data.profile} agency={data.agency}
    documents={data.documents || []} shareToken={token}
    pitchMessage={data.pitch_message} targetClub={data.target_club} />;
}
