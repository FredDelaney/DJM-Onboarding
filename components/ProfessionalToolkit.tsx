'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  ShieldCheck,
  Target,
} from 'lucide-react';

import {
  CAREER_PLAYBOOKS,
  type CareerPlaybook,
} from '@/lib/player-career';

type PublishedResource = {
  id?: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  url?: string | null;
  featured?: boolean;
};

const categories = [
  'All',
  'Perform',
  'Prepare',
  'Move',
  'Protect',
  'Communicate',
] as const;

const safeResourceHref = (value?: string | null) => {
  if (!value) return null;
  if (value.startsWith('/')) return value;

  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

function PlaybookCard({
  playbook,
  recommended,
}: {
  playbook: CareerPlaybook;
  recommended: boolean;
}) {
  const [open, setOpen] = useState(recommended);

  return (
    <article
      className={`toolkit-playbook ${
        recommended ? 'is-recommended' : ''
      } ${open ? 'is-open' : ''}`}
    >
      <button
        type="button"
        className="toolkit-playbook-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="toolkit-playbook-icon">
          {playbook.category === 'Protect' ? (
            <ShieldCheck size={18} />
          ) : playbook.category === 'Perform' ? (
            <Target size={18} />
          ) : (
            <BookOpen size={18} />
          )}
        </span>

        <span className="toolkit-playbook-copy">
          <span className="toolkit-playbook-meta">
            {recommended && <em>Recommended</em>}
            <span>{playbook.category}</span>
            <span>
              <Clock3 size={12} />
              {playbook.minutes} min
            </span>
          </span>
          <strong>{playbook.title}</strong>
          <small>{playbook.description}</small>
        </span>

        <ChevronDown
          size={18}
          className="toolkit-playbook-chevron"
        />
      </button>

      {open && (
        <div className="toolkit-playbook-body">
          <div className="toolkit-outcome">
            <span>YOU WILL LEAVE WITH</span>
            <strong>{playbook.outcome}</strong>
          </div>

          <ol className="toolkit-steps">
            {playbook.steps.map((step) => (
              <li key={step.title}>
                <span>
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          {playbook.note && (
            <p className="toolkit-note">
              <ShieldCheck size={15} />
              {playbook.note}
            </p>
          )}

          <Link
            href={playbook.action.href}
            className="btn btn-navy toolkit-action"
          >
            {playbook.action.label}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </article>
  );
}

export default function ProfessionalToolkit({
  recommendedId,
  publishedResources = [],
}: {
  recommendedId: string;
  publishedResources?: PublishedResource[];
}) {
  const [category, setCategory] =
    useState<(typeof categories)[number]>('All');

  const playbooks = useMemo(() => {
    const filtered =
      category === 'All'
        ? CAREER_PLAYBOOKS
        : CAREER_PLAYBOOKS.filter(
            (playbook) => playbook.category === category,
          );

    return [...filtered].sort((a, b) => {
      if (a.id === recommendedId) return -1;
      if (b.id === recommendedId) return 1;
      return 0;
    });
  }, [category, recommendedId]);

  const usefulPublished = publishedResources.filter(
    (resource) =>
      safeResourceHref(resource.url) &&
      ![
        '/profile',
        '/check-in',
        '/documents',
        '/inbox?compose=1',
      ].includes(String(resource.url)),
  );

  return (
    <section id="toolkit" className="career-toolkit-section">
      <div className="career-section-heading">
        <div>
          <div className="section-kicker">
            PLAYER TOOLKIT
          </div>
          <h2>Use the career, don’t just record it.</h2>
          <p>
            Short professional playbooks for moments that
            matter. Each one ends in a real action inside
            DJM Player.
          </p>
        </div>
      </div>

      <div
        className="toolkit-categories"
        role="group"
        aria-label="Filter player toolkit"
      >
        {categories.map((item) => (
          <button
            type="button"
            key={item}
            className={category === item ? 'active' : ''}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="toolkit-playbooks">
        {playbooks.map((playbook) => (
          <PlaybookCard
            key={playbook.id}
            playbook={playbook}
            recommended={playbook.id === recommendedId}
          />
        ))}
      </div>

      {usefulPublished.length > 0 && (
        <div className="djm-resource-library">
          <div className="djm-resource-library-head">
            <div>
              <span>CURATED BY DJM</span>
              <strong>Agency resources</strong>
            </div>
            <BookOpen size={19} />
          </div>

          <div className="djm-resource-grid">
            {usefulPublished.map((resource, index) => {
              const href = safeResourceHref(resource.url)!;
              const external = href.startsWith('http');
              const content = (
                <>
                  <span>
                    {resource.category || 'DJM resource'}
                  </span>
                  <strong>
                    {resource.title || 'Player resource'}
                  </strong>
                  {resource.description && (
                    <small>{resource.description}</small>
                  )}
                  {external ? (
                    <ExternalLink size={15} />
                  ) : (
                    <ArrowRight size={15} />
                  )}
                </>
              );

              return external ? (
                <a
                  key={resource.id || `${href}-${index}`}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {content}
                </a>
              ) : (
                <Link
                  key={resource.id || `${href}-${index}`}
                  href={href}
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
