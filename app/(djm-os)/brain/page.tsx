'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import ResearchLinkRail from '@/components/ResearchLinkRail';
import { buildBrainAnswer, type BrainData } from '@/lib/brain';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import { buildResearchLinks } from '@/lib/research-links';
import { supabase } from '@/lib/supabase';

const STARTERS = [
  'What should I do today?',
  'Where is our information missing?',
  'Show all club contacts',
  'Who do we know at Wellington Phoenix?',
  'Which signed players can play CDM?',
  'Which recruitment targets have no contact route?',
  'Which club needs have no candidate match?',
  'Which deals lack a next action?',
];

const EMPTY_DATA: BrainData = {
  command: null,
  needs: [],
  deals: [],
  contacts: [],
  clubs: [],
  recruitment: [],
  players: [],
};

export default function BrainPage() {
  const [data, setData] = useState<BrainData>(EMPTY_DATA);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playerScopeAvailable, setPlayerScopeAvailable] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [command, needs, deals, contacts, clubs, recruitment, playerResult] = await Promise.all([
        djmRpc('djm_command_center'),
        djmRpc<any[]>('djm_market_needs', { p_status: null }),
        djmRpc<any[]>('djm_deal_rooms', { p_status: 'active' }),
        djmRpc<any[]>('djm_network_club_contacts', { p_search: null, p_limit: 300 }),
        djmRpc<any[]>('djm_network_organisations', { p_search: null, p_limit: 300 }),
        djmRpc<any[]>('djm_recruitment_targets', { p_search: null, p_stage: null, p_limit: 300 }),
        supabase
          .from('players')
          .select('id,first_name,last_name,preferred_name,nationalities,primary_position,secondary_positions,current_club,current_country,contract_status,transfermarkt_url,stats_url,instagram_url,verification_status,updated_at')
          .order('updated_at', { ascending: false })
          .limit(300),
      ]);

      setPlayerScopeAvailable(!playerResult.error);
      setData({
        command,
        needs: needs || [],
        deals: deals || [],
        contacts: contacts || [],
        clubs: (clubs || []).filter((club: any) => club.organisation_type === 'club'),
        recruitment: recruitment || [],
        players: playerResult.error ? [] : playerResult.data || [],
      });
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const answer = useMemo(() => buildBrainAnswer(asked, data), [asked, data]);
  const activeNeeds = useMemo(
    () => data.needs.filter((need) => ['active', 'open', 'confirmed'].includes(need.need_status || need.status)),
    [data.needs],
  );
  const activeRecruitment = useMemo(
    () => data.recruitment.filter((target) => !['signed', 'declined', 'lost'].includes(target.recruitment_stage)),
    [data.recruitment],
  );
  const strongestContacts = useMemo(
    () => [...data.contacts]
      .sort((a, b) => Number(b.relationship_score || b.relationship_strength || 0) - Number(a.relationship_score || a.relationship_strength || 0))
      .slice(0, 4),
    [data.contacts],
  );

  const ask = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setAsked(query.trim());
  };

  const useStarter = (starter: string) => {
    setQuery(starter);
    setAsked(starter);
  };

  const sourceCards = [
    { label: 'Signed players', value: data.players.length, note: playerScopeAvailable ? 'Master football records' : 'Requires admin player scope', href: '/admin', icon: <UsersRound size={19} /> },
    { label: 'Recruitment', value: activeRecruitment.length, note: 'Unsigned player pipeline', href: '/recruitment', icon: <UserRoundSearch size={19} /> },
    { label: 'Clubs', value: data.clubs.length, note: 'Needs and relationship history', href: '/network#clubs', icon: <Building2 size={19} /> },
    { label: 'Club contacts', value: data.contacts.length, note: 'Decision-makers and routes in', href: '/network#contacts', icon: <UsersRound size={19} />, highlighted: true },
    { label: 'Live demand', value: activeNeeds.length, note: 'Hard constraints and matches', href: '/market', icon: <Target size={19} /> },
    { label: 'Deal Rooms', value: data.deals.length, note: 'Active commercial situations', href: '/market', icon: <BriefcaseBusiness size={19} /> },
    { label: 'Intelligence Data', value: 'QA', note: 'Evidence, benchmarks and freshness', href: '/brain/data', icon: <Database size={19} /> },
  ];

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
          <span className="djm-intelligence-kicker"><Sparkles size={14} /> Agency intelligence connected</span>
          <h2>Find the person, player or opportunity. Then act.</h2>
          <p>
            Search signed players, recruitment targets, clubs, club contacts, live demand and Deal Rooms together.
            Every answer links back to the operational record that supports it.
          </p>
        </div>
        <div className="djm-brain-trust">
          <span><ShieldCheck size={15} /> Team-authorised scope</span>
          <span><Database size={15} /> Live DJM records</span>
          <button type="button" className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </section>

      <section className="djm-brain-source-map" aria-label="Connected Brain sources">
        {sourceCards.map((source) => (
          <Link href={source.href} key={source.label} className={source.highlighted ? 'is-highlighted' : ''}>
            <span className="djm-brain-source-icon">{source.icon}</span>
            <div><strong>{source.value}</strong><span>{source.label}</span><small>{source.note}</small></div>
            <ArrowRight size={14} />
          </Link>
        ))}
      </section>

      <form className="djm-brain-search" onSubmit={ask}>
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask about a player, position, club, contact, need, budget, next action or deal…"
          aria-label="Ask DJM Brain"
        />
        <button className="djm-os-primary-button" type="submit" disabled={busy || !query.trim()}>Search Brain</button>
      </form>

      <div className="djm-brain-starters" aria-label="Suggested questions">
        {STARTERS.map((starter) => <button type="button" key={starter} onClick={() => useStarter(starter)}>{starter}</button>)}
      </div>

      {asked ? (
        <section className="djm-brain-answer" aria-live="polite">
          <div className="djm-brain-answer-head">
            <span>QUESTION</span>
            <h2>{asked}</h2>
            <button type="button" onClick={() => { setAsked(''); setQuery(''); }}>Clear result</button>
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
                  <article key={`${item.entity}-${item.title}-${index}`}>
                    <Link href={item.href} className="djm-brain-result-main">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div><em>{item.entity}</em><strong>{item.title}</strong><small>{item.detail}</small></div>
                      <ArrowRight size={15} />
                    </Link>
                    {item.research ? <ResearchLinkRail compact links={buildResearchLinks(item.research)} /> : null}
                  </article>
                ))}
              </div>
            ) : null}
            <div className="djm-brain-provenance"><Database size={14} /> {answer.provenance}</div>
          </div>
        </section>
      ) : (
        <section className="djm-brain-contact-window">
          <div className="djm-os-panel-head">
            <div>
              <span className="djm-intelligence-kicker">RELATIONSHIP ACCESS</span>
              <h2>Club contacts are here.</h2>
              <p>Search them in Brain or open the full Network directory. These are the strongest currently recorded routes.</p>
            </div>
            <Link href="/network#contacts" className="djm-os-secondary-button">Open all contacts <ArrowRight size={15} /></Link>
          </div>
          {strongestContacts.length ? (
            <div className="djm-brain-contact-grid">
              {strongestContacts.map((contact) => {
                const links = buildResearchLinks({
                  kind: 'contact',
                  name: contact.full_name,
                  clubName: contact.current_organisation,
                  country: contact.country,
                  whatsapp: contact.whatsapp,
                  phone: contact.phone,
                  email: contact.email,
                  linkedinUrl: contact.linkedin_url,
                  instagramUrl: contact.instagram_url,
                });
                return (
                  <article key={contact.id}>
                    <div><span>{contact.role_title || 'Club contact'}</span><strong>{contact.full_name}</strong><p>{contact.current_organisation || 'Club not recorded'}</p></div>
                    <small>Relationship {Number(contact.relationship_score || contact.relationship_strength || 0)} · {contact.last_interaction_at ? `last contact ${compactDateTime(contact.last_interaction_at)}` : 'no contact recorded'}</small>
                    <ResearchLinkRail compact links={links} />
                    <Link href={`/network/contacts/${contact.id}`}>Open relationship workspace <ArrowRight size={13} /></Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="djm-os-empty djm-brain-empty"><CheckCircle2 size={25} /><p>No club contacts are recorded yet.</p></div>
          )}
        </section>
      )}
    </DjmOsShell>
  );
}
