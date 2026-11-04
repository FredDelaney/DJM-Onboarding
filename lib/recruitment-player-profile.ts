/**
 * Read-only profile projection for an unpromoted recruitment target.
 * Every write must continue through the recruitment-target API, never through
 * the player API or a fabricated public.players UUID.
 */
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const recruitmentStages:Record<string,string>={
  identified:'Identified',contact:'Contact',relationship:'Relationship',evaluation:'Evaluation',
  representation_discussion:'Representation discussion',offer:'Offer',
  represented:'Represented',paused:'Paused',declined:'Declined',lost:'Lost',
};

export function recruitmentToPlayerProfile(target:any, interactions:any[]=[]){
  if(!target || !text(target.id)) return null;
  const followup=text(target.next_action_at);
  const stage=text(target.ui_stage)||'identified';
  return {
    identity:{
      name:text(target.full_name)||'Unnamed prospect',
      date_of_birth:target.date_of_birth||null,
      nationalities:text(target.nationality)?[text(target.nationality)]:[],
      preferred_foot:text(target.preferred_foot),
      primary_position:text(target.primary_position),
      current_club:text(target.current_club),
      current_league:text(target.current_league),
      current_country:text(target.current_country),
      contract_expiry:target.contract_expiry||null,
      transfermarkt_url:text(target.transfermarkt_url),
      next_action:followup?'Follow up with this recruitment prospect':'',
      next_action_due:followup||null,
      agency_status:null,
      recruitment_stage:recruitmentStages[stage]||stage.replaceAll('_',' '),
      recruitment_raw_stage:text(target.raw_stage||target.recruitment_stage),
    },
    service:{},
    profile:{exists:false,published:false},
    agreements:[],documents:[],opportunities:[],deals:[],career_alignment:{},
    activity:(Array.isArray(interactions)?interactions:[]).map(item=>({
      id:item.id,
      event_type:[text(item.channel),text(item.direction)].filter(Boolean).join(' · ')||'Recruitment interaction',
      summary:text(item.summary),
      occurred_at:item.occurred_at||null,
    })),
  };
}
