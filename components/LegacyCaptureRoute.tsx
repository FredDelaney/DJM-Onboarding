'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { platformRpc } from '@/lib/platform-client';
import AiFullPage from './AiFullPage';

export default function LegacyCaptureRoute() {
  const params = useSearchParams();
  const router = useRouter();
  const captureId = params.get('capture');
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    if (!captureId) return;
    let active = true;
    const requested = params.get('workspace');
    void platformRpc<string>('redream_ai_capture_workspace', { p_capture_id: captureId }, requested)
      .then((slug) => {
        if (active) router.replace(`/workspace/${encodeURIComponent(slug)}/capture?capture=${encodeURIComponent(captureId)}`);
      })
      .catch(() => { if (active) setError('This update is not available to this account.'); });
    return () => { active = false; };
  }, [captureId, params, router]);
  if (captureId) return <p role="status">{error || 'Opening your update...'}</p>;
  return <AiFullPage />;
}
