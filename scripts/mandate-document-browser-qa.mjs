// Real document editor/exporters, synthetic parties and sample wording only.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const output=process.env.MANDATE_QA_OUTPUT||'/tmp/redream-platform-programme/mandate-journey';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],warnings=[],results=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='warning'&&/wrap|page|height/i.test(msg.text()))warnings.push(msg.text());});
 await page.addInitScript(()=>{window.qaDocumentActions=[];window.addEventListener('qa-document-request',event=>window.qaDocumentActions.push(event.detail));});
 await page.route('https://brand-assets.supabase.co/**',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" fill="#23483F"/><text x="120" y="60" font-size="32" text-anchor="middle" fill="white">QA AGENCY</text></svg>'}));
 const tab=name=>page.getByRole('button',{name,exact:true}).click(),field=key=>page.locator('#document-field-'+key);
 for(const [index,type,brand] of [[1,'Agency','northstar'],[2,'Club','northstar'],[3,'Player','atlas']]){
  const url=new URL('/qa-documents?reviewBrand='+brand,process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let n=0;n<60;n++){try{await page.goto(url.href);break;}catch(error){if(n===59)throw error;await page.waitForTimeout(250);}}
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/Mandate.*Create document/}).click();
  for(const key of ['player_name','principal_type','principal_name','territory','commission','start_date','end_date'])assert.equal(await field(key).inputValue(),'','No invented '+key);
  assert.equal(await page.getByRole('combobox',{name:'Player to fill'}).isVisible(),false);
  await tab('Review');await page.getByRole('button',{name:'Add mandating party type',exact:true}).click();
  assert.equal(await field('principal_type').evaluate(node=>node===document.activeElement),true);
  await field('principal_type').selectOption(type);
  const player='QA Prospect M'+index+' TEST ONLY',principal=type==='Player'?player:'QA '+type+' Principal TEST ONLY';
  const territory=index===2?Array.from({length:22},(_,n)=>`QA scope line ${n+1}: Sample Club ${n+1}, Sample Country. Neutral layout sample only; no real authority or introduction.`).join('\n'):'QA Club A and QA Country B only. Test layout scope.';
  const commission=index===2?Array.from({length:12},(_,n)=>`QA fee note ${n+1}: sample payer, sample calculation basis, sample split and sample trigger for technical layout testing only.`).join('\n\n'):'QA agency fee split: 50% of the sample agency fee; QA payer and QA trigger, test only.';
  for(const [key,value]of Object.entries({player_name:player,principal_name:principal,territory,commission,start_date:'2026-11-01',end_date:'2026-10-01'}))await field(key).fill(value);
  await tab('Review');await page.getByRole('button',{name:'End date must follow the start date',exact:true}).click();
  assert.equal(await field('end_date').evaluate(node=>node===document.activeElement),true);await field('end_date').fill('2027-10-31');
  await tab('Review');await page.getByRole('checkbox',{name:'The wording and terms have been reviewed for this agreement.',exact:true}).check();
  assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isDisabled(),true,'Unfinished approved wording still blocks Share');
  await page.getByRole('button',{name:'Complete the highlighted template text',exact:true}).click();
  assert.equal(await page.locator('#document-section-section-0').evaluate(node=>node===document.activeElement),true);
  for(let n=1;n<=4;n++){
   const section=page.getByLabel('Section '+n,{exact:true});
   if(n!==1)await section.locator('summary').click();
   const wording=page.getByRole('textbox',{name:'Section '+n+' wording',exact:true});
   await wording.fill((await wording.inputValue()).replace(/\[\[[\s\S]*?\]\]/g,`QA software layout check for section ${n}. Synthetic wording only; not for execution.`));
  }
  await tab('Review');await page.getByRole('checkbox',{name:'The wording and terms have been reviewed for this agreement.',exact:true}).check();
  await page.getByText('Ready for your recipient',{exact:true}).waitFor();
  await tab('Save draft');await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
  await tab('Library');await page.getByRole('button',{name:new RegExp('^Mandate for '+player)}).click();
  assert.equal(await field('principal_type').inputValue(),type);assert.equal(await field('principal_name').inputValue(),principal);
  assert.equal(await field('territory').inputValue(),territory);assert.equal(await field('commission').inputValue(),commission);
  const paper=page.getByRole('article',{name:'Document preview'});
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});if(width<=760)await tab('Preview');
   await paper.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Mandate fits '+width);
   const text=await paper.innerText();assert.ok(text.includes(principal));assert.ok(text.includes(territory));assert.ok(text.includes(commission));
   const brief=await paper.locator('dl[aria-label="Document brief"]').innerText();
   assert.ok(brief.includes('Fee arrangement'));
   if(index===2){assert.match(brief,/See Clubs and territories/);assert.match(brief,/See Commission arrangement/);assert.doesNotMatch(brief,/QA scope line 22|QA fee note 12/);}
   assert.doesNotMatch(text,/Alex Bennett|Łukasz Zieliński|\[\[|\{\{|Draft for review/);
   if(width===390)await page.screenshot({path:output+'/mandate-'+index+'-390.png'});
   if(width<=760)await tab('Edit');
  }
  await page.setViewportSize({width:1440,height:1000});await tab('Review');
  for(const [label,extension]of [['Word','docx'],['PDF','pdf']]){
   const pending=page.waitForEvent('download');await tab(label);const path=output+'/mandate-'+index+'.'+extension;await(await pending).saveAs(path);
   const bytes=await readFile(path);assert.ok(bytes.length>4000);
   if(extension==='docx'){
    const xml=member=>execFileSync('unzip',['-p',path,member],{encoding:'utf8'}),body=xml('word/document.xml'),header=xml('word/header1.xml');
    assert.ok(body.includes(player)&&body.includes(principal));assert.doesNotMatch(body,/DRAFT FOR REVIEW|\[\[|\{\{|Alex Bennett|Łukasz Zieliński/);
    assert.match(header,brand==='atlas'?/Atlas Player Advisory/:/Northstar Football Management/);
    assert.doesNotMatch(xml('word/settings.xml'),/w:(?:documentProtection|writeProtection)/);
   }else assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  }
  if(index===3){
   await tab('Save as template');
   for(const key of ['player_name','principal_name','start_date','end_date'])assert.equal(await field(key).inputValue(),'','A reusable mandate clears '+key);
   await tab('Review');assert.equal(await page.getByRole('checkbox',{name:'The wording and terms have been reviewed for this agreement.',exact:true}).isChecked(),false);
   await tab('Save draft');await page.getByRole('status').filter({hasText:'Agency template saved'}).waitFor();
   await tab('Library');await tab('Use template');
   await field('player_name').fill('QA Next Prospect TEST ONLY');await field('principal_type').selectOption('Club');await field('principal_name').fill('QA Next Club Principal TEST ONLY');
   await page.setViewportSize({width:390,height:900});await tab('Preview');
   const text=await paper.innerText();assert.ok(text.includes('QA Next Prospect TEST ONLY')&&text.includes('QA Next Club Principal TEST ONLY'));
   assert.equal(text.includes(player),false,'A new recipient does not inherit the previous subject');
   await tab('Edit');await tab('Review');assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isDisabled(),true);
  }
  const actions=await page.evaluate(()=>window.qaDocumentActions);assert.deepEqual(actions,index===3?['save','save']:['save']);
  results.push({principalType:type,brand,player,principal,long:index===2,actions});
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/journey.json',JSON.stringify({synthetic:true,widths:[320,390,768,1440],results,warnings},null,2));
 console.log('Mandates: agency/club/player, new subject, missing/date/wording review gates, save/reopen, four widths and real editable branded Word/PDF exports pass.');
}finally{await browser.close();}
