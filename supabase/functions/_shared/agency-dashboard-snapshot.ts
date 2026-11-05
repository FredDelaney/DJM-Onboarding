/**
 * Tenant-authorised, read-only agency dashboard composition.
 * Original ReDream implementation. This module runs ONLY in the agency-os edge function.
 * It never reads Athlivo data, never returns private player fields, and never assumes
 * an absent provider fixture means a player has no match scheduled.
 */

type Row = Record<string, any>;
type Query = {data: Row[] | null; error: {message?: string} | null};
type RpcResponse = {data:unknown;error:Query['error']};
type RpcRequest = PromiseLike<RpcResponse> & {abortSignal?: (signal:AbortSignal)=>PromiseLike<RpcResponse>};
type QueryClient = {
  from: (table:string)=>any;
  rpc: (fn:string,args:Record<string,unknown>)=>RpcRequest;
};
export type DashboardRequestContext = {
  client: QueryClient;
  tenantId: string;
  userId: string;
  role: string;
  scope: 'me'|'agency';
  localDate: string;
  timeZone: string;
  basePath: string;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STAFF = new Set(['owner','admin','operations','agent','scout']);
const ADMIN = new Set(['owner','admin']);
const int = (v:unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v:unknown) => String(v ?? '').trim();
const human = (v:unknown) => str(v).replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
function dayInZone(stamp:string,zone:string):string|null {
  try {
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp));
    const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return fields.year&&fields.month&&fields.day?`${fields.year}-${fields.month}-${fields.day}`:null;
  } catch{return null;}
}
function localToday(zone:string):string {
  const now = dayInZone(new Date().toISOString(),zone);
  return now && DAY.test(now) ? now : new Date().toISOString().slice(0,10);
}
function asRows(result:{data:unknown;error:Query['error']}):Row[] {
  if(result.error) throw new Error(result.error.message || 'Data unavailable');
  if(!Array.isArray(result.data))throw new Error('Malformed data response');
  return result.data;
}
function datePlus(date:string,days:number):string {
  const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
const safeLimit = (rows:Row[],max:number) => {if(rows.length>max)throw new Error('Read exceeds verified coverage');return rows;};
const uuidIds = (rows:Row[],key='id')=>rows.map(r=>str(r[key])).filter(x=>/^[a-f\d-]{36}$/i.test(x));

export async function readAgencyDashboardSnapshot(ctx:DashboardRequestContext) {
  const {client,tenantId,userId,role,basePath,timeZone}=ctx;
  if(!STAFF.has(role))throw new Error('dashboard_access_denied');
  if(!/^[a-f\d-]{36}$/i.test(tenantId)||!/^[a-f\d-]{36}$/i.test(userId))throw new Error('dashboard_context_invalid');
  try {new Intl.DateTimeFormat('en-GB',{timeZone});} catch {throw new Error('dashboard_timezone_invalid');}
  const date=ctx.localDate||localToday(timeZone);
  if(!DAY.test(date)||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)throw new Error('dashboard_date_invalid');
  if(ctx.scope==='agency'&&!ADMIN.has(role))throw new Error('dashboard_agency_access_denied');
  const scope = ctx.scope === 'agency' ? 'agency' : 'me';
  const today=localToday(timeZone);
  const errors:Record<string,string>={};
  const snapshot={scope,localDate:date,timeZone,generatedAt:new Date().toISOString(),
    activeClients:null as number|null,fixturesToday:null as number|null,
    agencyContractsExpiring90Days:null as number|null,clubContractsExpiringThisCalendarYear:null as number|null,
    fixtureCoverage:null as Row|null,fixtures:[] as Row[],clubRequests:[] as Row[],upcomingEvents:[] as Row[],recentActivity:[] as Row[],errors};

  // These reads are independent of the roster and its representation agreements.
  const sourcesRead = Promise.resolve(client.rpc('platform_server_dashboard_sources', {
    p_tenant_id:tenantId,p_actor_user_id:userId,p_scope:scope,p_fixture_date:date,p_today:today,
  })).catch(() => null);
  const kickoffRequest = client.rpc('platform_server_kickoff_fixtures', {
    p_tenant_id:tenantId,p_actor_user_id:userId,p_scope:scope,p_start:date,p_end:datePlus(date,1),p_timezone:timeZone,
  });
  const kickoffRead = Promise.resolve(kickoffRequest.abortSignal?.(AbortSignal.timeout(2000)) ?? kickoffRequest)
    .catch(() => null);
  const activityRead = Promise.resolve(client.rpc('platform_server_dashboard_recent_activity', {
    p_tenant_id:tenantId,p_actor_user_id:userId,p_scope:scope,p_limit:12,
  })).catch(() => null);

  // Scope the only player data read to the caller's verified tenant and staff access.
  // The 'Me' subset is derived from primary owner plus explicit staff_player_access.
  let players:Row[]=[];
  try {
    const all=safeLimit(asRows(await client.from('players')
      .select('id,first_name,last_name,primary_staff_user_id,current_club,contract_expiry,date_of_birth,football_status,archived_at')
      .eq('tenant_id',tenantId).is('archived_at',null).limit(1001)),1000);
    if(scope==='agency')players=all;
    else {
      const assigned=safeLimit(asRows(await client.from('staff_player_access')
        .select('player_id').eq('staff_user_id',userId).limit(1001)),1000);
      const allowed=new Set(assigned.map(row=>str(row.player_id)));
      players=all.filter(row=>row.primary_staff_user_id===userId||allowed.has(str(row.id)));
    }
  } catch {errors.counts='Unable to confirm player coverage';errors.fixtures='Player coverage unavailable';errors.events='Player coverage unavailable';}

  const playerIds=uuidIds(players),playerById=new Map(players.map(p=>[str(p.id),p]));
  const agencyContractEvents:Row[]=[];
  const seasonEnd=`${date.slice(0,4)}-12-31`;
  // Do not equate any roster member with a signed client. A valid current agency
  // representation agreement is the source of truth for Total Clients.
  if(playerIds.length && !errors.counts) {
    try {
      const agreements=safeLimit(asRows(await client.from('player_agreements')
        .select('id,player_id,agreement_type,status,start_date,end_date')
        .in('player_id',playerIds).limit(1001)),1000);
      const signed=agreements.filter(a=>['active','signed','executed','current'].includes(str(a.status).toLowerCase())&&
        /representation|mandate|agency/i.test(str(a.agreement_type))&&
        (!a.start_date||str(a.start_date)<=today)&&(!a.end_date||str(a.end_date)>=today));
      // Without agreement records, a zero would falsely claim no represented clients.
      if(agreements.length){
        const clientIds=new Set(signed.map(x=>str(x.player_id)));
        snapshot.activeClients=clientIds.size;
        const expiring=signed.filter(a=>a.end_date&&str(a.end_date)>=today&&str(a.end_date)<=datePlus(today,90));
        snapshot.agencyContractsExpiring90Days=expiring.length;
        for(const agreement of expiring){
          const p=playerById.get(str(agreement.player_id));
          if(!p)continue;
          const name=`${str(p.first_name)} ${str(p.last_name)}`.trim()||'Player';
          agencyContractEvents.push({
            id:`agency-contract:${agreement.id}`,label:`${name} · Agency contract`,
            description:'Representation agreement expiry',date:str(agreement.end_date),
            type:'agency-contract',href:`${basePath}?view=players&player=${encodeURIComponent(str(p.id))}`,
          });
        }
      }
    }catch{errors.counts='Unable to verify representation agreements';}
  }
  if(!errors.counts){
    snapshot.clubContractsExpiringThisCalendarYear=players.filter(p=>str(p.contract_expiry)>=today&&str(p.contract_expiry)<=seasonEnd).length;
  }

  const sourcesResult=await sourcesRead;
  const sources=sourcesResult&&!sourcesResult.error&&sourcesResult.data&&typeof sourcesResult.data==='object'
    ? sourcesResult.data as Record<string,unknown> : {};
  const sourceRows=(key:string)=>asRows({data:sources[key],error:null});

  // Club schedules and verified appearances are separate sources. Either may be unavailable.
  if(playerIds.length && !errors.fixtures) {
    try {
      const links=safeLimit(sourceRows('fixture_links'),500);
      const kickoffResult=await kickoffRead;
      const kickoff=kickoffResult?.error ? null : kickoffResult?.data as Row|null;
      snapshot.fixtureCoverage=kickoff?.coverage ?? null;
      const fixtures=new Map<string,Row>();
      for(const link of links){
        const player=playerById.get(str(link.player_id));
        if(!player||!link.kickoff_at||dayInZone(link.kickoff_at,timeZone)!==date)continue;
        const fixtureId=str(link.fixture_id);
        const fixture=fixtures.get(fixtureId)||{
          fixtureId,kickoffAt:link.kickoff_at,homeName:link.home_team_name||'Home team',
          awayName:link.away_team_name||'Away team',status:link.status||'',relatedPlayerNames:new Set<string>(),
        };
        fixture.relatedPlayerNames.add(`${player.first_name||''} ${player.last_name||''}`.trim());
        fixtures.set(fixtureId,fixture);
      }
      const matchKey=(fixture:Row)=>JSON.stringify([
        Date.parse(fixture.kickoffAt),str(fixture.homeName).toLowerCase(),str(fixture.awayName).toLowerCase(),
      ]);
      const existing=new Map([...fixtures.values()].map(fixture=>[matchKey(fixture),fixture]));
      for(const row of (Array.isArray(kickoff?.items) ? kickoff.items : [])){
        if(!Array.isArray(row?.players) || dayInZone(row.kickoff_at,timeZone)!==date)continue;
        const related=row.players.filter((player:Row)=>playerById.has(str(player.id)));
        if(!related.length)continue;
        const fixture={
          fixtureId:row.fixture_id,kickoffAt:row.kickoff_at,homeName:row.home_team_name,awayName:row.away_team_name,
          homeLogo:row.home_logo,awayLogo:row.away_logo,status:row.status,source:'kickoffapi',
          attribution:row.attribution,relatedPlayerNames:new Set<string>(related.map((player:Row)=>str(player.name))),
          href:`${basePath}?view=calendar&date=${date}`,
        };
        const sameMatch=existing.get(matchKey(fixture));
        if(sameMatch){
          for(const name of sameMatch.relatedPlayerNames)fixture.relatedPlayerNames.add(name);
          fixtures.delete(sameMatch.fixtureId);
        }
        fixtures.set(fixture.fixtureId,fixture);
      }
      if(links.length || snapshot.fixtureCoverage || fixtures.size){
        const fullCoverage=snapshot.fixtureCoverage && snapshot.fixtureCoverage.fresh===snapshot.fixtureCoverage.eligible;
        snapshot.fixturesToday=fixtures.size || (fullCoverage || links.length ? 0 : null);
        snapshot.fixtures=[...fixtures.values()].sort((a,b)=>Date.parse(a.kickoffAt)-Date.parse(b.kickoffAt))
          .slice(0,12).map(fixture=>({...fixture,relatedPlayerNames:[...fixture.relatedPlayerNames]}));
      }
    }catch{errors.fixtures='Verified fixture links unavailable';}
  }

  if(ADMIN.has(role)) {
    try {
      snapshot.clubRequests=sourceRows('requests').map(row=>({
        id:row.id,clubName:row.club_name,position:row.position,
        candidateCount:int(row.candidate_count),shortlistedCount:int(row.shortlisted_count),
        pitchedCount:int(row.pitched_count),isPredicted:row.need_type==='predicted',
        href:`${basePath}?view=opportunities&tab=needs&record=${encodeURIComponent(row.id)}`,
      }));
    }catch{errors.requests='Club request data unavailable';}
  } else errors.requests='Available to agency administrators';

  if(!errors.events){
    try {
      const events:Row[]=[...agencyContractEvents];
      for(const p of players){
        const name=`${p.first_name||''} ${p.last_name||''}`.trim()||'Player';
        const href=`${basePath}?view=players&player=${encodeURIComponent(p.id)}`;
        const contract=str(p.contract_expiry);
        if(DAY.test(contract)&&contract>=today&&contract<=datePlus(today,120))
          events.push({id:`club-contract:${p.id}`,label:`${name} · Club contract`,description:'Contract expiry',date:contract,type:'club-contract',href});
        const birth=str(p.date_of_birth);
        if(DAY.test(birth)){
          let bday=`${today.slice(0,4)}-${birth.slice(5)}`;
          if(bday<today)bday=`${Number(today.slice(0,4))+1}-${birth.slice(5)}`;
          if(bday>=today&&bday<=datePlus(today,90))
            events.push({id:`birthday:${p.id}`,label:`${name} · Birthday`,description:'Player birthday',date:bday,type:'birthday',href});
        }
      }
      // A private-source failure must not hide the dates already verified from the roster.
      let tasks:Row[]=[];
      try {tasks=safeLimit(sourceRows('tasks'),500);}catch{errors.events='Upcoming work unavailable';}
      for(const task of tasks){
        const on=dayInZone(task.due_at,timeZone);
        if(on)events.push({id:`task:${task.id}`,label:task.title||'Follow-up',description:'Assigned task',date:on,type:'task',href:`${basePath}?view=calendar&task=${encodeURIComponent(task.id)}`});
      }
      snapshot.upcomingEvents=events.sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,9);
    }catch{errors.events='Upcoming work unavailable';}
  }

  try {
    const activity=await activityRead;
    if(!activity)throw new Error('Recent activity unavailable');
    snapshot.recentActivity=asRows(activity).filter(e=>e.action&&e.occurred_at)
      .slice(0,8).map(e=>{
        // Resolve names only from players already permitted in the active scope.
        // An opaque audit event by itself never grants visibility to a player.
        const player=playerById.get(str(e.entity_id));
        const created=e.action==='platform.agency.player_created'&&e.entity_type==='player'&&Boolean(player);
        const playerName=player?`${str(player.first_name)} ${str(player.last_name)}`.trim():'';
        return {id:e.id,
          title:created&&playerName?`${playerName} added as a new player`:`${human(e.action)} · ${human(e.entity_type)}`,
          happenedAt:e.occurred_at,
          ...(created?{href:`${basePath}?view=players&player=${encodeURIComponent(str(e.entity_id))}`}:{})};
      });
  }catch{errors.activity='Recent activity unavailable';}

  return snapshot;
}
