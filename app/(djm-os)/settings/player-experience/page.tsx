'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Bell, ShieldCheck } from 'lucide-react';

import AdminResourceStudio from '@/components/AdminResourceStudio';
import DjmOsShell from '@/components/DjmOsShell';
import { useAdmin } from '@/components/AdminShell';
import { friendlyError } from '@/lib/djm-os';
import { supabase } from '@/lib/supabase';

export default function PlayerExperienceSettingsPage() {
  const auth = useAdmin();
  const isAdmin = auth.profile?.role === 'admin';
  const userId = String(auth.user?.id || '');
  const [resources, setResources] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(true);
  const [publishBusy, setPublishBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [resourceResult, announcementResult] = await Promise.all([
        supabase.from('resources').select('id,title,description,category,resource_type,url,audience,featured,published,sort_order,created_by,created_at,updated_at').order('sort_order'),
        supabase.from('announcements').select('id,title,body,target_player_id,published,starts_at,ends_at,created_by,created_at').order('created_at', { ascending: false }).limit(12),
      ]);
      if (resourceResult.error) throw resourceResult.error;
      if (announcementResult.error) throw announcementResult.error;
      setResources(resourceResult.data || []);
      setAnnouncements(announcementResult.data || []);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.loading && auth.user) void load();
  }, [auth.loading, auth.user, load]);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !announcement.trim()) return;
    setPublishBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: publishError } = await supabase.from('announcements').insert({
        title: 'From DJM',
        body: announcement.trim(),
        published: true,
        created_by: userId,
      });
      if (publishError) throw publishError;
      const push = await supabase.functions.invoke('dispatch-player-push', { body: { reason: 'announcement' } });
      setAnnouncement('');
      setMessage(push.error ? 'Announcement published. Push delivery needs review.' : 'Announcement published to players.');
      await load();
    } catch (publishError) {
      setError(friendlyError(publishError));
    } finally {
      setPublishBusy(false);
    }
  };

  return (
    <DjmOsShell eyebrow="Settings · player service" title="Player experience">
      <Link href="/settings" className="ux-back-link"><ArrowLeft size={15} />Settings</Link>
      {error ? <div className="ux-alert ux-alert-error"><AlertCircle size={17} />{error}</div> : null}
      {message ? <div className="ux-alert ux-alert-success">{message}</div> : null}

      <section className="ux-surface">
        <div className="ux-surface-head"><div><p className="ux-eyebrow">FROM DJM</p><h2>Meaningful player updates</h2><p>Use announcements for information players genuinely need. Successful automation should not create noise.</p></div><Bell size={20} /></div>
        {isAdmin ? (
          <form className="ux-simple-form" onSubmit={publish}>
            <label>Announcement<textarea rows={4} value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="What do players need to know?" /></label>
            <button className="ux-primary-action" type="submit" disabled={publishBusy || !announcement.trim()}>{publishBusy ? 'Publishing...' : 'Publish to players'}</button>
          </form>
        ) : <div className="ux-mini-empty"><ShieldCheck size={18} />Only administrators can publish player-wide announcements.</div>}
        <div className="ux-announcement-list">
          {announcements.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{item.body}</p><small>{item.published ? 'Published' : 'Draft'}</small></article>)}
          {!announcements.length && !busy ? <p className="ux-muted-copy">No recent player announcements.</p> : null}
        </div>
      </section>

      <section className="ux-surface ux-resource-settings">
        <div className="ux-surface-head"><div><p className="ux-eyebrow">PLAYER LIBRARY</p><h2>Resources</h2><p>Keep the useful guidance players can access through their DJM experience.</p></div></div>
        <AdminResourceStudio
          resources={resources}
          canManage={isAdmin}
          userId={userId}
          onRefresh={load}
          onFlash={(text) => setMessage(text)}
        />
      </section>
    </DjmOsShell>
  );
}
