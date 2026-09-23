'use client';

import { useEffect } from 'react';

import { trackFunnel } from '@/lib/redream-funnel';

const sections = [
  ['try-redream', 'experience'],
  ['operating-spine', 'operating_spine'],
  ['product', 'product'],
  ['autopilot', 'autopilot'],
  ['pricing', 'pricing'],
  ['final-cta', 'final_cta'],
] as const;

export default function ReDreamFunnelTracker() {
  useEffect(() => {
    trackFunnel('page_view');

    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.28) continue;
          const key = entry.target.getAttribute('data-funnel-section');
          if (!key || seen.has(key)) continue;
          seen.add(key);
          trackFunnel('section_view', { section_key: key });
        }
      },
      { threshold: [0.28] },
    );

    for (const [id, key] of sections) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.setAttribute('data-funnel-section', key);
      observer.observe(element);
    }

    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cta = target.closest<HTMLElement>('[data-funnel-cta]');
      const key = cta?.dataset.funnelCta?.trim();
      if (key) trackFunnel('cta_click', { cta_key: key });
    };

    document.addEventListener('click', click);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', click);
    };
  }, []);

  return null;
}
