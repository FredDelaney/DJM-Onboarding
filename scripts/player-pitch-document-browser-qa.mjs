// Real editor/exporters; fictional prospects, agency wording and evidence only.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const output=process.env.PITCH_QA_OUTPUT||'/tmp/redream-platform-programme/player-pitch-journey';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
try{
 page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[],warnings=[],results=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='warning'&&/wrap|page|height/i.test(msg.text()))warnings.push(msg.text());});
 await page.addInitScript(()=>{window.qaDocumentActions=[];window.addEventListener('qa-document-request',event=>window.qaDocumentActions.push(event.detail));});
 await page.route('https://brand-assets.supabase.co/**',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" fill="#23483F"/><text x="120" y="60" font-size="32" text-anchor="middle" fill="white">QA AGENCY</text></svg>'}));
 const tab=name=>page.getByRole('button',{name,exact:true}).click(),field=key=>page.locator('#document-field-'+key);
 const sectionField=async(index,part)=>{
  const input=page.getByRole('textbox',{name:`Section ${index+1} ${part}`,exact:true});
  if(!await input.isVisible())await page.getByLabel('Section '+(index+1),{exact:true}).locator('summary').click();
  return input;
 };
 const title=async value=>{await tab('Details');const input=page.getByLabel('Document title',{exact:true});if(!await input.isVisible())await page.getByText('Document name',{exact:true}).click();await input.fill(value);};
 const save=async template=>{await tab('Save draft');await page.getByRole('status').filter({hasText:template?'Agency template saved':'Draft saved'}).waitFor();};
 const reusable=[
  '{{player_name}}, your priorities are {{purpose}}. We would begin by agreeing the support you want and how we will communicate.',
  'We would discuss the scope of representation and agree who is responsible before any commitment. Services depend on the agreement we make together.',
  'We would review the evidence, playing role and available options together. A conversation does not guarantee a transfer or club outcome.',
  'Meet the people who would support you. Ask about their actual experience and agree a point of contact and a regular review.',
  'Bring your questions to a private introductory conversation. We would listen, explain the proposed support and agree a next step together. {{agency_email}}',
 ];
 for(const brand of ['northstar','atlas']){
  const url=new URL('/qa-documents?reviewBrand='+brand,process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let n=0;n<60;n++){try{await page.goto(url.href);break;}catch(error){if(n===59)throw error;await page.waitForTimeout(250);}}
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/Player pitch.*Create document/}).click();
  for(const key of ['player_name','player_club','position','purpose'])assert.equal(await field(key).inputValue(),'','No invented '+key);
  assert.equal(await page.getByRole('combobox',{name:'Player to fill'}).isVisible(),false,'Roster import is optional');
  await tab('Review');await page.getByRole('button',{name:'Add target player',exact:true}).click();
  assert.equal(await field('player_name').evaluate(node=>node===document.activeElement),true);
  await field('player_name').fill('QA Previous Prospect');await field('purpose').fill('QA private family priority');
  await title('QA Original Pitch '+brand);await tab('Content');
  for(let n=0;n<5;n++){
   await(await sectionField(n,'heading')).fill('QA Previous Prospect chapter '+(n+1));
   await(await sectionField(n,'wording')).fill('QA Previous Prospect: QA private family priority. Synthetic private wording only.');
  }
  await tab('Add source');await page.getByLabel('Source description',{exact:true}).fill('QA private conversation');
  await tab('Review');await page.getByRole('checkbox',{name:/I have reviewed/}).check();await save(false);
  await tab('Library');await page.getByRole('button',{name:/^QA Original Pitch/}).click();
  await tab('Content');assert.match(await(await sectionField(0,'wording')).inputValue(),/QA private family/);
  await tab('Review');await tab('Save as template');await page.getByRole('status').filter({hasText:'Pitch wording and sources cleared'}).waitFor();
  for(const key of ['player_name','player_club','position','purpose'])assert.equal(await field(key).inputValue(),'','Clean template clears '+key);
  await tab('Content');assert.equal(await page.getByLabel('Source description',{exact:true}).count(),0);
  for(let n=0;n<5;n++){
   assert.doesNotMatch(await(await sectionField(n,'heading')).inputValue(),/QA Previous Prospect/);
   assert.match(await(await sectionField(n,'wording')).inputValue(),/\[\[/,'Old personal body replaced by an unfinished prompt');
   await(await sectionField(n,'wording')).fill(reusable[n]);
  }
  await tab('Add source');await page.getByLabel('Source description',{exact:true}).fill('QA reusable agency service schedule');
  await page.getByLabel('Source added on',{exact:true}).fill('2026-10-27');
  await title('QA Reusable Pitch '+brand);await save(true);
  await tab('Library');await page.getByRole('button',{name:/^QA Original Pitch/}).click();
  await tab('Content');assert.match(await(await sectionField(0,'wording')).inputValue(),/QA Previous Prospect/,'Original is unchanged');
  assert.equal(await page.getByLabel('Source description',{exact:true}).inputValue(),'QA private conversation');
  await tab('Library');await tab('Use template');
  await field('player_name').fill('QA Next Prospect TEST ONLY');await field('purpose').fill('QA regular communication and a realistic development discussion');
  for(const key of ['player_club','position'])assert.equal(await field(key).inputValue(),'','Unknown football information remains absent');
  await title('QA Second Pitch '+brand);await tab('Content');
  for(let n=0;n<5;n++)assert.equal(await(await sectionField(n,'wording')).inputValue(),reusable[n]);
  assert.equal(await page.getByLabel('Source description',{exact:true}).inputValue(),'QA reusable agency service schedule');
  await tab('Review');const reviewed=page.getByRole('checkbox',{name:/I have reviewed/});assert.equal(await reviewed.isChecked(),false);
  assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isDisabled(),true);await reviewed.check();
  await page.getByText('Ready for your recipient',{exact:true}).waitFor();await save(false);
  await tab('Library');await page.getByRole('button',{name:/^QA Second Pitch/}).click();
  assert.equal(await field('player_name').inputValue(),'QA Next Prospect TEST ONLY');
  const paper=page.getByRole('article',{name:'Document preview'});
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});if(width<=760)await tab('Preview');
   await paper.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Pitch fits '+width);
   const text=await paper.innerText();assert.ok(text.includes('QA Next Prospect TEST ONLY')&&text.includes('QA regular communication'));
   assert.doesNotMatch(text,/QA Previous Prospect|QA private family|QA private conversation|Alex Bennett|Łukasz Zieliński|\[\[|\{\{|Draft for review/);
   assert.equal(await paper.getByText('01 / 05',{exact:true}).count(),1);
   if(width===390||width===1440)await page.screenshot({path:`${output}/pitch-${brand}-${width}.png`});
   if(width<=760)await tab('Edit');
  }
  await page.setViewportSize({width:1440,height:1000});
  for(const [label,extension]of [['Word','docx'],['PDF','pdf']]){
   const pending=page.waitForEvent('download');await tab(label);const path=`${output}/pitch-${brand}.${extension}`;await(await pending).saveAs(path);
   const bytes=await readFile(path);assert.ok(bytes.length>4000);
   if(extension==='docx'){
    const xml=member=>execFileSync('unzip',['-p',path,member],{encoding:'utf8'}),body=xml('word/document.xml');
    assert.match(body,/QA Next Prospect TEST ONLY/);assert.match(body,/QA reusable agency service schedule/);
    assert.doesNotMatch(body,/QA Previous Prospect|QA private family|QA private conversation|pitchTemplateVersion|\[\[|\{\{/);
    assert.match(xml('word/header1.xml'),brand==='atlas'?/Atlas Player Advisory/:/Northstar Football Management/);
    assert.doesNotMatch(xml('word/settings.xml'),/w:(?:documentProtection|writeProtection)/);
    assert.equal((body.match(/<w:pageBreakBefore\/>/g)||[]).length,5);
   }else assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  }
  const actions=await page.evaluate(()=>window.qaDocumentActions);assert.deepEqual(actions,['save','save','save'],'Only explicit saves, no roster, AI, send or share');
  results.push({brand,widths:[320,390,768,1440],actions,originalPreserved:true,templateReused:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);await writeFile(output+'/browser-results.json',JSON.stringify({results,errors,warnings},null,2));
 console.log('Player pitch: clean template conversion, new prospect, review/save/reopen, two brands, four widths and real editable Word/PDF pass.');
}catch(error){if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
