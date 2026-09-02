'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, Download, Share2, Smartphone } from 'lucide-react';

import { enableWebPush, getPushReadiness, type PushReadiness } from '@/lib/push';

export default function AppExperience({ userId, mode = 'player' }: { userId: string; mode?: 'player' | 'admin' }) {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<any>(null);
  const [pushState, setPushState] = useState<PushReadiness>('unsupported');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone));
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    void getPushReadiness().then(setPushState);

    const onPrompt = (event: any) => {
      event.preventDefault();
      setPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
      setStandalone(true);
      return;
    }
    if (ios) {
      setToast('On iPhone: tap Share, then Add to Home Screen.');
      window.setTimeout(() => setToast(''), 4500);
    }
  };

  const enablePush = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await enableWebPush(userId);
      setPushState('enabled');
      setToast('Notifications enabled');
      window.setTimeout(() => setToast(''), 1800);
    } catch (error: any) {
      setPushState(await getPushReadiness());
      setToast(error?.message || 'Could not enable notifications yet');
      window.setTimeout(() => setToast(''), 2800);
    } finally {
      setBusy(false);
    }
  };

  if (standalone && pushState === 'unsupported') return null;

  return (
    <section className="card pad app-experience">
      <div className="section-kicker">{mode === 'admin' ? 'DJM ADMIN APP' : 'DJM PLAYER APP'}</div>
      {!standalone ? (
        <div className="app-setting-row">
          <div className="list-icon"><Smartphone size={18} /></div>
          <div className="list-copy"><strong>{mode === 'admin' ? 'Keep DJM Admin on your phone' : 'Keep DJM Player on your phone'}</strong><span>Open it like an app, without hunting for the link.</span></div>
          <button className="btn btn-quiet btn-sm" onClick={install}>{prompt ? <><Download size={14} /> Install</> : ios ? <><Share2 size={14} /> How</> : <><Download size={14} /> Install</>}</button>
        </div>
      ) : (
        <div className="app-setting-row"><div className="list-icon"><Check size={18} /></div><div className="list-copy"><strong>Installed</strong><span>DJM Player is running as a standalone app.</span></div></div>
      )}

      {pushState !== 'unsupported' ? (
        <div className="app-setting-row">
          <div className="list-icon"><Bell size={18} /></div>
          <div className="list-copy">
            <strong>DJM notifications</strong>
            <span>{pushState === 'enabled' ? 'This device can receive DJM alerts.' : pushState === 'denied' ? 'Notifications are blocked in your device settings.' : pushState === 'needs_install' ? 'Add DJM to your iPhone Home Screen first.' : mode === 'admin' ? 'Get notified when an important DJM action is due.' : 'Get notified when DJM needs something from you.'}</span>
          </div>
          {pushState === 'enabled' ? <span className="pill pill-green">On</span> : pushState === 'ready' ? <button className="btn btn-quiet btn-sm" onClick={() => void enablePush()} disabled={busy}>{busy ? 'Enabling...' : 'Enable'}</button> : null}
        </div>
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </section>
  );
}
