import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const out='/tmp/redream-platform-programme/player-salary';await mkdir(out,{recursive:true});
try{
 for(const scenario of ['normal','read-error','read-hung','denied','conflict','unknown']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   const url=new URL('/qa-player-salary?scenario='+scenario,process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
   for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(250);}}
   await page.locator('[data-qa-ready="true"]').waitFor();
   assert.equal(await page.evaluate(()=>window.salaryQa.reads),0,'Closed optional terms do not load');
   if(scenario==='read-hung')await page.clock.install();
   await page.locator('summary').filter({hasText:'Salary expectations'}).click();
   if(scenario==='read-hung'){await page.getByText('Loading salary details',{exact:true}).waitFor();await page.clock.fastForward(12001);}
   if(['read-error','read-hung'].includes(scenario)){await page.locator('section[role="alert"]').waitFor();await page.getByRole('button',{name:'Load latest terms',exact:true}).click();}
   await page.getByRole('button',{name:'Edit salary expectations',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Manage salary expectations',exact:true}).count(),0,'Private terms never expose archive/delete of the player');
   await page.getByRole('button',{name:'Edit salary expectations',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Manage salary expectations',exact:true});
   const save=dialog.getByRole('button',{name:'Save changes',exact:true});assert.ok(await save.isDisabled());
   const minimum=dialog.getByRole('textbox',{name:'Minimum base salary',exact:true});
   await minimum.fill('5000.01');await dialog.getByRole('textbox',{name:'Target base salary',exact:true}).fill('5500');await dialog.getByRole('textbox',{name:'Currency',exact:true}).fill('EUR');
   await dialog.getByRole('combobox',{name:'Salary period',exact:true}).selectOption('monthly');await dialog.getByRole('combobox',{name:'Tax basis',exact:true}).selectOption('net');
   await dialog.getByRole('combobox',{name:'Source status',exact:true}).selectOption('confirmed');await dialog.getByRole('textbox',{name:'Source / confirmation',exact:true}).fill('Player confirmation, base salary only.\nNo bonuses or options assumed.');await dialog.getByLabel('Checked on',{exact:true}).fill('2026-10-28');
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Editor fits '+width);
    await save.scrollIntoViewIfNeeded();const box=await save.boundingBox();assert.ok(box&&box.height>=40&&box.x>=0&&box.x+box.width<=width+1,'Reachable salary save '+width);
    if(scenario==='normal')await page.screenshot({path:out+'/editor-'+width+'.png'});
   }
   await save.click();
   if(scenario==='denied'){await dialog.getByRole('alert').waitFor();assert.equal(await minimum.inputValue(),'5000.01');await save.click();}
   if(scenario==='conflict'){
    await dialog.getByText('These salary terms changed. Cancel this edit, then load the latest terms before saving.',{exact:true}).waitFor();assert.equal(await minimum.inputValue(),'5000.01');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Discard changes',exact:true}).click();
    await page.getByRole('button',{name:'Load latest terms',exact:true}).click();await page.getByText('Currency unknown 5,100',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.salaryQa.writes),1);assert.deepEqual(errors,[]);console.log('Salary terms passed: '+scenario);continue;
   }
   if(scenario==='unknown'){
    await dialog.getByText('Change not confirmed',{exact:true}).waitFor();assert.equal(await save.count(),0);await dialog.getByRole('button',{name:'Reload record',exact:true}).click();
   }
   await dialog.waitFor({state:'hidden'});await page.getByText('EUR 5,000.01',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.salaryQa.writes),scenario==='denied'?2:1);
   if(scenario==='read-hung'){await page.evaluate(()=>window.salaryQa.releaseRead());assert.equal(await page.getByText('EUR 5,000.01',{exact:true}).count(),1,'Late read cannot replace saved terms');}
   for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(scenario==='normal')await page.screenshot({path:out+'/saved-'+width+'.png'});}
   await page.getByRole('button',{name:'Switch player',exact:true}).click();assert.equal(await page.getByText('EUR 5,000.01',{exact:true}).count(),0,'Selected player terms are discarded immediately');
   assert.deepEqual(errors,[]);console.log('Salary terms passed: '+scenario);
  }finally{await page.close();}
 }
}finally{await browser.close();}
