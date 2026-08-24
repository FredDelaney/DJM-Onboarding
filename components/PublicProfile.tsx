'use client';

import {
  ExternalLink,Mail,Printer,Play,ShieldCheck,FileText,BarChart3
} from 'lucide-react';
import {publicFile,supabase} from '@/lib/supabase';

const prettyDate=(v:any)=>{
  if(!v)return null;
  try{
    return new Intl.DateTimeFormat('en-GB',{
      day:'2-digit',
      month:'short',
      year:'numeric'
    }).format(new Date(v));
  }catch{
    return null;
  }
};

const mins=(value:any)=>{
  if(value==null||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?`${n.toLocaleString('en-GB')} mins`:String(value);
};

export default function PublicProfile({
  profile,
  documents=[],
  shareToken
}:{
  profile:any;
  documents?:any[];
  shareToken?:string;
}){
  if(!profile){
    return <div className="center"><div className="card pad">Profile unavailable.</div></div>;
  }

  const photo=publicFile('player-public',profile.profile_photo_path);
  const hidden=profile.hidden_sections||[];
  const nationality=Array.isArray(profile.nationalities)
    ?profile.nationalities.filter(Boolean).join(' / ')
    :profile.nationalities;

  const facts=[
    ['Position',profile.primary_position],
    ['Age',profile.age_display],
    ['Height',profile.height_display],
    ['Foot',profile.preferred_foot],
    ['Nationality',nationality],
    ['Status',profile.current_status]
  ].filter(x=>x[1]);

  const verified=prettyDate(profile.verified_at);

  const selectedVideos=Array.isArray(profile.selected_videos)
    ?profile.selected_videos.filter((v:any)=>v?.url)
    :[];

  const primaryVideo=profile.primary_video_url||selectedVideos?.[0]?.url||null;

  const quickLinks=[
    primaryVideo&&{
      label:'Watch player',
      sub:'Selected DJM footage',
      url:primaryVideo,
      icon:'video',
      primary:true
    },
    profile.transfermarkt_url&&{
      label:'Transfermarkt',
      sub:'Career & market reference',
      url:profile.transfermarkt_url,
      icon:'external'
    },
    profile.wyscout_url&&{
      label:'Wyscout',
      sub:'Scouting & match reference',
      url:profile.wyscout_url,
      icon:'external'
    },
    profile.stats_url&&{
      label:'Statistics',
      sub:'External performance reference',
      url:profile.stats_url,
      icon:'stats'
    }
  ].filter(Boolean) as any[];

  const sources=[
    ['Transfermarkt',profile.transfermarkt_url],
    ['Wyscout',profile.wyscout_url],
    ['Statistics',profile.stats_url]
  ].filter(x=>x[1]);

  const notable=Array.isArray(profile.notable_experience)
    ?profile.notable_experience.filter(Boolean)
    :[];

  const openDoc=async(d:any)=>{
    if(!shareToken)return;
    const {data,error}=await supabase.functions.invoke('club-document',{
      body:{token:shareToken,document_id:d.id}
    });
    if(!error&&data?.url)window.open(data.url,'_blank');
  };

  return (
    <main className="public-profile" style={{background:'#fff',minHeight:'100dvh'}}>
      <div className="hero-public">
        <div className="container">
          <div className="public-top">
            <div className="public-brand">
              <img src="/djm-mark.png" alt="DJM"/>
              <span>DJM SPORTS MANAGEMENT</span>
            </div>

            <button
              className="btn btn-sm no-print"
              style={{background:'rgba(255,255,255,.1)',color:'#fff'}}
              onClick={()=>window.print()}
            >
              <Printer size={14}/> Save PDF
            </button>
          </div>

          <div className="public-hero-grid">
            <div>
              <div className="yellow-line"/>
              <div className="public-eyebrow">PLAYER DOSSIER</div>
              <h1 className="public-name">{profile.display_name}</h1>

              <p className="public-headline">
                {profile.headline||'Professional footballer represented by DJM Sports Management'}
              </p>

              {profile.current_club&&<div className="public-club">{profile.current_club}</div>}

              <div className="row public-badges" style={{marginTop:25,flexWrap:'wrap'}}>
                {profile.verified_at&&(
                  <span className="pill" style={{background:'rgba(255,255,255,.1)',color:'#fff'}}>
                    <ShieldCheck size={13}/> DJM verified{verified?` · ${verified}`:''}
                  </span>
                )}

                {profile.market_value_display&&!profile.hide_market_value&&(
                  <span className="pill" style={{background:'rgba(255,255,255,.1)',color:'#fff'}}>
                    Market value {profile.market_value_display}
                  </span>
                )}
              </div>
            </div>

            <div className="public-photo">
              {photo?<img src={photo} alt={profile.display_name}/>:profile.display_name?.[0]}
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="fact-row">
          {facts.map(([k,v])=>
            <div className="fact" key={k}>
              <small>{k}</small>
              <strong>{String(v)}</strong>
            </div>
          )}
        </div>

        {quickLinks.length>0&&(
          <section className="public-section no-print-break" style={{paddingBottom:0}}>
            <div className="section-kicker">RECRUITMENT LINKS</div>

            <div
              style={{
                display:'grid',
                gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',
                gap:12
              }}
            >
              {quickLinks.map((link:any)=>
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`card pad row-between ${link.primary?'dark-card':''}`}
                  style={{
                    minHeight:92,
                    alignItems:'center',
                    border:link.primary?'0':undefined
                  }}
                >
                  <div className="row">
                    <div
                      className="list-icon"
                      style={link.primary?{background:'rgba(255,255,255,.1)',color:'#fff'}:undefined}
                    >
                      {link.icon==='video'
                        ?<Play size={18}/>
                        :link.icon==='stats'
                          ?<BarChart3 size={18}/>
                          :<ExternalLink size={18}/>
                      }
                    </div>

                    <div>
                      <strong>{link.label}</strong>
                      <div
                        className="small"
                        style={{marginTop:4,color:link.primary?'rgba(255,255,255,.64)':'var(--muted)'}}
                      >
                        {link.sub}
                      </div>
                    </div>
                  </div>

                  <ExternalLink size={16}/>
                </a>
              )}
            </div>
          </section>
        )}

        {profile.career_summary&&!hidden.includes('summary')&&(
          <section className="public-section public-snapshot">
            <div className="section-kicker">PLAYER SNAPSHOT</div>
            <p>{profile.career_summary}</p>
          </section>
        )}

        {!hidden.includes('why_review')&&(
          <section className="public-section">
            <div className="section-kicker">WHY REVIEW THIS PLAYER</div>
            <div className="why-box">
              {profile.why_review||'DJM Sports Management can provide further sporting and availability information on request.'}
            </div>
          </section>
        )}

        {notable.length>0&&!hidden.includes('experience')&&(
          <section className="public-section" style={{paddingTop:0}}>
            <div className="section-kicker">NOTABLE EXPERIENCE</div>
            <div className="notable-grid">
              {notable.slice(0,6).map((n:any,i:number)=>
                <div className="notable-item" key={i}>
                  <span>{typeof n==='string'?n:n.label||n.title||n.value}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {Array.isArray(profile.key_stats)&&profile.key_stats.length>0&&!hidden.includes('stats')&&(
          <section className="public-section" style={{paddingTop:0}}>
            <div className="section-kicker">KEY NUMBERS</div>
            <div className="public-stats">
              {profile.key_stats.slice(0,6).map((s:any,i:number)=>
                <div className="public-stat" key={i}>
                  <div>{s.value??s.stat??'—'}</div>
                  <span>{s.label??s.name??''}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {Array.isArray(profile.career_timeline)&&profile.career_timeline.length>0&&!hidden.includes('career')&&(
          <section className="public-section" style={{paddingTop:0}}>
            <div className="row-between" style={{alignItems:'flex-end'}}>
              <div>
                <div className="section-kicker">SEASON PERFORMANCE</div>
                <h2 className="section-title">Career record</h2>
              </div>
              <span className="small muted no-print">DJM reviewed statistics</span>
            </div>

            <div className="timeline" style={{marginTop:14}}>
              {profile.career_timeline.map((c:any,i:number)=>{
                const statBits=[
                  c.appearances!=null?`${c.appearances} apps`:null,
                  c.starts!=null?`${c.starts} starts`:null,
                  c.minutes!=null?mins(c.minutes):null,
                  c.goals!=null?`${c.goals} goals`:null,
                  c.assists!=null?`${c.assists} assists`:null
                ].filter(Boolean);

                return (
                  <div className="timeline-row" key={i}>
                    <strong>{c.season_label||c.season||c.start_date?.slice(0,4)||''}</strong>

                    <div>
                      <strong>{c.club_name||c.club}</strong>
                      <span style={{display:'block',marginTop:4}}>
                        {[c.league,c.country].filter(Boolean).join(' · ')}
                      </span>

                      {c.source_name&&(
                        <span style={{display:'block',marginTop:5,fontSize:11}}>
                          {c.source_url
                            ?<a href={c.source_url} target="_blank" rel="noreferrer">
                              Source: {c.source_name} <ExternalLink size={10} style={{display:'inline'}}/>
                            </a>
                            :`Source: ${c.source_name}`
                          }
                        </span>
                      )}
                    </div>

                    <span style={{lineHeight:1.55}}>
                      {statBits.length?statBits.join(' · '):'—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {selectedVideos.length>0&&!hidden.includes('videos')&&(
          <section className="public-section no-print-break" style={{paddingTop:0}}>
            <div className="section-kicker">VIDEO</div>
            <div className="grid2">
              {selectedVideos.map((v:any,i:number)=>
                <a
                  className="card pad row-between"
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  key={i}
                >
                  <div className="row">
                    <div className="list-icon"><Play size={18}/></div>
                    <div>
                      <strong>{v.title||'Player video'}</strong>
                      <div className="small muted">Watch player footage</div>
                    </div>
                  </div>
                  <ExternalLink size={16}/>
                </a>
              )}
            </div>
          </section>
        )}

        {documents.length>0&&shareToken&&(
          <section className="public-section no-print" style={{paddingTop:0}}>
            <div className="section-kicker">APPROVED MATERIAL</div>
            <div className="grid2">
              {documents.map(d=>
                <button
                  className="card pad row-between"
                  style={{textAlign:'left'}}
                  key={d.id}
                  onClick={()=>openDoc(d)}
                >
                  <div className="row">
                    <div className="list-icon"><FileText size={17}/></div>
                    <div>
                      <strong>{d.title}</strong>
                      <div className="small muted">Secure document</div>
                    </div>
                  </div>
                  <ExternalLink size={15}/>
                </button>
              )}
            </div>
          </section>
        )}

        {sources.length>0&&(
          <section className="public-section public-sources" style={{paddingTop:0}}>
            <div className="section-kicker">VERIFICATION SOURCES</div>
            <div className="source-row">
              {sources.map(([label,url])=>
                <a
                  key={label}
                  className="btn btn-quiet btn-sm"
                  target="_blank"
                  rel="noreferrer"
                  href={String(url)}
                >
                  {label} <ExternalLink size={13}/>
                </a>
              )}
            </div>
          </section>
        )}

        <section className="public-section public-contact" style={{paddingTop:0}}>
          <div className="card pad-lg dark-card">
            <div className="section-kicker" style={{color:'rgba(255,255,255,.5)'}}>DJM SPORTS MANAGEMENT</div>
            <h2 className="section-title">Discuss {profile.display_name} with DJM.</h2>
            <p style={{color:'rgba(255,255,255,.65)',lineHeight:1.5,maxWidth:620}}>
              For verified availability, contractual information, full-match footage or a direct player discussion, contact DJM Sports Management.
            </p>
            <a
              className="btn btn-yellow"
              href={`mailto:${profile.contact_email||'jesse.edge@djmsports.com'}?subject=${encodeURIComponent(profile.display_name+' - Club enquiry')}`}
            >
              <Mail size={16}/> {profile.contact_email||'jesse.edge@djmsports.com'}
            </a>
          </div>
        </section>

        <footer className="public-footer">
          <div>DJM SPORTS MANAGEMENT</div>
          <span>
            {verified
              ?`Player information verified ${verified}`
              :'Player information prepared by DJM Sports Management'
            }
          </span>
        </footer>
      </div>
    </main>
  );
}
