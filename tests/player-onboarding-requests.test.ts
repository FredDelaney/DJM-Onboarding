import assert from 'node:assert/strict';
import test from 'node:test';
import {awaitOnboardingRequest,onboardingSaveError} from '../lib/player-onboarding.ts';
test('onboarding requests cannot hang forever and late responses cannot revive a cancelled screen',async()=>{
 await assert.rejects(awaitOnboardingRequest(new Promise(()=>{}),undefined,5),/onboarding_timeout/);
 const controller=new AbortController();let resolve!:(value:number)=>void;
 const request=awaitOnboardingRequest(new Promise<number>(r=>{resolve=r;}),controller.signal,100);controller.abort();
 await assert.rejects(request,/onboarding_cancelled/);resolve(1);
 const alreadyAborted=new AbortController();alreadyAborted.abort();await assert.rejects(awaitOnboardingRequest(Promise.resolve(1),alreadyAborted.signal),/onboarding_cancelled/);
 assert.equal(await awaitOnboardingRequest(Promise.resolve(42)),42);
 await assert.rejects(awaitOnboardingRequest(Promise.reject(new Error('read failed'))),/read failed/);
});
test('onboarding save failures show actionable guidance without raw database details',()=>{
 assert.match(onboardingSaveError({message:'onboarding_changed'}),/Reload/);
 assert.match(onboardingSaveError({message:'onboarding_timeout'}),/not confirm/);
 assert.match(onboardingSaveError({message:'player_workspace_not_found'}),/agency/);
 assert.match(onboardingSaveError({message:'onboarding_required_fields'}),/name/);
 assert.doesNotMatch(onboardingSaveError({message:'secret_table constraint failed'}),/secret_table/);
});
