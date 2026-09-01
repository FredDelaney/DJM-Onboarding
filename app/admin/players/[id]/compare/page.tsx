import { redirect } from 'next/navigation';

export default async function PlayerComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/players/${id}`);
}
