import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  CalendarRange,
  ChartNoAxesCombined,
  Compass,
  FileCheck2,
  FolderLock,
  MessageCircleQuestion,
} from 'lucide-react';

const lanes = [
  { href: '/home#week', label: 'Week', detail: 'Your next useful action', icon: CalendarRange },
  { href: '/career#toolkit', label: 'Development', detail: 'Tools for the work', icon: Activity },
  { href: '/home#season', label: 'Season', detail: 'Minutes and momentum', icon: ChartNoAxesCombined },
  { href: '/cv', label: 'Evidence', detail: 'Your approved football record', icon: FileCheck2 },
  { href: '/career#record', label: 'Career', detail: 'History, contract and direction', icon: Compass },
  { href: '/inbox?compose=1', label: 'Decisions', detail: 'Ask DJM before it matters', icon: MessageCircleQuestion },
  { href: '/documents', label: 'Vault', detail: 'Private documents and expiry', icon: FolderLock },
] as const;

export default function PlayerCareerNavigator({ current }: { current: 'week' | 'career' }) {
  return (
    <nav className="player-career-navigator" aria-label="My career areas">
      <div className="player-career-navigator-head">
        <div><span>MY PROFESSIONAL SYSTEM</span><strong>Everything that helps you perform, prepare and decide.</strong></div>
        <small>Private to you and DJM unless you approve a club-facing record.</small>
      </div>
      <div className="player-career-lanes">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          const active = current === 'week' ? lane.label === 'Week' : lane.label === 'Career';
          return (
            <Link href={lane.href} key={lane.label} className={active ? 'is-active' : ''} aria-current={active ? 'location' : undefined}>
              <Icon size={17} />
              <span><strong>{lane.label}</strong><small>{lane.detail}</small></span>
              <ArrowUpRight size={13} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
