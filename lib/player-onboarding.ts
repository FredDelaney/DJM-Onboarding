export const ONBOARDING_PLAYER_COLUMNS='id,tenant_id,user_id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,transfermarkt_url,wyscout_url,stats_url,instagram_url,onboarding_status,updated_at';

export function awaitOnboardingRequest<T>(request:PromiseLike<T>,signal?:AbortSignal,timeoutMs=12000):Promise<T>{
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(action:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);action();};
  const cancel=()=>finish(()=>reject(new Error('onboarding_cancelled')));
  const timer=setTimeout(()=>finish(()=>reject(new Error('onboarding_timeout'))),timeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});
  Promise.resolve(request).then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));
  if(signal?.aborted)cancel();
 });
}

export function onboardingSaveError(error:unknown){
 const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
 if(message.includes('onboarding_changed'))return 'Your agency or another tab updated this profile. Your edits are still here. Reload the saved details before trying again.';
 if(message.includes('onboarding_timeout'))return 'We could not confirm the save. Your edits are still here. Reload the saved details to check whether it completed.';
 if(message.includes('player_workspace_not_found'))return 'This player workspace is no longer available. Contact your agency or sign in again.';
 if(message.includes('onboarding_required_fields'))return 'Check your first and last name, main position and preferred foot before finishing.';
 if(message.includes('invalid_onboarding_url'))return 'Use a full https:// or http:// link for your source profiles and highlight video.';
 if(message.includes('invalid_onboarding_height'))return 'Height must be between 140 and 230 cm.';
 if(message.includes('invalid_onboarding_birth_date'))return 'Check your date of birth. It cannot be in the future.';
 return 'We couldn’t save that. Your edits are still here. Please try again.';
}
