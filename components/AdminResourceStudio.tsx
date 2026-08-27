'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpenCheck,
  Check,
  Eye,
  EyeOff,
  FilePlus2,
  Pencil,
  Sparkles,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';

type Resource = Record<string, any>;

type ResourceDraft = {
  title: string;
  description: string;
  category: string;
  resource_type: string;
  url: string;
  audience: string;
  featured: boolean;
  published: boolean;
};

const EMPTY_DRAFT: ResourceDraft = {
  title: '',
  description: '',
  category: 'Career preparation',
  resource_type: 'article',
  url: '',
  audience: 'players',
  featured: false,
  published: false,
};

const STARTER_IDEAS: Array<Pick<ResourceDraft, 'title' | 'description' | 'category' | 'resource_type'>> = [
  {
    title: 'Contract meeting question sheet',
    description: 'A DJM-reviewed checklist a player can open before a contract or renewal conversation.',
    category: 'Contract',
    resource_type: 'document',
  },
  {
    title: 'Move-abroad preparation guide',
    description: 'Practical preparation covering family, housing, work rights and the first 30 days.',
    category: 'International move',
    resource_type: 'article',
  },
  {
    title: 'Match footage self-review',
    description: 'A short framework for choosing clips that show role execution rather than highlights alone.',
    category: 'Performance evidence',
    resource_type: 'video',
  },
];

