'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Database,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import { brainIntent, commandRecommendation, dealCredibility } from '@/lib/intelligence';

const STARTERS = [
  'What should I do today?',
  'Where is our information missing?',
  'Which club needs require attention?',
  'Which deals lack a next action?',
];

type BrainData = {
  command: any;
  needs: any[];
  deals: any[];
};

export default function BrainPage() {
  const [data, setData] = useState<BrainData>({ command: null, needs: [], deals: [] });
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [command, needs, deals] = await Promise.all([
        djmRpc('djm_command_center'),
        djmRpc<any[]>('djm_market_needs', { p_status: null }),
        djmRpc<any[]>('djm_deal_rooms', { p_status: 'active' }),
      ]);
      setData({ command, needs: needs || [], deals: deals || [] });
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const answer = useMemo(() => buildAnswer(asked, data), [asked, data]);

  const ask = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setAsked(query.trim());
  };

  const useStarter = (starter: string) => {
    setQuery(starter);
    setAsked(starter);
  };

  return (
    <DjmOsShell eyebrow="Authorised retrieval across DJM operational truth" title="Brain">
      {error ? (
        <div className="djm-os-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <section className="djm-brain-hero">
        <div className="djm-brain-orbit" aria-hidden="true"><BrainCircuit size={34} /></div>
        <div>
          <span className="djm-intelligence-kicker"><Sparkles size={14} /> Structured intelligence online</span>
          <h2>Ask the agency’s record.</h2>
          <p>
            Brain retrieves authorised operational data and explains what supports an answer.
            It refuses facts the record cannot prove; a generative model is not connected in this release.
          </p>
        </div>
        <div className="djm-brain-trust">
          <span><ShieldCheck size={15} /> Team-authorised scope</span>
          <span><Database size={15} /> Live DJM records</span>
        </div>
      </section>

      <form className="djm-brain-search" onSubmit={ask}>
        <Search size={20} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about priorities, gaps, demand or deals…" aria-label="Ask DJM Brain" />
        <button className="djm-os-primary-button" type="submit" disabled={busy || !query.trim()}>Ask Brain</button>
      </form>

      <div className="djm-brain-starters" aria-label="Suggested questions">
        {STARTERS.map((starter) => <button type="button" key={starter} onClick={() => useStarter(starter)}>{starter}</button>)}
      </div>

      {asked ? (
        <section className="djm-brain-answer" aria-live="polite">
          <div className="djm-brain-answer-head">
            <span>QUESTION</span>
            <h2>{asked}</h2>
          </div>
          <div className="djm-brain-answer-copy">
            <span className={`djm-evidence-state ${answer.supported ? 'is-verified' : 'is-missing'}`}>
              {answer.supported ? 'Supported by current records' : 'Insufficient evidence'}
            </span>
            <h3>{answer.title}</h3>
            <p>{answer.summary}</p>
            {answer.items.length ? (
              <div className="djm-brain-result-list">
                {answer.items.map((item, index) => (
                  <Link href={item.href} key={`${item.title}-${index}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="djm-brain-provenance"><Database size={14} /> {answer.provenance}</div>
          </div>
        </section>
      ) : (
        <div className="djm-os-empty djm-brain-empty"><CheckCircle2 size={25} /><p>Choose a prompt or ask a supported operational question.</p></div>
      )}
    </DjmOsShell>
  );
}

function buildAnswer(query: string, data: BrainData) {
  const intent = brainIntent(query);
  const command = data.command || {};
  const activeNeeds = data.needs.filter((need) => ['active', 'open', 'confirmed'].includes(need.need_status || need.status));

  if (intent === 'today') {
    const referenceTime = command.generated_at
      ? new Date(command.generated_at).getTime()
      : undefined;
    const items = (command.focus || []).slice(0, 5).map((item: any) => {
      const recommendation = commandRecommendation(item, referenceTime);
      return { title: item.title, detail: `${recommendation.kind} · ${recommendation.explanation}`, href: item.href || '/djm' };
    });
    return { supported: true, title: items.length ? 'Your current decision queue' : 'Holding is the supported action', summary: items.length ? 'These unresolved actions are ranked by the current operational feed. Review the evidence before acting.' : 'The record contains no unresolved priority. Do not create activity for its own sake.', items, provenance: `Command snapshot${command.generated_at ? ` · ${compactDateTime(command.generated_at)}` : ''}` };
  }

  if (intent === 'missing') {
    const quality = command.quality || {};
    const labels: Record<string, string> = { contacts_missing_club: 'Contacts missing a current club', contacts_missing_role: 'Contacts missing a role', recruitment_missing_transfermarkt: 'Prospects missing a source profile', recruitment_missing_contact: 'Prospects missing a contact route', open_reviews: 'Claims awaiting human review', stale_needs: 'Club needs requiring reverification' };
    const items = Object.entries(quality).filter(([, value]) => Number(value || 0) > 0).map(([key, value]) => ({ title: labels[key] || key.replaceAll('_', ' '), detail: `${Number(value)} record${Number(value) === 1 ? '' : 's'} need attention`, href: key.includes('need') ? '/market' : '/network' }));
    return { supported: true, title: items.length ? 'Known evidence gaps' : 'No obvious gap in the current checks', summary: items.length ? 'These are explicit gaps; absence from this list is not proof that every fact is correct.' : 'Current automated checks found no exception, but material facts still require source review.', items, provenance: 'DJM Command data-quality checks' };
  }

  if (intent === 'demand') {
    const items = activeNeeds.slice(0, 8).map((need) => ({ title: `${need.organisation_name || 'Club'} · ${need.need_position || need.position || need.title}`, detail: Number(need.match_count || 0) ? `${Number(need.match_count)} candidate records require evidence review` : 'No candidate evidence recorded', href: '/market' }));
    return { supported: true, title: `${activeNeeds.length} live demand signal${activeNeeds.length === 1 ? '' : 's'}`, summary: 'These requirements are recorded as live. Reconfirm stale or incomplete constraints before outreach.', items, provenance: 'Live club-needs register' };
  }

  if (intent === 'deals') {
    const items = data.deals.slice(0, 8).map((deal) => ({ title: deal.title, detail: `${dealCredibility(deal)} · ${deal.next_action_at ? `next ${compactDateTime(deal.next_action_at)}` : 'next action missing'}`, href: `/market/deals/${deal.id}` }));
    return { supported: true, title: `${data.deals.length} active commercial situation${data.deals.length === 1 ? '' : 's'}`, summary: 'Credibility is qualitative and based on stage, explicit blockers, linked demand and next actions—not a fabricated probability.', items, provenance: 'Active Deal Rooms' };
  }

  if (intent === 'commercial') {
    const evidenced = activeNeeds.filter((need) => need.transfer_budget != null || need.salary_budget != null);
    const items = evidenced.slice(0, 8).map((need) => ({ title: `${need.organisation_name || 'Club'} · ${need.need_position || need.position}`, detail: [need.transfer_budget != null ? `transfer ${need.currency || 'EUR'} ${Number(need.transfer_budget).toLocaleString('en-GB')}` : null, need.salary_budget != null ? `salary ${need.currency || 'EUR'} ${Number(need.salary_budget).toLocaleString('en-GB')} / ${need.salary_period || 'period not recorded'}` : null].filter(Boolean).join(' · '), href: '/market' }));
    return { supported: evidenced.length > 0, title: evidenced.length ? 'Explicit commercial parameters found' : 'The record cannot support that commercial answer', summary: evidenced.length ? 'Only figures explicitly attached to a live club need are shown. Reconfirm them before use.' : 'No explicit budget or salary evidence is attached to the relevant live demand. Brain will not infer a number.', items, provenance: 'Explicit fields on live club needs only' };
  }

  return { supported: false, title: 'That question is outside the connected evidence boundary', summary: 'Try asking about today’s actions, information gaps, club demand, deals or explicit commercial parameters. Brain will not invent an answer.', items: [], provenance: 'No authorised retrieval matched this question' };
}
