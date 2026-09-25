import { redirect } from 'next/navigation';

export default function LegacyAdminPlayersRoute() {
  redirect('/agency?view=players');
}