const safeDestination = (value: string) => {
  const candidate = value.trim();
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return true;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

export default function AdminResourceStudio({
  resources,
  canManage,
  userId,
  onRefresh,
  onFlash,
}: {
  resources: Resource[];
  canManage: boolean;
  userId: string;
  onRefresh: () => Promise<void>;
  onFlash: (message: string) => void;
}) {
  const [draft, setDraft] = useState<ResourceDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedResources = useMemo(
    () =>
      [...resources].sort(
        (a, b) =>
          Number(Boolean(b.published)) - Number(Boolean(a.published)) ||
          Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
          Number(a.sort_order || 0) - Number(b.sort_order || 0),
      ),
    [resources],
  );

  const startEdit = (resource: Resource) => {
    setEditingId(String(resource.id));
    setDraft({
      title: String(resource.title || ''),
      description: String(resource.description || ''),
      category: String(resource.category || 'Career preparation'),
      resource_type: String(resource.resource_type || 'article'),
      url: String(resource.url || ''),
      audience: String(resource.audience || 'players'),
      featured: Boolean(resource.featured),
      published: Boolean(resource.published),
    });
  };

  const reset = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const save = async () => {
    if (!canManage || !draft.title.trim()) return;
    if (!safeDestination(draft.url)) {
      onFlash('Add a safe https:// link or an app path beginning with /.');
      return;
    }

    setBusy(true);
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      category: draft.category.trim() || null,
      resource_type: draft.resource_type,
      url: draft.url.trim(),
      audience: draft.audience,
      featured: draft.featured,
      published: draft.published,
    };

    const result = editingId
      ? await supabase.from('resources').update(payload).eq('id', editingId)
      : await supabase.from('resources').insert({
          ...payload,
          created_by: userId,
          sort_order: resources.length,
        });

    setBusy(false);
    if (result.error) {
      onFlash(result.error.message || 'Could not save resource');
      return;
    }

    onFlash(editingId ? 'Resource updated' : 'Resource created');
    reset();
    await onRefresh();
  };

  const togglePublished = async (resource: Resource) => {
    if (!canManage) return;
    const nextPublished = !resource.published;
    const { error } = await supabase
      .from('resources')
      .update({ published: nextPublished })
      .eq('id', resource.id);

    if (error) {
      onFlash(error.message || 'Could not update publication');
      return;
    }

    onFlash(nextPublished ? 'Resource is live for its audience' : 'Resource moved back to draft');
    await onRefresh();
  };

  return (
    <div className="admin-value-grid">
      <section className="admin-command-panel admin-resource-library-panel">
        <div className="admin-command-panel-head">
          <div>
            <span className="admin-command-kicker">PLAYER VALUE LIBRARY</span>
            <h2>Useful after the login, not just another link list.</h2>
            <p>
              Publish DJM-reviewed tools into the player Career workspace. Drafts stay private until an admin turns them on.
            </p>
          </div>
          <div className="admin-command-stat-pair" aria-label="Resource coverage">
            <div><strong>{resources.filter((resource) => resource.published).length}</strong><span>live</span></div>
            <div><strong>{resources.filter((resource) => resource.featured).length}</strong><span>featured</span></div>
          </div>
        </div>

        <div className="admin-resource-list">
          {sortedResources.length ? (
            sortedResources.map((resource) => (
              <article className="admin-resource-row" key={resource.id}>
                <div className={`admin-resource-state ${resource.published ? 'is-live' : ''}`}>
                  {resource.published ? <Eye size={15} /> : <EyeOff size={15} />}
                </div>
                <div className="admin-resource-copy">
                  <div className="admin-resource-meta">
                    <span>{resource.category || 'Resource'}</span>
                    <span>{resource.audience}</span>
                    {resource.featured ? <span className="is-featured">Featured</span> : null}
                  </div>
                  <strong>{resource.title}</strong>
                  <p>{resource.description || 'No description yet.'}</p>
                </div>
                <div className="admin-resource-actions">
                  {resource.url ? (
                    <a href={resource.url} target={String(resource.url).startsWith('/') ? undefined : '_blank'} rel="noreferrer" aria-label={`Open ${resource.title}`}>
                      <ArrowUpRight size={16} />
                    </a>
                  ) : null}
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => startEdit(resource)} aria-label={`Edit ${resource.title}`}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => void togglePublished(resource)}>
                        {resource.published ? 'Unpublish' : 'Publish'}
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="admin-command-empty">
              <BookOpenCheck size={24} />
              <strong>No resources yet</strong>
              <span>Create a reviewed resource before publishing it to players.</span>
            </div>
          )}
        </div>
      </section>

      <aside className="admin-command-panel admin-resource-editor">
        <div className="admin-command-panel-head is-compact">
          <div>
            <span className="admin-command-kicker">{editingId ? 'EDIT RESOURCE' : 'CREATE RESOURCE'}</span>
            <h2>{editingId ? 'Refine the player value.' : 'Turn DJM knowledge into an asset.'}</h2>
          </div>
          <FilePlus2 size={21} />
        </div>

        {!canManage ? (
          <div className="admin-command-callout">
            <Check size={18} />
            <p>Your scoped role can review published resources. Full admins control publication.</p>
          </div>
        ) : (
          <>
            {!editingId ? (
              <div className="admin-resource-starters">
                <span>Start with a high-value format</span>
                {STARTER_IDEAS.map((idea) => (
                  <button
                    type="button"
                    key={idea.title}
                    onClick={() => setDraft((current) => ({ ...current, ...idea }))}
                  >
                    <Sparkles size={13} />
                    {idea.title}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="admin-command-field">
              <span>Title</span>
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What will the player get?" />
            </label>
            <label className="admin-command-field">
              <span>Why it is useful</span>
              <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="The practical outcome for a professional player…" />
            </label>
            <div className="admin-command-field-grid">
              <label className="admin-command-field">
                <span>Category</span>
                <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
              </label>
              <label className="admin-command-field">
                <span>Format</span>
                <select value={draft.resource_type} onChange={(event) => setDraft({ ...draft, resource_type: event.target.value })}>
                  <option value="article">Article</option>
                  <option value="document">Document</option>
                  <option value="video">Video</option>
                  <option value="link">Link</option>
                  <option value="contact">Contact</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <label className="admin-command-field">
              <span>Destination</span>
              <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://… or /career…" />
            </label>
            <div className="admin-command-field-grid">
              <label className="admin-command-field">
                <span>Audience</span>
                <select value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })}>
                  <option value="players">Players</option>
                  <option value="staff">Staff</option>
                  <option value="all">Everyone</option>
                </select>
              </label>
              <div className="admin-resource-switches">
                <label><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /> Featured</label>
                <label><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Publish now</label>
              </div>
            </div>
            <div className="admin-resource-editor-actions">
              {editingId ? <button type="button" className="is-quiet" onClick={reset}>Cancel</button> : null}
              <button type="button" className="is-primary" onClick={() => void save()} disabled={busy || !draft.title.trim() || !draft.url.trim()}>
                {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create resource'}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
