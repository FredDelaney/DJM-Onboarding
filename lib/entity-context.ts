export type EntityContext = {
  route?: string | null;
  label?: string | null;
  context_type?:
    | 'player'
    | 'club'
    | 'contact'
    | 'recruitment'
    | 'opportunity'
    | string
    | null;
  organisation_id?: string | null;
  organisation_name?: string | null;
  person_id?: string | null;
  person_name?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  prospect_id?: string | null;
  prospect_name?: string | null;
  opportunity_id?: string | null;
  club_need_id?: string | null;
  need_position?: string | null;
};

const UUID_SOURCE =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

export const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`);

const routeId = (pathname: string, route: string) =>
  pathname.match(new RegExp(`^${route}/(${UUID_SOURCE})(?:/|$)`))?.[1] || null;

export function contextFromRoute(pathname: string): EntityContext {
  const route = pathname || '/djm';

  const playerId = routeId(route, '/admin/players');
  if (playerId) {
    return { route, player_id: playerId, context_type: 'player' };
  }

  const clubId = routeId(route, '/network/clubs');
  if (clubId) {
    return { route, organisation_id: clubId, context_type: 'club' };
  }

  const personId = routeId(route, '/network/contacts');
  if (personId) {
    return { route, person_id: personId, context_type: 'contact' };
  }

  const prospectId = routeId(route, '/recruitment');
  if (prospectId) {
    return { route, prospect_id: prospectId, context_type: 'recruitment' };
  }

  const opportunityId =
    routeId(route, '/opportunities') ||
    routeId(route, '/market/deals') ||
    routeId(route, '/deals');
  if (opportunityId) {
    return { route, opportunity_id: opportunityId, context_type: 'opportunity' };
  }

  return { route };
}

export function mergeEntityContext(
  ...contexts: Array<EntityContext | null | undefined>
): EntityContext {
  return contexts.reduce<EntityContext>(
    (merged, context) => ({ ...merged, ...(context || {}) }),
    {},
  );
}

export function contextFromSearchParams(
  params: URLSearchParams,
): EntityContext {
  const context: EntityContext = {};
  const idKeys = new Set([
    'organisation_id',
    'person_id',
    'player_id',
    'prospect_id',
    'opportunity_id',
    'club_need_id',
  ]);
  const keys = [
    'context_type',
    'label',
    'organisation_id',
    'organisation_name',
    'person_id',
    'person_name',
    'player_id',
    'player_name',
    'prospect_id',
    'prospect_name',
    'opportunity_id',
    'club_need_id',
    'need_position',
  ] as const;

  for (const key of keys) {
    const value = params.get(key);
    if (!value || (idKeys.has(key) && !UUID_PATTERN.test(value))) continue;
    (context as Record<string, string>)[key] = value;
  }

  return context;
}

export function aiCaptureHref(
  pathname: string,
  context: EntityContext,
  workspaceSlug?: string | null,
): string {
  const params = new URLSearchParams({ from: pathname });
  if (workspaceSlug != null) params.set('workspace', workspaceSlug);
  const values: Record<string, string | null | undefined> = {
    context_type: context.context_type,
    label: context.label,
    organisation_id: context.organisation_id,
    organisation_name: context.organisation_name,
    person_id: context.person_id,
    person_name: context.person_name,
    player_id: context.player_id,
    player_name: context.player_name,
    prospect_id: context.prospect_id,
    prospect_name: context.prospect_name,
    opportunity_id: context.opportunity_id,
    club_need_id: context.club_need_id,
    need_position: context.need_position,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }

  const path = workspaceSlug ? `/workspace/${encodeURIComponent(workspaceSlug)}/capture` : '/tell';
  return `${path}?${params.toString()}`;
}

export function contextFromWorkspaceRoute(pathname:string,params:URLSearchParams):EntityContext {
 const query=params.toString(),route=pathname+(query?'?'+query:'');
 const base={...contextFromRoute(pathname),route};
 if(!/^\/(?:agency|workspace\/[a-z0-9][a-z0-9-]*)$/.test(pathname))return base;
 const recorded=(key:string)=>{const id=params.get(key)||'';return UUID_PATTERN.test(id)?id:undefined;};
 const view=params.get('view');
 if(view==='players'){
  const player=recorded('player'),target=recorded('target');
  if(player)return {...base,player_id:player,context_type:'player'};
  if(target)return {...base,prospect_id:target,context_type:'recruitment'};
 }
 if(view==='network'){
  const person=recorded('person'),club=recorded('club');
  if(person)return {...base,person_id:person,context_type:'contact'};
  if(club)return {...base,organisation_id:club,context_type:'club'};
 }
 if(['opportunities','market','deals'].includes(view||'')){
  const record=recorded('record');
  if(record&&params.get('tab')==='deals')return {...base,opportunity_id:record,context_type:'opportunity'};
  if(record&&params.get('tab')!=='routes')return {...base,club_need_id:record,context_type:'opportunity'};
 }
 return base;
}

export function entityContextLookupRoute(context:EntityContext,fallback:string):string {
 const records=[['player','player_id','/admin/players/'],['club','organisation_id','/network/clubs/'],['contact','person_id','/network/contacts/'],['recruitment','prospect_id','/recruitment/'],['opportunity','opportunity_id','/opportunities/']] as const;
 for(const [type,key,path] of records){const id=context[key];if(context.context_type===type&&id&&UUID_PATTERN.test(id))return path+id;}
 return fallback;
}
