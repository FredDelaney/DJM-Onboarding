import AgencyPlayerProfile from '@/components/AgencyPlayerProfile';

let reviewed = false;
const invoke = async (action: string) => {
  if (action === 'player_profile_verify') { reviewed = true; return {ok:true}; }
  return {profile:{player:{id:'qa-review-player',first_name:'Dylan',last_name:'Gardiner',primary_position:'Centre back',current_club:'Test club',verification_status:reviewed?'verified':'reviewing',review_required_at:reviewed?null:'2026-10-05',review_reason:reviewed?null:'Career statistics changed'},settings:{},published:{published:true},career:[],videos:[],documents:[],shares:[],deals:[],clubs:[],branding:{},secondary_ready:true,auto_key_stats:[{label:'Appearances',value:'8'}]}};
};
export default function Page() {
  return <AgencyPlayerProfile playerId="qa-review-player" backHref="/qa-command" role="owner" fallbackAgency={{}} invoke={invoke as any} onOpenAction={()=>{}} onOpenIntelligence={()=>{}}/>;
}
