import AgencyDocumentStudio from "@/components/AgencyDocumentStudio";
export const metadata = {
  title: "Documents",
  description: "Create and manage your agency documents.",
  robots: { index: false, follow: false },
};
export default async function DocumentsPage({
  params, searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ capture?: string | string[]; preparation?: string | string[] }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  return <AgencyDocumentStudio workspaceSlug={tenantSlug} sourceCapture={typeof query.capture === "string" ? query.capture : ""} sourcePreparation={typeof query.preparation === "string" ? query.preparation : ""} />;
}
