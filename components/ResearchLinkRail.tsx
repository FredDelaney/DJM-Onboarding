import {
  BarChart3,
  ExternalLink,
  Globe2,
  Instagram,
  Linkedin,
  Mail,
  MessageCircleMore,
  Search,
} from 'lucide-react';

import type { ResearchLink, ResearchPlatform } from '@/lib/research-links';
import styles from './ResearchLinkRail.module.css';

const ICONS: Record<ResearchPlatform, React.ReactNode> = {
  whatsapp: <MessageCircleMore size={14} />,
  email: <Mail size={14} />,
  transfermarkt: <ExternalLink size={14} />,
  sofascore: <BarChart3 size={14} />,
  instagram: <Instagram size={14} />,
  linkedin: <Linkedin size={14} />,
  website: <Globe2 size={14} />,
};

export default function ResearchLinkRail({
  links,
  compact = false,
  title = 'Research & contact',
}: {
  links: ResearchLink[];
  compact?: boolean;
  title?: string;
}) {
  if (!links.length) return null;

  return (
    <div className={`${styles.rail}${compact ? ` ${styles.compact}` : ''}`}>
      <div className={styles.heading}>
        <strong>{title}</strong>
        <span>Saved profiles first · targeted search where missing</span>
      </div>
      <div className={styles.links}>
        {links.map((link) => (
          <a
            key={`${link.platform}-${link.mode}`}
            className={`${styles.link} ${link.mode === 'direct' ? styles.direct : ''}`}
            data-platform={link.platform}
            href={link.href}
            target={link.href.startsWith('mailto:') ? undefined : '_blank'}
            rel={link.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
            title={`${link.label} · ${link.mode === 'direct' ? 'saved link' : 'targeted search'}`}
          >
            {link.mode === 'search' ? <Search size={13} /> : ICONS[link.platform]}
            <span>{link.label}</span>
            <span className={styles.mode}>{link.mode === 'direct' ? 'Saved' : 'Search'}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
