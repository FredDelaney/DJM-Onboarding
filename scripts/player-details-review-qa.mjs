// Exercise the real profile editor with a labelled, session-persistent API fixture.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const root=process.env.CALENDAR_QA_URL||'http://127.0.0.1:3016';
const out='/tmp/redream-platform-programme/player-details';await mkdir(out,{recursive:true});
try{
 for(const scenario of process.env.PLAYER_DETAILS_SCENARIOS?.split(',')||['details-reload-failed','details-review','details-staff','details-conflict','details-unconfirmed','details-timeout','details-retry','details-research','details-running','details-resolved']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const snapshot=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem('qa-player-data-'+key)),scenario);
  try{
   const url=new URL('/qa-player-data?scenario='+scenario+'#player-details',root);
   for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(500);}}
   const panel=page.getByRole('region',{name:'Player details review',exact:true});await panel.waitFor();
   if(scenario==='details-retry'){await page.getByRole('button',{name:'Restore fixture connection',exact:true}).click();await panel.getByRole('button',{name:'Check progress',exact:true}).click();}
   if(scenario==='details-research'){
    await panel.getByRole('button',{name:'Check player details',exact:true}).click();
   }
   if(scenario==='details-resolved'){
    await panel.getByText('These player details have already been reviewed. The recorded profile is shown above.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'player-details');assert.equal((await snapshot()).detailsDecisions,0);
   }else{
    await panel.getByRole('combobox',{name:'Current club decision',exact:true}).waitFor();
    await panel.getByRole('button',{name:'Use all suggestions',exact:true}).click();
    await panel.getByRole('combobox',{name:'Current club decision',exact:true}).selectOption('reject');
    await panel.getByRole('combobox',{name:'Nationalities decision',exact:true}).selectOption('edit');
    await panel.getByRole('textbox',{name:'Corrected nationalities',exact:true}).fill('New Zealand, Australia, New Caledonia,');
    await panel.getByRole('combobox',{name:'Height (cm) decision',exact:true}).selectOption('edit');
    await panel.getByRole('spinbutton',{name:'Corrected height (cm)',exact:true}).fill('185');
    if(scenario==='details-review')await panel.screenshot({path:out+'/comparison-390.png'});
    if(scenario==='details-timeout')await page.clock.install();
    await panel.getByRole('button',{name:'Save decisions',exact:true}).click();
    if(scenario==='details-timeout')await page.clock.fastForward(35001);
    if(scenario==='details-reload-failed'){
     await page.getByRole('region',{name:'Player refresh required',exact:true}).waitFor();
     assert.ok(await page.getByRole('button',{name:'Share Player Profile',exact:true}).isDisabled());
     assert.equal(await page.getByText('Live',{exact:true}).count(),0);
     await page.getByRole('button',{name:'Restore fixture connection',exact:true}).click();
     await panel.getByRole('button',{name:'Check progress',exact:true}).click();
     await page.getByRole('region',{name:'Player refresh required',exact:true}).waitFor({state:'hidden'});
    }
    if(['details-conflict','details-unconfirmed','details-timeout'].includes(scenario)){
     await panel.getByRole('button',{name:'Check progress',exact:true}).click();
     if(scenario==='details-conflict'){
      assert.equal(await panel.getByRole('spinbutton',{name:'Corrected height (cm)',exact:true}).inputValue(),'185','A conflict preserves corrections');
      await panel.getByText('Colleague FC',{exact:true}).waitFor();
      await panel.getByRole('button',{name:'Save decisions',exact:true}).click();
     }
    }
    await panel.getByRole('button',{name:'Check player details',exact:true}).waitFor();
    const saved=await snapshot();assert.equal(saved.player.height_cm,185);assert.deepEqual(saved.player.nationalities,['New Zealand','Australia','New Caledonia']);assert.equal(saved.player.contract_expiry,'2028-06-30');
    assert.equal(saved.player.current_club,scenario==='details-conflict'?'Colleague FC':'Example FC II');assert.equal(saved.player.verification_status,'reviewing');assert.equal(saved.published.published,false);assert.equal(saved.detailsTaskStatus,'open');assert.equal(saved.verifications,0);assert.equal(saved.publishes,0);assert.equal(saved.refreshes,0,'Field review does not start statistics research');
    assert.equal(saved.detailsDecisions,scenario==='details-conflict'?2:1,'Recovery never resends a confirmed decision');
    assert.equal(saved.detailsResearches,scenario==='details-research'?1:0);
    await panel.getByText('Reviewed details',{exact:true}).click();await panel.getByText('Accepted: 185',{exact:true}).waitFor();
    if(scenario==='details-staff'){assert.equal(await page.getByRole('button',{name:'Review current player data',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:/Publish Player Profile|Verify & publish/}).count(),0);}
   }
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow at '+width+' '+scenario);
    await panel.screenshot({path:out+'/'+scenario+'-'+width+'.png'});
   }
   assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({scenario,passed:true})+'\n');
  }catch(error){await page.screenshot({path:out+'/'+scenario+'-failure.png',fullPage:true}).catch(()=>{});const state=await snapshot().catch(()=>({}));process.stdout.write(JSON.stringify({scenario,detailsReads:state.detailsReads,detailsResearches:state.detailsResearches,detailsDecisions:state.detailsDecisions})+'\n');throw error;}finally{await page.close();}
 }
}finally{await browser.close();}
