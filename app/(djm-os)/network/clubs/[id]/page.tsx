'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  MessageCircleMore,
  Pencil,
  Save,
  Target,
  X,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import ResearchLinkRail from '@/components/ResearchLinkRail';
import { compactDateTime, djmRpc, friendlyError, initials } from '@/lib/djm-os';
import { buildResearchLinks } from '@/lib/research-links';

export default function ClubWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', country: '', city: '', website_url: '' });

  const load = async () => {
    setBusy(true); setError('');
    try {
      const result:any = await djmRpc('djm_network_club_workspace', { p_organisation_id: id });
      setData(result);
      const org=result?.organisation;
      if (org) setForm({ name:org.name||'', country:org.country||'', city:org.city||'', website_url:org.website_url||'' });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [id]);

  const saveClub = async (event:FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true); setError('');
    try {
      await djmRpc('djm_network_update_club_profile', {
        p_organisation_id:id, p_name:form.name.trim(), p_country:form.country.trim()||null,
        p_city:form.city.trim()||null, p_website_url:form.website_url.trim()||null,
      });
      setEditing(false); await load();
    } catch(e){ setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const closeTask = async (taskId:string) => {
    try { await djmRpc('djm_network_set_task_status',{p_task_id:taskId,p_status:'completed'}); await load(); }
    catch(e){ setError(friendlyError(e)); }
  };

  const deleteClub = async () => {
    try {
      const impact:any=await djmRpc('djm_delete_preview',{p_entity_type:'club',p_entity_id:id});
      if(!window.confirm(`Permanently delete ${org?.name||'this club'}? This removes ${impact?.contacts||0} club relationships, ${impact?.needs||0} club needs and ${impact?.deals||0} Deal Rooms. Conversation records that can safely survive will be detached.`)) return;
      await djmRpc('djm_delete_entity',{p_entity_type:'club',p_entity_id:id,p_confirm:true});
      router.push('/network');
    } catch(e){ setError(friendlyError(e)); }
  };

  const org=data?.organisation;
  const summary=data?.summary||{};

  return (
    <DjmOsShell eyebrow="Club relationship workspace" title={org?.name||'Club'}>
      <div className="djm-os-toolbar">
        <Link href="/network" className="djm-os-secondary-button" style={{textDecoration:'none'}}><ArrowLeft size={15}/>Network</Link>
        <div className="djm-os-button-row">
          {org?.website_url ? <a className="djm-os-secondary-button" href={org.website_url} target="_blank" rel="noreferrer">Club website</a> : null}
          <button className="djm-os-secondary-button" onClick={()=>setEditing((x)=>!x)}>{editing?<X size={15}/>:<Pencil size={15}/>} {editing?'Cancel edit':'Edit club'}</button>
          <button className="djm-os-secondary-button" onClick={()=>void deleteClub()}>Delete club</button>
        </div>
      </div>

      {org ? (
        <ResearchLinkRail
          links={buildResearchLinks({
            kind: 'club',
            name: org.name,
            country: org.country,
            websiteUrl: org.website_url,
            instagramUrl: org.instagram_url,
            linkedinUrl: org.linkedin_url,
          })}
          title="Club research"
        />
      ) : null}

      {error ? <div className="djm-os-error"><AlertCircle size={17}/><span>{error}</span><button onClick={()=>setError('')}>Dismiss</button></div>:null}
      {!data ? <div className="djm-os-empty"><Building2 size={25}/><p>{busy?'Loading club…':'Club not found.'}</p></div> : <>
        {editing ? <section className="djm-os-panel" style={{marginBottom:16}}><div className="djm-os-panel-head"><div><h2>Edit club profile</h2><p>Automatic data stays editable. Saving here becomes DJM's current truth.</p></div><Pencil size={19}/></div><form className="djm-os-form djm-os-form-grid" onSubmit={saveClub}><label>Club name<input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label>Country<input value={form.country} onChange={(e)=>setForm({...form,country:e.target.value})}/></label><label>City<input value={form.city} onChange={(e)=>setForm({...form,city:e.target.value})}/></label><label>Website<input value={form.website_url} onChange={(e)=>setForm({...form,website_url:e.target.value})} placeholder="https://..."/></label><div style={{display:'flex',alignItems:'end'}}><button className="djm-os-primary-button" disabled={busy}><Save size={15}/>{busy?'Saving…':'Save club'}</button></div></form></section>:null}

        <section className="djm-os-metrics">
          <Metric label="Club contacts" value={summary.contact_count||0}/><Metric label="Active needs" value={summary.active_need_count||0}/><Metric label="Open tasks" value={summary.open_task_count||0}/><Metric label="Last contact" value={summary.last_interaction_at?compactDateTime(summary.last_interaction_at):'-'}/>
        </section>

        <div className="djm-os-grid djm-os-grid-2">
          <section className="djm-os-panel"><div className="djm-os-panel-head"><div><h2>Best routes in</h2><p>Who should DJM use to approach this club?</p></div></div>{(data.best_routes||[]).length?<div className="djm-os-list">{data.best_routes.map((route:any)=><article className="djm-os-list-row" key={`${route.person_id}-${route.team_member_id}`}><div><strong>{route.person_name}</strong><p>{[route.role_title,route.team_member_name].filter(Boolean).join(' · ')}</p><small>Relationship {route.relationship_strength||0} · access {route.access_score||0}</small></div><div className="djm-os-score"><b>{route.route_score||0}</b><small>route</small></div></article>)}</div>:<Empty text="No relationship routes yet."/>}</section>

          <section className="djm-os-panel"><div className="djm-os-panel-head"><div><h2>Open commitments</h2><p>Only things DJM genuinely needs to do.</p></div></div>{(data.open_tasks||[]).length?<div className="djm-os-list">{data.open_tasks.map((task:any)=><article className="djm-os-list-row" key={task.id}><div style={{flex:1}}><strong>{task.title}</strong><p>{[task.person_name,task.owner_name].filter(Boolean).join(' · ')}</p><small>{task.due_at?`Due ${compactDateTime(task.due_at)}`:'No deadline'}</small></div><button className="djm-os-icon-button is-success" onClick={()=>void closeTask(task.id)} aria-label="Complete"><CheckCircle2 size={17}/></button></article>)}</div>:<Empty text="No open commitments."/>}</section>
        </div>

        <section className="djm-os-panel" style={{marginBottom:16}}><div className="djm-os-panel-head"><div><h2>Club contacts</h2><p>Current decision-makers and relationship ownership.</p></div></div>{(data.contacts||[]).length?<div className="djm-os-card-grid">{data.contacts.map((person:any)=><Link href={`/network/contacts/${person.id}`} className="djm-os-person-card" key={person.id} style={{textDecoration:'none',color:'inherit'}}><div className="djm-os-avatar">{initials(person.full_name)}</div><div className="djm-os-person-main"><strong>{person.full_name}</strong><span>{person.role_title||'Club contact'}</span><small>{person.best_owner?`Best DJM route: ${person.best_owner}`:'Relationship not assigned'}</small></div><div className="djm-os-score"><b>{person.relationship_strength||0}</b><small>relationship</small></div><div className="djm-os-card-contact">{person.whatsapp?<span><MessageCircleMore size={14}/> {person.whatsapp}</span>:null}{person.email?<span>{person.email}</span>:null}<small>Last contact {compactDateTime(person.last_interaction_at)}</small></div></Link>)}</div>:<Empty text="No current club contacts yet."/>}</section>

        <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel"><div className="djm-os-panel-head"><div><h2>Club needs</h2><p>Requests flow into Market for hard-constraint and evidence review.</p></div><Target size={19}/></div>{(data.needs||[]).length?<div className="djm-os-list">{data.needs.map((need:any)=>{const count=Number(need.match_count||0);return <Link href="/market" className="djm-os-list-row" style={{textDecoration:'none',color:'inherit'}} key={need.id}><div style={{flex:1}}><strong>{need.title||need.position}</strong><p>{[need.position,need.preferred_foot,need.transfer_type].filter(Boolean).join(' · ')}</p><small>{need.status} · {count ? `${count} candidate record${count===1?'':'s'} to review` : 'no candidate evidence'}</small></div><span className={`djm-evidence-state ${count?'is-review':'is-missing'}`}>{count?'Review evidence':'Qualification gap'}</span></Link>;})}</div>:<Empty text="No club needs recorded."/>}</section>
          <section className="djm-os-panel"><div className="djm-os-panel-head"><div><h2>Relationship timeline</h2><p>Conversations, events and changes in one history.</p></div></div>{(data.timeline||[]).length?<div className="djm-os-list">{data.timeline.slice(0,30).map((item:any)=><article className="djm-os-feed-row" key={`${item.item_type}-${item.id}`}><span className="djm-os-feed-dot"/><div><strong>{item.person_name||item.team_member_name||item.subtype}</strong><p>{item.summary}</p><small>{item.subtype} · {compactDateTime(item.occurred_at)}</small></div></article>)}</div>:<Empty text="No club timeline yet."/>}</section>
        </div>
      </>}
    </DjmOsShell>
  );
}

function Metric({label,value}:{label:string;value:string|number}){return <div className="djm-os-metric"><strong>{value}</strong><span>{label}</span></div>}
function Empty({text}:{text:string}){return <div className="djm-os-empty"><Building2 size={24}/><p>{text}</p></div>}
