import Link from 'next/link';
import CaptureSession from '@/components/CaptureSession';
import AiFullPage from '@/components/AiFullPage';

export const metadata = { title: 'Capture | ReDream AI' };

export default async function CapturePage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <Link href={`/workspace/${encodeURIComponent(tenantSlug)}`}>Back to workspace</Link>
      <h1>Capture</h1>
      <p>ReDream AI</p>
      <CaptureSession><AiFullPage /></CaptureSession>
    </main>
  );
}
