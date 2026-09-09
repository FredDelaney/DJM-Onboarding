import type { ReactNode } from 'react';

import './roster-overview.css';

export default function AdminRosterLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="djm-roster-visual-layer">{children}</div>;
}
