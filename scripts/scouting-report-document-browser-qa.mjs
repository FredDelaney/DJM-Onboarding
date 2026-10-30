// Real editor/exporters; fictional reports, no roster write, model call or external action.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const output=process.env.SCOUTING_REPORT_QA_OUTPUT||'/tmp/redream-platform-programme/scouting-report-journey';
await mkdir(output,{recursive:true});
const root=new URL(process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
try{
 page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[],warnings=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='warning'&&/wrap|page|height/i.test(m.text()))warnings.push(m.text());});
 await page.addInitScript(()=>{window.qaDocumentActions=[];window.addEventListener('qa-document-request',e=>window.qaDocumentActions.push(e.detail));});
 await page.route('https://brand-assets.supabase.co/**',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" fill="#23483F"/><text x="120" y="60" font-size="32" text-anchor="middle" fill="white">QA AGENCY</text></svg>'}));
 const tab=name=>page.getByRole('button',{name,exact:true}).click(),field=key=>page.locator('#document-field-'+key);
 const section=async(index,part)=>{const input=page.getByRole('textbox',{name:`Section ${index+1} ${part}`,exact:true});if(!await input.isVisible())await page.getByLabel('Section '+(index+1),{exact:true}).locator('summary').click();return input;};
 const title=async value=>{await tab('Details');const input=page.getByLabel('Document title',{exact:true});if(!await input.isVisible())await page.getByText('Document name',{exact:true}).click();await input.fill(value);};
 const copyProfile=async id=>{await tab('Details');const select=page.getByRole('combobox',{name:'Player to fill'});if(!await select.isVisible())await page.getByText('Copy details from an existing workspace player',{exact:true}).click();if(id)await select.selectOption(id);await tab('Fill player details');};
 const save=async template=>{await tab('Save draft');await page.getByRole('status').filter({hasText:template?'Agency template saved':'Draft saved'}).waitFor();};
 const go=async query=>{for(let n=0;n<60;n++){try{await page.goto(new URL('/qa-documents?'+query,root).href);break;}catch(e){if(n===59)throw e;await page.waitForTimeout(250);}}};
 const notes=[
  'QA fictional software report for {{player_name}}. Current club and position are unknown; no sporting fact is asserted.',
  'QA software review notes only. No real match or video has been observed. A club decision requires actual evidence.',
  'QA role is not established. Discuss the receiving club\'s requirements and collect relevant match footage before assessing tactical fit.',
  'QA no strengths are verified. The report records questions for a future observation rather than a player rating.',
  'QA request full-match footage, match date, opposition, role and timecodes. Unavailable evidence remains unavailable.',
  'QA no sporting recommendation is made. Obtain and review actual football evidence with the receiving club before a decision.',
 ];
 for(const brand of ['northstar','atlas']){
  const long=brand==='atlas';
  await go('reviewBrand='+brand+(long?'':'&scenario=save-failed'));
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Scouting report.*Create document/}).click();
  for(const key of ['player_name','player_club','position','recipient_name','author'])assert.equal(await field(key).inputValue(),'','No invented '+key);
  assert.equal(await page.getByRole('combobox',{name:'Player to fill'}).isVisible(),false);
  await tab('Review');await page.getByRole('button',{name:'Add prepared for',exact:true}).click();assert.equal(await field('recipient_name').evaluate(node=>node===document.activeElement),true);
  for(const[key,value]of Object.entries({player_name:'QA Previous Report Subject',recipient_name:'QA Receiving Club TEST ONLY '+brand,report_date:'2026-10-27',author:'QA Software Reviewer'}))await field(key).fill(value);
  await title('QA Original Scouting '+brand);await tab('Content');
  for(let n=0;n<6;n++)await(await section(n,'wording')).fill(notes[n]);
  await(await section(0,'heading')).fill('QA Previous Report Subject assessment');
  await tab('Add section');await(await section(6,'heading')).fill('QA Previous Report Subject observation limits');
  const count=long?18:1;
  const paragraphs=Array.from({length:count},(_,n)=>`QA-NOTE-${String(n+1).padStart(2,'0')} TEST ONLY. This is a fictional layout and evidence-review sample. No football claim is verified. Missing match context, observation dates and video evidence would need to be supplied before a real club evaluation. The software must retain each note exactly once and keep the agency identity visible.`);
  await(await section(6,'wording')).fill(paragraphs.join('\n\n'));
  await tab('Add source');await page.getByLabel('Source description',{exact:true}).fill('QA Previous Report Subject software notes, not a match');await page.getByLabel('HTTPS source URL',{exact:true}).fill('http://example.test/unsafe');
  await tab('Review');await page.getByRole('button',{name:'Add a source description and a valid HTTPS source link',exact:true}).click();assert.equal(await page.locator('#document-sources').evaluate(node=>node===document.activeElement),true);
  await page.getByLabel('HTTPS source URL',{exact:true}).fill('https://example.com/qa-scouting-notes');await page.getByLabel('Source added on',{exact:true}).fill('2026-10-27');
  await tab('Review');await page.getByRole('checkbox',{name:/I have reviewed/}).check();await page.getByText('Ready for your recipient',{exact:true}).waitFor();
  if(!long){await tab('Save draft');await page.getByRole('alert').filter({hasText:'Your draft is still here'}).waitFor();assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isDisabled(),true);await tab('Content');assert.equal(await(await section(6,'wording')).inputValue(),paragraphs.join('\n\n'));await tab('Review');}
  await save(false);await tab('Library');await page.getByRole('button',{name:/^QA Original Scouting/}).click();
  assert.equal(await field('player_name').inputValue(),'QA Previous Report Subject');for(const key of ['player_club','position'])assert.equal(await field(key).inputValue(),'');
  const paper=page.getByRole('article',{name:'Document preview'});
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});if(width<=760)await tab('Preview');await paper.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Report fits '+width);
   const text=await paper.innerText();for(const value of ['QA Previous Report Subject','QA Receiving Club TEST ONLY '+brand,'QA Software Reviewer','no sporting recommendation','QA-NOTE-01','QA software review notes'])assert.ok(text.toLowerCase().includes(value.toLowerCase()),value);
   assert.doesNotMatch(text,/Alex Bennett|Łukasz Zieliński|IBAN|\[\[|\{\{|Draft for review/);
   if(width===390){await paper.locator('header').scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/report-${brand}-390.png`});}
   if(width<=760)await tab('Edit');
  }
  await tab('Review');
  for(const[label,ext]of [['Word','docx'],['PDF','pdf']]){
   const waiting=page.waitForEvent('download');await tab(label);const path=`${output}/report-${brand}.${ext}`;await(await waiting).saveAs(path);const bytes=await readFile(path);assert.ok(bytes.length>4000);
   if(ext==='docx'){
    const xml=member=>execFileSync('unzip',['-p',path,member],{encoding:'utf8'}),body=xml('word/document.xml');
    for(let n=1;n<=count;n++)assert.equal((body.match(new RegExp('QA-NOTE-'+String(n).padStart(2,'0'),'g'))||[]).length,1);
    assert.match(body,/QA Software Reviewer/);assert.match(body,/no sporting recommendation/);assert.doesNotMatch(body,/IBAN|scoutingProfilePlayerId|scoutingTemplateVersion|\[\[|\{\{/);
    assert.match(xml('word/header1.xml'),long?/Atlas Player Advisory/:/Northstar Football Management/);assert.doesNotMatch(xml('word/settings.xml'),/w:(?:documentProtection|writeProtection)/);
    assert.match(xml('word/_rels/document.xml.rels'),/https:\/\/example.com\/qa-scouting-notes/);
   }else {assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const pages=(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;assert.ok(long?pages>=2:pages===1,'A short assessment and its sources fit one page; long evidence remains paginated');}
  }
  await tab('Save as template');await page.getByRole('status').filter({hasText:'Player headings, observations and sources cleared'}).waitFor();for(const key of ['player_name','player_club','position','recipient_name'])assert.equal(await field(key).inputValue(),'');
  await tab('Content');assert.equal(await page.getByLabel('Source description',{exact:true}).count(),0);
  for(let n=0;n<7;n++){
   assert.doesNotMatch(await(await section(n,'heading')).inputValue(),/QA Previous Report Subject/);
   await(await section(n,'wording')).fill(n===0?'{{player_name}}':'QA reusable methodology: record sources and limitations for {{player_name}}.');
  }
  await tab('Add source');await page.getByLabel('Source description',{exact:true}).fill('QA reusable scouting methodology');await title('QA Reusable Scouting '+brand);await save(true);
  await tab('Library');await page.getByRole('button',{name:/^QA Original Scouting/}).click();await tab('Content');assert.equal(await(await section(0,'heading')).inputValue(),'QA Previous Report Subject assessment');assert.match(await page.getByLabel('Source description',{exact:true}).inputValue(),/QA Previous Report Subject/);
  await tab('Library');await tab('Use template');await field('player_name').fill('QA Next Report Subject');await field('recipient_name').fill('QA New Receiving Club');await tab('Content');assert.equal(await(await section(2,'wording')).inputValue(),'QA reusable methodology: record sources and limitations for {{player_name}}.');assert.equal(await page.getByLabel('Source description',{exact:true}).inputValue(),'QA reusable scouting methodology');
  await tab('Review');assert.equal(await page.getByRole('checkbox',{name:/I have reviewed/}).isChecked(),false);await page.getByRole('checkbox',{name:/I have reviewed/}).check();await save(false);
  const actions=await page.evaluate(()=>window.qaDocumentActions);assert.equal(actions.some(action=>['share','assist','sent','paid'].includes(action)),false);results.push({brand,widths:[320,390,768,1440],notes:count,originalPreserved:true,cleanTemplate:true,actions});
 }
 // Optional published-profile import, same-player refresh, cancellation and same-name replacement.
 await go('reviewBrand=northstar&scoutingPlayers=1');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Scouting report.*Create document/}).click();
 await page.getByText('Copy details from an existing workspace player',{exact:true}).click();const select=page.getByRole('combobox',{name:'Player to fill'});
 await select.selectOption('player-a');await tab('Fill player details');assert.equal(await field('player_name').inputValue(),'Alex Bennett');await tab('Content');
 assert.match(await(await section(1,'wording')).inputValue(),/QA published appearances, 2025\/26: 0/);assert.doesNotMatch(await(await section(1,'wording')).inputValue(),/QA unknown minutes/);
 assert.match(await page.getByLabel('Source description',{exact:true}).inputValue(),/Published player profile: Alex Bennett/);
 await(await section(3,'wording')).fill('QA PLAYER A ONLY personal observations');await copyProfile('player-a');let dialog=page.getByRole('dialog',{name:'Document action',exact:true});await dialog.getByText('Your scouting observations will stay.',{exact:false}).waitFor();await dialog.getByRole('button',{name:'Keep current report',exact:true}).click();await tab('Content');assert.equal(await(await section(3,'wording')).inputValue(),'QA PLAYER A ONLY personal observations');
 await copyProfile();await dialog.getByRole('button',{name:'Copy profile details',exact:true}).click();await tab('Content');assert.equal(await(await section(3,'wording')).inputValue(),'QA PLAYER A ONLY personal observations');
 await copyProfile('player-c');await dialog.getByText(/existing scouting observations will be cleared/).waitFor();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});assert.equal(await dialog.isVisible(),true);const close=await dialog.getByRole('button',{name:'Close document dialog',exact:true}).boundingBox();assert.ok(close.width>=44&&close.height>=44,'Touch-safe close');assert.notEqual(await dialog.getByRole('button',{name:'Copy profile details',exact:true}).evaluate(node=>getComputedStyle(node).backgroundColor),await dialog.getByRole('button',{name:'Keep current report',exact:true}).evaluate(node=>getComputedStyle(node).backgroundColor),'One tenant-branded primary action');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Copy confirmation fits '+width);
  for(const key of ['Tab','Shift+Tab'])for(let n=0;n<4;n++){await page.keyboard.press(key);assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog[open]')),true,'Native dialog contains keyboard focus');}
  if(width===390)await page.screenshot({path:output+'/copy-confirmation-390.png'});
 }
 await page.setViewportSize({width:390,height:844});await dialog.press('Escape');assert.equal(await page.getByRole('button',{name:'Fill player details',exact:true}).evaluate(node=>node===document.activeElement),true);
 await tab('Content');assert.equal(await(await section(3,'wording')).inputValue(),'QA PLAYER A ONLY personal observations');await copyProfile();await dialog.getByRole('button',{name:'Copy profile details',exact:true}).click();await page.getByRole('status').filter({hasText:'No published profile evidence is available'}).waitFor();for(const key of ['player_club','position'])assert.equal(await field(key).inputValue(),'');await tab('Content');assert.doesNotMatch(await(await section(3,'wording')).inputValue(),/QA PLAYER A ONLY/);assert.equal(await page.getByLabel('Source description',{exact:true}).count(),0);assert.match(await(await section(1,'wording')).inputValue(),/No approved profile evidence is available/);
 await tab('Library');await page.getByRole('dialog',{name:'Unsaved document changes',exact:true}).getByRole('button',{name:'Discard changes',exact:true}).click();await go('reviewBrand=northstar&legacyReport=1');await tab('Use template');await page.getByRole('status').filter({hasText:'Previous scouting headings, observations and sources cleared'}).waitFor();await tab('Content');assert.doesNotMatch(await(await section(0,'heading')).inputValue(),/QA Previous Legacy/);assert.equal(await page.getByLabel('Source description',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);await writeFile(output+'/browser-results.json',JSON.stringify({results,publishedProfile:true,sameNameReplacement:true,cancelPreserves:true,legacyTemplate:true,errors,warnings},null,2));console.log('Scouting report: sourced new prospects, missing-data truth, review/retry/reopen, clean templates, published-profile identity/cancel/refresh, two brands, four widths and real Word/PDF pass.');
}catch(e){if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
