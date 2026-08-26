'use client';

import {useEffect,useState} from 'react';
import {useParams,useRouter} from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Send,
  ShieldCheck,
  ExternalLink,
  Copy,
  Eye,
  Upload,
  Plus,
  Check,
  MessageCircle,
  Activity,
  FileText,
  BriefcaseBusiness,
  Video,
  Trash2,
  Download,
  Link2,
  Clock3,
  X
} from 'lucide-react';

import {
  AdminShell,
  useAdmin
} from '@/components/AdminShell';

import {
  fmtDate,
  publicFile,
  supabase
} from '@/lib/supabase';

import {
  getClubReadyState
} from '@/lib/clubReady';

import ClubReadyPanel
  from '@/components/ClubReadyPanel';

import SeasonRecordEditor
  from '@/components/SeasonRecordEditor';

import RemovePlayerSheet
  from '@/components/RemovePlayerSheet';

const txt=(v:any)=>v??'';

const arr=(v:any)=>
  Array.isArray(v)
    ?v.join(', ')
    :'';

const slug=(s:string)=>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'')
    .slice(0,45);


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
  const [pdfBusy,setPdfBusy]=useState(false);
  const [toast,setToast]=useState('');

  const [reqTitle,setReqTitle]=useState('');
  const [reqMsg,setReqMsg]=useState('');
  const [reqType,setReqType]=useState('action');

  const [note,setNote]=useState('');

  const [oppClub,setOppClub]=useState('');
  const [oppSummary,setOppSummary]=useState('');

  const [videoUrl,setVideoUrl]=useState('');
  const [videoTitle,setVideoTitle]=useState('');

  const [shareOpen,setShareOpen]=useState(false);
  const [shareLabel,setShareLabel]=useState('');
  const [shareExpiryDays,setShareExpiryDays]=useState('30');
  const [shareBusy,setShareBusy]=useState(false);
  const [unpublishOpen,setUnpublishOpen]=useState(false);
  const [removeOpen,setRemoveOpen]=useState(false);

  const load=async()=>{
    const [
      {data:pd},
      {data:priv},
      {data:r},
      {data:rt},
      {data:c},
      {data:au},
      {data:n},
      {data:o},
      {data:a},
      {data:d},
      {data:ce},
      {data:v},
      {data:cs},
      {data:pp},
      {data:s}
    ]=await Promise.all([
      supabase
        .from('players')
        .select('*')
        .eq('id',id)
        .maybeSingle(),

      supabase
        .from('player_private')
        .select('*')
        .eq('player_id',id)
        .maybeSingle(),

      supabase
        .from('player_requests')
        .select('*')
        .eq('player_id',id)
        .order('created_at',{ascending:false}),

      supabase
        .from('request_templates')
        .select('*')
        .eq('active',true)
        .order('sort_order'),

      supabase
        .from('weekly_checkins')
        .select('*')
        .eq('player_id',id)
        .order('week_start',{ascending:false}),

      supabase
        .from('audit_events')
        .select('*')
        .eq('entity_id',id)
        .order('created_at',{ascending:false})
        .limit(30),

      supabase
        .from('admin_notes')
        .select('*')
        .eq('player_id',id)
        .order('pinned',{ascending:false})
        .order('created_at',{ascending:false}),

      supabase
        .from('player_opportunities')
        .select('*')
        .eq('player_id',id)
        .order('updated_at',{ascending:false}),

      supabase
        .from('player_agreements')
        .select('*')
        .eq('player_id',id)
        .order('end_date',{ascending:true}),

      supabase
        .from('player_documents')
        .select('*')
        .eq('player_id',id)
        .order('created_at',{ascending:false}),

supabase
  .from('career_entries')
  .select('*')
  .eq('player_id',id)
  .order('sort_order')
  .order(
    'start_date',
    {ascending:false}
  ),

      supabase
        .from('player_videos')
        .select('*')
        .eq('player_id',id)
        .order('featured',{ascending:false})
        .order('sort_order'),

      supabase
        .from('player_cv_settings')
        .select('*')
        .eq('player_id',id)
        .maybeSingle(),

      supabase
        .from('player_public_profiles')
        .select('*')
        .eq('player_id',id)
        .maybeSingle(),

      supabase
        .from('club_share_links')
        .select('*')
        .eq('player_id',id)
        .order('created_at',{ascending:false})
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
        .select(
          'id,platform,device_label,enabled'
        )
        .eq('user_id',pd.user_id)
        .eq('enabled',true);

      setPushSubs(ps||[]);
    }else{
      setPushSubs([]);
    }
  };

  useEffect(()=>{
    if(!auth.loading){
      load();
    }
  },[auth.loading,id]);

  if(auth.loading||!p){
    return(
      <div className="center">
        <div className="loader"/>
      </div>
    );
  }

  const name=
    [p.first_name,p.last_name]
      .filter(Boolean)
      .join(' ')
    ||p.preferred_name
    ||'Unnamed player';

  const photo=
    publicFile(
      'player-public',
      p.profile_photo_path
    );

  const openReq=
    requests.filter(
      r=>r.status!=='completed'
    );

  const incoming=
    requests.filter(
      r=>
        r.status!=='completed'
        &&
        ['message','signal']
          .includes(r.request_type)
    );

  const latest=checks[0];

  const liveOpps=
    opps.filter(
      o=>
        ![
          'won',
          'lost',
          'closed'
        ].includes(o.stage)
    );

  const isFullAdmin=
    auth.profile?.role==='admin';

  const readinessPlayer={
  ...p,
  nationalities:
    String(
      p.nationalitiesInput
      ??arr(p.nationalities)
    )
      .split(',')
      .map(
        (value:string)=>
          value.trim()
      )
      .filter(Boolean)
};

const clubReady=
  getClubReadyState(
    readinessPlayer,
    cv,
    career,
    videos
  );

  const genericStatLabels=
  new Set([
    'apps',
    'appearances',
    'starts',
    'minutes',
    'mins',
    'goals',
    'assists',
    'g+a',
    'goal contributions'
  ]);

const reviewedCareer=
  (
    Array.isArray(career)
      ?career
      :[]
  )
    .filter(
      (row:any)=>
        !!row.source_reviewed_at
    );

const seasonLabels=
  Array.from(
    new Set(
      reviewedCareer
        .map(
          (row:any)=>
            String(
              row.season_label
              ||''
            ).trim()
        )
        .filter(Boolean)
    )
  )
    .sort(
      (a,b)=>
        String(b)
          .localeCompare(
            String(a),
            undefined,
            {numeric:true}
          )
    );

const trustedSeasonLabel=
  p.current_season_label
  &&seasonLabels.includes(
    p.current_season_label
  )
    ?p.current_season_label
    :seasonLabels[0]
      ||null;

const trustedSeasonRows=
  trustedSeasonLabel
    ?reviewedCareer.filter(
        (row:any)=>
          row.season_label
          ===trustedSeasonLabel
      )
    :[];

const sumReviewedStat=(
  key:
    |'appearances'
    |'starts'
    |'minutes'
    |'goals'
    |'assists'
)=>{
  const known=
    trustedSeasonRows.filter(
      (row:any)=>
        row[key]!==null
        &&row[key]!==undefined
        &&row[key]!==''
    );

  if(!known.length){
    return null;
  }

  return known.reduce(
    (
      total:number,
      row:any
    )=>
      total+
      Number(
        row[key]||0
      ),
    0
  );
};

const trustedStats=[
  {
    label:'Apps',
    value:
      sumReviewedStat(
        'appearances'
      )
  },
  {
    label:'Starts',
    value:
      sumReviewedStat(
        'starts'
      )
  },
  {
    label:'Minutes',
    value:
      sumReviewedStat(
        'minutes'
      )
  },
  {
    label:'Goals',
    value:
      sumReviewedStat(
        'goals'
      )
  },
  {
    label:'Assists',
    value:
      sumReviewedStat(
        'assists'
      )
  }
]
  .filter(
    item=>
      item.value!==null
  );

const trustedSources=
  Array.from(
    new Set(
      trustedSeasonRows
        .map(
          (row:any)=>
            row.source_name
        )
        .filter(Boolean)
    )
  );

const latestStatReview=
  trustedSeasonRows
    .map(
      (row:any)=>
        row.source_reviewed_at
    )
    .filter(Boolean)
    .sort()
    .reverse()[0]
  ||null;

const customKeyStats=
  (
    Array.isArray(
      cv.key_stats
    )
      ?cv.key_stats
      :[]
  )
    .map(
      (
        stat:any,
        index:number
      )=>({
        stat,
        index
      })
    )
    .filter(
      ({stat})=>
        !genericStatLabels
          .has(
            String(
              stat?.label||''
            )
              .trim()
              .toLowerCase()
          )
    );

  const flash=(m:string)=>{
    setToast(m);

    setTimeout(
      ()=>setToast(''),
      2200
    );
  };

  const downloadCv=async()=>{
    if(!pub){
      flash(
        'Create the club profile before downloading the dossier'
      );

      return;
    }

    setPdfBusy(true);

    try{
      /*
       * IMPORTANT:
       * React PDF is intentionally imported only
       * after the user presses Download.
       *
       * This prevents PDFKit from entering the
       * normal Next.js server-render path.
       */
      const {downloadClubCv}=
        await import(
          '@/components/ClubCvPdf'
        );

      const cvPhoto=
        publicFile(
          'player-public',
          pub.profile_photo_path
            ||p.profile_photo_path
        );

      await downloadClubCv({
        profile:pub,
        photoUrl:cvPhoto||null,
        logoUrl:
          `${window.location.origin}/djm-mark.png`,
        filename:
          `${name}-DJM-Player-Dossier.pdf`
      });

      flash('DJM player dossier downloaded');
    }catch(error:any){
      flash(
        error?.message
        ||'Could not build DJM player dossier'
      );
    }finally{
      setPdfBusy(false);
    }
  };

  const updateStat=(
    i:number,
    k:'label'|'value',
    v:string
  )=>
    setCv({
      ...cv,
      key_stats:
        (
          Array.isArray(cv.key_stats)
            ?cv.key_stats
            :[]
        ).map(
          (x:any,ix:number)=>
            ix===i
              ?{...x,[k]:v}
              :x
        )
    });

  const addStat=()=>
    setCv({
      ...cv,
      key_stats:[
        ...(
          Array.isArray(cv.key_stats)
            ?cv.key_stats
            :[]
        ),
        {
          label:'',
          value:''
        }
      ]
    });

  const removeStat=(i:number)=>
    setCv({
      ...cv,
      key_stats:
        (
          Array.isArray(cv.key_stats)
            ?cv.key_stats
            :[]
        ).filter(
          (_:any,ix:number)=>
            ix!==i
        )
    });

  const toggleSection=(key:string)=>{
    const h=
      Array.isArray(cv.hidden_sections)
        ?cv.hidden_sections
        :[];

    setCv({
      ...cv,
      hidden_sections:
        h.includes(key)
          ?h.filter(
              (x:string)=>x!==key
            )
          :[
              ...h,
              key
            ]
    });
  };

const save=async(
  showToast=true
)=>{
  setBusy(true);

  const [
    playerResult,
    privateResult,
    cvResult
  ]=
    await Promise.all([
      supabase
        .from('players')
        .update({
          first_name:
            p.first_name||null,

          last_name:
            p.last_name||null,

          preferred_name:
            p.preferred_name||null,

          date_of_birth:
            p.date_of_birth||null,

          nationalities:
            String(
              p.nationalitiesInput
              ??arr(p.nationalities)
            )
              .split(',')
              .map(
                (x:string)=>
                  x.trim()
              )
              .filter(Boolean),

          height_cm:
            p.height_cm
              ?Number(p.height_cm)
              :null,

          preferred_foot:
            p.preferred_foot||null,

          primary_position:
            p.primary_position||null,

          secondary_positions:
            String(
              p.secondaryInput
              ??arr(
                p.secondary_positions
              )
            )
              .split(',')
              .map(
                (x:string)=>
                  x.trim()
              )
              .filter(Boolean),

          current_club:
            p.current_club||null,

          current_league:
            p.current_league||null,

          current_country:
            p.current_country||null,

          current_season_label:
            p.current_season_label
              ?.trim()
            ||null,

          current_season_start:
            p.current_season_start
            ||null,

          contract_status:
            p.contract_status||null,

          contract_expiry:
            p.contract_expiry||null,

          transfermarkt_url:
            p.transfermarkt_url||null,

          wyscout_url:
            p.wyscout_url||null,

          stats_url:
            p.stats_url||null,

          instagram_url:
            p.instagram_url||null,

          agency_priority:
            p.agency_priority
            ||'normal',

          next_action:
            p.next_action||null,

          next_action_due:
            p.next_action_due||null
        })
        .eq('id',id)
        .select('*')
        .single(),

      supabase
        .from('player_private')
        .upsert({
          player_id:id,

          phone:
            pr.phone||null,

          personal_email:
            pr.personal_email||null,

          whatsapp:
            pr.whatsapp||null,

          residence_country:
            pr.residence_country||null,

          passports_held:
            String(
              pr.passportsInput
              ??arr(
                pr.passports_held
              )
            )
              .split(',')
              .map(
                (x:string)=>
                  x.trim()
              )
              .filter(Boolean),

          work_rights:
            pr.work_rights||null,

          market_preferences:
            pr.market_preferences
            ||null,

          relocation_preferences:
            pr.relocation_preferences
            ||null,

          preferred_move_timing:
            pr.preferred_move_timing
            ||null,

          salary_expectation:
            pr.salary_expectation
            ||null,

          travel_availability:
            pr.travel_availability
            ||null
        })
        .select('*')
        .single(),

      supabase
        .from('player_cv_settings')
        .upsert({
          player_id:id,

          intro_line:
            cv.intro_line||null,

          why_review:
            cv.why_review||null,

          hide_market_value:
            cv.hide_market_value
            ??true,

          hidden_sections:
            cv.hidden_sections||[],

          custom_sections:
            cv.custom_sections||[],

          section_order:
            cv.section_order
            ||[
              'hero',
              'facts',
              'why_review',
              'stats',
              'career',
              'videos',
              'contact'
            ],

          career_summary:
            cv.career_summary||null,

          key_stats:
            cv.key_stats||[],

         notable_experience:
  (
    Array.isArray(
      cv.notable_experience
    )
      ?cv.notable_experience
      :[]
  )
    .map(
      (item:any)=>
        typeof item==='string'
          ?item.trim()
          :String(
              item?.label
              ||item?.title
              ||''
            ).trim()
    )
    .filter(Boolean),

          market_value_display:
            cv.market_value_display
            ||null,

          market_value_source_url:
            cv.market_value_source_url
            ||null
        })
        .select('*')
        .single()
    ]);

  const failed=
    [
      playerResult,
      privateResult,
      cvResult
    ].find(
      (result:any)=>
        result.error
    );

  if(failed?.error){
    setBusy(false);

    flash(
      failed.error.message
      ||'Could not save player'
    );

    return false;
  }

  if(playerResult.data){
    setP(playerResult.data);
  }

  if(privateResult.data){
    setPr(privateResult.data);
  }

  if(cvResult.data){
    setCv(cvResult.data);
  }

  setBusy(false);

  if(showToast){
    flash('Saved');
  }

  return true;
};

 const verify=async()=>{
  const saved=
    await save(false);

  if(!saved){
    return;
  }

  const readiness=
    clubReady;

  if(!readiness.isReady){
    flash(
      `Not Club Ready · ${
        readiness
          .missingRequired
          .slice(0,2)
          .map(
            (item:any)=>
              item.label
          )
          .join(' · ')
      }`
    );

    return;
  }

  setBusy(true);

  const {data,error}=
    await supabase
      .from('players')
      .update({
        verification_status:
          'verified',

        verified_at:
          new Date()
            .toISOString(),

        review_required_at:
          null,

        review_reason:
          null
      })
      .eq('id',id)
      .select('*')
      .single();

  setBusy(false);

  if(error){
    flash(
      error.message
      ||'Could not verify player'
    );

    return;
  }

  if(data){
    setP(data);
  }

  flash(
    'Current player data verified'
  );
};

  const uploadPhoto=async(e:any)=>{
    const f=
      e.target.files?.[0];

    if(!f){
      return;
    }

    const ext=
      f.name
        .split('.')
        .pop()
      ||'jpg';

    const path=
      `admin/${id}/profile-${Date.now()}.${ext}`;

    setBusy(true);

    const {error:uploadError}=
      await supabase
        .storage
        .from('player-public')
        .upload(
          path,
          f,
          {
            upsert:false
          }
        );

    if(uploadError){
      setBusy(false);

      flash(
        uploadError.message
        ||'Could not upload photo'
      );

      return;
    }

const {
  data:updatedPlayer,
  error:saveError
}=
  await supabase
    .from('players')
    .update({
      profile_photo_path:
        path
    })
    .eq('id',id)
    .select('*')
    .single();

    if(saveError){
      setBusy(false);

      flash(
        saveError.message
        ||'Could not attach photo'
      );

      return;
    }

if(updatedPlayer){
  setP(updatedPlayer);
}

setBusy(false);

flash('Photo updated');
  };

 const sendRequest=async()=>{
  if(!reqTitle.trim()){
    return;
  }

  const {data,error}=
    await supabase
      .from('player_requests')
      .insert({
        player_id:id,
        title:reqTitle.trim(),
        message:
          reqMsg.trim()
          ||null,
        request_type:
          reqType,
        status:'open',
        created_by:
          auth.user.id
      })
      .select('*')
      .single();

  if(error||!data){
    flash(
      'Could not send request'
    );

    return;
  }

  setRequests(
    current=>[
      data,
      ...current
    ]
  );

  setReqTitle('');
  setReqMsg('');
  setReqType('action');

  const push=
    await supabase
      .functions
      .invoke(
        'dispatch-player-push',
        {
          body:{
            reason:'request'
          }
        }
      );

  const pushed=
    Number(
      push.data?.sent
      ||0
    );

  flash(
    push.error
      ?'Request sent · push pending'
      :pushed>0
        ?'Request sent · notification delivered'
        :'Request sent · no push device yet'
  );
};
const refreshCareer=async()=>{
  const [
    careerResult,
    cvResult,
    publicResult,
    playerResult
  ]=
    await Promise.all([
      supabase
        .from('career_entries')
        .select('*')
        .eq('player_id',id)
        .order('sort_order')
        .order(
          'start_date',
          {ascending:false}
        ),

      supabase
        .from('player_cv_settings')
        .select('*')
        .eq('player_id',id)
        .maybeSingle(),

      supabase
        .from('player_public_profiles')
        .select('*')
        .eq('player_id',id)
        .maybeSingle(),

      supabase
        .from('players')
        .select('*')
        .eq('id',id)
        .single()
    ]);

  if(careerResult.data){
    setCareer(
      careerResult.data
    );
  }

  if(cvResult.data){
    setCv(
      cvResult.data
    );
  }

  if(publicResult.data){
    setPub(
      publicResult.data
    );
  }

  if(playerResult.data){
    setP(
      playerResult.data
    );
  }
};


const addNote=async()=>{
  if(!note.trim()){
    return;
  }

  const {data,error}=
    await supabase
      .from('admin_notes')
      .insert({
        player_id:id,
        author_id:
          auth.user.id,
        body:
          note.trim()
      })
      .select('*')
      .single();

  if(error||!data){
    flash(
      'Could not add note'
    );

    return;
  }

  setNotes(
    current=>[
      data,
      ...current
    ]
  );

  setNote('');

  flash('Note added');
};

const addOpp=async()=>{
  if(!oppClub.trim()){
    return;
  }

  const {data,error}=
    await supabase
      .from(
        'player_opportunities'
      )
      .insert({
        player_id:id,
        club_name:
          oppClub.trim(),
        summary:
          oppSummary.trim()
          ||null,
        stage:'targeted',
        owner_id:
          auth.user.id
      })
      .select('*')
      .single();

  if(error||!data){
    flash(
      'Could not add opportunity'
    );

    return;
  }

  setOpps(
    current=>[
      data,
      ...current
    ]
  );

  setOppClub('');
  setOppSummary('');

  flash(
    'Opportunity added'
  );
};

  

  const addVideo=async()=>{
    if(!videoUrl.trim()){
      return;
    }

    const {error}=
      await supabase
        .from('player_videos')
        .insert({
          player_id:id,
          title:
            videoTitle.trim()
            ||'Player video',
          url:
            videoUrl.trim(),
          video_type:
            'highlight',
          featured:
            videos.length===0,
          sort_order:
            videos.length
        });

    if(error){
      flash(
        'Could not add video'
      );

      return;
    }

    setVideoUrl('');
    setVideoTitle('');

    await load();

    flash('Video added');
  };

  const openDocument=async(d:any)=>{
    const {data,error}=
      await supabase
        .storage
        .from(
          d.bucket_id
          ||'player-private'
        )
        .createSignedUrl(
          d.object_path,
          120
        );

    if(
      error
      ||!data?.signedUrl
    ){
      flash(
        'Could not open document'
      );

      return;
    }

    window.open(
      data.signedUrl,
      '_blank'
    );
  };

  const toggleClubDocument=async(d:any)=>{
    const next=
      !d.club_shareable;

    const {error}=
      await supabase
        .from(
          'player_documents'
        )
        .update({
          club_shareable:next
        })
        .eq('id',d.id);

    if(error){
      flash(
        'Could not update club sharing'
      );

      return;
    }

    await load();

    flash(
      next
        ?'Approved for club share'
        :'Returned to private'
    );
  };

  const uploadDocument=async(e:any)=>{
    const file=
      e.target.files?.[0];

    if(!file){
      return;
    }

    setBusy(true);

    const safe=
      file.name.replace(
        /[^a-zA-Z0-9._-]+/g,
        '-'
      );

    const path=
      `${auth.user.id}/admin-${id}/${Date.now()}-${safe}`;

    const {error:up}=
      await supabase
        .storage
        .from('player-private')
        .upload(
          path,
          file
        );

    if(up){
      setBusy(false);

      flash(
        'Could not upload document'
      );

      return;
    }

    const {error:rec}=
      await supabase
        .from(
          'player_documents'
        )
        .insert({
          player_id:id,
          title:file.name,
          document_type:'other',
          bucket_id:
            'player-private',
          object_path:path,
          club_shareable:false,
          uploaded_by:
            auth.user.id
        });

    if(rec){
      await supabase
        .storage
        .from('player-private')
        .remove([path]);

      setBusy(false);

      flash(
        'Could not save document'
      );

      return;
    }

    await load();

    setBusy(false);

    flash(
      'Document uploaded privately'
    );
  };

  const publish=async()=>{
    setBusy(true);

       const readiness=
  clubReady;

    if(!readiness.isReady){
      setBusy(false);

      flash(
        `Not Club Ready · ${
          readiness
            .missingRequired
            .slice(0,2)
            .map(
              (item:any)=>
                item.label
            )
            .join(' · ')
        }`
      );

      return false;
    }

    const {data:fresh}=
      await supabase
        .from('players')
        .select(
          'verification_status,verified_at'
        )
        .eq('id',id)
        .maybeSingle();

    if(
      fresh?.verification_status
        !=='verified'
      ||!fresh?.verified_at
    ){
      setBusy(false);

      flash(
        'Verify current player data before publishing'
      );

      return false;
    }

    if(
      !(cv.hide_market_value??true)
      &&
      cv.market_value_display
      &&
      !cv.market_value_source_url
    ){
      setBusy(false);

      flash(
        'Add a source URL before showing market value'
      );

      return false;
    }

    const age=
      p.date_of_birth
        ?String(
            Math.floor(
              (
                Date.now()
                -
                new Date(
                  p.date_of_birth
                ).getTime()
              )
              /
              (
                365.2425
                *
                86400000
              )
            )
          )
        :null;

    const publicSlug=
      pub?.public_slug
      ||
      `${
        slug(name)
        ||'player'
      }-${id.slice(0,5)}`;

    const selected=
      videos
        .filter(v=>v.featured)
        .length
        ?videos.filter(
            v=>v.featured
          )
        :videos.slice(0,4);

    const timeline=
      career.map(c=>({
        club_name:
          c.club_name,
        country:
          c.country,
        league:
          c.league,
        season_label:
          c.season_label,
        start_date:
          c.start_date,
        end_date:
          c.end_date,
        appearances:
          c.appearances,
        starts:
          c.starts,
        minutes:
          c.minutes,
        goals:
          c.goals,
        assists:
          c.assists,
source_name:
  c.source_name,

source_url:
  c.source_url,

source_reviewed_at:
  c.source_reviewed_at,

sort_order:
  c.sort_order
      }));

    const payload:any={
      player_id:id,

      public_slug:
        publicSlug,

      published:true,

      published_at:
        pub?.published_at
        ||
        new Date()
          .toISOString(),

      display_name:
        name,

      headline:
        cv.intro_line
        ||
        `${
          p.primary_position
          ||'Professional footballer'
        }${
          p.current_club
            ?` · ${p.current_club}`
            :''
        }`,

      primary_position:
        p.primary_position,

      secondary_positions:
        p.secondary_positions
        ||[],

      preferred_foot:
        p.preferred_foot,

      age_display:
        age,

      height_display:
        p.height_cm
          ?`${p.height_cm} cm`
          :null,

      nationalities:
        p.nationalities
        ||[],

      current_status:
        p.contract_status,

      current_club:
        p.current_club,

      key_stats:
        (
          cv.key_stats?.length
            ?cv.key_stats
            :pub?.key_stats
        )
        ||[],

      why_review:
        cv.why_review
        ||pub?.why_review
        ||null,

      career_summary:
        cv.career_summary
        ||pub?.career_summary
        ||null,

      profile_photo_path:
        p.profile_photo_path,

      primary_video_url:
        selected?.[0]?.url
        ||null,

      transfermarkt_url:
        p.transfermarkt_url,

      wyscout_url:
        p.wyscout_url,

      stats_url:
        p.stats_url
        ||null,

      contact_email:
        'jesse.edge@djmsports.com',

      career_timeline:
        timeline,

      selected_videos:
        selected.map(
          (v:any)=>({
            title:v.title,
            url:v.url,
            video_type:
              v.video_type
          })
        ),

      notable_experience:
        (
          cv.notable_experience
            ?.length
            ?cv.notable_experience
            :pub?.notable_experience
        )
        ||[],

      market_value_display:
        cv.market_value_display
        ||pub?.market_value_display
        ||null,

      market_value_source_url:
        cv.market_value_source_url
        ||pub?.market_value_source_url
        ||null,

      hidden_sections:
        cv.hidden_sections
        ||[],

      hide_market_value:
        cv.hide_market_value
        ??true,

      verified_at:
        p.verified_at
        ||null
    };

    const {error}=
      await supabase
        .from(
          'player_public_profiles'
        )
        .upsert(payload);

    if(error){
      setBusy(false);

      flash(
        error.message
        ||'Could not publish club profile'
      );

      return false;
    }

    await load();

    setBusy(false);

    flash(
      pub?.published
        ?'Live profile updated'
        :'Club profile published'
    );

    return true;
  };

  const copyShare=async(token:string)=>{
    try{
      await navigator
        .clipboard
        .writeText(
          `${window.location.origin}/s/${token}`
        );

      flash('Club link copied');
    }catch{
      flash('Could not copy club link');
    }
  };

  const openShare=()=>{
    setShareLabel('');
    setShareExpiryDays('30');
    setShareOpen(true);
  };

  const createShare=async()=>{
    const label=
      shareLabel.trim();

    if(!label){
      flash('Add the club or contact name');
      return;
    }

    const days=
      Number(shareExpiryDays)||30;

    const expiresAt=
      new Date(
        Date.now()
        +days*86400000
      ).toISOString();

    setShareBusy(true);

    const {data,error}=
      await supabase
        .from(
          'club_share_links'
        )
        .insert({
          player_id:id,
          label,
          active:true,
          expires_at:expiresAt,
          created_by:
            auth.user.id
        })
        .select('*')
        .single();

    if(
      error
      ||!data
    ){
      setShareBusy(false);

      flash(
        error?.message
        ||'Could not create club link'
      );

      return;
    }

    try{
      await navigator
        .clipboard
        .writeText(
          `${window.location.origin}/s/${data.token}`
        );
    }catch{}

    await load();

    setShareBusy(false);
    setShareOpen(false);
    setShareLabel('');

    flash(
      'Club link created and copied'
    );
  };

  const deactivateShare=async(share:any)=>{
    setShareBusy(true);

    const {error}=
      await supabase
        .from(
          'club_share_links'
        )
        .update({
          active:false
        })
        .eq('id',share.id);

    setShareBusy(false);

    if(error){
      flash(
        'Could not deactivate club link'
      );

      return;
    }

    await load();

    flash(
      'Club link deactivated'
    );
  };

  const unpublish=async()=>{
    setBusy(true);

    const {error}=
      await supabase
        .from(
          'player_public_profiles'
        )
        .update({
          published:false
        })
        .eq('player_id',id);

    setBusy(false);

    if(error){
      flash(
        'Could not unpublish profile'
      );

      return;
    }

    await load();

    setUnpublishOpen(false);

    flash(
      'Club profile unpublished'
    );
  };

const removePlayer=async(
  confirmation:string
)=>{
  if(
    !isFullAdmin
    ||confirmation!==name
  ){
    return;
  }

  setBusy(true);

  const {data,error}=
    await supabase
      .functions
      .invoke(
        'remove-player',
        {
          body:{
            player_id:id,
            confirmation
          }
        }
      );

  setBusy(false);

  if(
    error
    ||!data?.ok
  ){
    flash(
      data?.error
      ||error?.message
      ||'Could not remove player'
    );

    return;
  }

  setRemoveOpen(false);

  router.replace('/admin');
  router.refresh();
};

  const tabs=[
    'overview',
    'inbox',
    'profile',
    'cv',
    'activity'
  ];

  return(
    <AdminShell>
      <main className="container admin-main">
        <div className="admin-player-back">
          <Link
            href="/admin"
            className="admin-back-link"
          >
            <ArrowLeft size={16}/>
            <span>Players</span>
          </Link>
        </div>

        <section className="admin-player-hero">
          <div className="admin-player-identity">
            <label
              className="admin-player-photo"
              style={{
                cursor:'pointer'
              }}
            >
              {photo
                ?(
                  <img
                    src={photo}
                    alt={name}
                  />
                )
                :(
                  <span className="admin-player-photo-fallback">
                    {name
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )
              }

              <span className="admin-player-photo-edit">
                <Upload size={14}/>
              </span>

              <input
                type="file"
                hidden
                accept="image/*"
                onChange={uploadPhoto}
              />
            </label>

            <div className="admin-player-copy">
              <div className="admin-player-status-line">
                <span
                  className={`admin-status-pill ${
                    p.verification_status
                      ==='verified'
                      ?'is-verified'
                      :p.verification_status
                        ==='reviewing'
                        ?'is-reviewing'
                        :''
                  }`}
                >
                  <span className="admin-status-dot"/>

                  {p.verification_status
                    ==='verified'
                    ?'DJM verified'
                    :p.verification_status
                      ==='reviewing'
                      ?'Review required'
                      :'Not verified'
                  }
                </span>
              </div>

              <h1 className="admin-player-name">
                {name}
              </h1>

              <div className="admin-player-subtitle">
                {[
                  p.primary_position,
                  p.current_club,
                  p.current_country
                ]
                  .filter(Boolean)
                  .join(' · ')
                  ||
                  'Player information incomplete'
                }
              </div>

              <div className="admin-player-signals">
                {p.agency_priority&&(
                  <span
                    className={`admin-signal ${
                      p.agency_priority
                        ==='urgent'
                        ?'is-urgent'
                        :''
                    }`}
                  >
                    {p.agency_priority}
                    {' '}
                    priority
                  </span>
                )}

                {openReq.length>0&&(
                  <button
                    type="button"
                    className="admin-signal is-action"
                    onClick={()=>
                      setTab('inbox')
                    }
                  >
                    {openReq.length}
                    {' '}
                    open request
                    {openReq.length>1
                      ?'s'
                      :''
                    }
                  </button>
                )}

                {liveOpps.length>0&&(
                  <span className="admin-signal">
                    {liveOpps.length}
                    {' '}
                    live club opportunit
                    {liveOpps.length>1
                      ?'ies'
                      :'y'
                    }
                  </span>
                )}

                {p.user_id&&(
                  <span
                    className={`admin-signal ${
                      pushSubs.length
                        ?'is-good'
                        :''
                    }`}
                  >
                    {pushSubs.length
                      ?'Push active'
                      :'No push device'
                    }
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="admin-player-primary-actions">
            <button
              className="btn btn-navy admin-player-save"
              onClick={()=>{   void save(); }}
              disabled={busy}
            >
              <Save size={16}/>

              {busy
                ?'Saving…'
                :'Save changes'
              }
            </button>

            <button
              className="btn btn-quiet admin-player-verify"
              onClick={verify}
              disabled={busy}
            >
              <ShieldCheck size={16}/>
              Verify
            </button>
          </div>
        </section>

        <div className="admin-player-quick-actions">
          <button
            type="button"
            className="admin-quick-action"
            onClick={()=>
              setTab('cv')
            }
          >
            <FileText size={18}/>

            <span>
              <strong>
                Club CV
              </strong>

              <small>
                Edit dossier
              </small>
            </span>
          </button>

          <button
            type="button"
            className="admin-quick-action"
            onClick={()=>
              setTab('inbox')
            }
          >
            <MessageCircle size={18}/>

            <span>
              <strong>
                Player inbox
              </strong>

              <small>
                {incoming.length
                  ?`${incoming.length} waiting`
                  :'Open conversation'
                }
              </small>
            </span>
          </button>

          {pub&&(
            <button
              type="button"
              className="admin-quick-action"
              onClick={downloadCv}
              disabled={pdfBusy}
            >
              <Download size={18}/>

              <span>
                <strong>
                  {pdfBusy
                    ?'Building…'
                    :'Download dossier'
                  }
                </strong>

                <small>
                  Club-ready PDF
                </small>
              </span>
            </button>
          )}

          {pub?.published&&(
            <a
              href={`/p/${pub.public_slug}`}
              target="_blank"
              rel="noreferrer"
              className="admin-quick-action"
            >
              <Eye size={18}/>

              <span>
                <strong>
                  View live
                </strong>

                <small>
                  Club profile
                </small>
              </span>
            </a>
          )}
        </div>

        <nav
          className="admin-player-tabs"
          aria-label="Player sections"
        >
          {tabs.map(t=>(
            <button
              key={t}
              type="button"
              onClick={()=>
                setTab(t)
              }
              className={`admin-player-tab ${
                tab===t
                  ?'active'
                  :''
              }`}
              aria-current={
                tab===t
                  ?'page'
                  :undefined
              }
            >
              {t==='cv'
                ?'Dossier'
                :t[0]
                  .toUpperCase()
                  +t.slice(1)
              }
            </button>
          ))}
        </nav>

        {tab==='overview'&&(
          <div
            className="grid-main"
            style={{
              marginTop:22
            }}
          >
            <div
              className="stack"
              style={{
                gap:20
              }}
            >
              <section className="admin-card">
                <div className="section-kicker">
                  NEXT DJM MOVE
                </div>

                <h2 className="section-title">
                  Keep representation moving.
                </h2>

                <div
                  className="grid2"
                  style={{
                    marginTop:18
                  }}
                >
                  <div className="field">
                    <label className="label">
                      Priority
                    </label>

                    <select
                      className="select"
                      value={
                        p.agency_priority
                        ||'normal'
                      }
                      onChange={e=>
                        setP({
                          ...p,
                          agency_priority:
                            e.target.value
                        })
                      }
                    >
                      <option>low</option>
                      <option>normal</option>
                      <option>high</option>
                      <option>urgent</option>
                    </select>
                  </div>

                  <div className="field">
                    <label className="label">
                      Due
                    </label>

                    <input
                      className="input"
                      type="date"
                      value={
                        p.next_action_due
                        ||''
                      }
                      onChange={e=>
                        setP({
                          ...p,
                          next_action_due:
                            e.target.value
                        })
                      }
                    />
                  </div>
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:14
                  }}
                >
                  <label className="label">
                    Next action
                  </label>

                  <input
                    className="input"
                    value={
                      p.next_action
                      ||''
                    }
                    onChange={e=>
                      setP({
                        ...p,
                        next_action:
                          e.target.value
                      })
                    }
                    placeholder="What should DJM do next?"
                  />
                </div>
              </section>

              <section className="admin-card">
                <div className="row-between">
                  <div>
                    <div className="section-kicker">
                      CLUB ACTIVITY
                    </div>

                    <h2 className="section-title">
                      Opportunities
                    </h2>
                  </div>

                  <span className="pill">
                    {liveOpps.length}
                    {' '}
                    live
                  </span>
                </div>

                
                <div
                  className="list-clean"
                  style={{
                    marginTop:10
                  }}
                >
                  {opps.map(o=>(
                    <div
                      className="list-row"
                      key={o.id}
                    >
                      <div className="list-icon">
                        <BriefcaseBusiness
                          size={17}
                        />
                      </div>

                      <div className="list-copy">
                        <strong>
                          {o.club_name}
                        </strong>

                        <span>
                          {o.stage}
                          {o.summary
                            ?` · ${o.summary}`
                            :''
                          }
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="grid2"
                  style={{
                    marginTop:14
                  }}
                >
                  <input
                    className="input"
                    value={oppClub}
                    onChange={e=>
                      setOppClub(
                        e.target.value
                      )
                    }
                    placeholder="Club name"
                  />

                  <input
                    className="input"
                    value={oppSummary}
                    onChange={e=>
                      setOppSummary(
                        e.target.value
                      )
                    }
                    placeholder="Short context"
                  />
                </div>

                <button
                  className="btn btn-quiet btn-sm"
                  style={{
                    marginTop:10
                  }}
                  onClick={addOpp}
                >
                  <Plus size={14}/>
                  Add opportunity
                </button>
              </section>

              <section className="admin-card">
                <div className="section-kicker">
                  INTERNAL NOTES
                </div>

                <div className="list-clean">
                  {notes
                    .slice(0,8)
                    .map(n=>(
                      <div
                        className="list-row"
                        key={n.id}
                      >
                        <div className="list-copy">
                          <strong>
                            {n.pinned
                              ?'Pinned note'
                              :'DJM note'
                            }
                          </strong>

                          <span
                            style={{
                              whiteSpace:
                                'normal'
                            }}
                          >
                            {n.body}
                          </span>
                        </div>

                        <span className="tiny muted">
                          {fmtDate(
                            n.created_at
                          )}
                        </span>
                      </div>
                    ))
                  }
                </div>

                <textarea
                  className="textarea"
                  style={{
                    marginTop:12,
                    minHeight:88
                  }}
                  value={note}
                  onChange={e=>
                    setNote(
                      e.target.value
                    )
                  }
                  placeholder="Private DJM note…"
                />

                <button
                  className="btn btn-dark btn-sm"
                  style={{
                    marginTop:10
                  }}
                  onClick={addNote}
                >
                  <Plus size={14}/>
                  Add note
                </button>
              </section>
            </div>

            <aside
              className="stack admin-sidebar"
              style={{
                gap:18
              }}
            >
              <section className="admin-card">
                <div className="section-kicker">
                  PLAYER PULSE
                </div>

                <div className="list-clean">
                  <div className="list-row">
                    <div className="list-icon">
                      <Activity size={17}/>
                    </div>

                    <div className="list-copy">
                      <strong>
                        Latest check-in
                      </strong>

                      <span>
                        {latest
                          ?fmtDate(
                              latest.submitted_at
                            )
                          :'Never'
                        }
                      </span>
                    </div>
                  </div>

                  <div className="list-row">
                    <div className="list-icon">
                      <MessageCircle
                        size={17}
                      />
                    </div>

                    <div className="list-copy">
                      <strong>
                        Player inbox
                      </strong>

                      <span>
                        {incoming.length}
                      </span>
                    </div>
                  </div>

                  <div className="list-row">
                    <div className="list-icon">
                      <ShieldCheck
                        size={17}
                      />
                    </div>

                    <div className="list-copy">
                      <strong>
                        Verified
                      </strong>

                      <span>
                        {p.verified_at
                          ?fmtDate(
                              p.verified_at
                            )
                          :'Not yet'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="admin-card">
                <div className="section-kicker">
                  AUTHORITY
                </div>

                {agreements.length
                  ?(
                    <div className="list-clean">
                      {agreements.map(a=>(
                        <div
                          className="list-row"
                          key={a.id}
                        >
                          <div className="list-copy">
                            <strong>
                              {a.title
                                ||a.agreement_type
                              }
                            </strong>

                            <span>
                              {a.status}
                              {a.end_date
                                ?` · to ${fmtDate(a.end_date)}`
                                :''
                              }
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                  :(
                    <div
                      className="empty"
                      style={{
                        padding:'18px 0'
                      }}
                    >
                      No authority records yet.
                    </div>
                  )
                }
              </section>
            </aside>
          </div>
        )}

        {tab==='inbox'&&(
          <div
            className="grid-main"
            style={{
              marginTop:22
            }}
          >
            <section className="admin-card">
              <div className="section-kicker">
                PLAYER CONVERSATION
              </div>

              <h2 className="section-title">
                Requests & messages
              </h2>

              <div
                className="list-clean"
                style={{
                  marginTop:14
                }}
              >
                {requests.map(r=>(
                  <div
                    className="list-row"
                    key={r.id}
                  >
                    <div className="list-icon">
                      <MessageCircle
                        size={17}
                      />
                    </div>

                    <div className="list-copy">
                      <strong>
                        {r.title}
                      </strong>

                      <span
                        style={{
                          whiteSpace:
                            'normal'
                        }}
                      >
                        {r.request_type
                          ==='message'
                          ?'Player message · '
                          :r.request_type
                            ==='signal'
                            ?'Check-in alert · '
                            :''
                        }

                        {r.message
                          ||r.player_reply
                          ||'No message'
                        }

                        {' · '}
                        {r.status}
                      </span>
                    </div>

                    <span className="tiny muted">
                      {fmtDate(
                        r.created_at
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="admin-card admin-sidebar">
              <div className="section-kicker">
                SEND TO PLAYER
              </div>

              <h3
                style={{
                  margin:'0 0 8px'
                }}
              >
                Ask for one clear thing.
              </h3>

              <p className="small muted">
                Use a DJM shortcut or write your own request.
              </p>

              {templates.length>0&&(
                <div
                  style={{
                    display:'flex',
                    gap:7,
                    flexWrap:'wrap',
                    margin:'14px 0 16px'
                  }}
                >
                  {templates.map(t=>(
                    <button
                      key={t.id}
                      className="pill"
                      style={{
                        border:0,
                        cursor:'pointer',
                        textAlign:'left'
                      }}
                      onClick={()=>{
                        setReqTitle(
                          t.title
                        );

                        setReqMsg(
                          t.message||''
                        );

                        setReqType(
                          t.request_type
                          ||'action'
                        );
                      }}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              )}

              <div className="stack">
                <input
                  className="input"
                  value={reqTitle}
                  onChange={e=>
                    setReqTitle(
                      e.target.value
                    )
                  }
                  placeholder="What do you need?"
                />

                <textarea
                  className="textarea"
                  value={reqMsg}
                  onChange={e=>
                    setReqMsg(
                      e.target.value
                    )
                  }
                  placeholder="Short context (optional)"
                />

                <button
                  className="btn btn-navy btn-block"
                  onClick={sendRequest}
                  disabled={
                    !reqTitle.trim()
                  }
                >
                  <Send size={15}/>
                  Send to player
                </button>
              </div>
            </aside>
          </div>
        )}

        {tab==='profile'&&(
          <div
            className="grid-main"
            style={{
              marginTop:22
            }}
          >
            <div
              className="stack"
              style={{
                gap:20
              }}
            >
              <section className="admin-card">
                <div className="section-kicker">
                  MASTER FOOTBALL RECORD
                </div>

                <h2 className="section-title">
                  One source of truth.
                </h2>

                <div className="form-section">
                  <div className="grid2">
                    <F
                      label="First name"
                      value={p.first_name}
                      on={v=>
                        setP({
                          ...p,
                          first_name:v
                        })
                      }
                    />

                    <F
                      label="Last name"
                      value={p.last_name}
                      on={v=>
                        setP({
                          ...p,
                          last_name:v
                        })
                      }
                    />

                    <F
                      label="Known as"
                      value={p.preferred_name}
                      on={v=>
                        setP({
                          ...p,
                          preferred_name:v
                        })
                      }
                    />

                    <F
                      label="Date of birth"
                      type="date"
                      value={p.date_of_birth}
                      on={v=>
                        setP({
                          ...p,
                          date_of_birth:v
                        })
                      }
                    />

                    <F
                      label="Nationalities"
                      value={
                        p.nationalitiesInput
                        ??arr(
                          p.nationalities
                        )
                      }
                      on={v=>
                        setP({
                          ...p,
                          nationalitiesInput:v
                        })
                      }
                    />

                    <F
                      label="Height cm"
                      value={p.height_cm}
                      on={v=>
                        setP({
                          ...p,
                          height_cm:v
                        })
                      }
                    />

                    <F
                      label="Preferred foot"
                      value={p.preferred_foot}
                      on={v=>
                        setP({
                          ...p,
                          preferred_foot:v
                        })
                      }
                    />

                    <F
                      label="Primary position"
                      value={p.primary_position}
                      on={v=>
                        setP({
                          ...p,
                          primary_position:v
                        })
                      }
                    />

                    <F
                      label="Other positions"
                      value={
                        p.secondaryInput
                        ??arr(
                          p.secondary_positions
                        )
                      }
                      on={v=>
                        setP({
                          ...p,
                          secondaryInput:v
                        })
                      }
                    />

                    <F
                      label="Current club"
                      value={p.current_club}
                      on={v=>
                        setP({
                          ...p,
                          current_club:v
                        })
                      }
                    />

                    <F
                      label="League"
                      value={p.current_league}
                      on={v=>
                        setP({
                          ...p,
                          current_league:v
                        })
                      }
                    />

                    <F
                      label="Country"
                      value={p.current_country}
                      on={v=>
                        setP({
                          ...p,
                          current_country:v
                        })
                      }
                    />

                    <F
                      label="Contract status"
                      value={p.contract_status}
                      on={v=>
                        setP({
                          ...p,
                          contract_status:v
                        })
                      }
                    />

                    <F
                      label="Contract expiry"
                      type="date"
                      value={p.contract_expiry}
                      on={v=>
                        setP({
                          ...p,
                          contract_expiry:v
                        })
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="admin-card">
                <div className="section-kicker">
                  PRIVATE DJM / PLAYER
                </div>

                <div className="grid2">
                  <F
                    label="Email"
                    value={pr.personal_email}
                    on={v=>
                      setPr({
                        ...pr,
                        personal_email:v
                      })
                    }
                  />

                  <F
                    label="Phone"
                    value={pr.phone}
                    on={v=>
                      setPr({
                        ...pr,
                        phone:v
                      })
                    }
                  />

                  <F
                    label="Passports"
                    value={
                      pr.passportsInput
                      ??arr(
                        pr.passports_held
                      )
                    }
                    on={v=>
                      setPr({
                        ...pr,
                        passportsInput:v
                      })
                    }
                  />

                  <F
                    label="Work rights"
                    value={pr.work_rights}
                    on={v=>
                      setPr({
                        ...pr,
                        work_rights:v
                      })
                    }
                  />

                  <F
                    label="Ideal timing"
                    value={
                      pr.preferred_move_timing
                    }
                    on={v=>
                      setPr({
                        ...pr,
                        preferred_move_timing:v
                      })
                    }
                  />

                  <F
                    label="Salary expectation"
                    value={
                      pr.salary_expectation
                    }
                    on={v=>
                      setPr({
                        ...pr,
                        salary_expectation:v
                      })
                    }
                  />
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:14
                  }}
                >
                  <label className="label">
                    Markets
                  </label>

                  <textarea
                    className="textarea"
                    value={
                      pr.market_preferences
                      ||''
                    }
                    onChange={e=>
                      setPr({
                        ...pr,
                        market_preferences:
                          e.target.value
                      })
                    }
                  />
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:14
                  }}
                >
                  <label className="label">
                    Relocation constraints
                  </label>

                  <textarea
                    className="textarea"
                    value={
                      pr.relocation_preferences
                      ||''
                    }
                    onChange={e=>
                      setPr({
                        ...pr,
                        relocation_preferences:
                          e.target.value
                      })
                    }
                  />
                </div>
              </section>
            </div>

            <aside className="stack admin-sidebar">
              <section className="admin-card">
                <div className="section-kicker">
                  SOURCE REVIEW
                </div>

                <h3
                  style={{
                    marginTop:0
                  }}
                >
                  External references
                </h3>

                <p className="small muted">
                  Keep the source links that clubs and DJM use to verify the sporting record.
                </p>

                <div className="source-row">
                  {p.transfermarkt_url&&(
                    <a
                      href={p.transfermarkt_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-quiet btn-sm"
                    >
                      Transfermarkt
                      <ExternalLink
                        size={13}
                      />
                    </a>
                  )}

                  {p.wyscout_url&&(
                    <a
                      href={p.wyscout_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-quiet btn-sm"
                    >
                      Wyscout
                      <ExternalLink
                        size={13}
                      />
                    </a>
                  )}

                  {p.stats_url&&(
                    <a
                      href={p.stats_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-quiet btn-sm"
                    >
                      Stats
                      <ExternalLink
                        size={13}
                      />
                    </a>
                  )}
                </div>

                <div className="divider"/>

                <div className="field">
                  <label className="label">
                    Transfermarkt URL
                  </label>

                  <input
                    className="input"
                    value={
                      p.transfermarkt_url
                      ||''
                    }
                    onChange={e=>
                      setP({
                        ...p,
                        transfermarkt_url:
                          e.target.value
                      })
                    }
                  />
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:10
                  }}
                >
                  <label className="label">
                    Wyscout URL
                  </label>

                  <input
                    className="input"
                    value={
                      p.wyscout_url
                      ||''
                    }
                    onChange={e=>
                      setP({
                        ...p,
                        wyscout_url:
                          e.target.value
                      })
                    }
                  />
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:10
                  }}
                >
                  <label className="label">
                    Statistics URL
                  </label>

                  <input
                    className="input"
                    value={
                      p.stats_url
                      ||''
                    }
                    onChange={e=>
                      setP({
                        ...p,
                        stats_url:
                          e.target.value
                      })
                    }
                  />
                </div>

                <button
                  className="btn btn-navy btn-block"
                  style={{
                    marginTop:14
                  }}
                  onClick={()=>{   void save(); }}
                >
                  <Save size={15}/>
                  Save profile
                </button>
              </section>
            </aside>
          </div>
        )}

        {tab==='cv'&&(
          <div
            className="grid-main"
            style={{
              marginTop:22
            }}
          >
            <div
              className="stack"
              style={{
                gap:20
              }}
            >
              <section className="admin-card">
                <div className="row-between">
                  <div>
                    <div className="section-kicker">
                      CLUB PROFILE EDITOR
                    </div>

                    <h2 className="section-title">
                      Control the story.
                    </h2>
                  </div>

                  <span
                    className={`pill ${
                      pub?.published
                        ?'pill-good'
                        :''
                    }`}
                  >
                    {pub?.published
                      ?'Live'
                      :'Draft'
                    }
                  </span>
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:20
                  }}
                >
                  <label className="label">
                    Headline
                  </label>

                  <input
                    className="input"
                    value={
                      cv.intro_line
                      ||''
                    }
                    onChange={e=>
                      setCv({
                        ...cv,
                        intro_line:
                          e.target.value
                      })
                    }
                    placeholder="Positioning line shown under the player name"
                  />
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:14
                  }}
                >
                  <label className="label">
                    Why review this player?
                  </label>

                  <textarea
                    className="textarea"
                    value={
                      cv.why_review
                      ||''
                    }
                    onChange={e=>
                      setCv({
                        ...cv,
                        why_review:
                          e.target.value
                      })
                    }
                    placeholder="Short, credible recruitment argument. No fluff."
                  />
                </div>

                <div
                  className="field"
                  style={{
                    marginTop:14
                  }}
                >
                  <label className="label">
                    Player snapshot
                  </label>

                  <textarea
                    className="textarea"
                    value={
                      cv.career_summary
                      ||''
                    }
                    onChange={e=>
                      setCv({
                        ...cv,
                        career_summary:
                          e.target.value
                      })
                    }
                    placeholder="2–3 sentences of factual sporting context: level, role, current situation and strongest relevant experience."
                  />
                </div>

<div className="form-section">

  <div className="row-between">
    <div>
      <div className="section-kicker">
        PERFORMANCE
      </div>

      <span className="small muted">
        Reviewed sporting data used in the club dossier.
      </span>
    </div>

    {trustedSeasonLabel&&(
      <span className="pill pill-good">
        <Check size={12}/>
        DJM reviewed
      </span>
    )}
  </div>

  {trustedStats.length>0
    ?(
      <>
        <div
          className="admin-trusted-stats"
          style={{
            marginTop:14
          }}
        >
          {trustedStats.map(
            stat=>(
              <div
                className="admin-trusted-stat"
                key={stat.label}
              >
                <strong>
                  {stat.value}
                </strong>

                <span>
                  {stat.label}
                </span>
              </div>
            )
          )}
        </div>

        <div
          className="admin-trusted-source"
          style={{
            marginTop:12
          }}
        >
          <div>
            <strong>
              {trustedSeasonLabel}
            </strong>

            <span>
              {trustedSeasonRows
                .map(
                  (row:any)=>
                    row.club_name
                )
                .filter(Boolean)
                .join(' · ')
              }
            </span>
          </div>

          <div
            style={{
              textAlign:'right'
            }}
          >
            <strong>
              {trustedSources.length
                ?trustedSources.join(' + ')
                :'Reviewed source'
              }
            </strong>

            {latestStatReview&&(
              <span>
                Reviewed{' '}
                {new Date(
                  latestStatReview
                ).toLocaleDateString(
                  'en-GB',
                  {
                    day:'numeric',
                    month:'short',
                    year:'numeric'
                  }
                )}
              </span>
            )}
          </div>
        </div>

        <div
          className="small muted"
          style={{
            marginTop:10,
            lineHeight:1.45
          }}
        >
          Apps, starts, minutes, goals and assists come from
          the approved sporting record. Update them through
          <strong> Refresh stats</strong> or the Season Record,
          not here.
        </div>
      </>
    )
    :(
      <div
        className="admin-empty"
        style={{
          marginTop:14
        }}
      >
        <strong>
          No reviewed performance data yet
        </strong>

        <span>
          Use Refresh stats below to pull and approve the
          player’s sporting record.
        </span>
      </div>
    )
  }

  <div
    className="divider"
    style={{
      marginTop:22,
      marginBottom:20
    }}
  />

  <div className="row-between">
    <div>
      <div className="section-kicker">
        CAREER HIGHLIGHTS
      </div>

      <span className="small muted">
        Add numbers that external season stats do not capture.
      </span>
    </div>

    <button
      className="btn btn-quiet btn-sm"
      onClick={addStat}
    >
      <Plus size={14}/>
      Add highlight
    </button>
  </div>

  <div
    className="small muted"
    style={{
      marginTop:8,
      lineHeight:1.45
    }}
  >
    Good examples: international caps, promotions,
    major tournaments, awards or appearances in
    continental competition.
  </div>

  <div
    className="stack"
    style={{
      marginTop:12
    }}
  >
    {customKeyStats.length
      ?customKeyStats.map(
        ({
          stat,
          index
        })=>(
          <div
            key={index}
            className="grid2"
            style={{
              alignItems:'center'
            }}
          >
            <input
              className="input"
              value={
                stat.label||''
              }
              onChange={e=>
                updateStat(
                  index,
                  'label',
                  e.target.value
                )
              }
              placeholder="International caps / Promotions / Awards"
            />

            <div className="row">
              <input
                className="input"
                value={
                  stat.value||''
                }
                onChange={e=>
                  updateStat(
                    index,
                    'value',
                    e.target.value
                  )
                }
                placeholder="12 / 2 / Winner"
              />

              <button
                className="btn btn-quiet btn-sm"
                aria-label="Remove highlight"
                onClick={()=>
                  removeStat(index)
                }
              >
                ×
              </button>
            </div>
          </div>
        )
      )
      :(
        <div className="admin-empty">
          <strong>
            No additional highlights
          </strong>

          <span>
            That’s fine. Only add something if it genuinely
            strengthens the player’s profile.
          </span>
        </div>
      )
    }
  </div>
</div>
                
                <div
                  className="field"
                  style={{
                    marginTop:2
                  }}
                >
                  <label className="label">
                    Notable experience
                    {' '}
                    <span
                      className="muted"
                      style={{
                        fontWeight:500
                      }}
                    >
                      (one item per line)
                    </span>
                  </label>

                  <textarea
                    className="textarea"
                    value={
                      (
                        Array.isArray(
                          cv.notable_experience
                        )
                          ?cv.notable_experience
                          :[]
                      )
                        .map(
                          (x:any)=>
                            typeof x
                              ==='string'
                              ?x
                              :x?.label
                                ||x?.title
                                ||''
                        )
                        .join('\n')
                    }
                    onChange={e=>
                      setCv({
                        ...cv,
                        notable_experience:
  e.target.value
    .split('\n')
                      })
                    }
                    placeholder={
                      "Senior international football\nEuropean competition\nPromotion-winning season"
                    }
                  />
                </div>

                <div className="form-section">
                  <div className="section-kicker">
                    MARKET VALUE
                  </div>

                  <div className="grid2">
                    <div className="field">
                      <label className="label">
                        Verified display value
                      </label>

                      <input
                        className="input"
                        value={
                          cv.market_value_display
                          ||''
                        }
                        onChange={e=>
                          setCv({
                            ...cv,
                            market_value_display:
                              e.target.value
                          })
                        }
                        placeholder="€500k"
                      />
                    </div>

                    <div className="field">
                      <label className="label">
                        Source URL
                      </label>

                      <input
                        className="input"
                        value={
                          cv.market_value_source_url
                          ||''
                        }
                        onChange={e=>
                          setCv({
                            ...cv,
                            market_value_source_url:
                              e.target.value
                          })
                        }
                        placeholder="https://…"
                      />
                    </div>
                  </div>

                  <label
                    className="row"
                    style={{
                      marginTop:13,
                      fontSize:13,
                      fontWeight:700
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        !(
                          cv.hide_market_value
                          ??true
                        )
                      }
                      onChange={e=>
                        setCv({
                          ...cv,
                          hide_market_value:
                            !e.target.checked
                        })
                      }
                    />

                    Show market value on club profile
                  </label>
                </div>

                <div className="form-section">
                  <div className="section-kicker">
                    SECTIONS SHOWN TO CLUBS
                  </div>

                  <div
                    style={{
                      display:'flex',
                      gap:8,
                      flexWrap:'wrap'
                    }}
                  >
                    {[
                      [
                        'summary',
                        'Snapshot'
                      ],
                      [
                        'why_review',
                        'Why review'
                      ],
                      [
                        'experience',
                        'Experience'
                      ],
                      [
                        'stats',
                        'Key numbers'
                      ],
                      [
                        'career',
                        'Career'
                      ],
                      [
                        'videos',
                        'Video'
                      ]
                    ].map(
                      ([key,label])=>{
                        const shown=
                          !(
                            cv.hidden_sections
                            ||[]
                          ).includes(key);

                        return(
                          <button
                            key={key}
                            className={`pill ${
                              shown
                                ?'pill-blue'
                                :''
                            }`}
                            style={{
                              border:0,
                              cursor:'pointer'
                            }}
                            onClick={()=>
                              toggleSection(key)
                            }
                          >
                            {shown
                              ?<Check size={12}/>
                              :null
                            }

                            {label}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                <div
                  className="row"
                  style={{
                    marginTop:16,
                    flexWrap:'wrap'
                  }}
                >
                  <button
                    className="btn btn-dark"
                    onClick={downloadCv}
                    disabled={
                      pdfBusy
                      ||!pub
                    }
                  >
                    <Download size={15}/>

                    {pdfBusy
                      ?'Building PDF…'
                      :'Download dossier'
                    }
                  </button>

                  <button
                    className="btn btn-quiet"
                    onClick={()=>{   void save(); }}
                    disabled={busy}
                  >
                    <Save size={15}/>
                    Save draft
                  </button>

                  <button
                    className="btn btn-navy"
                    onClick={async()=>{
                      const ok=
                        await save();

                      if(ok){
                        await publish();
                      }
                    }}
                    disabled={busy}
                  >
                    {pub?.published
                      ?'Update live profile'
                      :'Publish club profile'
                    }
                  </button>

                  {pub?.published&&(
                    <>
                      <a
                        href={`/p/${pub.public_slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-quiet"
                      >
                        <Eye size={15}/>
                        View live
                      </a>

                      <button
                        className="btn btn-quiet"
                        onClick={openShare}
                      >
                        <Link2 size={15}/>
                        Share with club
                      </button>

                      <button
                        className="btn btn-outline"
                        onClick={()=>
                          setUnpublishOpen(true)
                        }
                      >
                        Unpublish
                      </button>
                    </>
                  )}
                </div>
              </section>

              <SeasonRecordEditor
                player={p}
                career={career}
                canEdit={isFullAdmin}
                onChanged={refreshCareer}
              />

              <section className="admin-card">
                <div className="section-kicker">
                  VIDEO
                </div>

                <div className="list-clean">
                  {videos.map(v=>(
                    <a
                      className="list-row"
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      key={v.id}
                    >
                      <div className="list-icon">
                        <Video size={16}/>
                      </div>

                      <div className="list-copy">
                        <strong>
                          {v.title}
                        </strong>

                        <span>
                          {v.featured
                            ?'Featured · '
                            :''
                          }

                          {v.video_type}
                        </span>
                      </div>

                      <ExternalLink
                        size={14}
                      />
                    </a>
                  ))}
                </div>

                <div
                  className="grid2"
                  style={{
                    marginTop:12
                  }}
                >
                  <input
                    className="input"
                    value={videoTitle}
                    onChange={e=>
                      setVideoTitle(
                        e.target.value
                      )
                    }
                    placeholder="Video title"
                  />

                  <input
                    className="input"
                    value={videoUrl}
                    onChange={e=>
                      setVideoUrl(
                        e.target.value
                      )
                    }
                    placeholder="URL"
                  />
                </div>

                <button
                  className="btn btn-quiet btn-sm"
                  style={{
                    marginTop:10
                  }}
                  onClick={addVideo}
                >
                  <Plus size={14}/>
                  Add video
                </button>
              </section>
            </div>

            <aside className="stack admin-sidebar">
              <section className="admin-card">
                <div className="row-between">
                  <div className="section-kicker">
                    SHARE ACTIVITY
                  </div>

                  {pub?.published&&(
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={openShare}
                    >
                      <Link2 size={13}/>
                      Manage
                    </button>
                  )}
                </div>

                {shares.length
                  ?(
                    <div className="list-clean">
                      {shares.map(s=>(
                        <div
                          className="list-row"
                          key={s.id}
                        >
                          <div className="list-copy">
                            <strong>
                              {s.label
                                ||'Club share'
                              }
                            </strong>

                            <span>
                              {s.view_count}
                              {' '}
                              view
                              {s.view_count===1
                                ?''
                                :'s'
                              }

                              {s.last_viewed_at
                                ?` · last ${fmtDate(s.last_viewed_at)}`
                                :''
                              }
                            </span>
                          </div>

                          <button
                            className="btn btn-quiet btn-sm"
                            onClick={()=>
                              copyShare(s.token)
                            }
                            disabled={!s.active}
                          >
                            <Copy size={13}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                  :(
                    <div
                      className="empty"
                      style={{
                        padding:'18px 0'
                      }}
                    >
                      No tracked links yet.
                    </div>
                  )
                }
              </section>

<ClubReadyPanel
  state={clubReady}
/>
              
              <section className="admin-card">
                <div className="section-kicker">
                  VERIFICATION
                </div>

                <p className="small muted">
                  Last verified:
                  {' '}
                  {p.verified_at
                    ?fmtDate(
                        p.verified_at
                      )
                    :'Never'
                  }
                </p>

                {p.review_reason&&(
                  <p
                    className="small"
                    style={{
                      lineHeight:1.5
                    }}
                  >
                    {p.review_reason}
                  </p>
                )}

                <button
                  className="btn btn-quiet btn-block"
                  onClick={verify}
                >
                  <ShieldCheck size={15}/>
                  Mark current data verified
                </button>
              </section>
            </aside>
          </div>
        )}

        {tab==='activity'&&(
          <div
            className="grid-main"
            style={{
              marginTop:22
            }}
          >
            <div
              className="stack"
              style={{
                gap:20
              }}
            >
              <section className="admin-card">
                <div className="section-kicker">
                  WEEKLY CHECK-INS
                </div>

                <div className="list-clean">
                  {checks.map(c=>(
                    <div
                      className="list-row"
                      key={c.id}
                    >
                      <div className="list-icon">
                        <Activity size={16}/>
                      </div>

                      <div className="list-copy">
                        <strong>
                          {fmtDate(
                            c.week_start
                          )}
                          {' · '}
                          {c.availability_status
                            ||'No status'
                          }
                        </strong>

                        <span
                          style={{
                            whiteSpace:
                              'normal'
                          }}
                        >
                          {[
                            c.fitness_status,
                            c.player_notes,

                            c.support_request
                              &&
                              `Needs DJM: ${c.support_request}`
                          ]
                            .filter(Boolean)
                            .join(' · ')
                            ||
                            'No extra notes'
                          }
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="admin-card">
                <div className="row-between">
                  <div>
                    <div className="section-kicker">
                      PRIVATE DOCUMENTS
                    </div>

                    <span className="small muted">
                      Only explicitly approved files can appear on a tracked club share.
                    </span>
                  </div>

                  <label
                    className={`btn btn-quiet btn-sm ${
                      busy
                        ?'disabled'
                        :''
                    }`}
                  >
                    <Upload size={14}/>
                    Upload

                    <input
                      type="file"
                      hidden
                      onChange={uploadDocument}
                    />
                  </label>
                </div>

                <div
                  className="list-clean"
                  style={{
                    marginTop:10
                  }}
                >
                  {docs.map(d=>(
                    <div
                      className="list-row"
                      key={d.id}
                    >
                      <div className="list-icon">
                        <FileText size={16}/>
                      </div>

                      <div className="list-copy">
                        <strong>
                          {d.title}
                        </strong>

                        <span>
                          {[
                            d.document_type
                              ?.replace(
                                '_',
                                ' '
                              ),

                            d.country,

                            d.expires_at
                              ?`expires ${fmtDate(d.expires_at)}`
                              :null,

                            d.club_shareable
                              ?'Club-share approved'
                              :'Private'
                          ]
                            .filter(Boolean)
                            .join(' · ')
                          }
                        </span>
                      </div>

                      <button
                        className="btn btn-quiet btn-sm"
                        onClick={()=>
                          openDocument(d)
                        }
                      >
                        Open
                      </button>

                      <button
                        className={`btn btn-sm ${
                          d.club_shareable
                            ?'btn-outline'
                            :'btn-quiet'
                        }`}
                        onClick={()=>
                          toggleClubDocument(d)
                        }
                      >
                        {d.club_shareable
                          ?'Make private'
                          :'Approve'
                        }
                      </button>
                    </div>
                  ))}

                  {docs.length===0&&(
                    <div
                      className="empty"
                      style={{
                        padding:'18px 0'
                      }}
                    >
                      No private documents yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="admin-card">
                <div className="section-kicker">
                  DJM HISTORY
                </div>

                <div className="list-clean">
                  {audits.map(a=>(
                    <div
                      className="list-row"
                      key={a.id}
                    >
                      <div className="list-copy">
                        <strong>
                          {String(
                            a.action||''
                          ).replaceAll(
                            '_',
                            ' '
                          )}
                        </strong>

                        <span>
                          {fmtDate(
                            a.created_at
                          )}

                          {a.metadata?.label
                            ?` · ${a.metadata.label}`
                            :''
                          }

                          {a.metadata?.title
                            ?` · ${a.metadata.title}`
                            :''
                          }
                        </span>
                      </div>
                    </div>
                  ))}

                  {audits.length===0&&(
                    <div
                      className="empty"
                      style={{
                        padding:'18px 0'
                      }}
                    >
                      No sensitive DJM actions recorded yet.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="stack admin-sidebar">
              <section className="admin-card">
                <div className="section-kicker">
                  AUTHORITY / AGREEMENTS
                </div>

                {agreements.map(a=>(
                  <div
                    className="list-row"
                    key={a.id}
                  >
                    <div className="list-copy">
                      <strong>
                        {a.title
                          ||a.agreement_type
                        }
                      </strong>

                      <span>
                        {a.status}

                        {a.end_date
                          ?` · ${fmtDate(a.end_date)}`
                          :''
                        }
                      </span>
                    </div>
                  </div>
                ))}
              </section>

              {isFullAdmin&&(
                <section
                  className="admin-card"
                  style={{
                    borderColor:
                      'rgba(141,45,45,.16)'
                  }}
                >
                  <div className="section-kicker">
                    PLAYER ADMINISTRATION
                  </div>

                  <h3
                    style={{
                      margin:'0 0 8px'
                    }}
                  >
                    Remove from DJM Player
                  </h3>

                  <p
                    className="small muted"
                    style={{
                      lineHeight:1.5
                    }}
                  >
                    Permanent. This removes the player record and linked app data. Use only when you are certain the record should no longer exist.
                  </p>

                  <button
                    className="btn btn-outline btn-block"
                    style={{
                      color:'var(--danger)',
                      borderColor:
                        'rgba(141,45,45,.26)'
                    }}
                    onClick={()=>   setRemoveOpen(true) }
                    disabled={busy}
                  >
                    <Trash2 size={15}/>
                    Remove player
                  </button>
                </section>
              )}
            </aside>
          </div>
        )}

      
        {shareOpen&&(
          <div
            className="club-share-backdrop"
            onClick={()=>
              !shareBusy
              &&setShareOpen(false)
            }
          >
            <section
              className="club-share-sheet"
              onClick={e=>
                e.stopPropagation()
              }
              aria-label="Share player dossier"
            >
              <div className="club-share-handle"/>

              <header className="club-share-head">
                <div>
                  <div className="section-kicker">
                    CLUB SHARING
                  </div>

                  <h2>
                    Share {name}.
                  </h2>

                  <p>
                    Create a private, tracked club link. Each link can be copied, monitored and switched off independently.
                  </p>
                </div>

                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Close"
                  onClick={()=>
                    setShareOpen(false)
                  }
                  disabled={shareBusy}
                >
                  <X size={18}/>
                </button>
              </header>

              <div className="club-share-body">
                <div className="club-share-create">
                  <div className="field">
                    <label className="label">
                      Club or contact
                    </label>

                    <input
                      className="input"
                      value={shareLabel}
                      onChange={e=>
                        setShareLabel(
                          e.target.value
                        )
                      }
                      placeholder="e.g. HJK · Sporting Director"
                      autoFocus
                    />
                  </div>

                  <div className="club-share-expiry">
                    <span className="label">
                      Link expires
                    </span>

                    <div className="club-share-segmented">
                      {[
                        ['7','7 days'],
                        ['30','30 days'],
                        ['90','90 days']
                      ].map(([value,label])=>(
                        <button
                          type="button"
                          key={value}
                          className={
                            shareExpiryDays===value
                              ?'active'
                              :''
                          }
                          onClick={()=>
                            setShareExpiryDays(value)
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-navy btn-block club-share-create-btn"
                    onClick={createShare}
                    disabled={
                      shareBusy
                      ||!shareLabel.trim()
                    }
                  >
                    <Link2 size={15}/>
                    {shareBusy
                      ?'Creating…'
                      :'Create & copy link'
                    }
                  </button>
                </div>

                <div className="club-share-history">
                  <div className="club-share-history-head">
                    <strong>
                      Existing links
                    </strong>

                    <span>
                      {shares.length}
                    </span>
                  </div>

                  {shares.length
                    ?shares.map(s=>{
                        const expired=
                          !!s.expires_at
                          &&new Date(
                            s.expires_at
                          ).getTime()<Date.now();

                        const usable=
                          s.active
                          &&!expired;

                        return(
                          <div
                            className="club-share-link-row"
                            key={s.id}
                          >
                            <div className="club-share-link-icon">
                              <Link2 size={16}/>
                            </div>

                            <div className="club-share-link-copy">
                              <div className="club-share-link-title">
                                <strong>
                                  {s.label
                                    ||'Club share'
                                  }
                                </strong>

                                <span
                                  className={`club-share-state ${
                                    usable
                                      ?'is-active'
                                      :''
                                  }`}
                                >
                                  {expired
                                    ?'Expired'
                                    :s.active
                                      ?'Active'
                                      :'Off'
                                  }
                                </span>
                              </div>

                              <span>
                                {s.view_count||0}
                                {' '}
                                view
                                {Number(s.view_count||0)===1
                                  ?''
                                  :'s'
                                }
                                {s.last_viewed_at
                                  ?` · last ${fmtDate(s.last_viewed_at)}`
                                  :''
                                }
                              </span>

                              <small>
                                {s.expires_at
                                  ?`${expired?'Expired':'Expires'} ${fmtDate(s.expires_at)}`
                                  :'No expiry'
                                }
                              </small>
                            </div>

                            <div className="club-share-link-actions">
                              {usable&&(
                                <button
                                  type="button"
                                  onClick={()=>
                                    copyShare(s.token)
                                  }
                                  aria-label="Copy link"
                                >
                                  <Copy size={14}/>
                                  Copy
                                </button>
                              )}

                              {s.active&&(
                                <button
                                  type="button"
                                  onClick={()=>
                                    deactivateShare(s)
                                  }
                                  disabled={shareBusy}
                                >
                                  Turn off
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    :(
                      <div className="club-share-empty">
                        <Clock3 size={18}/>
                        <strong>
                          No club links yet.
                        </strong>
                        <span>
                          Create a separate tracked link for each club or contact.
                        </span>
                      </div>
                    )
                  }
                </div>
              </div>
            </section>
          </div>
        )}

        {unpublishOpen&&(
          <div
            className="club-share-backdrop"
            onClick={()=>
              !busy
              &&setUnpublishOpen(false)
            }
          >
            <section
              className="club-confirm-sheet"
              onClick={e=>
                e.stopPropagation()
              }
            >
              <div className="club-share-handle"/>

              <div className="section-kicker">
                CLUB PROFILE
              </div>

              <h2>
                Take {name} offline?
              </h2>

              <p>
                The public club profile will stop being available. Player data and the DJM dossier stay safely in the platform.
              </p>

              <div className="club-confirm-actions">
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={()=>
                    setUnpublishOpen(false)
                  }
                  disabled={busy}
                >
                  Keep live
                </button>

                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={unpublish}
                  disabled={busy}
                >
                  {busy
                    ?'Updating…'
                    :'Unpublish profile'
                  }
                </button>
              </div>
            </section>
          </div>
        )}

        <RemovePlayerSheet
  open={removeOpen}
  name={name}
  busy={busy}
  onClose={()=>
    !busy
    &&setRemoveOpen(false)
  }
  onConfirm={
    removePlayer
  }
/>
        
        {toast&&(
          <div className="toast">
            {toast}
          </div>
        )}
      </main>
    </AdminShell>
  );
}

function F({
  label,
  value,
  on,
  type='text'
}:{
  label:string;
  value:any;
  on:(v:string)=>void;
  type?:string;
}){
  return(
    <div className="field">
      <label className="label">
        {label}
      </label>

      <input
        className="input"
        type={type}
        value={txt(value)}
        onChange={e=>
          on(e.target.value)
        }
      />
    </div>
  );
}
