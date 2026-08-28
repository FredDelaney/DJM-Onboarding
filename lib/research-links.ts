export type ResearchEntityKind = 'player' | 'recruitment' | 'club' | 'contact';

export type ResearchPlatform =
  | 'whatsapp'
  | 'email'
  | 'transfermarkt'
  | 'wyscout'
  | 'sofascore'
  | 'fotmob'
  | 'soccerway'
  | 'stats'
  | 'instagram'
  | 'linkedin'
  | 'website'
  | 'youtube'
  | 'vimeo'
  | 'x'
  | 'tiktok'
  | 'video'
  | 'other';

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
  wyscoutUrl?: string | null;
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

function webHostname(value: unknown) {
  const normalised = normaliseWebUrl(value);
  if (!normalised) return '';

  return new URL(normalised).hostname
    .toLowerCase()
    .replace(/^www\./, '');
}

function isHost(value: unknown, domain: string) {
  const hostname = webHostname(value);
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isTransfermarktUrl(value: unknown) {
  return isHost(value, 'transfermarkt.com');
}

export function sameResearchUrl(left: unknown, right: unknown) {
  const first = normaliseWebUrl(left);
  const second = normaliseWebUrl(right);
  return Boolean(first && second && first === second);
}

export function researchSourceLabel(
  value: unknown,
  fallback = 'Statistics source',
) {
  if (isHost(value, 'sofascore.com')) return 'Sofascore';
  if (isHost(value, 'transfermarkt.com')) return 'Transfermarkt';
  if (isHost(value, 'wyscout.com')) return 'Wyscout';
  if (isHost(value, 'fbref.com')) return 'FBref';
  if (isHost(value, 'fotmob.com')) return 'FotMob';
  if (isHost(value, 'soccerway.com')) return 'Soccerway';
  if (isHost(value, 'statsbomb.com')) return 'StatsBomb';
  return fallback;
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
  const url = normaliseWebUrl(raw);
  return url && isHost(url, 'instagram.com') ? url : null;
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
      const transfermarktUrl = normaliseWebUrl(input.transfermarktUrl);
      const directTransfermarkt =
        transfermarktUrl && isTransfermarktUrl(transfermarktUrl)
          ? transfermarktUrl
          : null;

      links.push(
        directOrSearch(
          'transfermarkt',
          directTransfermarkt,
          'Transfermarkt',
          transfermarktSearch(identity),
          'Find Transfermarkt',
        ),
      );

      const wyscout = normaliseWebUrl(input.wyscoutUrl);
      if (wyscout) {
        links.push({ platform: 'wyscout', label: 'Wyscout', href: wyscout, mode: 'direct' });
      }

      const statsUrl = normaliseWebUrl(input.statsUrl);
      if (
        statsUrl &&
        !isTransfermarktUrl(statsUrl) &&
        !sameResearchUrl(statsUrl, directTransfermarkt)
      ) {
        const hostname = webHostname(statsUrl);
        const platform: ResearchPlatform = hostname.includes('sofascore.com')
          ? 'sofascore'
          : hostname.includes('fotmob.com')
            ? 'fotmob'
            : hostname.includes('soccerway.com')
              ? 'soccerway'
              : 'stats';
        links.push({
          platform,
          label: researchSourceLabel(statsUrl),
          href: statsUrl,
          mode: 'direct',
        });
      }

      links.push(
        directOrSearch(
          'instagram',
          instagramHref(input.instagramUrl),
          'Instagram',
          instagramSearch(identity),
          'Find Instagram',
        ),
      );
    }
  }

  if (input.kind === 'club' && organisationIdentity) {
    const website = normaliseWebUrl(input.websiteUrl);
    const transfermarktUrl = normaliseWebUrl(input.transfermarktUrl);
    const savedTransfermarkt = transfermarktUrl && isTransfermarktUrl(transfermarktUrl)
      ? transfermarktUrl
      : website && isTransfermarktUrl(website)
        ? website
        : null;

    if (website && !savedTransfermarkt) {
      links.push({ platform: 'website', label: 'Website', href: website, mode: 'direct' });
    }
    links.push(
      directOrSearch(
        'transfermarkt',
        savedTransfermarkt,
        'Transfermarkt',
        transfermarktSearch(organisationIdentity),
        'Find Transfermarkt',
      ),
      directOrSearch(
        'instagram',
        instagramHref(input.instagramUrl),
        'Instagram',
        instagramSearch(organisationIdentity),
        'Find Instagram',
      ),
      directOrSearch(
        'linkedin',
        isHost(input.linkedinUrl, 'linkedin.com')
          ? normaliseWebUrl(input.linkedinUrl)
          : null,
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
        isHost(input.linkedinUrl, 'linkedin.com')
          ? normaliseWebUrl(input.linkedinUrl)
          : null,
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
