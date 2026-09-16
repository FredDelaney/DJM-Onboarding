import CaptureSession from '@/components/CaptureSession';
import LegacyCaptureRoute from '@/components/LegacyCaptureRoute';

export default function LegacyCapturePage() {
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
    <h1>Capture</h1><p>ReDream AI</p>
    <CaptureSession><LegacyCaptureRoute /></CaptureSession>
  </main>;
}
