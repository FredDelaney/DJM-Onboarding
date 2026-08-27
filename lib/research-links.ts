export type ResearchEntityKind = 'player' | 'recruitment' | 'club' | 'contact';

export type ResearchPlatform =
  | 'whatsapp'
  | 'email'
  | 'transfermarkt'
  | 'sofascore'
  | 'instagram'
  | 'linkedin'
  | 'website';

export type ResearchLink = {
  platform: ResearchPlatform;
  label: string;
  href: string;
  mode: 'direct' | 'search';
};

export type ResearchLinkInput = {
  kind: ResearchEntityKind;
  name?: string | null;
  clubName?: string | null;
  country?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  transfermarktUrl?: string | null;
  statsUrl?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
};

function text(value: unknown) {
  return String(value || '').trim();
}

export function normaliseWebUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function whatsappHref(value: unknown) {
  let digits = text(value).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

function emailHref(value: unknown) {
  const email = text(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null;
}

function instagramHref(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^@?[a-z0-9._]+$/i.test(raw)) {
    return `https://www.instagram.com/${raw.replace(/^@/, '')}/`;
  }
  return normaliseWebUrl(raw);
}

function linkedinSearch(type: 'people' | 'companies', query: string) {
  return `https://www.linkedin.com/search/results/${type}/?keywords=${encodeURIComponent(query)}`;
}

function transfermarktSearch(query: string) {
  return `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`;
}

function instagramSearch(query: string) {
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`;
}

function directOrSearch(
  platform: ResearchPlatform,
  directUrl: string | null,
  directLabel: string,
  searchUrl: string,
  searchLabel: string,
): ResearchLink {
  return directUrl
    ? { platform, label: directLabel, href: directUrl, mode: 'direct' }
    : { platform, label: searchLabel, href: searchUrl, mode: 'search' };
}

export function buildResearchLinks(input: ResearchLinkInput): ResearchLink[] {
  const name = text(input.name);
  const clubName = text(input.clubName);
  const country = text(input.country);
  const identity = [name, clubName, country].filter(Boolean).join(' ');
  const organisationIdentity = [name, country].filter(Boolean).join(' ');
  const links: ResearchLink[] = [];

  const whatsapp = whatsappHref(input.whatsapp || input.phone);
  if (whatsapp) {
    links.push({ platform: 'whatsapp', label: 'WhatsApp', href: whatsapp, mode: 'direct' });
  }

  const email = emailHref(input.email);
  if (email) {
    links.push({ platform: 'email', label: 'Email', href: email, mode: 'direct' });
  }

  if (input.kind === 'player' || input.kind === 'recruitment') {
    if (identity) {
      links.push(
        directOrSearch(
          'transfermarkt',
          normaliseWebUrl(input.transfermarktUrl),
          'Transfermarkt',
          transfermarktSearch(identity),
          'Find Transfermarkt',
        ),
        directOrSearch(
          'instagram',
          instagramHref(input.instagramUrl),
          'Instagram',
          instagramSearch(identity),
          'Find Instagram',
        ),
      );

      const statsUrl = normaliseWebUrl(input.statsUrl);
      if (statsUrl) {
        links.splice(links.length - 1, 0, {
          platform: 'sofascore',
          label: 'Sofascore / stats',
          href: statsUrl,
          mode: 'direct',
        });
      }
    }
  }

  if (input.kind === 'club' && organisationIdentity) {
    const website = normaliseWebUrl(input.websiteUrl);
    if (website) {
      links.push({ platform: 'website', label: 'Website', href: website, mode: 'direct' });
    }
    links.push(
      { platform: 'transfermarkt', label: 'Find Transfermarkt', href: transfermarktSearch(organisationIdentity), mode: 'search' },
      directOrSearch(
        'instagram',
        instagramHref(input.instagramUrl),
        'Instagram',
        instagramSearch(organisationIdentity),
        'Find Instagram',
      ),
      directOrSearch(
        'linkedin',
        normaliseWebUrl(input.linkedinUrl),
        'LinkedIn',
        linkedinSearch('companies', organisationIdentity),
        'Find LinkedIn',
      ),
    );
  }

  if (input.kind === 'contact' && identity) {
    links.push(
      directOrSearch(
        'linkedin',
        normaliseWebUrl(input.linkedinUrl),
        'LinkedIn',
        linkedinSearch('people', identity),
        'Find LinkedIn',
      ),
      directOrSearch(
        'instagram',
        instagramHref(input.instagramUrl),
        'Instagram',
        instagramSearch(identity),
        'Find Instagram',
      ),
    );
  }

  return links;
}
