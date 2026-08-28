import { brainIntent, commandRecommendation, dealCredibility } from '@/lib/intelligence';
import type { ResearchLinkInput } from '@/lib/research-links';

const compactDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export type BrainData = {
  command: any;
  needs: any[];
  deals: any[];
  contacts: any[];
  clubs: any[];
  recruitment: any[];
  players: any[];
};

export type BrainAnswerItem = {
  entity: string;
  title: string;
  detail: string;
  href: string;
  research?: ResearchLinkInput;
};

export type BrainAnswer = {
  supported: boolean;
  title: string;
  summary: string;
  items: BrainAnswerItem[];
  provenance: string;
};

const STOP_WORDS = new Set([
  'about', 'all', 'are', 'at', 'can', 'could', 'do', 'for', 'from', 'give',
  'have', 'i', 'in', 'is', 'list', 'me', 'of', 'on', 'our', 'please', 'show',
  'tell', 'the', 'their', 'them', 'to', 'us', 'we', 'what', 'where', 'which',
  'who', 'with', 'would',
]);

const normalise = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (query: string, ignored: string[] = []) => {
  const localStop = new Set([...STOP_WORDS, ...ignored]);
  return normalise(query)
    .split(' ')
    .filter((word) => word.length >= 2 && !localStop.has(word));
};

const haystack = (values: unknown[]) =>
  normalise(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .join(' '),
  );

const matches = (values: unknown[], terms: string[]) => {
  if (!terms.length) return true;
  const value = haystack(values);
  return terms.every((term) => value.includes(term));
};

const activeNeeds = (data: BrainData) =>
  data.needs.filter((need) =>
    ['active', 'open', 'confirmed'].includes(need.need_status || need.status),
  );

const formatContact = (contact: any): BrainAnswerItem => ({
  entity: 'Club contact',
  title: contact.full_name || 'Unnamed contact',
  detail: [
    contact.role_title,
    contact.current_organisation,
    `Relationship ${Number(contact.relationship_score || contact.relationship_strength || 0)}`,
    contact.last_interaction_at ? `last contact ${compactDateTime(contact.last_interaction_at)}` : 'no contact recorded',
  ]
    .filter(Boolean)
    .join(' · '),
  href: `/network/contacts/${contact.id}`,
  research: {
    kind: 'contact',
    name: contact.full_name,
    clubName: contact.current_organisation,
    country: contact.country,
    whatsapp: contact.whatsapp,
    phone: contact.phone,
    email: contact.email,
    linkedinUrl: contact.linkedin_url,
    instagramUrl: contact.instagram_url,
  },
});

const formatClub = (club: any): BrainAnswerItem => ({
  entity: 'Club',
  title: club.name || 'Unnamed club',
  detail: [
    [club.city, club.country].filter(Boolean).join(', '),
    `${Number(club.contacts_count || 0)} contacts`,
    `${Number(club.active_needs_count || 0)} live needs`,
    club.last_interaction_at ? `last contact ${compactDateTime(club.last_interaction_at)}` : 'no contact recorded',
  ]
    .filter(Boolean)
    .join(' · '),
  href: `/network/clubs/${club.id}`,
  research: {
    kind: 'club',
    name: club.name,
    country: club.country,
    websiteUrl: club.website_url,
    linkedinUrl: club.linkedin_url,
    instagramUrl: club.instagram_url,
  },
});

