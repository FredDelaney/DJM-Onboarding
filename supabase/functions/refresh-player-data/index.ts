// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v) => { const s = String(v ?? "").trim(); return s || null; };
const num = (v) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : null; };
const whole = (v) => { const n = num(v); return n == null ? null : Math.max(0, Math.round(n)); };
const norm = (v) => String(v || "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const API_BASE = "https://v3.football.api-sports.io";
const PITCH_BASE = "https://api.pitchapi.dev";
const FREE_FALLBACK_SEASONS = [2024, 2023, 2022];

function secretCandidates() {
  return [...new Set([
    clean(Deno.env.get("API_FOOTBALL_KEY")),
    clean(Deno.env.get("PITCH_API_KEY")),
  ].filter(Boolean))];
}

async function probePitch(key) {
  try {
    const r = await fetch(`${PITCH_BASE}/v1/leagues`, { headers: { "X-API-KEY": key }, signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}

async function probeApiFootball(key) {
  try {
    const r = await fetch(`${API_BASE}/countries`, { headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    const p = await r.json();
    return !(p?.errors && Object.keys(p.errors).length);
  } catch { return false; }
}

async function resolveProviderKeys() {
  const candidates = secretCandidates();
  let pitchKey = candidates.find((k) => /^pk_(live|test)_/i.test(k)) || null;
  if (!pitchKey) {
    for (const key of candidates) if (await probePitch(key)) { pitchKey = key; break; }
  }
  let apiKey = candidates.find((k) => k !== pitchKey) || null;
  if (apiKey && !(await probeApiFootball(apiKey))) apiKey = null;
  if (!apiKey) {
    for (const key of candidates) {
      if (key === pitchKey) continue;
      if (await probeApiFootball(key)) { apiKey = key; break; }
    }
  }
  return { pitchKey, apiKey, configuredSecrets: candidates.length };
}

async function pitch(path, key) {
  const r = await fetch(`${PITCH_BASE}${path}`, { headers: { "X-API-KEY": key }, signal: AbortSignal.timeout(15000) });
  const p = await r.json().catch(() => ({}));
  if (!r.ok || p?.error) throw new Error(p?.error?.message || p?.error || `PitchAPI returned HTTP ${r.status}.`);
  return p?.data ?? p;
}

async function apiFootball(path, params, key) {
  if (!key) throw new Error("API-Football key is not configured.");
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => q.set(k, String(v)));
  const r = await fetch(`${API_BASE}${path}?${q}`, { headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`API-Football returned HTTP ${r.status}.`);
  const p = await r.json();
  if (p?.errors && Object.keys(p.errors).length) throw new Error(Object.values(p.errors).map(String).join("; ") || "API-Football returned an error.");
  return p;
}
function seasonAccessError(e) {
  const m = e instanceof Error ? e.message : String(e);
  return /free plans do not have access to this season|try from 2022 to 2024|season.*not.*available/i.test(m);
}

const COUNTRY_CODES = {
  england:"ENG", scotland:"SCO", wales:"WAL", ireland:"IRL", "republic of ireland":"IRL",
  italy:"ITA", spain:"ESP", germany:"GER", france:"FRA", portugal:"POR", netherlands:"NED",
  belgium:"BEL", austria:"AUT", switzerland:"SUI", denmark:"DEN", norway:"NOR", sweden:"SWE",
  finland:"FIN", poland:"POL", croatia:"CRO", serbia:"SRB", slovenia:"SVN", romania:"ROU",
  greece:"GRE", turkey:"TUR", israel:"ISR", japan:"JPN", "south korea":"KOR", australia:"AUS",
  "new zealand":"NZL", thailand:"THA", malaysia:"MAS", indonesia:"IDN", singapore:"SGP",
  china:"CHN", "united states":"USA", usa:"USA", mexico:"MEX", brazil:"BRA", argentina:"ARG",
  colombia:"COL", uruguay:"URU", chile:"CHI", "south africa":"RSA", "saudi arabia":"KSA",
  "united arab emirates":"UAE", qatar:"QAT", egypt:"EGY", morocco:"MAR"
};
const CODE_COUNTRIES = Object.fromEntries(Object.entries(COUNTRY_CODES).map(([k,v]) => [v, k.replace(/\b\w/g, c => c.toUpperCase())]));
const countryAliases = {
  usa:"United States","united states of america":"United States","korea republic":"South Korea","south korea":"South Korea",
  uae:"United Arab Emirates","cote d ivoire":"Ivory Coast","republic of ireland":"Republic of Ireland",ireland:"Republic of Ireland",
  "congo dr":"DR Congo","democratic republic of the congo":"DR Congo",luxemburg:"Luxembourg",czechia:"Czech Republic","new zealand":"New Zealand"
};
function canonicalCountry(v) {
  const n = norm(v);
  return countryAliases[n] || String(v || "").trim();
}

const top = {
  england:["premier league"],spain:["la liga"],brazil:["serie a"],italy:["serie a"],germany:["bundesliga"],france:["ligue 1"],
  portugal:["primeira liga"],argentina:["liga profesional argentina","primera division"],netherlands:["eredivisie"],colombia:["primera a"],
  turkey:["super lig"],belgium:["jupiler pro league","pro league"],"saudi arabia":["pro league"],greece:["super league 1"],egypt:["premier league"],
  "czech republic":["czech liga","chance liga"],japan:["j1 league"],uruguay:["primera division"],mexico:["liga mx"],poland:["ekstraklasa"],
  scotland:["premiership"],denmark:["superliga"],romania:["liga i","liga 1"],croatia:["hnl","1 hnl"],switzerland:["super league"],
  norway:["eliteserien"],serbia:["super liga"],ukraine:["premier league"],austria:["bundesliga"],"south korea":["k league 1"],morocco:["botola pro"],
  "united states":["major league soccer","mls"],"united arab emirates":["pro league"],israel:["ligat ha al","premier league"],
  "south africa":["premiership","premier soccer league"],thailand:["thai league 1"],"republic of ireland":["premier division"],china:["super league"],
  sweden:["allsvenskan"],finland:["veikkausliiga"],qatar:["stars league"],australia:["a league","a league men"],malaysia:["super league"],
  indonesia:["liga 1"],singapore:["premier league"],"new zealand":["national league","premiership"]
};
const lower = {
  england:[[2,["championship"]],[3,["league one"]],[4,["league two"]],[5,["national league"]]],italy:[[2,["serie b"]],[3,["serie c"]]],
  germany:[[2,["2 bundesliga"]],[3,["3 liga"]]],france:[[2,["ligue 2"]],[3,["national 1","national"]]],
  spain:[[2,["segunda division"]],[3,["primera federacion"]],[4,["segunda federacion"]]],portugal:[[2,["liga portugal 2","segunda liga"]],[3,["liga 3"]]],
  netherlands:[[2,["eerste divisie"]],[3,["tweede divisie"]]],scotland:[[2,["championship"]],[3,["league one"]],[4,["league two"]]],
  finland:[[2,["ykkosliiga"]],[3,["ykkonen"]],[4,["kakkonen"]]],sweden:[[2,["superettan"]],[3,["ettan norra","ettan sodra","ettan"]]],
  norway:[[2,["1 division"]],[3,["2 division"]]],denmark:[[2,["1st division","1 division"]],[3,["2nd division","2 division"]]],
  japan:[[2,["j2 league"]],[3,["j3 league"]]],"south korea":[[2,["k league 2"]]],thailand:[[2,["thai league 2"]],[3,["thai league 3"]]],
  indonesia:[[2,["liga 2"]],[3,["liga nusantara"]]],"republic of ireland":[[2,["first division"]]],israel:[[2,["liga leumit"]]],
  china:[[2,["league one"]],[3,["league two"]]],brazil:[[2,["serie b"]],[3,["serie c"]],[4,["serie d"]]],argentina:[[2,["primera nacional"]]],
  "united states":[[2,["usl championship"]],[3,["usl league one"]]],mexico:[[2,["liga de expansion mx","liga de expansion"]]],
  "south africa":[[2,["1st division","first division"]]],"new zealand":[[2,["northern league","central league","southern league"]]]
};
function inferTier(country, league) {
  const c = norm(canonicalCountry(country)), l = norm(league);
  if (top[c]?.includes(l)) return 1;
  for (const [tier, names] of lower[c] || []) if (names.includes(l)) return tier;
  return null;
}

async function ensureCompetitionBenchmark(admin, provider, providerCompetitionId, league, country, userId) {
  if (!providerCompetitionId || !league) return { competitionId: null, benchmark: null };
  const tier = inferTier(country, league);
  const { data, error } = await admin.rpc("djm_refresh_player_data_context", {
    p_mode: "benchmark",
    p_payload: {
      provider,
      provider_competition_id: String(providerCompetitionId),
      league,
      country: canonicalCountry(country),
      tier,
      user_id: userId,
    },
  });
  if (error) throw error;
  return {
    competitionId: data?.competitionId || null,
    benchmark: data?.benchmark || null,
  };
}

function nameScore(remote, player) {
  const rn = norm(remote);
  const full = norm([player.first_name, player.last_name].filter(Boolean).join(" "));
  const pref = norm(player.preferred_name);
  const last = norm(player.last_name);
  const first = norm(player.first_name);
  if (!rn) return 0;
  if (full && rn === full) return 12;
  if (pref && rn === pref) return 11;
  const parts = rn.split(" ");
  if (last && parts.includes(last) && first && (rn.includes(first) || rn.startsWith(first[0] + " "))) return 8;
  if (last && parts.includes(last)) return 5;
  return 0;
}
function leagueScore(remote, player) {
  const a = norm(remote?.name), b = norm(player.current_league);
  if (!a || !b) return 0;
  let s = a === b ? 15 : (a.includes(b) || b.includes(a) ? 9 : 0);
  const wantedCode = COUNTRY_CODES[norm(player.current_country)];
  if (wantedCode && remote?.country_code === wantedCode) s += 6;
  return s;
}
function matchLeague(leagues, player) {
  const ranked = (leagues || []).map(l => ({ l, s:leagueScore(l, player) })).sort((a,b)=>b.s-a.s);
  if (!ranked.length || ranked[0].s < 9) return null;
  if (ranked[1] && ranked[1].s === ranked[0].s) return null;
  return ranked[0].l;
}
function teamMatchScore(name, wanted) {
  const a=norm(name), b=norm(wanted);
  if (!a || !b) return 0;
  if (a===b) return 10;
  if (a.includes(b) || b.includes(a)) return 7;
  const at=new Set(a.split(" ")), bt=new Set(b.split(" "));
  const overlap=[...at].filter(x=>bt.has(x)&&x.length>2).length;
  return overlap>=2?5:0;
}
function finishedMatch(m) {
  return m?.status === "finished" || m?.finished === true || (m?.score_home != null && m?.score_away != null);
}
async function parallel(items, limit, fn) {
  const out=[];
  for (let i=0;i<items.length;i+=limit) {
    const batch=items.slice(i,i+limit);
    out.push(...await Promise.all(batch.map(fn)));
  }
  return out;
}
function flattenPitchBasic(line) {
  const flat={};
  for (const group of line?.stats || []) {
    for (const entry of Object.values(group?.stats || {})) {
      const key=entry?.key; const stat=entry?.stat || {};
      if (!key) continue;
      flat[key]=stat?.value ?? null;
      if (stat?.total != null) flat[`${key}_total`]=stat.total;
      if (stat?.percentage != null) flat[`${key}_percentage`]=stat.percentage;
    }
  }
  return flat;
}
function findFlat(flat, keys) {
  for (const k of keys) if (num(flat?.[k]) != null) return num(flat[k]);
  return null;
}
function pitchRole(positionId) {
  return positionId===1?"goalkeeper":positionId===2?"defender":positionId===3?"midfielder":positionId===4?"attacker":"unknown";
}
function groupForPosition(p) {
  const n=norm(p);
  if (/goalkeeper|\bgk\b/.test(n)) return "GK";
  if (/centre back|center back|\bcb\b|\blcb\b|\brcb\b/.test(n)) return "CB";
  if (/left back|right back|wing back|full back|\blb\b|\brb\b|\blwb\b|\brwb\b/.test(n)) return "FB_WB";
  if (/defensive midfielder|\bdm\b|\bcdm\b/.test(n)) return "DM";
  if (/attacking midfielder|\bam\b|\bcam\b/.test(n)) return "AM";
  if (/central midfielder|\bcm\b/.test(n)) return "CM";
  if (/winger|left wing|right wing|\blw\b|\brw\b/.test(n)) return "W";
  if (/striker|forward|centre forward|center forward|\bst\b|\bcf\b/.test(n)) return "ST";
  return "UNKNOWN";
}
function broadForGroup(g) {
  if (g==="GK") return "goalkeeper";
  if (["CB","FB_WB"].includes(g)) return "defender";
  if (["DM","CM","AM"].includes(g)) return "midfielder";
  if (["W","ST"].includes(g)) return "attacker";
  return "unknown";
}

function mergePitchMatchPlayers(basicData, advancedData, match) {
  const basics = Array.isArray(basicData) ? basicData : [];
  const advanced = advancedData?.players || [];
  const map = new Map();
  for (const b of basics) {
    const id=String(b?.player?.id||""); if(!id) continue;
    map.set(id,{provider:"pitchapi",provider_player_id:id,provider_team_id:String(b?.team_id||""),player_name:clean(b?.player?.name),
      provider_position_id:b?.player?.position_id ?? b?.position_id ?? null,provider_position:pitchRole(b?.player?.position_id ?? b?.position_id),
      basic:flattenPitchBasic(b),advanced:null,match_id:match.id,match_date:match.date||String(match.time_utc||"").slice(0,10)});
  }
  for (const a of advanced) {
    const id=String(a?.player?.id||""); if(!id) continue;
    const row=map.get(id)||{provider:"pitchapi",provider_player_id:id,provider_team_id:String(a?.team_id||""),player_name:clean(a?.player?.name),
      provider_position_id:null,provider_position:"unknown",basic:{},advanced:null,match_id:match.id,match_date:match.date||String(match.time_utc||"").slice(0,10)};
    row.advanced=a; map.set(id,row);
  }
  return [...map.values()];
}

function aggregatePitch(rows) {
  const map=new Map();
  for (const r of rows) {
    let a=map.get(r.provider_player_id);
    if(!a){a={id:r.provider_player_id,name:r.player_name,role:r.provider_position,positionId:r.provider_position_id,minutes:0,apps:0,starts:0,goals:0,assists:0,xg:0,xa:0,ratingWeighted:0,ratingMinutes:0,
      passes:0,keyPasses:0,assistsAdvanced:0,progressivePasses:0,passesIntoBox:0,passAccuracyWeighted:0,passAccuracyWeight:0,
      carries:0,progressiveCarries:0,carriesIntoFinalThird:0,carriesIntoBox:0,takeOns:0,takeOnsWon:0,
      sca:0,gca:0,xag:0,xgChain:0,xgBuildup:0,tackles:0,interceptions:0,blocks:0,clearances:0,duelsWon:0,aerials:0,aerialsWon:0,
      xt:0,vaep:0,vaepOff:0,vaepDef:0,claims:0,claimsWon:0,sweeperActions:0,distributions:0,distributionAccuracyWeighted:0,distributionWeight:0,
      foulsCommitted:0,foulsWon:0,yellow:0,red:0,distance:0,sprints:0,topSpeedMax:null,matches:new Set()};map.set(r.provider_player_id,a)}
    const b=r.basic||{}, adv=r.advanced||{};
    const mins=num(adv?.minutes_played) ?? findFlat(b,["minutes_played","minutes"]) ?? 0;
    a.minutes += mins; a.matches.add(r.match_id); if(mins>0)a.apps+=1;
    a.goals += findFlat(b,["goals"]) ?? 0; a.assists += findFlat(b,["assists"]) ?? 0;
    a.xg += findFlat(b,["expected_goals","xg"]) ?? 0; a.xa += findFlat(b,["expected_assists","xa"]) ?? 0;
    const rating=findFlat(b,["rating_title","rating"]); if(rating!=null&&mins>0){a.ratingWeighted+=rating*mins;a.ratingMinutes+=mins}
    const p=adv?.passing||{}, c=adv?.carrying||{}, cr=adv?.creation||{}, d=adv?.defending||{}, pv=adv?.possession_value||{}, g=adv?.goalkeeping||{};
    a.passes+=num(p.passes)??0;a.keyPasses+=num(p.key_passes)??0;a.assistsAdvanced+=num(p.assists)??0;a.progressivePasses+=num(p.progressive_passes)??0;a.passesIntoBox+=num(p.passes_into_box)??0;
    if(num(p.pass_accuracy)!=null&&num(p.passes)!=null){a.passAccuracyWeighted+=num(p.pass_accuracy)*Math.max(1,num(p.passes));a.passAccuracyWeight+=Math.max(1,num(p.passes))}
    a.carries+=num(c.carries)??0;a.progressiveCarries+=num(c.progressive_carries)??0;a.carriesIntoFinalThird+=num(c.carries_into_final_third)??0;a.carriesIntoBox+=num(c.carries_into_box)??0;a.takeOns+=num(c.take_ons)??0;a.takeOnsWon+=num(c.take_ons_won)??0;
    a.sca+=num(cr.sca)??0;a.gca+=num(cr.gca)??0;a.xag+=num(cr.xag)??0;a.xgChain+=num(cr.xg_chain)??0;a.xgBuildup+=num(cr.xg_buildup)??0;
    a.tackles+=num(d.tackles)??0;a.interceptions+=num(d.interceptions)??0;a.blocks+=num(d.blocks)??0;a.clearances+=num(d.clearances)??0;a.duelsWon+=num(d.duels_won)??0;a.aerials+=num(d.aerials)??0;a.aerialsWon+=num(d.aerials_won)??0;
    a.xt+=num(pv.xt_total)??0;a.vaep+=num(pv.vaep_total)??0;a.vaepOff+=num(pv.vaep_offensive)??0;a.vaepDef+=num(pv.vaep_defensive)??0;
    a.claims+=num(g.claims)??0;a.claimsWon+=num(g.claims_won)??0;a.sweeperActions+=num(g.sweeper_actions)??0;a.distributions+=num(g.distributions)??0;
    if(num(g.distribution_accuracy)!=null&&num(g.distributions)!=null){a.distributionAccuracyWeighted+=num(g.distribution_accuracy)*Math.max(1,num(g.distributions));a.distributionWeight+=Math.max(1,num(g.distributions))}
    a.foulsCommitted += findFlat(b,["fouls_committed","fouls"]) ?? 0;a.foulsWon += findFlat(b,["fouls_won"]) ?? 0;
    a.yellow += findFlat(b,["yellow_cards","yellow"]) ?? 0;a.red += findFlat(b,["red_cards","red"]) ?? 0;
    a.distance += findFlat(b,["distance_covered","distance"]) ?? 0;a.sprints += findFlat(b,["sprints"]) ?? 0;
    const ts=findFlat(b,["top_speed"]);if(ts!=null)a.topSpeedMax=a.topSpeedMax==null?ts:Math.max(a.topSpeedMax,ts);
  }
  return [...map.values()].map(a=>{
    const per90=(x)=>a.minutes>0?x*90/a.minutes:null;
    return {...a,apps:a.matches.size,rating:a.ratingMinutes?a.ratingWeighted/a.ratingMinutes:null,goals90:per90(a.goals),assists90:per90(a.assists),xg90:per90(a.xg),xa90:per90(a.xa),
      keyPasses90:per90(a.keyPasses),progressivePasses90:per90(a.progressivePasses),passesIntoBox90:per90(a.passesIntoBox),passes90:per90(a.passes),
      passAccuracy:a.passAccuracyWeight?a.passAccuracyWeighted/a.passAccuracyWeight:null,progressiveCarries90:per90(a.progressiveCarries),carriesIntoFinalThird90:per90(a.carriesIntoFinalThird),
      carriesIntoBox90:per90(a.carriesIntoBox),takeOnsWon90:per90(a.takeOnsWon),takeOnRate:a.takeOns?a.takeOnsWon/a.takeOns*100:null,sca90:per90(a.sca),gca90:per90(a.gca),xag90:per90(a.xag),
      tackles90:per90(a.tackles),interceptions90:per90(a.interceptions),blocks90:per90(a.blocks),clearances90:per90(a.clearances),duelsWon90:per90(a.duelsWon),
      aerialsWon90:per90(a.aerialsWon),aerialWinRate:a.aerials?a.aerialsWon/a.aerials*100:null,xt90:per90(a.xt),vaep90:per90(a.vaep),vaepOff90:per90(a.vaepOff),vaepDef90:per90(a.vaepDef),
      claimRate:a.claims?a.claimsWon/a.claims*100:null,sweeper90:per90(a.sweeperActions),distributionAccuracy:a.distributionWeight?a.distributionAccuracyWeighted/a.distributionWeight:null,
      fouls90:per90(a.foulsCommitted),yellow90:per90(a.yellow),red90:per90(a.red),distance90:per90(a.distance),sprints90:per90(a.sprints)};
  });
}
function pct(v,xs,getter,inverse=false){if(v==null||!Number.isFinite(v))return null;const vals=xs.map(getter).filter(x=>x!=null&&Number.isFinite(x));if(vals.length<6)return null;let less=0,equal=0;for(const x of vals){if(x<v)less++;else if(Math.abs(x-v)<1e-9)equal++}const p=(less+0.5*equal)/vals.length*100;return Math.round((inverse?100-p:p)*10)/10}
function composite(cur,peers,parts,minWeight=.5){let total=0,w=0;const detail={};for(const [k,weight,inverse] of parts){const p=pct(cur[k],peers,x=>x[k],Boolean(inverse));detail[k]=p;if(p!=null){total+=p*weight;w+=weight}}return{score:w>=minWeight?Math.round(total/w*10)/10:null,coverage:w,detail}}
function pitchPerformance(cur, all, group) {
  const role=broadForGroup(group); let threshold=450; let peers=all.filter(x=>x.role===role&&x.minutes>=threshold);
  if(peers.length<8){threshold=270;peers=all.filter(x=>x.role===role&&x.minutes>=threshold)}
  if(peers.length<8){threshold=180;peers=all.filter(x=>x.role===role&&x.minutes>=threshold)}
  if(peers.length<6||cur.minutes<threshold)return null;
  const attacking=composite(cur,peers,[["xg90",.3],["goals90",.2],["vaepOff90",.2],["carriesIntoBox90",.15],["rating",.15]],.5);
  const creativity=composite(cur,peers,[["xag90",.3],["assists90",.2],["keyPasses90",.25],["sca90",.15],["passesIntoBox90",.1]],.5);
  const progression=composite(cur,peers,[["progressivePasses90",.3],["progressiveCarries90",.3],["xt90",.2],["carriesIntoFinalThird90",.2]],.5);
  const possession=composite(cur,peers,[["passAccuracy",.35],["passes90",.25],["vaep90",.25],["takeOnRate",.15]],.5);
  const defending=composite(cur,peers,[["tackles90",.2],["interceptions90",.25],["blocks90",.1],["clearances90",.1],["duelsWon90",.2],["vaepDef90",.15]],.5);
  const aerial=composite(cur,peers,[["aerialWinRate",.65],["aerialsWon90",.35]],.65);
  const goalkeeping=composite(cur,peers,[["claimRate",.4],["distributionAccuracy",.3],["sweeper90",.3]],.6);
  const physical=composite(cur,peers,[["distance90",.45],["sprints90",.35],["topSpeedMax",.2]],.6);
  const discipline=composite(cur,peers,[["yellow90",.6,true],["red90",.4,true]],.6);
  const expected=group==="GK"?1:group==="ST"?2:3;
  const available=[attacking,creativity,progression,possession,defending,aerial,goalkeeping].filter(x=>x.score!=null).length;
  const confidence=Math.max(.5,Math.min(.97,.55+.2*Math.min(1,peers.length/30)+.15*Math.min(1,cur.minutes/900)+.07*Math.min(1,available/expected)));
  return {peerCount:peers.length,threshold,confidence:Math.round(confidence*100)/100,attacking,creativity,progression,possession,defending,aerial,goalkeeping,physical,discipline};
}

async function pitchCurrentRefresh(admin, player, userId, key) {
  if (!player.current_league) return { ok:false, reason:"Current league is missing, so PitchAPI coverage cannot be resolved safely." };
  const catalog=await pitch("/v1/leagues",key);
  const league=matchLeague(catalog?.leagues||[],player);
  if(!league)return{ok:false,reason:`PitchAPI does not clearly cover ${player.current_league}.`};
  const detail=await pitch(`/v1/leagues/${league.id}`,key);
  const season=detail?.season||league?.seasons?.[0];
  if(!season)return{ok:false,reason:"PitchAPI returned no current season for the matched competition."};
  const matchPayload=await pitch(`/v1/leagues/${league.id}/matches?season=${encodeURIComponent(season)}`,key);
  const matches=(matchPayload?.matches||[]).filter(finishedMatch).sort((a,b)=>String(b.date||b.time_utc).localeCompare(String(a.date||a.time_utc)));
  if(!matches.length)return{ok:false,reason:"PitchAPI has no finished current-season matches for this competition."};

  let teamId=null,teamName=null;
  if(player.current_club){
    const candidates=new Map();
    for(const m of matches){for(const t of [m.home_team,m.away_team]){const s=teamMatchScore(t?.name,player.current_club);if(s>(candidates.get(t?.id)?.s||0))candidates.set(t?.id,{s,name:t?.name})}}
    const ranked=[...candidates.entries()].map(([id,v])=>({id,...v})).sort((a,b)=>b.s-a.s);
    if(ranked[0]?.s>=7){teamId=ranked[0].id;teamName=ranked[0].name}
  }
  const targetMatches=(teamId?matches.filter(m=>m.home_team?.id===teamId||m.away_team?.id===teamId):matches.slice(0,30));
  let found=null;
  const scan=async(ms)=>{
    const responses=await parallel(ms,5,async m=>({m,data:await pitch(`/v1/matches/${m.id}/players`,key).catch(()=>[])}));
    for(const {m,data} of responses){
      const ranked=(Array.isArray(data)?data:[]).map(line=>({line,s:nameScore(line?.player?.name,player)})).sort((a,b)=>b.s-a.s);
      if(ranked[0]?.s>=8){found={playerId:String(ranked[0].line.player.id),positionId:ranked[0].line.player.position_id??ranked[0].line.position_id??null,match:m};return true}
    }
    return false;
  };
  if(!(await scan(targetMatches.slice(0,12))))await scan(targetMatches.slice(12,30));
  if(!found)return{ok:false,reason:"PitchAPI covers the competition but DJM could not confidently match this player in the current-season lineups."};

  const windowMatches=matches.slice(0,60);
  const matchRowsNested=await parallel(windowMatches,6,async m=>{
    const [basic,advanced]=await Promise.all([
      pitch(`/v1/matches/${m.id}/players`,key).catch(()=>[]),
      pitch(`/v1/matches/${m.id}/advanced/players`,key).catch(()=>({players:[]})),
    ]);
    return mergePitchMatchPlayers(basic,advanced,m);
  });
  const peerRows=matchRowsNested.flat();
  const ag=aggregatePitch(peerRows);
  const cur=ag.find(x=>x.id===found.playerId);
  if(!cur)return{ok:false,reason:"PitchAPI matched the player but returned no usable current performance sample."};

  const group=groupForPosition(player.primary_position);
  const perf=group==="UNKNOWN"?null:pitchPerformance(cur,ag,group);
  const country=canonicalCountry(player.current_country || CODE_COUNTRIES[league.country_code] || "");
  const cb=await ensureCompetitionBenchmark(admin,"pitchapi",String(league.id),league.name,country,userId);

  const providerIds={...(player.football_provider_ids&&typeof player.football_provider_ids==="object"?player.football_provider_ids:{}),pitchapi:found.playerId};
  const patch={football_provider_ids:providerIds};
  if(!player.current_competition_id&&cb.competitionId)patch.current_competition_id=cb.competitionId;

  const allTeamMatches=teamId?matches.filter(m=>m.home_team?.id===teamId||m.away_team?.id===teamId):targetMatches;
  const targetBasic=await parallel(allTeamMatches,8,async m=>{
    const d=await pitch(`/v1/matches/${m.id}/players/${found.playerId}`,key).catch(()=>null);
    if(!d)return null;
    return {provider:"pitchapi",provider_player_id:found.playerId,provider_team_id:String(d.team_id||teamId||""),player_name:clean(d.player?.name),
      provider_position_id:d.player?.position_id??d.position_id??found.positionId,provider_position:pitchRole(d.player?.position_id??d.position_id??found.positionId),
      basic:flattenPitchBasic(d),advanced:null,match_id:m.id,match_date:m.date||String(m.time_utc||"").slice(0,10)};
  });
  const fullTarget=aggregatePitch(targetBasic.filter(Boolean))[0]||cur;
  const seasonLabel=String(season);
  const now=nowIso();
  const existingQuery=await admin.from("career_entries").select("id,season_label,club_name,league,source_name,source_reviewed_at,source_provider").eq("player_id",player.id);
  if(existingQuery.error)throw existingQuery.error;
  const exact=(existingQuery.data||[]).find(e=>norm(e.season_label)===norm(seasonLabel)&&norm(e.club_name)===norm(teamName||player.current_club)&&norm(e.league)===norm(league.name));
  const providerOwned=exact&&(norm(exact.source_provider)==="pitchapi"||norm(exact.source_name)==="pitchapi");
  let careerConflict=false;
  if(exact?.source_reviewed_at&&!providerOwned)careerConflict=true;
  else{
    const payload={player_id:player.id,season_label:seasonLabel,club_name:teamName||player.current_club||"Unknown club",league:league.name,country:country||player.current_country,
      appearances:fullTarget.apps,starts:null,minutes:Math.round(fullTarget.minutes),goals:Math.round(fullTarget.goals),assists:Math.round(fullTarget.assists),
      source_name:"PitchAPI",source_url:"https://pitchapi.dev/",source_reviewed_at:now,source_provider:"pitchapi",source_acceptance_method:"licensed_sync",
      source_provider_player_id:found.playerId,source_synced_at:now,competition_id:cb.competitionId};
    if(exact?.id){const {error}=await admin.from("career_entries").update(payload).eq("id",exact.id);if(error)throw error}
    else{const {error}=await admin.from("career_entries").insert(payload);if(error)throw error}
  }

  const {error:snapErr}=await admin.rpc("djm_upsert_pitchapi_player_snapshot",{p_snapshot:{
    player_id:player.id,provider_player_id:found.playerId,provider_team_id:String(teamId||""),provider_competition_id:String(league.id),
    provider_season_id:seasonLabel,season_label:seasonLabel,club_name:teamName||player.current_club,competition_name:league.name,
    metrics:{current_season:fullTarget,current_window:cur,window_matches:windowMatches.length},observed_at:now,synced_at:now
  }});
  if(snapErr)throw snapErr;

  let performanceSnapshot=null;
  if(perf){
    const ref=`pitchapi:${league.id}:${seasonLabel}:rolling60`;
    const payload={player_id:player.id,competition_id:cb.competitionId,season_label:seasonLabel,position_group:group,evidence_date:today(),minutes:Math.round(cur.minutes),starts:null,appearances:cur.apps,possible_minutes:null,
      overall_performance_percentile:null,attacking_percentile:perf.attacking.score,creativity_percentile:perf.creativity.score,progression_percentile:perf.progression.score,
      possession_percentile:perf.possession.score,defending_percentile:perf.defending.score,aerial_percentile:perf.aerial.score,goalkeeping_percentile:perf.goalkeeping.score,
      physical_percentile:perf.physical.score,discipline_percentile:perf.discipline.score,
      peer_group_description:`PitchAPI ${cur.role}s in ${league.name}, ${seasonLabel}, rolling ${windowMatches.length} finished league matches, minimum ${perf.threshold} minutes`,
      provider:"pitchapi_current_peer_v1",source_name:"PitchAPI current rolling peer cohort",source_url:"https://pitchapi.dev/",source_reference:ref,
      observed_at:now,verified_at:now,verified_by:userId,confidence:perf.confidence,
      raw_metrics:{current:cur,category_components:{attacking:perf.attacking.detail,creativity:perf.creativity.detail,progression:perf.progression.detail,possession:perf.possession.detail,defending:perf.defending.detail,aerial:perf.aerial.detail,goalkeeping:perf.goalkeeping.detail,physical:perf.physical.detail,discipline:perf.discipline.detail}},
      metadata:{methodology_version:"djm_pitchapi_current_peer_v1",peer_count:perf.peerCount,minimum_minutes:perf.threshold,match_window:windowMatches.length,season:seasonLabel,current_data:true}};
    const {data:id,error}=await admin.rpc("djm_upsert_pitchapi_performance_snapshot",{p_snapshot:payload});
    if(error)throw error;
    performanceSnapshot={id,...perf};
  }

  return {ok:true,patch,league,season:seasonLabel,playerId:found.playerId,teamId,teamName,benchmark:cb.benchmark,performance:performanceSnapshot,
    peerRows:ag.length,windowMatches:windowMatches.length,careerConflict,currentSeason:fullTarget};
}

function candidateScore(c,p){const x=c?.player||{};const full=norm([p.first_name,p.last_name].filter(Boolean).join(" "));const pref=norm(p.preferred_name),cn=norm(x.name);let s=0;if(full&&cn===full)s+=7;else if(pref&&cn===pref)s+=6;else if(full&&(cn.includes(full)||full.includes(cn)))s+=3;const dob=String(p.date_of_birth||"").slice(0,10),cd=String(x?.birth?.date||"").slice(0,10);if(dob&&cd&&dob===cd)s+=12;return s}
function chooseCandidate(xs,p){const r=xs.map(x=>({x,s:candidateScore(x,p)})).sort((a,b)=>b.s-a.s);if(!r.length)return null;if(r[0].s<7&&r[1]?.s===r[0].s)throw new Error("DJM found multiple players with the same name.");if(r[0].s<5)throw new Error("DJM could not confidently identify this player in API-Football.");return r[0].x}
function seasonCandidates(p){const y=new Date().getUTCFullYear();const s=String(p.current_season_start||"").slice(0,4);const sy=/^\d{4}$/.test(s)?Number(s):null;return [...new Set([sy,y,y-1].filter(Number.isInteger))].slice(0,2)}
function mappedSeasonRows(item,season){const out=[];for(const st of Array.isArray(item?.statistics)?item.statistics:[]){const apps=whole(st?.games?.appearences),mins=whole(st?.games?.minutes);if((apps??0)<=0&&(mins??0)<=0)continue;const team=clean(st?.team?.name);if(!team)continue;out.push({season_label:String(st?.league?.season??season),club_name:team,league:clean(st?.league?.name),country:clean(st?.league?.country),appearances:apps,starts:whole(st?.games?.lineups),minutes:mins,goals:whole(st?.goals?.total),assists:whole(st?.goals?.assists),provider_team_id:st?.team?.id==null?null:String(st.team.id),provider_competition_id:st?.league?.id==null?null:String(st.league.id),provider_season_id:String(st?.league?.season??season),provider_position:clean(st?.games?.position),raw_metrics:{games:st?.games??null,shots:st?.shots??null,goals:st?.goals??null,passes:st?.passes??null,tackles:st?.tackles??null,duels:st?.duels??null,dribbles:st?.dribbles??null,fouls:st?.fouls??null,cards:st?.cards??null,penalty:st?.penalty??null}})}return out}
async function apiHistoricalRefresh(admin,player,key){
  if(!key)return{ok:false,reason:"API-Football fallback is not configured."};
  const preferred=seasonCandidates(player), ids=player.football_provider_ids&&typeof player.football_provider_ids==="object"?player.football_provider_ids:{};
  let pid=clean(ids.api_football),profile=null,results=[],restricted=false;const search=String(player.last_name||[player.first_name,player.last_name].filter(Boolean).join(" ")||player.preferred_name||"").trim();
  const fetchSeason=async(season,searchMode)=>{try{const payload=await apiFootball("/players",searchMode?{search,season}:{id:String(pid),season},key);const item=searchMode?chooseCandidate(Array.isArray(payload.response)?payload.response:[],player):(Array.isArray(payload.response)?payload.response[0]:null);if(item){pid=pid||String(item?.player?.id||"").trim();profile=profile||item.player||null;results.push({season,item});return true}return false}catch(e){if(seasonAccessError(e)){restricted=true;return false}throw e}};
  if(!pid){if(search.length<3)return{ok:false,reason:"Player name is too short for API-Football fallback."};for(const s of preferred)if(await fetchSeason(s,true))break}
  if(pid)for(const s of preferred)if(!results.some(x=>x.season===s))await fetchSeason(s,false);
  if((!pid||!results.length)&&restricted){for(const s of FREE_FALLBACK_SEASONS){if(!pid){if(await fetchSeason(s,true))break}else{await fetchSeason(s,false);if(results.length)break}}}
  if(!pid||!results.length)return{ok:false,reason:"No usable API-Football historical record was found."};
  const rows=results.flatMap(({season,item})=>mappedSeasonRows(item,season));
  const existing=await admin.from("career_entries").select("id,season_label,club_name,league,source_reviewed_at,source_provider").eq("player_id",player.id);if(existing.error)throw existing.error;
  let inserted=0,updated=0,conflicts=0;const now=nowIso();
  for(const row of rows){const exact=(existing.data||[]).find(e=>norm(e.season_label)===norm(row.season_label)&&norm(e.club_name)===norm(row.club_name)&&norm(e.league)===norm(row.league));const owned=exact&&norm(exact.source_provider)==="api football";if(exact?.source_reviewed_at&&!owned){conflicts++;continue}const payload={player_id:player.id,season_label:row.season_label,club_name:row.club_name,league:row.league,country:row.country,appearances:row.appearances,starts:row.starts,minutes:row.minutes,goals:row.goals,assists:row.assists,source_name:"API-Football",source_url:"https://www.api-football.com/",source_reviewed_at:now,source_provider:"api_football",source_acceptance_method:"licensed_sync",source_provider_player_id:pid,source_synced_at:now};if(exact?.id){const{error}=await admin.from("career_entries").update(payload).eq("id",exact.id);if(error)throw error;updated++}else{const{error}=await admin.from("career_entries").insert(payload);if(error)throw error;inserted++}}
  return{ok:true,providerPlayerId:pid,profile,seasons:results.map(x=>x.season),rows,inserted,updated,conflicts,restricted};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(!token)return json({ok:false,error:"Unauthorized"},401);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")||serviceKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:authData,error:authError}=await admin.auth.getUser(token);if(authError||!authData?.user)return json({ok:false,error:"Unauthorized"},401);
    const {data:profile}=await admin.from("profiles").select("role").eq("id",authData.user.id).maybeSingle();if(profile?.role!=="admin")return json({ok:false,error:"Admin access required"},403);
    const keys=await resolveProviderKeys();
const body=await req.json().catch(()=>({}));
const mode=String(body?.mode||"refresh").toLowerCase();
const statsOnly=mode==="free_stats";

if(mode==="status"){
      const {data:status,error:statusError}=await admin.rpc("djm_refresh_player_data_context",{p_mode:"status",p_payload:{}});
      if(statusError)throw statusError;
      return json({ok:true,provider_priority:["pitchapi_current","api_football_historical"],pitchapi_configured:Boolean(keys.pitchKey),api_football_configured:Boolean(keys.apiKey),
        secret_names_are_ignored:true,configured_secret_values:keys.configuredSecrets,benchmark_anchors:Number(status?.benchmark_anchors||0),current_data_strategy:"PitchAPI current first, API-Football historical fallback only"});
    }
    const playerId=String(body?.player_id||"").trim();if(!playerId)return json({ok:false,error:"Player is required"},400);
    const {data:player,error:pe}=await admin.from("players").select("id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,primary_position,current_club,current_league,current_country,current_season_start,current_competition_id,football_provider_ids").eq("id",playerId).maybeSingle();
    if(pe)throw pe;if(!player)return json({ok:false,error:"Player not found"},404);

    let current=null,currentError=null;
    if(keys.pitchKey&&!statsOnly){try{current=await pitchCurrentRefresh(admin,player,authData.user.id,keys.pitchKey)}catch(e){currentError=e instanceof Error?e.message:String(e)}}
    if(current?.ok){
      const {error:ue}=await admin.from("players").update(current.patch).eq("id",player.id);if(ue)throw ue;
      let scoreResult=null;try{const{data,error}=await caller.rpc("djm_player_scorecard",{p_player_id:player.id});if(error)throw error;scoreResult=data}catch(e){console.warn(JSON.stringify({provider:"pitchapi",operation:"recalculate_player_score",entity_id:player.id,result_status:"skipped",error:e instanceof Error?e.message:String(e)}))}
      return json({ok:true,primary_provider:"PitchAPI",current_data:true,season:current.season,competition:current.league?.name,team:current.teamName,provider_player_id:current.playerId,
        peer_cohort:{players:current.peerRows,matches:current.windowMatches},performance_snapshot:current.performance?{peer_count:current.performance.peerCount,minimum_minutes:current.performance.threshold,confidence:current.performance.confidence}:null,
        benchmark:current.benchmark,career_conflict_kept_for_review:current.careerConflict,score_result:scoreResult,
        message:current.performance?"Current player data, current peer performance and Player Score refreshed from PitchAPI.":"Current player data refreshed from PitchAPI, but the peer sample was not sufficient for a full performance snapshot."});
    }

    const fallback=await apiHistoricalRefresh(admin,player,keys.apiKey).catch(e=>({ok:false,reason:e instanceof Error?e.message:String(e)}));
    if(fallback?.ok){
      const ids={...(player.football_provider_ids&&typeof player.football_provider_ids==="object"?player.football_provider_ids:{}),api_football:fallback.providerPlayerId};
      const patch={football_provider_ids:ids};if(!player.height_cm){const h=whole(fallback.profile?.height);if(h&&h>=140&&h<=220)patch.height_cm=h}
      if((!Array.isArray(player.nationalities)||!player.nationalities.length)&&fallback.profile?.nationality)patch.nationalities=[String(fallback.profile.nationality)];
      const{error}=await admin.from("players").update(patch).eq("id",player.id);if(error)throw error;
      return json({ok:true,primary_provider:"API-Football",current_data:false,access_mode:statsOnly?"free_stats":"historical_fallback",pitchapi_reason:statsOnly
  ?"Deep provider intentionally skipped in free stats mode."
  :current?.reason||currentError||"PitchAPI current coverage unavailable.",
                   score_refresh:false,
        seasons_checked:fallback.seasons,rows_inserted:fallback.inserted,rows_updated:fallback.updated,conflicts_kept_for_review:fallback.conflicts,
        message:statsOnly
  ?"Free player stats refreshed from API-Football without running DJM scoring."
  :"PitchAPI current coverage was unavailable for this player. DJM refreshed historical/profile evidence from API-Football but did not treat it as current performance."});
    }
       return json({
      ok:false,
      error:"No free provider could supply usable data for this player.",
      pitchapi_reason:statsOnly
        ?"Deep provider intentionally skipped in free stats mode."
        :current?.reason||currentError||"PitchAPI key or coverage unavailable.",
      api_football_reason:fallback?.reason||"API-Football key or historical record unavailable.",
      existing_data_changed:false,
    },422);
  }catch(e){
    const message=e instanceof Error?e.message:"Player data refresh failed";
    console.error(JSON.stringify({
      operation:"refresh_player",
      result_status:"failed",
      error:message
    }));
    return json({
      ok:false,
      error:message,
      existing_data_changed:false
    },500);
  }
});
