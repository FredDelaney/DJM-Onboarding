import AgencyDocumentStudio from "@/components/AgencyDocumentStudio";
export const metadata = {
  title: "Documents",
  description: "Create and manage your agency documents.",
  robots: { index: false, follow: false },
};
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <AgencyDocumentStudio workspaceSlug={tenantSlug} />;
}
