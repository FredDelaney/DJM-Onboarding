'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

export default function TenantRuntimeUnavailable() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(() => {
    if (retrying) return;

    setRetrying(true);
    router.refresh();

    window.setTimeout(() => {
      setRetrying(false);
    }, 1800);
  }, [retrying, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      retry();
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [retry]);

  return (
    <section
      className="tenant-unresolved-card tenant-unavailable-card"
      aria-labelledby="tenant-unavailable-title"
    >
      <p className="tenant-unresolved-eyebrow">
        Temporary service interruption
      </p>

      <h1 id="tenant-unavailable-title">
        Workspace temporarily unavailable
      </h1>

      <p>
        We could not reach the workspace service. Your workspace and access
        settings have not been changed.
      </p>

      <p className="tenant-unresolved-help">
        We will retry automatically. You can also try again now.
      </p>

      <button
        type="button"
        className="tenant-unavailable-retry"
        onClick={retry}
        disabled={retrying}
      >
        <RefreshCw
          size={16}
          className={retrying ? 'is-spinning' : undefined}
        />
        {retrying ? 'Retrying…' : 'Retry now'}
      </button>
    </section>
  );
}
