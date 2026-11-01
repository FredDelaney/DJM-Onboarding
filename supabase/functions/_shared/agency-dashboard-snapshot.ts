/**
 * Tenant-authorised, read-only agency dashboard composition.
 * Original ReDream implementation. This module runs ONLY in the agency-os edge function.
 * It never reads Athlivo data, never returns private player fields, and never assumes
 * an absent provider fixture means a player has no match scheduled.
 */

type Row = Record<string, any>;
type Query = {data: Row[] | null; error: {message?: string} | null};
type QueryClient = {
  from: (table:string)=>any;
  schema: (schema:string)=>{from:(table:string)=>any};
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
function asRows(result:Query):Row[] {
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
    fixtures:[] as Row[],clubRequests:[] as Row[],upcomingEvents:[] as Row[],recentActivity:[] as Row[],errors};

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

  // Fixture links MUST be confirmed by a provider ID on an actual player match record.
  // Do not match teams using a fuzzy club name, or show an invented fixture count.
  if(playerIds.length && !errors.fixtures) {
    try {
      const snaps=safeLimit(asRows(await client.schema('djm_os').from('player_match_stat_snapshots')
        .select('player_id,fixture_id,match_date').in('player_id',playerIds)
        .gte('match_date',datePlus(date,-1)).lte('match_date',datePlus(date,1)).limit(501)),500);
      const fixtureIds=[...new Set(uuidIds(snaps.filter(s=>s.fixture_id),'fixture_id'))];
      if(fixtureIds.length){
        const matches=safeLimit(asRows(await client.schema('djm_os').from('football_fixtures')
          .select('id,kickoff_at,home_team_name,away_team_name,status').in('id',fixtureIds).limit(501)),500);
        const verified=matches.filter(row=>row.kickoff_at&&dayInZone(row.kickoff_at,timeZone)===date)
          .sort((a,b)=>String(a.kickoff_at).localeCompare(String(b.kickoff_at)));
        snapshot.fixtures=verified.slice(0,12).map(row=>({
          fixtureId:row.id,kickoffAt:row.kickoff_at,homeName:row.home_team_name||'Home team',
          awayName:row.away_team_name||'Away team',status:row.status||'',
          relatedPlayerNames:[...new Set(snaps.filter(s=>s.fixture_id===row.id)
            .map(s=>playerById.get(str(s.player_id))).filter(Boolean)
            .map(p=>`${p!.first_name||''} ${p!.last_name||''}`.trim()))],
        }));
        snapshot.fixturesToday=verified.length;
      }
      // No linked match snapshot is not proof that no fixtures are scheduled.
    }catch{errors.fixtures='Verified fixture links unavailable';}
  }

  // Commercial records are not exposed to agent and scout roles by this dashboard.
  if(ADMIN.has(role)) {
    try {
      let query=client.schema('djm_os').from('club_needs')
        .select('id,organisation_id,owner_user_id,title,position,status,need_type,updated_at')
        .eq('tenant_id',tenantId).is('archived_at',null)
        .in('status',['active','open','confirmed']).order('updated_at',{ascending:false}).limit(7);
      if(scope==='me') query=query.eq('owner_user_id',userId);
      const needs=asRows(await query);
      const needIds=uuidIds(needs);
      const orgIds=[...new Set(uuidIds(needs.filter(n=>n.organisation_id),'organisation_id'))];
      const [orgs,matchRows,dealRows]=await Promise.all([
        orgIds.length?client.schema('djm_os').from('organisations').select('id,name').eq('tenant_id',tenantId).in('id',orgIds).limit(50):Promise.resolve({data:[],error:null}),
        needIds.length?client.schema('djm_os').from('player_matches').select('club_need_id,player_id,status').eq('tenant_id',tenantId).in('club_need_id',needIds).limit(501):Promise.resolve({data:[],error:null}),
        needIds.length?client.schema('djm_os').from('deal_rooms').select('club_need_id,player_id,pitch_status').eq('tenant_id',tenantId).in('club_need_id',needIds).limit(501):Promise.resolve({data:[],error:null}),
      ]);
      const byOrg=new Map(asRows(orgs).map(x=>[str(x.id),str(x.name)]));
      const matches=safeLimit(asRows(matchRows),500),deals=safeLimit(asRows(dealRows),500);
      snapshot.clubRequests=needs.map(n=>{
        const ms=matches.filter(m=>m.club_need_id===n.id),ds=deals.filter(d=>d.club_need_id===n.id);
        return {id:n.id,clubName:byOrg.get(str(n.organisation_id))||'Club',position:n.position||n.title||'Unspecified position',
          candidateCount:ms.length,shortlistedCount:ms.filter(m=>['shortlisted','selected'].includes(str(m.status))).length,
          pitchedCount:ds.filter(d=>['pitched','pending','accepted','declined'].includes(str(d.pitch_status).toLowerCase())).length,
          href:`${basePath}?view=opportunities&tab=needs&record=${encodeURIComponent(n.id)}`,
          isPredicted:n.need_type==='predicted'};
      });
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
      const tasks=safeLimit(asRows(await client.schema('djm_os').from('tasks')
        .select('id,title,due_at,owner_user_id,player_id,status').eq('tenant_id',tenantId)
        .eq('owner_user_id',userId).gte('due_at',`${today}T00:00:00Z`)
        .lte('due_at',`${datePlus(today,90)}T23:59:59Z`).limit(501)),500);
      for(const task of tasks){
        if(['done','completed','cancelled','archived'].includes(str(task.status).toLowerCase()))continue;
        const on=dayInZone(task.due_at,timeZone);
        if(on)events.push({id:`task:${task.id}`,label:task.title||'Follow-up',description:'Assigned task',date:on,type:'task',href:`${basePath}?view=calendar&task=${encodeURIComponent(task.id)}`});
      }
      snapshot.upcomingEvents=events.sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,9);
    }catch{errors.events='Upcoming work unavailable';}
  }

  try {
    let query=client.schema('platform').from('audit_events')
      .select('id,actor_user_id,action,entity_type,entity_id,occurred_at')
      .eq('tenant_id',tenantId).order('occurred_at',{ascending:false}).limit(12);
    if(scope==='me')query=query.eq('actor_user_id',userId);
    snapshot.recentActivity=asRows(await query).filter(e=>e.action&&e.occurred_at)
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
