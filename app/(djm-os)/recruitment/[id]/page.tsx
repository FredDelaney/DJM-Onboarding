import { redirect } from 'next/navigation';
import { legacyWorkspaceRecordHref } from '@/lib/legacy-workspace-route';

export default async function LegacyRouteRedirect({params}:{params:Promise<{id:string}>}) {
  redirect(legacyWorkspaceRecordHref('recruitment',(await params).id));
}