const formatPlayer = (player: any): BrainAnswerItem => {
  const name =
    [player.first_name, player.last_name].filter(Boolean).join(' ') ||
    player.preferred_name ||
    player.display_name ||
    'Unnamed player';

  return {
    entity: 'Signed player',
    title: name,
    detail: [
      player.primary_position,
      Array.isArray(player.secondary_positions) && player.secondary_positions.length
        ? `also ${player.secondary_positions.join(', ')}`
        : null,
      player.current_club,
      player.contract_status,
      player.verification_status ? `record ${String(player.verification_status).replaceAll('_', ' ')}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    href: `/admin/players/${player.id}`,
    research: {
      kind: 'player',
      name,
      clubName: player.current_club,
      country: player.current_country,
      transfermarktUrl: player.transfermarkt_url,
      statsUrl: player.stats_url,
      instagramUrl: player.instagram_url,
    },
  };
};

const formatRecruitment = (target: any): BrainAnswerItem => ({
  entity: 'Recruitment target',
  title: target.full_name || 'Unnamed target',
  detail: [
    target.primary_position,
    target.current_club,
    String(target.recruitment_stage || 'identified').replaceAll('_', ' '),
    `priority ${Number(target.recruitment_priority || 3)}/5`,
    target.next_action_at ? `next ${compactDateTime(target.next_action_at)}` : 'next action missing',
  ]
    .filter(Boolean)
    .join(' · '),
  href: `/recruitment/${target.id}`,
  research: {
    kind: 'recruitment',
    name: target.full_name,
    clubName: target.current_club,
    country: target.current_country || target.nationality,
    whatsapp: target.whatsapp,
    phone: target.phone,
    email: target.email,
    transfermarktUrl: target.transfermarkt_url,
    statsUrl: target.stats_url,
    instagramUrl: target.instagram_url,
  },
});

const genericRecordSearch = (query: string, data: BrainData): BrainAnswerItem[] => {
  const terms = words(query, ['find', 'record', 'records', 'search', 'lookup']);
  if (!terms.length) return [];

  const items: BrainAnswerItem[] = [];

  data.contacts.forEach((contact) => {
    if (matches([contact.full_name, contact.role_title, contact.current_organisation, contact.country], terms)) {
      items.push(formatContact(contact));
    }
  });
  data.clubs.forEach((club) => {
    if (matches([club.name, club.country, club.city], terms)) items.push(formatClub(club));
  });
  data.players.forEach((player) => {
    if (matches([player.first_name, player.last_name, player.preferred_name, player.primary_position, player.secondary_positions, player.current_club, player.current_country], terms)) {
      items.push(formatPlayer(player));
    }
  });
  data.recruitment.forEach((target) => {
    if (matches([target.full_name, target.primary_position, target.secondary_positions, target.current_club, target.current_country, target.nationality], terms)) {
      items.push(formatRecruitment(target));
    }
  });

  return items.slice(0, 12);
};

export function buildBrainAnswer(query: string, data: BrainData): BrainAnswer {
  const intent = brainIntent(query);
  const command = data.command || {};
  const liveNeeds = activeNeeds(data);

  if (!query.trim()) {
    return {
      supported: false,
      title: 'Ask across the agency record',
      summary: 'Brain can retrieve signed players, recruitment targets, clubs, club contacts, live demand and Deal Rooms.',
      items: [],
      provenance: 'No question asked',
    };
  }

  if (intent === 'today') {
    const referenceTime = command.generated_at
      ? new Date(command.generated_at).getTime()
      : undefined;
    const items = (command.focus || []).slice(0, 8).map((item: any) => {
      const recommendation = commandRecommendation(item, referenceTime);
      return {
        entity: String(item.kind || 'Action').replaceAll('_', ' '),
        title: item.title,
        detail: `${recommendation.kind} · ${recommendation.explanation}`,
        href: item.href || '/djm',
      };
    });
    return {
      supported: true,
      title: items.length ? 'Current decision queue' : 'No forced activity',
      summary: items.length
        ? 'Unresolved actions ranked from the current operational feed. Open any record to review the underlying evidence.'
        : 'The record contains no unresolved priority. Holding is a valid supported action.',
      items,
      provenance: `Command snapshot${command.generated_at ? ` · ${compactDateTime(command.generated_at)}` : ''}`,
    };
  }

  if (intent === 'missing') {
    const quality = command.quality || {};
    const labels: Record<string, string> = {
      contacts_missing_club: 'Contacts missing a current club',
      contacts_missing_role: 'Contacts missing a role',
      recruitment_missing_transfermarkt: 'Prospects missing a source profile',
      recruitment_missing_contact: 'Prospects missing a contact route',
      open_reviews: 'Claims awaiting human review',
      stale_needs: 'Club needs requiring reverification',
    };
    const items = Object.entries(quality)
      .filter(([, value]) => Number(value || 0) > 0)
      .map(([key, value]) => ({
        entity: 'Evidence gap',
        title: labels[key] || key.replaceAll('_', ' '),
        detail: `${Number(value)} record${Number(value) === 1 ? '' : 's'} need attention`,
        href: key.includes('need') ? '/market' : key.includes('recruitment') ? '/recruitment' : '/network',
      }));
    return {
      supported: true,
      title: items.length ? 'Known evidence gaps' : 'No automated exception found',
      summary: items.length
        ? 'These are explicit gaps. Absence from this list is not proof that every material fact is complete.'
        : 'Current checks found no exception, but important facts still require source review.',
      items,
      provenance: 'DJM Command data-quality checks',
    };
  }

  if (intent === 'contacts') {
    const terms = words(query, [
      'club', 'clubs', 'contact', 'contacts', 'know', 'relationship', 'relationships',
      'person', 'people', 'whatsapp', 'email', 'phone', 'missing', 'without', 'no',
    ]);
    const missingWhatsapp = /(without|missing|no)\s+(a\s+)?(whatsapp|phone|contact)/i.test(query);
    const contacts = data.contacts
      .filter((contact) => !missingWhatsapp || !(contact.whatsapp || contact.phone))
      .filter((contact) => matches([contact.full_name, contact.role_title, contact.current_organisation, contact.country, contact.city], terms))
      .sort((a, b) => Number(b.relationship_score || b.relationship_strength || 0) - Number(a.relationship_score || a.relationship_strength || 0));
    return {
      supported: true,
      title: `${contacts.length} club contact${contacts.length === 1 ? '' : 's'} found`,
      summary: contacts.length
        ? 'Open the relationship workspace for full context, promises, best route and conversation history. Direct messaging and research links are shown where available.'
        : 'No club contact matches those terms in the current authorised record.',
      items: contacts.slice(0, 12).map(formatContact),
      provenance: 'DJM Network · current club contacts',
    };
  }

  if (intent === 'commercial') {
    const terms = words(query, ['budget', 'salary', 'fee', 'wage', 'wages', 'commercial', 'club', 'need', 'needs']);
    const evidenced = liveNeeds
      .filter((need) => need.transfer_budget != null || need.salary_budget != null)
      .filter((need) => matches([need.organisation_name, need.need_position, need.position, need.title], terms));
    const items = evidenced.slice(0, 10).map((need) => ({
      entity: 'Live club need',
      title: `${need.organisation_name || 'Club'} · ${need.need_position || need.position}`,
      detail: [
        need.transfer_budget != null ? `transfer ${need.currency || 'EUR'} ${Number(need.transfer_budget).toLocaleString('en-GB')}` : null,
        need.salary_budget != null ? `salary ${need.currency || 'EUR'} ${Number(need.salary_budget).toLocaleString('en-GB')} / ${need.salary_period || 'period not recorded'}` : null,
      ].filter(Boolean).join(' · '),
      href: '/market',
    }));
    return {
      supported: evidenced.length > 0,
      title: evidenced.length ? 'Explicit commercial parameters' : 'No supported commercial figure',
      summary: evidenced.length
        ? 'Only figures explicitly attached to a live club need are shown. Reconfirm them before external use.'
        : 'No explicit budget or salary evidence matches that question. Brain will not infer a number.',
      items,
      provenance: 'Explicit fields on live club needs only',
    };
  }

  if (intent === 'deals') {
    const needsNextAction = /(lack|missing|without|no)\s+(a\s+)?next action/i.test(query);
    const deals = data.deals.filter((deal) => !needsNextAction || !deal.next_action_at);
    const items = deals.slice(0, 10).map((deal) => ({
      entity: 'Deal Room',
      title: deal.title,
      detail: `${dealCredibility(deal)} · ${deal.next_action_at ? `next ${compactDateTime(deal.next_action_at)}` : 'next action missing'}`,
      href: `/market/deals/${deal.id}`,
    }));
    return {
      supported: true,
      title: `${deals.length} active commercial situation${deals.length === 1 ? '' : 's'}`,
      summary: 'Credibility is qualitative and based on stage, blockers, linked demand and dated next actions-not a fabricated probability.',
      items,
      provenance: 'Active Deal Rooms',
    };
  }

  if (intent === 'demand') {
    const withoutMatch = /(without|missing|no)\s+(a\s+)?(match|candidate)/i.test(query);
    const terms = words(query, ['club', 'need', 'needs', 'demand', 'market', 'match', 'matches', 'candidate', 'candidates', 'live', 'without', 'missing', 'no']);
    const needs = liveNeeds
      .filter((need) => !withoutMatch || Number(need.match_count || 0) === 0)
      .filter((need) => matches([need.organisation_name, need.need_position, need.position, need.title, need.profile_notes], terms));
    const items = needs.slice(0, 10).map((need) => ({
      entity: 'Live club need',
      title: `${need.organisation_name || 'Club'} · ${need.need_position || need.position || need.title}`,
      detail: Number(need.match_count || 0)
        ? `${Number(need.match_count)} candidate records require evidence review`
        : 'No candidate evidence recorded',
      href: '/market',
    }));
    return {
      supported: true,
      title: `${needs.length} live demand signal${needs.length === 1 ? '' : 's'}`,
      summary: 'These requirements are recorded as live. Reconfirm stale or incomplete constraints before outreach.',
      items,
      provenance: 'Live club-needs register',
    };
  }

  if (intent === 'recruitment') {
    const missingContact = /(without|missing|no)\s+(a\s+)?(contact|route|whatsapp|email)/i.test(query);
    const terms = words(query, ['recruitment', 'recruit', 'target', 'targets', 'prospect', 'prospects', 'unsigned', 'player', 'players', 'contact', 'route', 'without', 'missing', 'no']);
    const targets = data.recruitment
      .filter((target) => !missingContact || !(target.whatsapp || target.email || target.instagram_url))
      .filter((target) => matches([target.full_name, target.primary_position, target.secondary_positions, target.current_club, target.current_country, target.nationality, target.recruitment_stage], terms));
    return {
      supported: true,
      title: `${targets.length} recruitment target${targets.length === 1 ? '' : 's'} found`,
      summary: targets.length ? 'Open a target to review evidence, outreach history, representation stage and next action.' : 'No recruitment target matches those terms.',
      items: targets.slice(0, 12).map(formatRecruitment),
      provenance: 'DJM Recruitment pipeline',
    };
  }

  if (intent === 'players') {
    const terms = words(query, ['signed', 'player', 'players', 'client', 'clients', 'roster', 'play', 'plays', 'position', 'positions']);
    const players = data.players.filter((player) => matches([
      player.first_name,
      player.last_name,
      player.preferred_name,
      player.primary_position,
      player.secondary_positions,
      player.current_club,
      player.current_country,
      player.nationalities,
      player.contract_status,
    ], terms));
    return {
      supported: true,
      title: `${players.length} signed player${players.length === 1 ? '' : 's'} found`,
      summary: players.length ? 'Results use the current master football record, including primary and secondary positions.' : 'No signed player matches those terms.',
      items: players.slice(0, 12).map(formatPlayer),
      provenance: 'DJM signed-player master records',
    };
  }

  if (intent === 'clubs') {
    const terms = words(query, ['club', 'clubs', 'organisation', 'organisations', 'organization', 'organizations']);
    const clubs = data.clubs.filter((club) => matches([club.name, club.country, club.city], terms));
    return {
      supported: true,
      title: `${clubs.length} club${clubs.length === 1 ? '' : 's'} found`,
      summary: clubs.length ? 'Open a club for decision-makers, live demand, relationship history and best routes in.' : 'No club matches those terms.',
      items: clubs.slice(0, 12).map(formatClub),
      provenance: 'DJM Network · canonical club records',
    };
  }

  const found = genericRecordSearch(query, data);
  if (found.length) {
    return {
      supported: true,
      title: `${found.length} matching record${found.length === 1 ? '' : 's'}`,
      summary: 'Brain matched the question against names, clubs, countries, roles and playing positions across authorised sources.',
      items: found,
      provenance: 'Cross-source DJM record search',
    };
  }

  return {
    supported: false,
    title: 'No authorised record supports that answer',
    summary: 'Ask about signed players, recruitment targets, clubs, club contacts, live demand, commercial parameters, Deal Rooms, priorities or evidence gaps. Brain will not invent a response.',
    items: [],
    provenance: 'No authorised retrieval matched this question',
  };
}
