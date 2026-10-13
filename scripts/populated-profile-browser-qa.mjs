import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage();
 const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow';
 const dir=process.env.PROFILE_QA_SCREENSHOT_DIR;
 if(dir)await mkdir(dir,{recursive:true});
 async function open(width,scenario='populated',role='owner'){
  await page.setViewportSize({width,height:900});
  for(let attempt=0;attempt<60;attempt++){try{await page.goto(root+'?view=players&player=qa-player-0&profile=1&scenario='+scenario+'&role='+role);break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}}
  await page.getByRole('heading',{name:'José Silva',exact:true}).waitFor();
 }
 for(const width of [320,390,768,1440]){
  await open(width);
  await page.getByRole('region',{name:'Player data',exact:true}).waitFor();
  const hero=page.locator('section').filter({has:page.getByRole('heading',{name:'José Silva',exact:true})});
  const edit=hero.getByRole('button',{name:'Edit profile',exact:true});
  assert.equal(await edit.isVisible(),true,'Editing must be directly discoverable at '+width);
  const facts=page.locator('[class*="__facts"] strong');
  assert.equal(await facts.evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),true,'Long profile facts must remain readable at '+width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal page overflow at '+width);
  if(dir)await page.screenshot({path:dir+'/profile-'+width+'.png',fullPage:true});
  await edit.click();
  const dialog=page.getByRole('dialog',{name:'Edit Player Profile',exact:true});await dialog.waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Story',exact:true}).getAttribute('aria-pressed'),'true');
  const headline=dialog.getByLabel('Profile headline',{exact:true});
  await headline.fill('Reviewed club presentation '+width);
  await dialog.getByRole('button',{name:'Presentation',exact:true}).click();
  const career=dialog.getByRole('button',{name:'Career',exact:true});
  assert.equal(await career.getAttribute('aria-pressed'),'true');
  await career.click();
  assert.equal(await career.getAttribute('aria-pressed'),'false');
  await dialog.getByRole('navigation',{name:'Profile editor sections'}).getByRole('button',{name:'Video',exact:true}).click();
  await dialog.getByRole('heading',{name:'Current player footage',exact:true}).waitFor();
  await dialog.getByLabel('Video title',{exact:true}).fill('New reviewed footage');
  await dialog.getByLabel('Video URL',{exact:true}).fill('https://example.test/new-footage');
  await dialog.getByRole('button',{name:'Add video',exact:true}).click();
  await dialog.getByText('New reviewed footage',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Remove video',exact:true}).last().click();
  await dialog.getByText('New reviewed footage',{exact:true}).waitFor({state:'hidden'});
  await dialog.getByRole('button',{name:'Story',exact:true}).click();
  assert.equal(await headline.inputValue(),'Reviewed club presentation '+width,'Switching sections must retain the draft');
  if(dir)await page.screenshot({path:dir+'/editor-'+width+'.png'});
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(node=>node.contains(document.activeElement)),true,'Keyboard focus must stay inside during a save');
  await dialog.getByRole('status').filter({hasText:'Player Profile saved.'}).waitFor();
  if(width===390){
   await page.setViewportSize({width,height:320});
   const publish=dialog.getByRole('button',{name:'Save and update live profile',exact:true});
   await publish.scrollIntoViewIfNeeded();
   const buttonBox=await publish.boundingBox(),modalBox=await dialog.boundingBox();
   assert.ok(buttonBox.y>=modalBox.y-1&&buttonBox.y+buttonBox.height<=modalBox.y+modalBox.height+1,'Short viewports must keep the full publishing control reachable');
   if(dir)await page.screenshot({path:dir+'/editor-short.png'});
   await page.setViewportSize({width,height:900});
  }
  const saved=await page.evaluate(()=>window.qaProfileSave);
  assert.equal(saved.intro_line,'Reviewed club presentation '+width);
  assert.deepEqual(saved.hidden_sections,['career']);
  assert.equal(saved.why_review,'Comfortable building play from the back. Review the full-match footage and recorded season figures together.');
  const first=dialog.getByRole('button',{name:'Close',exact:true});
  await first.focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(node=>node.contains(document.activeElement)),true,'Keyboard focus must stay inside the editor');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await edit.evaluate(node=>node===document.activeElement),true,'Closing the editor must return focus to Edit profile');
  await edit.click();
  assert.equal(await dialog.getByLabel('Profile headline',{exact:true}).inputValue(),'Reviewed club presentation '+width,'Reopening after Save must use the saved values');
  await page.keyboard.press('Escape');
 }
 await open(390,'populated-late-detail');
 await page.waitForFunction(()=>window.qaWaitingProfileDetail===true);
 await page.getByRole('button',{name:'Edit profile',exact:true}).click();
 const progressive=page.getByRole('dialog',{name:'Edit Player Profile',exact:true});
 await progressive.getByLabel('Profile headline',{exact:true}).fill('Saved while details finish');
 await progressive.getByRole('button',{name:'Save',exact:true}).click();
 await progressive.getByRole('status').filter({hasText:'Player Profile saved.'}).waitFor();
 await page.keyboard.press('Escape');
 await page.getByText('Late loaded club recruitment',{exact:true}).waitFor();
 await page.getByText('Progressive detail arrived during Save.',{exact:true}).waitFor();
 await open(390,'populated-save-failure');
 await page.getByRole('button',{name:'Edit profile',exact:true}).click();
 const failed=page.getByRole('dialog',{name:'Edit Player Profile',exact:true});
 await failed.getByLabel('Profile headline',{exact:true}).fill('Keep this draft after a failed save');
 await failed.getByRole('button',{name:'Save',exact:true}).click();
 await failed.getByRole('alert').filter({hasText:'Profile save temporarily unavailable'}).waitFor();
 assert.equal(await failed.getByLabel('Profile headline',{exact:true}).inputValue(),'Keep this draft after a failed save');
 await page.keyboard.press('Escape');
 await open(390,'populated','scout');
 assert.equal(await page.getByRole('button',{name:'Edit profile',exact:true}).count(),0,'Assigned read-only users must not get editing controls');
 console.log('Populated profile, long facts, direct editing, retained drafts, saved visibility, recovery and keyboard focus passed at four widths.');
} finally {await browser.close();}
