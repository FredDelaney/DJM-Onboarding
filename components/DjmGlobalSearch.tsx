'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { djmRpc } from '@/lib/djm-os';

export default function DjmGlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const timer = useRef<any>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (timer.current) window.clearTimeout(timer.current);

    timer.current = window.setTimeout(async () => {
      const q = query.trim();
      if (!q) {
        setResults([]);
        return;
      }
      try {
        setResults(await djmRpc<any[]>('djm_universal_search', {
          p_query: q,
          p_limit: 20,
        }) || []);
      } catch {
        setResults([]);
      }
    }, 180);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query, open]);

  const hrefFor = (item: any) => {
    if (item.entity_type === 'club') return `/network/clubs/${item.entity_id}`;
    if (item.entity_type === 'club_contact') return `/network/contacts/${item.entity_id}`;
    if (item.entity_type === 'signed_player') return `/admin/players/${item.entity_id}`;
    if (item.entity_type === 'recruitment_target') return `/recruitment/${item.entity_id}`;
    if (item.entity_type === 'club_need') return '/market';
    if (item.entity_type === 'deal_room') return `/market/deals/${item.entity_id}`;
    return '/djm';
  };

  return (
    <>
      <button
        type="button"
        className="djm-os-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search DJM"
      >
        <Search size={16} />
        <span>Search DJM</span>
        <kbd>⌘K</kbd>
      </button>

      {open ? (
        <div className="djm-os-search-overlay" onMouseDown={() => setOpen(false)}>
          <div className="djm-os-search-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="djm-os-search-modal-head">
              <Search size={18} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clubs, contacts, signed players, recruitment targets, needs and DJM memory…"
              />
              <button onClick={() => setOpen(false)}><X size={17} /></button>
            </div>

            <div className="djm-os-search-results">
              {query.trim() && results.length === 0 ? (
                <div className="djm-os-empty" style={{ minHeight: 110 }}>
                  <p>No DJM results yet.</p>
                </div>
              ) : null}

              {results.map((item) => (
                <Link
                  key={`${item.entity_type}-${item.entity_id}`}
                  href={hrefFor(item)}
                  onClick={() => setOpen(false)}
                  className="djm-os-search-result"
                >
                  <span className="djm-os-kicker">{String(item.entity_type).replaceAll('_', ' ')}</span>
                  <strong>{item.title}</strong>
                  <p>{item.subtitle}</p>
                  {item.detail ? <small>{item.detail}</small> : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
