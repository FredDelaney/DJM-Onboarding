import CaptureWorkspaceHeader from '@/components/CaptureWorkspaceHeader';
import CaptureSession from '@/components/CaptureSession';
import LegacyCaptureRoute from '@/components/LegacyCaptureRoute';

export default function LegacyCapturePage() {
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
    <CaptureWorkspaceHeader/>
    <CaptureSession><LegacyCaptureRoute /></CaptureSession>
  </main>;
}
