import CaptureWorkspaceHeader from '@/components/CaptureWorkspaceHeader';
import CaptureSession from '@/components/CaptureSession';
import AiFullPage from '@/components/AiFullPage';

export const metadata = { title: 'Tell ReDream | ReDream' };

export default async function CapturePage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <CaptureWorkspaceHeader workspaceSlug={tenantSlug}/>
      <CaptureSession><AiFullPage /></CaptureSession>
    </main>
  );
}
