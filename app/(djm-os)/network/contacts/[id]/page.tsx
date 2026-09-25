import { redirect } from 'next/navigation';

export default function LegacyRouteRedirect() {
  redirect('/agency?view=relationships');
}
