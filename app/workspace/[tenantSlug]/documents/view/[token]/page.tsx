import AgencyDocumentRecipient from "@/components/AgencyDocumentRecipient";
export const metadata = {
  title: "Shared document",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function DocumentLinkPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; token: string }>;
}) {
  const { tenantSlug, token } = await params;
  return <AgencyDocumentRecipient workspaceSlug={tenantSlug} token={token} />;
}
