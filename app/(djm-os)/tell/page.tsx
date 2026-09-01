import DjmOsShell from '@/components/DjmOsShell';
import TellDjmFullPage from '@/components/TellDjmFullPage';

export default function TellDjmPage() {
  return (
    <DjmOsShell title="Tell DJM" eyebrow="Capture">
      <div style={{ width: 'min(720px, 100%)', margin: '0 auto' }}>
        <TellDjmFullPage />
      </div>
    </DjmOsShell>
  );
}
