'use client';

import {useEffect,useState} from 'react';
import {useParams,useRouter} from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,Save,Send,ShieldCheck,ExternalLink,Copy,Eye,Upload,Plus,Check,
  MessageCircle,Activity,FileText,BriefcaseBusiness,Video,BarChart3,Trash2
} from 'lucide-react';
import {AdminShell,useAdmin} from '@/components/AdminShell';
import {fmtDate,publicFile,supabase} from '@/lib/supabase';

const txt=(v:any)=>v??'';
const arr=(v:any)=>Array.isArray(v)?v.join(', '):'';
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);

type ImportedStatRow={
  season_label?:string|null;
  club_name?:string|null;
  league?:string|null;
  country?:string|null;
  appearances?:number|null;
  starts?:number|null;
  goals?:number|null;
  assists?:number|null;
  minutes?:number|null;
};

export default function AdminPlayer(){
  const {id}=useParams<{id:string}>();
  const router=useRouter();
  const auth=useAdmin();

  const [tab,setTab]=useState('overview');
  const [p,setP]=useState<any>(null);
  const [pr,setPr]=useState<any>({});
  const [requests,setRequests]=useState<any[]>([]);
  const [templates,setTemplates]=useState<any[]>([]);
  const [checks,setChecks]=useState<any[]>([]);
  const [audits,setAudits]=useState<any[]>([]);
  const [notes,setNotes]=useState<any[]>([]);
  const [opps,setOpps]=useState<any[]>([]);
  const [agreements,setAgreements]=useState<any[]>([]);
  const [docs,setDocs]=useState<any[]>([]);
  const [career,setCareer]=useState<any[]>([]);
  const [videos,setVideos]=useState<any[]>([]);
  const [cv,setCv]=useState<any>({});
  const [pub,setPub]=useState<any>(null);
  const [shares,setShares]=useState<any[]>([]);
  const [pushSubs,setPushSubs]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState('');

  const [reqTitle,setReqTitle]=useState('');
  const [reqMsg,setReqMsg]=useState('');
  const [reqType,setReqType]=useState('action');
  const [note,setNote]=useState('');
  const [oppClub,setOppClub]=useState('');
  const [oppSummary,setOppSummary]=useState('');
  const [careerClub,setCareerClub]=useState('');
  const [careerSeason,setCareerSeason]=useState('');
  const [videoUrl,setVideoUrl]=useState('');
  const [videoTitle,setVideoTitle]=useState('');

  const [statsOpen,setStatsOpen]=useState(false);
  const [statsText,setStatsText]=useState('');
  const [statsRows,setStatsRows]=useState<ImportedStatRow[]>([]);
  const [statsWarnings,setStatsWarnings]=useState<string[]>([]);
  const [statsSource,setStatsSource]=useState('');

  const load=async()=>{
    const [
      {data:pd},{data:priv},{data:r},{data:rt},{data:c},{data:au},{data:n},
      {data:o},{data:a},{data:d},{data:ce},{data:v},{data:cs},{data:pp},{data:s}
    ]=await Promise.all([
      supabase.from('players').select('*').eq('id',id).maybeSingle(),
      supabase.from('player_private').select('*').eq('player_id',id).maybeSingle(),
      supabase.from('player_requests').select('*').eq('player_id',id).order('created_at',{ascending:false}),
      supabase.from('request_templates').select('*').eq('active',true).order('sort_order'),
      supabase.from('weekly_checkins').select('*').eq('player_id',id).order('week_start',{ascending:false}),
      supabase.from('audit_events').select('*').eq('entity_id',id).order('created_at',{ascending:false}).limit(30),
      supabase.from('admin_notes').select('*').eq('player_id',id).order('pinned',{ascending:false}).order('created_at',{ascending:false}),
      supabase.from('player_opportunities').select('*').eq('player_id',id).order('updated_at',{ascending:false}),
      supabase.from('player_agreements').select('*').eq('player_id',id).order('end_date',{ascending:true}),
      supabase.from('player_documents').select('*').eq('player_id',id).order('created_at',{ascending:false}),
      supabase.from('career_entries').select('*').eq('player_id',id).order('sort_order').order('start_date',{ascending:false}),
      supabase.from('player_videos').select('*').eq('player_id',id).order('featured',{ascending:false}).order('sort_order'),
      supabase.from('player_cv_settings').select('*').eq('player_id',id).maybeSingle(),
      supabase.from('player_public_profiles').select('*').eq('player_id',id).maybeSingle(),
      supabase.from('club_share_links').select('*').eq('player_id',id).order('created_at',{ascending:false})
    ]);

    setP(pd);
    setPr(priv||{});
    setRequests(r||[]);
    setTemplates(rt||[]);
    setChecks(c||[]);
    setAudits(au||[]);
    setNotes(n||[]);
    setOpps(o||[]);
    setAgreements(a||[]);
    setDocs(d||[]);
    setCareer(ce||[]);
    setVideos(v||[]);
    setCv(cs||{});
    setPub(pp);
    setShares(s||[]);

    if(pd?.user_id){
      const {data:ps}=await supabase
        .from('push_subscriptions')
        .select('id,platform,device_label,enabled')
        .eq('user_id',pd.user_id)
        .eq('enabled',true);
      setPushSubs(ps||[]);
    }else{
      setPushSubs([]);
    }
  };

  useEffect(()=>{
    if(!auth.loading)load();
  },[auth.loading,id]);

  if(auth.loading||!p){
    return <div className="center"><div className="loader"/></div>;
  }

  const name=[p.first_name,p.last_name].filter(Boolean).join(' ')||p.preferred_name||'Unnamed player';
  const photo=publicFile('player-public',p.profile_photo_path);
  const openReq=requests.filter(r=>r.status!=='completed');
  const incoming=requests.filter(r=>r.status!=='completed'&&['message','signal'].includes(r.request_type));
  const latest=checks[0];
  const liveOpps=opps.filter(o=>!['won','lost','closed'].includes(o.stage));
  const isFullAdmin=auth.profile?.role==='admin';

  const flash=(m:string)=>{
    setToast(m);
    setTimeout(()=>setToast(''),2200);
  };

  const updateStat=(i:number,k:'label'|'value',v:string)=>
    setCv({...cv,key_stats:(Array.isArray(cv.key_stats)?cv.key_stats:[]).map((x:any,ix:number)=>ix===i?{...x,[k]:v}:x)});

  const addStat=()=>setCv({
    ...cv,
    key_stats:[...(Array.isArray(cv.key_stats)?cv.key_stats:[]),{label:'',value:''}]
  });

  const removeStat=(i:number)=>setCv({
    ...cv,
    key_stats:(Array.isArray(cv.key_stats)?cv.key_stats:[]).filter((_:any,ix:number)=>ix!==i)
  });

  const toggleSection=(key:string)=>{
    const h=Array.isArray(cv.hidden_sections)?cv.hidden_sections:[];
    setCv({...cv,hidden_sections:h.includes(key)?h.filter((x:string)=>x!==key):[...h,key]});
  };

  const save=async()=>{
    setBusy(true);

    const results=await Promise.all([
      supabase.from('players').update({
        first_name:p.first_name||null,
        last_name:p.last_name||null,
        preferred_name:p.preferred_name||null,
        date_of_birth:p.date_of_birth||null,
        nationalities:String(p.nationalitiesInput??arr(p.nationalities)).split(',').map((x:string)=>x.trim()).filter(Boolean),
        height_cm:p.height_cm?Number(p.height_cm):null,
        preferred_foot:p.preferred_foot||null,
        primary_position:p.primary_position||null,
        secondary_positions:String(p.secondaryInput??arr(p.secondary_positions)).split(',').map((x:string)=>x.trim()).filter(Boolean),
        current_club:p.current_club||null,
        current_league:p.current_league||null,
        current_country:p.current_country||null,
        contract_status:p.contract_status||null,
        contract_expiry:p.contract_expiry||null,
        transfermarkt_url:p.transfermarkt_url||null,
        wyscout_url:p.wyscout_url||null,
        stats_url:p.stats_url||null,
        instagram_url:p.instagram_url||null,
        agency_priority:p.agency_priority||'normal',
        next_action:p.next_action||null,
        next_action_due:p.next_action_due||null
      }).eq('id',id),

      supabase.from('player_private').upsert({
        player_id:id,
        phone:pr.phone||null,
        personal_email:pr.personal_email||null,
        whatsapp:pr.whatsapp||null,
        residence_country:pr.residence_country||null,
        passports_held:String(pr.passportsInput??arr(pr.passports_held)).split(',').map((x:string)=>x.trim()).filter(Boolean),
        work_rights:pr.work_rights||null,
        market_preferences:pr.market_preferences||null,
        relocation_preferences:pr.relocation_preferences||null,
        preferred_move_timing:pr.preferred_move_timing||null,
        salary_expectation:pr.salary_expectation||null,
        travel_availability:pr.travel_availability||null
      }),

      supabase.from('player_cv_settings').upsert({
        player_id:id,
        intro_line:cv.intro_line||null,
        why_review:cv.why_review||null,
        hide_market_value:cv.hide_market_value??true,
        hidden_sections:cv.hidden_sections||[],
        custom_sections:cv.custom_sections||[],
        section_order:cv.section_order||['hero','facts','why_review','stats','career','videos','contact'],
        career_summary:cv.career_summary||null,
        key_stats:cv.key_stats||[],
        notable_experience:cv.notable_experience||[],
        market_value_display:cv.market_value_display||null,
        market_value_source_url:cv.market_value_source_url||null
      })
    ]);

    const failed=results.find((r:any)=>r.error);
    if(failed?.error){
      setBusy(false);
      flash(failed.error.message||'Could not save player');
      return false;
    }

    await load();
    setBusy(false);
    flash('Saved');
    return true;
  };

  const verify=async()=>{
    const saved=await save();
    if(!saved)return;

    const {error}=await supabase.from('players').update({
      verification_status:'verified',
      verified_at:new Date().toISOString(),
      review_required_at:null,
      review_reason:null
    }).eq('id',id);

    if(error){
      flash(error.message||'Could not verify player');
      return;
    }

    await load();
    flash('Current player data verified');
  };

  const uploadPhoto=async(e:any)=>{
    const f=e.target.files?.[0];
    if(!f)return;

    const ext=f.name.split('.').pop()||'jpg';
    const path=`admin/${id}/profile-${Date.now()}.${ext}`;

    setBusy(true);

    const {error:uploadError}=await supabase.storage
      .from('player-public')
      .upload(path,f,{upsert:false});

    if(uploadError){
      setBusy(false);
      flash(uploadError.message||'Could not upload photo');
      return;
    }

    const {error:saveError}=await supabase
      .from('players')
      .update({profile_photo_path:path})
      .eq('id',id);

    if(saveError){
      setBusy(false);
      flash(saveError.message||'Could not attach photo');
      return;
    }

    await load();
    setBusy(false);
    flash('Photo updated');
  };

  const sendRequest=async()=>{
    if(!reqTitle.trim())return;

    const {error}=await supabase.from('player_requests').insert({
      player_id:id,
      title:reqTitle.trim(),
      message:reqMsg.trim()||null,
      request_type:reqType,
      status:'open',
      created_by:auth.user.id
    });

    if(error){
      flash('Could not send request');
      return;
    }

    const push=await supabase.functions.invoke('dispatch-player-push',{body:{reason:'request'}});
    setReqTitle('');
    setReqMsg('');
    setReqType('action');
    await load();

    const pushed=Number(push.data?.sent||0);
    flash(
      push.error
        ?'Request sent · push pending'
        :pushed>0
          ?'Request sent · notification delivered'
          :'Request sent · no push device yet'
    );
  };

  const addNote=async()=>{
    if(!note.trim())return;
    const {error}=await supabase.from('admin_notes').insert({
      player_id:id,
      author_id:auth.user.id,
      body:note.trim()
    });
    if(error){flash('Could not add note');return;}
    setNote('');
    await load();
    flash('Note added');
  };

  const addOpp=async()=>{
    if(!oppClub.trim())return;
    const {error}=await supabase.from('player_opportunities').insert({
      player_id:id,
      club_name:oppClub.trim(),
      summary:oppSummary.trim()||null,
      stage:'targeted',
      owner_id:auth.user.id
    });
    if(error){flash('Could not add opportunity');return;}
    setOppClub('');
    setOppSummary('');
    await load();
    flash('Opportunity added');
  };

  const addCareer=async()=>{
    if(!careerClub.trim())return;
    const {error}=await supabase.from('career_entries').insert({
      player_id:id,
      club_name:careerClub.trim(),
      season_label:careerSeason.trim()||null,
      sort_order:career.length
    });
    if(error){flash('Could not add career entry');return;}
    setCareerClub('');
    setCareerSeason('');
    await load();
    flash('Career entry added · verification required');
  };

  const addVideo=async()=>{
    if(!videoUrl.trim())return;
    const {error}=await supabase.from('player_videos').insert({
      player_id:id,
      title:videoTitle.trim()||'Player video',
      url:videoUrl.trim(),
      video_type:'highlight',
      featured:videos.length===0,
      sort_order:videos.length
    });
    if(error){flash('Could not add video');return;}
    setVideoUrl('');
    setVideoTitle('');
    await load();
    flash('Video added');
  };

  const openDocument=async(d:any)=>{
    const {data,error}=await supabase.storage
      .from(d.bucket_id||'player-private')
      .createSignedUrl(d.object_path,120);

    if(error||!data?.signedUrl){
      flash('Could not open document');
      return;
    }

    window.open(data.signedUrl,'_blank');
  };

  const toggleClubDocument=async(d:any)=>{
    const next=!d.club_shareable;
    const {error}=await supabase.from('player_documents')
      .update({club_shareable:next})
      .eq('id',d.id);

    if(error){flash('Could not update club sharing');return;}
    await load();
    flash(next?'Approved for club share':'Returned to private');
  };

  const uploadDocument=async(e:any)=>{
    const file=e.target.files?.[0];
    if(!file)return;

    setBusy(true);
    const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const path=`${auth.user.id}/admin-${id}/${Date.now()}-${safe}`;

    const {error:up}=await supabase.storage.from('player-private').upload(path,file);

    if(up){
      setBusy(false);
      flash('Could not upload document');
      return;
    }

    const {error:rec}=await supabase.from('player_documents').insert({
      player_id:id,
      title:file.name,
      document_type:'other',
      bucket_id:'player-private',
      object_path:path,
      club_shareable:false,
      uploaded_by:auth.user.id
    });

    if(rec){
      await supabase.storage.from('player-private').remove([path]);
      setBusy(false);
      flash('Could not save document');
      return;
    }

    await load();
    setBusy(false);
    flash('Document uploaded privately');
  };

  const publish=async()=>{
    setBusy(true);

    const {data:fresh}=await supabase
      .from('players')
      .select('verification_status,verified_at')
      .eq('id',id)
      .maybeSingle();

    if(fresh?.verification_status!=='verified'||!fresh?.verified_at){
      setBusy(false);
      flash('Verify current player data before publishing');
      return false;
    }

    if(!(cv.hide_market_value??true)&&cv.market_value_display&&!cv.market_value_source_url){
      setBusy(false);
      flash('Add a source URL before showing market value');
      return false;
    }

    const age=p.date_of_birth
      ?String(Math.floor((Date.now()-new Date(p.date_of_birth).getTime())/(365.2425*86400000)))
      :null;

    const publicSlug=pub?.public_slug||`${slug(name)||'player'}-${id.slice(0,5)}`;
    const selected=videos.filter(v=>v.featured).length
      ?videos.filter(v=>v.featured)
      :videos.slice(0,4);

    const timeline=career.map(c=>({
      club_name:c.club_name,
      country:c.country,
      league:c.league,
      season_label:c.season_label,
      start_date:c.start_date,
      end_date:c.end_date,
      appearances:c.appearances,
      starts:c.starts,
      minutes:c.minutes,
      goals:c.goals,
      assists:c.assists,
      source_name:c.source_name,
      source_url:c.source_url
    }));

    const payload:any={
      player_id:id,
      public_slug:publicSlug,
      published:true,
      published_at:pub?.published_at||new Date().toISOString(),
      display_name:name,
      headline:cv.intro_line||`${p.primary_position||'Professional footballer'}${p.current_club?` · ${p.current_club}`:''}`,
      primary_position:p.primary_position,
      secondary_positions:p.secondary_positions||[],
      preferred_foot:p.preferred_foot,
      age_display:age,
      height_display:p.height_cm?`${p.height_cm} cm`:null,
      nationalities:p.nationalities||[],
      current_status:p.contract_status,
      current_club:p.current_club,
      key_stats:(cv.key_stats?.length?cv.key_stats:pub?.key_stats)||[],
      why_review:cv.why_review||pub?.why_review||null,
      career_summary:cv.career_summary||pub?.career_summary||null,
      profile_photo_path:p.profile_photo_path,
      primary_video_url:selected?.[0]?.url||null,
      transfermarkt_url:p.transfermarkt_url,
      wyscout_url:p.wyscout_url,
      stats_url:p.stats_url||null,
      contact_email:'jesse.edge@djmsports.com',
      career_timeline:timeline,
      selected_videos:selected.map((v:any)=>({
        title:v.title,
        url:v.url,
        video_type:v.video_type
      })),
      notable_experience:(cv.notable_experience?.length?cv.notable_experience:pub?.notable_experience)||[],
      market_value_display:cv.market_value_display||pub?.market_value_display||null,
      market_value_source_url:cv.market_value_source_url||pub?.market_value_source_url||null,
      hidden_sections:cv.hidden_sections||[],
      hide_market_value:cv.hide_market_value??true,
      verified_at:p.verified_at||null
    };

    const {error}=await supabase.from('player_public_profiles').upsert(payload);

    if(error){
      setBusy(false);
      flash(error.message||'Could not publish club profile');
      return false;
    }

    await load();
    setBusy(false);
    flash(pub?.published?'Live profile updated':'Club profile published');
    return true;
  };

  const unpublish=async()=>{
    const {error}=await supabase.from('player_public_profiles')
      .update({published:false})
      .eq('player_id',id);

    if(error){flash('Could not unpublish profile');return;}
    await load();
    flash('Profile unpublished');
  };

  const createShare=async()=>{
    const label=window.prompt('Club / contact label for this link?','Club share');
    if(!label)return;

    const exp=new Date(Date.now()+30*86400000).toISOString();
    const {data,error}=await supabase.from('club_share_links').insert({
      player_id:id,
      label,
      expires_at:exp,
      created_by:auth.user.id
    }).select('*').single();

    if(error||!data){
      flash('Could not create tracked link');
      return;
    }

    await navigator.clipboard.writeText(`${window.location.origin}/s/${data.token}`);
    flash('Tracked club link copied');
    await load();
  };

  const openStatsImport=()=>{
    setStatsSource(p.transfermarkt_url||p.stats_url||'');
    setStatsText('');
    setStatsRows([]);
    setStatsWarnings([]);
    setStatsOpen(true);
  };

  const parseStats=async()=>{
    if(!statsText.trim())return;

    setBusy(true);
    const {data,error}=await supabase.functions.invoke('import-player-stats',{
      body:{mode:'parse',text:statsText}
    });
    setBusy(false);

    if(error){
      flash(error.message||'Could not parse stats');
      return;
    }

    setStatsRows(Array.isArray(data?.rows)?data.rows:[]);
    setStatsWarnings(Array.isArray(data?.warnings)?data.warnings:[]);

    if(!data?.rows?.length){
      flash('No season rows recognised');
    }
  };

  const editStatsRow=(index:number,key:keyof ImportedStatRow,value:any)=>{
    setStatsRows(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));
  };

  const applyStats=async()=>{
    const usable=statsRows.filter(r=>String(r.season_label||'').trim()&&String(r.club_name||'').trim());

    if(!usable.length){
      flash('Each imported row needs a season and club');
      return;
    }

    setBusy(true);
    const {data,error}=await supabase.functions.invoke('import-player-stats',{
      body:{
        mode:'apply',
        player_id:id,
        source_name:'Transfermarkt',
        source_url:statsSource||p.transfermarkt_url||null,
        rows:usable
      }
    });
    setBusy(false);

    if(error||!data?.ok){
      flash(data?.error||error?.message||'Stats import failed');
      return;
    }

    setStatsOpen(false);
    setStatsText('');
    setStatsRows([]);
    setStatsWarnings([]);
    await load();
    setTab('cv');
    flash(`${data.total} season${data.total===1?'':'s'} imported · verify before publishing`);
  };

  const removePlayer=async()=>{
    if(!isFullAdmin)return;

    const first=window.confirm(
      `Permanently remove ${name} from DJM Player?\n\nThis removes their player record, CV, check-ins, requests, opportunities, share links and stored player files.`
    );
    if(!first)return;

    const confirmation=window.prompt(`Type "${name}" to confirm permanent removal.`);
    if(!confirmation)return;

    setBusy(true);
    const {data,error}=await supabase.functions.invoke('remove-player',{
      body:{player_id:id,confirmation}
    });
    setBusy(false);

    if(error||!data?.ok){
      flash(data?.error||error?.message||'Could not remove player');
      return;
    }

    router.replace('/admin');
    router.refresh();
  };

  const tabs=['overview','inbox','profile','cv','activity'];

  return (
    <AdminShell>
      <main className="container admin-main">
        <Link href="/admin" className="small muted row" style={{display:'inline-flex',marginBottom:22}}>
          <ArrowLeft size={15}/> Back to players
        </Link>

        <div className="row-between" style={{alignItems:'flex-start'}}>
          <div className="row" style={{alignItems:'flex-start',gap:18}}>
            <label className="avatar avatar-xl" style={{cursor:'pointer'}}>
              {photo?<img src={photo} alt=""/>:<Upload size={22}/>}
              <input type="file" hidden accept="image/*" onChange={uploadPhoto}/>
            </label>

            <div>
              <div className="row" style={{flexWrap:'wrap'}}>
                <h1 className="admin-title">{name}</h1>
                <span className={`pill ${p.verification_status==='verified'?'pill-good':p.verification_status==='reviewing'?'pill-warn':''}`}>
                  {p.verification_status}
                </span>
              </div>

              <div className="muted" style={{marginTop:7}}>
                {[p.primary_position,p.current_club,p.current_country].filter(Boolean).join(' · ')||'Player information incomplete'}
              </div>

              <div className="row" style={{marginTop:13,flexWrap:'wrap'}}>
                {p.agency_priority&&<span className="pill">{p.agency_priority} priority</span>}
                {openReq.length>0&&<span className="pill pill-blue">{openReq.length} open request{openReq.length>1?'s':''}</span>}
                {liveOpps.length>0&&<span className="pill pill-blue">{liveOpps.length} club opportunit{liveOpps.length>1?'ies':'y'}</span>}
                {p.user_id&&<span className={`pill ${pushSubs.length?'pill-good':''}`}>{pushSubs.length?'Push on':'No push device'}</span>}
              </div>
            </div>
          </div>

          <div className="row" style={{flexWrap:'wrap',justifyContent:'flex-end'}}>
            <button className="btn btn-quiet btn-sm" onClick={verify}>
              <ShieldCheck size={15}/> Verify
            </button>
            <button className="btn btn-navy btn-sm" onClick={save} disabled={busy}>
              <Save size={15}/>{busy?'Saving…':'Save'}
            </button>
          </div>
        </div>

        <div className="admin-tabs" style={{display:'inline-flex',marginTop:28}}>
          {tabs.map(t=>
            <button
              key={t}
              onClick={()=>setTab(t)}
              className={`admin-tab ${tab===t?'active':''}`}
              style={{border:0}}
            >
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          )}
        </div>

        {tab==='overview'&&(
          <div className="grid-main" style={{marginTop:22}}>
            <div className="stack" style={{gap:20}}>
              <section className="admin-card">
                <div className="section-kicker">NEXT DJM MOVE</div>
                <h2 className="section-title">Keep representation moving.</h2>

                <div className="grid2" style={{marginTop:18}}>
                  <div className="field">
                    <label className="label">Priority</label>
                    <select className="select" value={p.agency_priority||'normal'} onChange={e=>setP({...p,agency_priority:e.target.value})}>
                      <option>low</option>
                      <option>normal</option>
                      <option>high</option>
                      <option>urgent</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Due</label>
                    <input className="input" type="date" value={p.next_action_due||''} onChange={e=>setP({...p,next_action_due:e.target.value})}/>
                  </div>
                </div>

                <div className="field" style={{marginTop:14}}>
                  <label className="label">Next action</label>
                  <input className="input" value={p.next_action||''} onChange={e=>setP({...p,next_action:e.target.value})} placeholder="What should DJM do next?"/>
                </div>
              </section>

              <section className="admin-card">
                <div className="row-between">
                  <div>
                    <div className="section-kicker">CLUB ACTIVITY</div>
                    <h2 className="section-title">Opportunities</h2>
                  </div>
                  <span className="pill">{liveOpps.length} live</span>
                </div>

                <div className="list-clean" style={{marginTop:10}}>
                  {opps.map(o=>
                    <div className="list-row" key={o.id}>
                      <div className="list-icon"><BriefcaseBusiness size={17}/></div>
                      <div className="list-copy">
                        <strong>{o.club_name}</strong>
                        <span>{o.stage}{o.summary?` · ${o.summary}`:''}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid2" style={{marginTop:14}}>
                  <input className="input" value={oppClub} onChange={e=>setOppClub(e.target.value)} placeholder="Club name"/>
                  <input className="input" value={oppSummary} onChange={e=>setOppSummary(e.target.value)} placeholder="Short context"/>
                </div>

                <button className="btn btn-quiet btn-sm" style={{marginTop:10}} onClick={addOpp}>
                  <Plus size={14}/> Add opportunity
                </button>
              </section>

              <section className="admin-card">
                <div className="section-kicker">INTERNAL NOTES</div>

                <div className="list-clean">
                  {notes.slice(0,8).map(n=>
                    <div className="list-row" key={n.id}>
                      <div className="list-copy">
                        <strong>{n.pinned?'Pinned note':'DJM note'}</strong>
                        <span style={{whiteSpace:'normal'}}>{n.body}</span>
                      </div>
                      <span className="tiny muted">{fmtDate(n.created_at)}</span>
                    </div>
                  )}
                </div>

                <textarea className="textarea" style={{marginTop:12,minHeight:88}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Private DJM note…"/>
                <button className="btn btn-dark btn-sm" style={{marginTop:10}} onClick={addNote}>
                  <Plus size={14}/> Add note
                </button>
              </section>
            </div>

            <aside className="stack admin-sidebar" style={{gap:18}}>
              <section className="admin-card">
                <div className="section-kicker">PLAYER PULSE</div>
                <div className="list-clean">
                  <div className="list-row">
                    <div className="list-icon"><Activity size={17}/></div>
                    <div className="list-copy"><strong>Latest check-in</strong><span>{latest?fmtDate(latest.submitted_at):'Never'}</span></div>
                  </div>
                  <div className="list-row">
                    <div className="list-icon"><MessageCircle size={17}/></div>
                    <div className="list-copy"><strong>Player inbox</strong><span>{incoming.length}</span></div>
                  </div>
                  <div className="list-row">
                    <div className="list-icon"><ShieldCheck size={17}/></div>
                    <div className="list-copy"><strong>Verified</strong><span>{p.verified_at?fmtDate(p.verified_at):'Not yet'}</span></div>
                  </div>
                </div>
              </section>

              <section className="admin-card">
                <div className="section-kicker">AUTHORITY</div>
                {agreements.length
                  ?<div className="list-clean">
                    {agreements.map(a=>
                      <div className="list-row" key={a.id}>
                        <div className="list-copy">
                          <strong>{a.title||a.agreement_type}</strong>
                          <span>{a.status}{a.end_date?` · to ${fmtDate(a.end_date)}`:''}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  :<div className="empty" style={{padding:'18px 0'}}>No authority records yet.</div>
                }
              </section>
            </aside>
          </div>
        )}

        {tab==='inbox'&&(
          <div className="grid-main" style={{marginTop:22}}>
            <section className="admin-card">
              <div className="section-kicker">PLAYER CONVERSATION</div>
              <h2 className="section-title">Requests & messages</h2>

              <div className="list-clean" style={{marginTop:14}}>
                {requests.map(r=>
                  <div className="list-row" key={r.id}>
                    <div className="list-icon"><MessageCircle size={17}/></div>
                    <div className="list-copy">
                      <strong>{r.title}</strong>
                      <span style={{whiteSpace:'normal'}}>
                        {r.request_type==='message'?'Player message · ':r.request_type==='signal'?'Check-in alert · ':''}
                        {r.message||r.player_reply||'No message'} · {r.status}
                      </span>
                    </div>
                    <span className="tiny muted">{fmtDate(r.created_at)}</span>
                  </div>
                )}
              </div>
            </section>

            <aside className="admin-card admin-sidebar">
              <div className="section-kicker">SEND TO PLAYER</div>
              <h3 style={{margin:'0 0 8px'}}>Ask for one clear thing.</h3>
              <p className="small muted">Use a DJM shortcut or write your own request.</p>

              {templates.length>0&&(
                <div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'14px 0 16px'}}>
                  {templates.map(t=>
                    <button
                      key={t.id}
                      className="pill"
                      style={{border:0,cursor:'pointer',textAlign:'left'}}
                      onClick={()=>{setReqTitle(t.title);setReqMsg(t.message||'');setReqType(t.request_type||'action')}}
                    >
                      {t.title}
                    </button>
                  )}
                </div>
              )}

              <div className="stack">
                <input className="input" value={reqTitle} onChange={e=>setReqTitle(e.target.value)} placeholder="What do you need?"/>
                <textarea className="textarea" value={reqMsg} onChange={e=>setReqMsg(e.target.value)} placeholder="Short context (optional)"/>
                <button className="btn btn-navy btn-block" onClick={sendRequest} disabled={!reqTitle.trim()}>
                  <Send size={15}/> Send to player
                </button>
              </div>
            </aside>
          </div>
        )}

        {tab==='profile'&&(
          <div className="grid-main" style={{marginTop:22}}>
            <div className="stack" style={{gap:20}}>
              <section className="admin-card">
                <div className="section-kicker">MASTER FOOTBALL RECORD</div>
                <h2 className="section-title">One source of truth.</h2>

                <div className="form-section">
                  <div className="grid2">
                    <F label="First name" value={p.first_name} on={v=>setP({...p,first_name:v})}/>
                    <F label="Last name" value={p.last_name} on={v=>setP({...p,last_name:v})}/>
                    <F label="Known as" value={p.preferred_name} on={v=>setP({...p,preferred_name:v})}/>
                    <F label="Date of birth" type="date" value={p.date_of_birth} on={v=>setP({...p,date_of_birth:v})}/>
                    <F label="Nationalities" value={p.nationalitiesInput??arr(p.nationalities)} on={v=>setP({...p,nationalitiesInput:v})}/>
                    <F label="Height cm" value={p.height_cm} on={v=>setP({...p,height_cm:v})}/>
                    <F label="Preferred foot" value={p.preferred_foot} on={v=>setP({...p,preferred_foot:v})}/>
                    <F label="Primary position" value={p.primary_position} on={v=>setP({...p,primary_position:v})}/>
                    <F label="Other positions" value={p.secondaryInput??arr(p.secondary_positions)} on={v=>setP({...p,secondaryInput:v})}/>
                    <F label="Current club" value={p.current_club} on={v=>setP({...p,current_club:v})}/>
                    <F label="League" value={p.current_league} on={v=>setP({...p,current_league:v})}/>
                    <F label="Country" value={p.current_country} on={v=>setP({...p,current_country:v})}/>
                    <F label="Contract status" value={p.contract_status} on={v=>setP({...p,contract_status:v})}/>
                    <F label="Contract expiry" type="date" value={p.contract_expiry} on={v=>setP({...p,contract_expiry:v})}/>
                  </div>
                </div>
              </section>

              <section className="admin-card">
                <div className="section-kicker">PRIVATE DJM / PLAYER</div>

                <div className="grid2">
                  <F label="Email" value={pr.personal_email} on={v=>setPr({...pr,personal_email:v})}/>
                  <F label="Phone" value={pr.phone} on={v=>setPr({...pr,phone:v})}/>
                  <F label="Passports" value={pr.passportsInput??arr(pr.passports_held)} on={v=>setPr({...pr,passportsInput:v})}/>
                  <F label="Work rights" value={pr.work_rights} on={v=>setPr({...pr,work_rights:v})}/>
                  <F label="Ideal timing" value={pr.preferred_move_timing} on={v=>setPr({...pr,preferred_move_timing:v})}/>
                  <F label="Salary expectation" value={pr.salary_expectation} on={v=>setPr({...pr,salary_expectation:v})}/>
                </div>

                <div className="field" style={{marginTop:14}}>
                  <label className="label">Markets</label>
                  <textarea className="textarea" value={pr.market_preferences||''} onChange={e=>setPr({...pr,market_preferences:e.target.value})}/>
                </div>

                <div className="field" style={{marginTop:14}}>
                  <label className="label">Relocation constraints</label>
                  <textarea className="textarea" value={pr.relocation_preferences||''} onChange={e=>setPr({...pr,relocation_preferences:e.target.value})}/>
                </div>
              </section>
            </div>

            <aside className="stack admin-sidebar">
              <section className="admin-card">
                <div className="section-kicker">SOURCE REVIEW</div>
                <h3 style={{marginTop:0}}>External references</h3>
                <p className="small muted">
                  Keep the source links that clubs and DJM use to verify the sporting record.
                </p>

                <div className="source-row">
                  {p.transfermarkt_url&&<a href={p.transfermarkt_url} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">Transfermarkt <ExternalLink size={13}/></a>}
                  {p.wyscout_url&&<a href={p.wyscout_url} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">Wyscout <ExternalLink size={13}/></a>}
                  {p.stats_url&&<a href={p.stats_url} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">Stats <ExternalLink size={13}/></a>}
                </div>

                <div className="divider"/>

                <div className="field">
                  <label className="label">Transfermarkt URL</label>
                  <input className="input" value={p.transfermarkt_url||''} onChange={e=>setP({...p,transfermarkt_url:e.target.value})}/>
                </div>

                <div className="field" style={{marginTop:10}}>
                  <label className="label">Wyscout URL</label>
                  <input className="input" value={p.wyscout_url||''} onChange={e=>setP({...p,wyscout_url:e.target.value})}/>
                </div>

                <div className="field" style={{marginTop:10}}>
                  <label className="label">Statistics URL</label>
                  <input className="input" value={p.stats_url||''} onChange={e=>setP({...p,stats_url:e.target.value})}/>
                </div>

                <button className="btn btn-navy btn-block" style={{marginTop:14}} onClick={save}>
                  <Save size={15}/> Save profile
                </button>
              </section>
            </aside>
          </div>
        )}

        {tab==='cv'&&(
          <div className="grid-main" style={{marginTop:22}}>
            <div className="stack" style={{gap:20}}>
              <section className="admin-card">
                <div className="row-between">
                  <div>
                    <div className="section-kicker">CLUB PROFILE EDITOR</div>
                    <h2 className="section-title">Control the story.</h2>
                  </div>
                  <span className={`pill ${pub?.published?'pill-good':''}`}>{pub?.published?'Live':'Draft'}</span>
                </div>

                <div className="field" style={{marginTop:20}}>
                  <label className="label">Headline</label>
                  <input className="input" value={cv.intro_line||''} onChange={e=>setCv({...cv,intro_line:e.target.value})} placeholder="Positioning line shown under the player name"/>
                </div>

                <div className="field" style={{marginTop:14}}>
                  <label className="label">Why review this player?</label>
                  <textarea className="textarea" value={cv.why_review||''} onChange={e=>setCv({...cv,why_review:e.target.value})} placeholder="Short, credible recruitment argument. No fluff."/>
                </div>

                <div className="field" style={{marginTop:14}}>
                  <label className="label">Player snapshot</label>
                  <textarea className="textarea" value={cv.career_summary||''} onChange={e=>setCv({...cv,career_summary:e.target.value})} placeholder="2–3 sentences of factual sporting context: level, role, current situation and strongest relevant experience."/>
                </div>

                <div className="form-section">
                  <div className="row-between">
                    <div>
                      <div className="section-kicker">KEY NUMBERS</div>
                      <span className="small muted">Only use numbers you can stand behind.</span>
                    </div>
                    <button className="btn btn-quiet btn-sm" onClick={addStat}><Plus size={14}/> Add stat</button>
                  </div>

                  <div className="stack" style={{marginTop:12}}>
                    {(Array.isArray(cv.key_stats)?cv.key_stats:[]).map((st:any,i:number)=>
                      <div key={i} className="grid2" style={{alignItems:'center'}}>
                        <input className="input" value={st.label||''} onChange={e=>updateStat(i,'label',e.target.value)} placeholder="Apps / Goals / Minutes / Caps…"/>
                        <div className="row">
                          <input className="input" value={st.value||''} onChange={e=>updateStat(i,'value',e.target.value)} placeholder="24 / 11 / 1,942…"/>
                          <button className="btn btn-quiet btn-sm" aria-label="Remove stat" onClick={()=>removeStat(i)}>×</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="field" style={{marginTop:2}}>
                  <label className="label">
                    Notable experience <span className="muted" style={{fontWeight:500}}>(one item per line)</span>
                  </label>
                  <textarea
                    className="textarea"
                    value={(Array.isArray(cv.notable_experience)?cv.notable_experience:[]).map((x:any)=>typeof x==='string'?x:x?.label||x?.title||'').join('\n')}
                    onChange={e=>setCv({...cv,notable_experience:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)})}
                    placeholder={"Senior international football\nEuropean competition\nPromotion-winning season"}
                  />
                </div>

                <div className="form-section">
                  <div className="section-kicker">MARKET VALUE</div>
                  <div className="grid2">
                    <div className="field">
                      <label className="label">Verified display value</label>
                      <input className="input" value={cv.market_value_display||''} onChange={e=>setCv({...cv,market_value_display:e.target.value})} placeholder="€500k"/>
                    </div>
                    <div className="field">
                      <label className="label">Source URL</label>
                      <input className="input" value={cv.market_value_source_url||''} onChange={e=>setCv({...cv,market_value_source_url:e.target.value})} placeholder="https://…"/>
                    </div>
                  </div>
                  <label className="row" style={{marginTop:13,fontSize:13,fontWeight:700}}>
                    <input type="checkbox" checked={!(cv.hide_market_value??true)} onChange={e=>setCv({...cv,hide_market_value:!e.target.checked})}/>
                    Show market value on club profile
                  </label>
                </div>

                <div className="form-section">
                  <div className="section-kicker">SECTIONS SHOWN TO CLUBS</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {[
                      ['summary','Snapshot'],['why_review','Why review'],['experience','Experience'],
                      ['stats','Key numbers'],['career','Career'],['videos','Video']
                    ].map(([key,label])=>{
                      const shown=!(cv.hidden_sections||[]).includes(key);
                      return (
                        <button
                          key={key}
                          className={`pill ${shown?'pill-blue':''}`}
                          style={{border:0,cursor:'pointer'}}
                          onClick={()=>toggleSection(key)}
                        >
                          {shown?<Check size={12}/>:null}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="row" style={{marginTop:16,flexWrap:'wrap'}}>
                  <button className="btn btn-quiet" onClick={save} disabled={busy}>
                    <Save size={15}/> Save draft
                  </button>

                  <button
                    className="btn btn-navy"
                    onClick={async()=>{const ok=await save();if(ok)await publish();}}
                    disabled={busy}
                  >
                    {pub?.published?'Update live profile':'Publish club profile'}
                  </button>

                  {pub?.published&&<>
                    <a href={`/p/${pub.public_slug}`} target="_blank" rel="noreferrer" className="btn btn-quiet">
                      <Eye size={15}/> View live
                    </a>
                    <button className="btn btn-quiet" onClick={createShare}>
                      <Copy size={15}/> Create tracked link
                    </button>
                    <button className="btn btn-outline" onClick={unpublish}>Unpublish</button>
                  </>}
                </div>
              </section>

              <section className="admin-card">
                <div className="row-between" style={{alignItems:'flex-start'}}>
                  <div>
                    <div className="section-kicker">SEASON STATISTICS</div>
                    <h3 style={{margin:0}}>Career & performance</h3>
                    <p className="small muted" style={{margin:'7px 0 0',lineHeight:1.45}}>
                      Apps, starts, goals, assists and minutes flow directly into the club dossier.
                    </p>
                  </div>

                  {isFullAdmin&&(
                    <button className="btn btn-navy btn-sm" onClick={openStatsImport}>
                      <BarChart3 size={15}/> Import season stats
                    </button>
                  )}
                </div>

                <div className="list-clean" style={{marginTop:12}}>
                  {career.map(c=>
                    <div className="list-row" key={c.id}>
                      <div className="list-icon"><BriefcaseBusiness size={16}/></div>
                      <div className="list-copy">
                        <strong>{c.club_name}</strong>
                        <span style={{whiteSpace:'normal'}}>
                          {[c.season_label,c.league,c.country].filter(Boolean).join(' · ')}
                          {(c.appearances!=null||c.starts!=null||c.goals!=null||c.assists!=null||c.minutes!=null)
                            ?` · ${[
                              c.appearances!=null?`${c.appearances} apps`:null,
                              c.starts!=null?`${c.starts} starts`:null,
                              c.goals!=null?`${c.goals} goals`:null,
                              c.assists!=null?`${c.assists} assists`:null,
                              c.minutes!=null?`${Number(c.minutes).toLocaleString('en-GB')} mins`:null
                            ].filter(Boolean).join(' · ')}`
                            :''
                          }
                          {c.source_name?` · Source: ${c.source_name}`:''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid2" style={{marginTop:12}}>
                  <input className="input" value={careerClub} onChange={e=>setCareerClub(e.target.value)} placeholder="Club"/>
                  <input className="input" value={careerSeason} onChange={e=>setCareerSeason(e.target.value)} placeholder="Season"/>
                </div>

                <button className="btn btn-quiet btn-sm" style={{marginTop:10}} onClick={addCareer}>
                  <Plus size={14}/> Add career entry
                </button>
              </section>

              <section className="admin-card">
                <div className="section-kicker">VIDEO</div>

                <div className="list-clean">
                  {videos.map(v=>
                    <a className="list-row" href={v.url} target="_blank" rel="noreferrer" key={v.id}>
                      <div className="list-icon"><Video size={16}/></div>
                      <div className="list-copy">
                        <strong>{v.title}</strong>
                        <span>{v.featured?'Featured · ':''}{v.video_type}</span>
                      </div>
                      <ExternalLink size={14}/>
                    </a>
                  )}
                </div>

                <div className="grid2" style={{marginTop:12}}>
                  <input className="input" value={videoTitle} onChange={e=>setVideoTitle(e.target.value)} placeholder="Video title"/>
                  <input className="input" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="URL"/>
                </div>

                <button className="btn btn-quiet btn-sm" style={{marginTop:10}} onClick={addVideo}>
                  <Plus size={14}/> Add video
                </button>
              </section>
            </div>

            <aside className="stack admin-sidebar">
              <section className="admin-card">
                <div className="section-kicker">SHARE ACTIVITY</div>
                {shares.length
                  ?<div className="list-clean">
                    {shares.map(s=>
                      <div className="list-row" key={s.id}>
                        <div className="list-copy">
                          <strong>{s.label||'Club share'}</strong>
                          <span>{s.view_count} view{s.view_count===1?'':'s'}{s.last_viewed_at?` · last ${fmtDate(s.last_viewed_at)}`:''}</span>
                        </div>
                        <button className="btn btn-quiet btn-sm" onClick={()=>navigator.clipboard.writeText(`${location.origin}/s/${s.token}`)}>
                          <Copy size={13}/>
                        </button>
                      </div>
                    )}
                  </div>
                  :<div className="empty" style={{padding:'18px 0'}}>No tracked links yet.</div>
                }
              </section>

              <section className="admin-card">
                <div className="section-kicker">VERIFICATION</div>
                <p className="small muted">Last verified: {p.verified_at?fmtDate(p.verified_at):'Never'}</p>
                {p.review_reason&&<p className="small" style={{lineHeight:1.5}}>{p.review_reason}</p>}
                <button className="btn btn-quiet btn-block" onClick={verify}>
                  <ShieldCheck size={15}/> Mark current data verified
                </button>
              </section>
            </aside>
          </div>
        )}

        {tab==='activity'&&(
          <div className="grid-main" style={{marginTop:22}}>
            <div className="stack" style={{gap:20}}>
              <section className="admin-card">
                <div className="section-kicker">WEEKLY CHECK-INS</div>
                <div className="list-clean">
                  {checks.map(c=>
                    <div className="list-row" key={c.id}>
                      <div className="list-icon"><Activity size={16}/></div>
                      <div className="list-copy">
                        <strong>{fmtDate(c.week_start)} · {c.availability_status||'No status'}</strong>
                        <span style={{whiteSpace:'normal'}}>
                          {[c.fitness_status,c.player_notes,c.support_request&&`Needs DJM: ${c.support_request}`].filter(Boolean).join(' · ')||'No extra notes'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="admin-card">
                <div className="row-between">
                  <div>
                    <div className="section-kicker">PRIVATE DOCUMENTS</div>
                    <span className="small muted">Only explicitly approved files can appear on a tracked club share.</span>
                  </div>
                  <label className={`btn btn-quiet btn-sm ${busy?'disabled':''}`}>
                    <Upload size={14}/> Upload
                    <input type="file" hidden onChange={uploadDocument}/>
                  </label>
                </div>

                <div className="list-clean" style={{marginTop:10}}>
                  {docs.map(d=>
                    <div className="list-row" key={d.id}>
                      <div className="list-icon"><FileText size={16}/></div>
                      <div className="list-copy">
                        <strong>{d.title}</strong>
                        <span>
                          {[d.document_type?.replace('_',' '),d.country,d.expires_at?`expires ${fmtDate(d.expires_at)}`:null,d.club_shareable?'Club-share approved':'Private'].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <button className="btn btn-quiet btn-sm" onClick={()=>openDocument(d)}>Open</button>
                      <button className={`btn btn-sm ${d.club_shareable?'btn-outline':'btn-quiet'}`} onClick={()=>toggleClubDocument(d)}>
                        {d.club_shareable?'Make private':'Approve'}
                      </button>
                    </div>
                  )}

                  {docs.length===0&&<div className="empty" style={{padding:'18px 0'}}>No private documents yet.</div>}
                </div>
              </section>

              <section className="admin-card">
                <div className="section-kicker">DJM HISTORY</div>
                <div className="list-clean">
                  {audits.map(a=>
                    <div className="list-row" key={a.id}>
                      <div className="list-copy">
                        <strong>{String(a.action||'').replaceAll('_',' ')}</strong>
                        <span>{fmtDate(a.created_at)}{a.metadata?.label?` · ${a.metadata.label}`:''}{a.metadata?.title?` · ${a.metadata.title}`:''}</span>
                      </div>
                    </div>
                  )}
                  {audits.length===0&&<div className="empty" style={{padding:'18px 0'}}>No sensitive DJM actions recorded yet.</div>}
                </div>
              </section>
            </div>

            <aside className="stack admin-sidebar">
              <section className="admin-card">
                <div className="section-kicker">AUTHORITY / AGREEMENTS</div>
                {agreements.map(a=>
                  <div className="list-row" key={a.id}>
                    <div className="list-copy">
                      <strong>{a.title||a.agreement_type}</strong>
                      <span>{a.status}{a.end_date?` · ${fmtDate(a.end_date)}`:''}</span>
                    </div>
                  </div>
                )}
              </section>

              {isFullAdmin&&(
                <section className="admin-card" style={{borderColor:'rgba(141,45,45,.16)'}}>
                  <div className="section-kicker">PLAYER ADMINISTRATION</div>
                  <h3 style={{margin:'0 0 8px'}}>Remove from DJM Player</h3>
                  <p className="small muted" style={{lineHeight:1.5}}>
                    Permanent. This removes the player record and linked app data. Use only when you are certain the record should no longer exist.
                  </p>
                  <button
                    className="btn btn-outline btn-block"
                    style={{color:'var(--danger)',borderColor:'rgba(141,45,45,.26)'}}
                    onClick={removePlayer}
                    disabled={busy}
                  >
                    <Trash2 size={15}/> Remove player
                  </button>
                </section>
              )}
            </aside>
          </div>
        )}

        {statsOpen&&(
          <div
            style={{
              position:'fixed',inset:0,zIndex:100,background:'rgba(3,12,22,.54)',
              display:'grid',placeItems:'center',padding:18,overflowY:'auto'
            }}
            onClick={()=>!busy&&setStatsOpen(false)}
          >
            <div
              className="card pad-lg card-shadow"
              style={{width:'min(920px,100%)',maxHeight:'92dvh',overflowY:'auto'}}
              onClick={e=>e.stopPropagation()}
            >
              <div className="row-between" style={{alignItems:'flex-start'}}>
                <div>
                  <div className="section-kicker">SEASON STATS IMPORT</div>
                  <h2 className="section-title">Bring the numbers into DJM.</h2>
                  <p className="small muted" style={{lineHeight:1.55,maxWidth:680}}>
                    Copy a season-stat table including its headings, paste it below, review the rows, then import.
                    Any change automatically returns the player to review status before the club dossier can be published again.
                  </p>
                </div>
                <button className="icon-btn" onClick={()=>setStatsOpen(false)} disabled={busy}>×</button>
              </div>

              {statsRows.length===0?(
                <>
                  <div className="field" style={{marginTop:20}}>
                    <label className="label">Source URL</label>
                    <input
                      className="input"
                      value={statsSource}
                      onChange={e=>setStatsSource(e.target.value)}
                      placeholder="Transfermarkt player / detailed stats URL"
                    />
                  </div>

                  <div className="field" style={{marginTop:14}}>
                    <label className="label">Paste season table</label>
                    <textarea
                      className="textarea"
                      style={{minHeight:220,fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',fontSize:13}}
                      value={statsText}
                      onChange={e=>setStatsText(e.target.value)}
                      placeholder={"Season\tClub\tCompetition\tApps\tStarts\tGoals\tAssists\tMinutes\n2025/26\tExample FC\tSerie A\t28\t21\t7\t5\t2,137"}
                    />
                  </div>

                  <div className="row" style={{marginTop:14,flexWrap:'wrap'}}>
                    {statsSource&&(
                      <a className="btn btn-quiet" href={statsSource} target="_blank" rel="noreferrer">
                        Open source <ExternalLink size={14}/>
                      </a>
                    )}
                    <button className="btn btn-navy" onClick={parseStats} disabled={busy||!statsText.trim()}>
                      <BarChart3 size={15}/>{busy?'Reading…':'Review imported rows'}
                    </button>
                  </div>
                </>
              ):(
                <>
                  {statsWarnings.length>0&&(
                    <div className="card pad soft" style={{marginTop:18}}>
                      <strong style={{fontSize:14}}>Review notes</strong>
                      {statsWarnings.map((w,i)=>
                        <div key={i} className="small muted" style={{marginTop:6,lineHeight:1.45}}>• {w}</div>
                      )}
                    </div>
                  )}

                  <div className="field" style={{marginTop:18}}>
                    <label className="label">Source URL saved against these seasons</label>
                    <input className="input" value={statsSource} onChange={e=>setStatsSource(e.target.value)}/>
                  </div>

                  <div className="stack" style={{gap:12,marginTop:18}}>
                    {statsRows.map((row,i)=>
                      <div className="card pad" key={i}>
                        <div className="row-between" style={{marginBottom:12}}>
                          <strong>Season {i+1}</strong>
                          <button className="btn btn-quiet btn-sm" onClick={()=>setStatsRows(rows=>rows.filter((_,ix)=>ix!==i))}>Remove</button>
                        </div>

                        <div className="grid2">
                          <StatField label="Season" value={row.season_label} on={v=>editStatsRow(i,'season_label',v)}/>
                          <StatField label="Club" value={row.club_name} on={v=>editStatsRow(i,'club_name',v)}/>
                          <StatField label="Competition" value={row.league} on={v=>editStatsRow(i,'league',v)}/>
                          <StatField label="Country" value={row.country} on={v=>editStatsRow(i,'country',v)}/>
                        </div>

                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,marginTop:10}}>
                          <StatField label="Apps" type="number" value={row.appearances} on={v=>editStatsRow(i,'appearances',v===''?null:Number(v))}/>
                          <StatField label="Starts" type="number" value={row.starts} on={v=>editStatsRow(i,'starts',v===''?null:Number(v))}/>
                          <StatField label="Goals" type="number" value={row.goals} on={v=>editStatsRow(i,'goals',v===''?null:Number(v))}/>
                          <StatField label="Assists" type="number" value={row.assists} on={v=>editStatsRow(i,'assists',v===''?null:Number(v))}/>
                          <StatField label="Minutes" type="number" value={row.minutes} on={v=>editStatsRow(i,'minutes',v===''?null:Number(v))}/>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="row" style={{marginTop:18,flexWrap:'wrap',justifyContent:'space-between'}}>
                    <button
                      className="btn btn-quiet"
                      onClick={()=>{setStatsRows([]);setStatsWarnings([]);}}
                      disabled={busy}
                    >
                      Back to paste
                    </button>

                    <button className="btn btn-navy" onClick={applyStats} disabled={busy||statsRows.length===0}>
                      <Check size={15}/>{busy?'Importing…':`Import ${statsRows.length} season${statsRows.length===1?'':'s'}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {toast&&<div className="toast">{toast}</div>}
      </main>
    </AdminShell>
  );
}

function F({label,value,on,type='text'}:{label:string,value:any,on:(v:string)=>void,type?:string}){
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input" type={type} value={txt(value)} onChange={e=>on(e.target.value)}/>
    </div>
  );
}

function StatField({
  label,value,on,type='text'
}:{
  label:string;
  value:any;
  on:(v:string)=>void;
  type?:string;
}){
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input" type={type} value={value??''} onChange={e=>on(e.target.value)}/>
    </div>
  );
}
