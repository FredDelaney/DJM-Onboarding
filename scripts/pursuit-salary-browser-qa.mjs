import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const out='/tmp/redream-platform-programme/pursuit-salary';await mkdir(out,{recursive:true});
const expires=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
try{
 for(const scenario of process.env.PURSUIT_SALARY_SCENARIOS?.split(',')||['verification-required','verification-dirty','dossier-missing','dossier-unpublished','dossier-stale','dossier-unknown','dossier-contradictory','access-known','access-develop','access-missing','external-refresh','deal-money','deal-money-unknown','normal','wrong-player','wrong-club','core-refresh','read-error','denied','conflict','unknown','idem-retry','timeout','terms-edit','late-scope']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],calls=[],receipts=new Map();let reads=0,writes=0,release,minimum='6000',target='6500',fingerprint='a'.repeat(32),active=false;
  let careerApproved=scenario!=='external-refresh';
  if(scenario==='external-refresh'||scenario==='core-refresh'||scenario.startsWith('deal-money')){minimum='4000';target='4500';}
  page.on('pageerror',e=>errors.push(e.message));
  const gate=(match,command)=>{const min=match==='match-b'?'1000':minimum,tgt=match==='match-b'?'2000':target,within=Number(min)<=5000&&Number(tgt)<=5000;return {version:1,player_match_id:match,player_id:match==='match-a'?'player-a':'player-b',club_id:'club-a',can_proceed:active||within,state:active?'open_exploration_review':within?'open_recorded_salary':'hold_salary_conflict',message:active?'Exploration is permitted under the recorded temporary review. The salary gap or uncertainty remains.':within?'The confirmed recorded base-salary expectation fits this budget. Contract terms still require agreement.':'The confirmed minimum exceeds the budget. Resolve the terms or record a justified temporary exploration decision.',comparison:{version:1,fingerprint,state:within?'minimum_within_budget':'minimum_above_budget',message:within?'The recorded minimum base salary fits this budget. This is not acceptance of contract terms.':'The recorded salary minimum exceeds the club base-salary budget.',player_minimum:min,player_target:tgt,player_currency:'EUR',player_period:'monthly',player_tax_basis:'net',club_budget:'5000',club_currency:'EUR',club_period:'monthly',club_tax_basis:'net',source_status:'confirmed',club_source_status:'confirmed',checked_on:'2026-10-28',missing:[]},review:active?{current:true,active:true,reason:'Check willingness before quoting any offer.',expires_on:expires}:null,confirmed_command_id:command&&receipts.has(command)?command:null};};
  const terms=()=>({player_id:'player-a',salary_minimum:minimum,salary_target:target,salary_currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',salary_source_status:'confirmed',salary_source_context:'Player confirmation',salary_checked_on:'2026-10-28',updated_at:'2026-10-28T00:00:00Z',updated_by:'actor',legacy_salary_expectation:null});
  await page.route('https://example.supabase.co/**',async route=>{
   const body=route.request().postDataJSON()||{},name=body.action||new URL(route.request().url()).pathname.split('/').at(-1);calls.push({name,body});let data={},status=200;
   if(name==='external_dossiers'){
    const states={'verification-required':'player_verification_required','verification-dirty':'player_verification_required','dossier-missing':'dossier_missing','dossier-unpublished':'dossier_unpublished','dossier-stale':'dossier_verification_stale','dossier-unknown':'not_checked','dossier-contradictory':'share_safe','access-known':'player_verification_required','access-develop':'player_verification_required','access-missing':'player_verification_required'};
    data={dossiers:{items:[{player:{player_id:body.player_id||'player-a'},share_state:states[scenario]||'share_safe',...(states[scenario]?{safety:{profile_exists:['dossier-unpublished','dossier-stale'].includes(scenario)},next_action:{action:states[scenario]==='player_verification_required'?'verify_player':'review_then_publish',instruction:states[scenario]==='player_verification_required'?'Complete the human player verification workflow before external sharing.':'Review the current dossier.'}}:{})}]}};
   }
   else if(name==='pitch_readiness')data={readiness:{items:['a','b'].map(key=>({player_match_id:'match-'+key,player:{player_id:'player-'+key},club:{organisation_id:'club-a'},career_gate:{state:careerApproved?'open_aligned':'hold_strategy_missing'},pursuit_readiness:{score:99}}))}};
   else if(name==='pitch_execution')data={execution:{items:scenario.startsWith('deal-money')?[{player_id:'player-a',organisation_id:'club-a',share_id:'synthetic-existing-share'}]:[]}};
   else if(name==='pitch_responses')data={responses:{items:[]}};
   else if(name==='pursuit_salary_review'){
    const snapshot=gate(body.player_match_id,body.command_id);reads++;
    if(scenario==='late-scope'&&body.player_match_id==='match-a'){await new Promise(resolve=>{release=resolve;});data={review:snapshot};}
    else if(scenario==='read-error'&&reads===1){status=500;data={error:'Salary read interrupted'};}
    else data={review:{...snapshot,...(scenario==='wrong-player'?{player_id:'another-player'}:scenario==='wrong-club'?{club_id:'another-club'}:{})}};
   }else if(name==='pursuit_salary_review_save'){
    writes++;
    if(scenario==='denied'&&writes===1){status=400;data={error:'Check the exploration expiry.',code:'22023'};}
    else if(scenario==='conflict'&&writes===1){fingerprint='b'.repeat(32);minimum='6100';status=409;data={error:'The salary evidence changed. Load the current check and review your decision again.',code:'40001'};}
    else{
     if(!receipts.has(body.command_id))receipts.set(body.command_id,body);active=true;data={review:gate(body.player_match_id,body.command_id)};
     if(['unknown','idem-retry'].includes(scenario)&&writes===1)data={review:{...data.review,confirmed_command_id:null}};
     if(scenario==='timeout'&&writes===1)await new Promise(resolve=>{release=resolve;});
    }
   }else if(name==='redream_player_salary_terms')data={salary_terms_version:1,terms:terms()};
   else if(name==='redream_player_salary_terms_patch'){minimum=body.p_patch.salary_minimum||minimum;target=body.p_patch.salary_target||target;fingerprint='c'.repeat(32);active=false;data={ok:true,id:'player-a',entity_type:'player',salary_terms_version:1,terms:terms()};}
   else if(name==='pitch_draft_create'){if(scenario==='core-refresh'){status=409;fingerprint='d'.repeat(32);minimum='7000';target='7500';data={error:'Review current base-salary feasibility before preparing a new pitch or deal.',code:'salary_review_required'};}else data={result:{created:true,share_id:'synthetic-private-draft'}};}
   else if(name==='pitch_detail')data={pitch:{id:'synthetic-existing-share',player_id:'player-a',organisation_id:'club-a',active:true,pitch_status:'sent',sent_at:'2026-10-28T00:00:00Z',token:'synthetic-fixture-token'}};
   else if(name==='pursuit_deal_create')data={result:{created:true,deal_room_id:'synthetic-money-deal'}};
   else{status=400;data={error:'Unexpected fixture action '+name};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
  });
  try{
   const url=new URL('/qa-pursuit-salary',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');if(scenario.startsWith('access-'))url.searchParams.set('access',scenario.slice(7));if(scenario==='verification-required')url.searchParams.set('brand','light');if(scenario==='dossier-unpublished')url.searchParams.set('brand','other');for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(250);}}
   const panel=page.getByRole('region',{name:'Base-salary review',exact:true});await panel.waitFor();
   if(['wrong-player','wrong-club'].includes(scenario)){await panel.getByText('This opportunity now refers to a different player or club. Close it and reopen the current record.',{exact:true}).waitFor();assert.equal(await panel.getByText('EUR 6,000',{exact:true}).count(),0);assert.equal(writes,0);await page.getByRole('button',{name:'Back to Opportunities',exact:true}).click();await page.getByText('Opportunity list',{exact:true}).waitFor();assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;}
   if(scenario.startsWith('access-')){
    await page.locator('summary').filter({hasText:'Opportunity details'}).click();
    await page.getByText(scenario==='access-known'?'QA Club Contact':scenario==='access-develop'?/Develop Access/i:/Access not recorded/i,{exact:scenario==='access-known'}).waitFor();
    assert.equal(await page.getByText('Previous cached contact',{exact:true}).count(),0);assert.equal(await page.getByText('Known Contact Route',{exact:true}).count(),0);assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;
   }
   if(scenario.startsWith('verification')||scenario.startsWith('dossier-')){
    const needsReview=scenario.startsWith('verification')||['dossier-unknown','dossier-contradictory'].includes(scenario);
    const button=page.getByRole('button',{name:needsReview?'Review player details':scenario==='dossier-missing'?'Create private dossier':'Publish dossier',exact:true});await button.waitFor();assert.equal(await button.count(),1,'One primary dossier action follows the current safety state');
    if(needsReview){assert.equal(await page.getByRole('button',{name:'Publish dossier',exact:true}).count(),0);assert.equal(await page.getByText('The dossier exists but still needs controlled publication before it can support the pitch.',{exact:true}).count(),0);}
    if(scenario==='dossier-contradictory')assert.equal(await page.getByText('Share Safe',{exact:true}).count(),0,'A missing profile is not shown as share-safe');
    if(['verification-required','dossier-unpublished'].includes(scenario))for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:844});await button.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guidance fits '+width);assert.ok((await button.boundingBox()).height>=44,'Primary guidance remains easy to tap');
      const colours=await page.getByRole('region',{name:'Next pursuit action',exact:true}).evaluate(hero=>{
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;
        const paint=(colour,background)=>{ctx.clearRect(0,0,1,1);if(background){ctx.fillStyle=background;ctx.fillRect(0,0,1,1);}ctx.fillStyle=colour;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
        const bg=getComputedStyle(hero).backgroundColor,rgb=paint(bg),agency=paint(getComputedStyle(hero).getPropertyValue('--agency-primary'));
        const luminance=values=>values.map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
        const contrast=colour=>{const values=[luminance(rgb),luminance(paint(colour,bg))].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
        return {brandDistance:Math.max(...rgb.map((c,i)=>Math.abs(c-agency[i]))),ratios:[...hero.querySelectorAll('h3,div:first-child>span')].map(n=>contrast(getComputedStyle(n).color))};
      });assert.ok(colours.brandDistance<40,'The hero follows this agency’s safe primary colour');assert.ok(colours.ratios.every(ratio=>ratio>=4.5),'Decision text stays readable at '+width);
      await page.screenshot({path:out+'/guidance-'+scenario+'-'+width+'.png'});
    }
    if(scenario==='verification-dirty'){
      await panel.getByText('Record a decision',{exact:true}).click();await panel.getByRole('combobox',{name:'Decision',exact:true}).selectOption('hold');await panel.getByRole('textbox',{name:'Reason',exact:true}).fill('Keep this review until the profile handoff is approved.');
      await button.click();const discard=page.getByRole('alertdialog',{name:'Leave this salary review?',exact:true});await discard.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await panel.getByRole('textbox',{name:'Reason',exact:true}).inputValue(),'Keep this review until the profile handoff is approved.');
      await button.click();await discard.getByRole('button',{name:'Leave review',exact:true}).click();
    }else await button.click();
    if(needsReview)await page.getByText('Player details: player-a',{exact:true}).waitFor();else{await page.getByText(scenario==='dossier-missing'?'Create a private dossier draft?':'Publish this player dossier?',{exact:true}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();}
    assert.equal(calls.filter(c=>['dossier_publish','pitch_publish','dossier_draft_create'].includes(c.name)).length,0,'No external publication or unapproved creation is implicit');assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;
   }
   if(scenario.startsWith('deal-money')){
    await panel.getByText('EUR 4,000',{exact:true}).waitFor();
    const create=page.getByRole('button',{name:'Create Deal Room',exact:true}),probability=page.getByLabel('Human probability %',{exact:true}),currency=page.getByRole('combobox',{name:'Deal currency',exact:true}),commission=page.getByLabel('Expected commission',{exact:true});
    await create.click();assert.equal(await page.getByText('Create a live Deal Room?',{exact:true}).count(),0);assert.equal(calls.filter(c=>c.name==='pursuit_deal_create').length,0,'An empty human probability cannot become zero');
    await probability.fill('0');await create.click();assert.equal(await currency.inputValue(),'','Deal currency has no EUR default');assert.equal(await page.getByText('Create a live Deal Room?',{exact:true}).count(),0);
    await currency.selectOption(scenario==='deal-money'?'USD':'JPY');
    if(scenario==='deal-money'){
     await commission.fill('1234.567');await create.click();assert.equal(await commission.evaluate(n=>n.validity.patternMismatch),true);assert.equal(calls.filter(c=>c.name==='pursuit_deal_create').length,0);await commission.fill('1234.56');
    }
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Deal money fits '+width);for(const field of [probability,currency,commission])assert.ok(await field.evaluate(n=>n.getBoundingClientRect().height>=44),'Deal fields stay easy to tap');await create.scrollIntoViewIfNeeded();assert.ok((await create.boundingBox()).height>=44);if(scenario==='deal-money')await page.screenshot({path:out+'/deal-money-'+width+'.png'});}
    await create.click();await page.getByText('Create a live Deal Room?',{exact:true}).waitFor();await page.getByText(scenario==='deal-money'?/Expected agency commission: USD 1,234[.]56[.]/:/Agency commission is not recorded[.]/).waitFor();await page.getByRole('button',{name:'Create Deal Room',exact:true}).last().click();
    await page.getByRole('button',{name:'Open Deal War Room',exact:true}).waitFor();const sent=calls.filter(c=>c.name==='pursuit_deal_create');assert.equal(sent.length,1);assert.equal(sent[0].body.input.currency,scenario==='deal-money'?'USD':'JPY');assert.equal(sent[0].body.input.expected_commission,scenario==='deal-money'?'1234.56':null);assert.equal(sent[0].body.input.probability,0);assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;
   }
   if(scenario==='external-refresh'){
    await panel.getByText('EUR 4,000',{exact:true}).waitFor();await page.getByRole('button',{name:'Review career plan',exact:true}).waitFor();
    await panel.getByText('Record a decision',{exact:true}).click();await panel.getByRole('combobox',{name:'Decision',exact:true}).selectOption('hold');
    const reason=panel.getByRole('textbox',{name:'Reason',exact:true});await reason.fill('Preserve this unsaved review through the related career update.');
    await page.getByRole('button',{name:'Review career plan',exact:true}).click();careerApproved=true;
    await page.getByRole('dialog',{name:'Related career approval',exact:true}).getByRole('button',{name:'Confirm synthetic career approval',exact:true}).click();
    await page.getByRole('button',{name:'Create private pitch',exact:true}).waitFor();
    assert.equal(await reason.inputValue(),'Preserve this unsaved review through the related career update.');assert.equal(writes,0);
    assert.equal(calls.filter(c=>c.name==='pitch_readiness').length,2,'A related save reloads the core snapshot once without remounting the review');
    assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;
   }
   if(scenario==='core-refresh'){
    await panel.getByText('EUR 4,000',{exact:true}).waitFor();await panel.getByText('Record a decision',{exact:true}).click();await panel.getByRole('combobox',{name:'Decision',exact:true}).selectOption('hold');await panel.getByRole('textbox',{name:'Reason',exact:true}).fill('Keep this local draft while the opportunity refreshes.');
    await page.getByRole('button',{name:'Create private pitch',exact:true}).click();await page.getByRole('button',{name:'Create pitch draft',exact:true}).click();await page.getByText('Review current base-salary feasibility before preparing a new pitch or deal.',{exact:true}).waitFor();assert.equal(await panel.isVisible(),false,'A failed core read hides the view without discarding its draft');await page.getByRole('button',{name:'Try again',exact:true}).click();await panel.getByText('EUR 7,000',{exact:true}).waitFor();assert.equal(await panel.getByRole('textbox',{name:'Reason',exact:true}).inputValue(),'Keep this local draft while the opportunity refreshes.');assert.equal(writes,0);assert.ok(reads>=2,'A canonical financial denial reloads the current check');assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;
   }
   if(scenario==='late-scope'){
    await panel.getByText('Checking current salary evidence',{exact:true}).waitFor();await page.getByRole('button',{name:'Back to Opportunities',exact:true}).click();await page.getByRole('button',{name:'Switch opportunity',exact:true}).click();await panel.getByText('EUR 1,000',{exact:true}).waitFor();release();assert.equal(await panel.getByText('EUR 6,000',{exact:true}).count(),0);assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;
   }
   if(scenario==='read-error'){await panel.getByText('Salary read interrupted',{exact:true}).waitFor();await panel.getByRole('button',{name:'Load current check',exact:true}).click();}
   await panel.getByText('EUR 6,000',{exact:true}).waitFor();assert.equal(await page.locator('[class*="heroScore"]').count(),0,'A high old readiness value cannot mask a financial hold');
   await page.getByRole('button',{name:'Review salary terms',exact:true}).click();assert.ok(await panel.evaluate(n=>n===document.activeElement));
   if(scenario==='terms-edit'){
    await panel.locator('summary').filter({hasText:'Salary expectations'}).click();await panel.getByRole('button',{name:'Edit salary expectations',exact:true}).click();
    const edit=page.getByRole('dialog',{name:'Manage salary expectations',exact:true});await edit.getByLabel('Minimum base salary',{exact:true}).fill('5000');await edit.getByLabel('Target base salary',{exact:true}).fill('5000');await edit.getByRole('button',{name:'Save changes',exact:true}).click();await edit.waitFor({state:'hidden'});await page.getByRole('button',{name:'Create private pitch',exact:true}).waitFor();assert.equal(writes,0,'Correcting canonical terms never creates an override');assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);continue;
   }
   await panel.getByText('Record a decision',{exact:true}).click();await panel.getByRole('combobox',{name:'Decision',exact:true}).selectOption('explore');await panel.getByRole('textbox',{name:'Reason',exact:true}).fill('Check willingness before quoting any offer.');await panel.getByLabel('Exploration until (UTC)',{exact:true}).fill(expires);
   if(scenario==='normal'){
    await page.getByRole('button',{name:'Back to Opportunities',exact:true}).click();const discard=page.getByRole('alertdialog',{name:'Leave this salary review?',exact:true});await discard.waitFor();await discard.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await panel.getByRole('textbox',{name:'Reason',exact:true}).inputValue(),'Check willingness before quoting any offer.');
   }
   for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Financial review fits '+width);const save=panel.getByRole('button',{name:'Save review',exact:true});await save.scrollIntoViewIfNeeded();const box=await save.boundingBox();assert.ok(box&&box.height>=44&&box.x>=0&&box.x+box.width<=width+1);if(scenario==='normal')await page.screenshot({path:out+'/review-'+width+'.png'});}
   if(scenario==='timeout')await page.clock.install();await panel.getByRole('button',{name:'Save review',exact:true}).click();
   if(scenario==='timeout'){await panel.getByRole('button',{name:'Saving review…',exact:true}).waitFor();await page.clock.fastForward(12100);}
   if(scenario==='denied'){await panel.getByText('Check the exploration expiry.',{exact:true}).waitFor();assert.equal(await panel.getByRole('textbox',{name:'Reason',exact:true}).inputValue(),'Check willingness before quoting any offer.');await panel.getByRole('button',{name:'Save review',exact:true}).click();}
   if(scenario==='conflict'){await panel.getByText('The salary evidence changed. Load the current check and review your decision again.',{exact:true}).waitFor();await panel.getByRole('button',{name:'Load current check',exact:true}).click();await panel.getByText('EUR 6,100',{exact:true}).waitFor();assert.equal(await panel.getByRole('textbox',{name:'Reason',exact:true}).inputValue(),'Check willingness before quoting any offer.');await panel.getByRole('button',{name:'Save review',exact:true}).click();}
   if(scenario==='idem-retry'){await panel.getByRole('button',{name:'Retry same review',exact:true}).click();}
   if(['unknown','timeout'].includes(scenario)){await panel.getByRole('button',{name:'Retry same review',exact:true}).waitFor();await panel.getByRole('button',{name:'Check saved review',exact:true}).last().click();}
   await panel.getByText('Salary review saved. The recorded evidence and career controls are unchanged.',{exact:true}).waitFor();assert.equal(receipts.size,1);if(scenario==='idem-retry'){const saves=calls.filter(c=>c.name==='pursuit_salary_review_save');assert.deepEqual(saves[1].body,saves[0].body,'Explicit retry retains the same command identity and decision');}assert.equal(writes,['denied','conflict','idem-retry'].includes(scenario)?2:1,'Read recovery never resends a confirmed command');await page.getByRole('button',{name:'Create private pitch',exact:true}).waitFor();
   if(scenario==='timeout')release();assert.deepEqual(errors,[]);console.log('Salary pursuit passed: '+scenario);
  }catch(error){await page.screenshot({path:out+'/'+scenario+'-failure.png',fullPage:true}).catch(()=>{});console.log(JSON.stringify({scenario,reads,writes,calls:calls.map(c=>c.name),text:await page.locator('body').innerText()}));throw error;}
  finally{await page.close();}
 }
}finally{await browser.close();}
