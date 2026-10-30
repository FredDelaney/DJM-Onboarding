// Real editor/exporters; fictional invoice values, no obligation or provider call.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const output=process.env.INVOICE_QA_OUTPUT||'/tmp/redream-platform-programme/invoice-journey';
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
 const title=async value=>{await tab('Details');const input=page.getByLabel('Document title',{exact:true});if(!await input.isVisible())await page.getByText('Document name',{exact:true}).click();await input.fill(value);};
 const save=async template=>{await tab('Save draft');await page.getByRole('status').filter({hasText:template?'Agency template saved':'Draft saved'}).waitFor();};
 for(const brand of ['northstar','atlas']){
  const long=brand==='atlas',count=long?30:1;
  const url=new URL('/qa-documents?reviewBrand='+brand+(long?'':'&scenario=save-failed'),process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let n=0;n<60;n++){try{await page.goto(url.href);break;}catch(error){if(n===59)throw error;await page.waitForTimeout(250);}}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Invoice.*Create document/}).click();
  assert.equal(await page.getByRole('combobox',{name:'Player to fill'}).count(),0,'Invoice bills an organisation, without tagging a roster player');
  for(const key of ['recipient_name','recipient_address','invoice_number','due_date','reference','payment_url'])assert.equal(await field(key).inputValue(),'','No invented '+key);
  await tab('Review');await page.getByRole('button',{name:'Add bill to',exact:true}).click();
  assert.equal(await field('recipient_name').evaluate(node=>node===document.activeElement),true);
  const recipient='QA Club Billing Entity TEST ONLY '+brand,number='QA-INVOICE-002-'+brand,reference='QA CLUB REF '+brand;
  for(const[key,value]of Object.entries({recipient_name:recipient,recipient_address:'QA Example Address\nTEST ONLY, not a billing destination',invoice_number:'QA-INVOICE-001-'+brand,issue_date:'2026-12-20',due_date:'2026-12-19',currency:'EUR',tax_rate:'20'}))await field(key).fill(value);
  assert.equal(await field('reference').inputValue(),'QA-INVOICE-001-'+brand);
  await field('reference').fill(reference);await field('invoice_number').fill(number);assert.equal(await field('reference').inputValue(),reference,'Custom club reference remains in control');
  await tab('Review');await page.getByRole('button',{name:'Due date must be on or after the issue date',exact:true}).click();
  assert.equal(await field('due_date').evaluate(node=>node===document.activeElement),true);await tab('14 days');assert.equal(await field('due_date').inputValue(),'2027-01-03');
  await page.getByLabel('Service 1',{exact:true}).fill('QA service line 01 TEST ONLY');await page.getByLabel('Quantity',{exact:true}).fill('2.5');await page.getByLabel('Unit price',{exact:true}).fill('100.10');
  for(let n=2;n<=count;n++){
   await tab('Add service');await page.getByLabel('Service '+n,{exact:true}).fill('QA service line '+String(n).padStart(2,'0')+' TEST ONLY');
   await page.getByLabel('Unit price',{exact:true}).nth(n-1).fill('1.00');
  }
  if(long)assert.equal(await page.getByRole('button',{name:'Add service',exact:true}).isDisabled(),true);
  await tab('Review');await page.getByRole('button',{name:'Add bank details or a secure payment link',exact:true}).click();
  assert.equal(await page.getByLabel('Bank details',{exact:true}).evaluate(node=>node===document.activeElement),true);
  if(!long)await page.getByLabel('Bank details',{exact:true}).fill('QA fictional receiving account\nTEST ONLY, not an account or payment instruction');
  await field('payment_url').fill('http://example.test/unsafe');await tab('Review');await page.getByRole('button',{name:'Use an HTTPS payment link',exact:true}).click();
  assert.equal(await field('payment_url').evaluate(node=>node===document.activeElement),true);
  await field('payment_url').fill(long?'https://wise.com/pay/qa-layout-only':'');
  await title('QA Invoice Journey '+brand);await tab('Content');
  for(let n=1;n<=2;n++){
   const input=page.getByRole('textbox',{name:'Section '+n+' wording',exact:true});
   if(!await input.isVisible())await page.getByLabel('Section '+n,{exact:true}).locator('summary').click();
   await input.fill(n===1?'QA fictional software layout review. No fee is payable.':'For this QA software test only, reference {{reference}}. No payment is requested.');
  }
  await tab('Review');await page.getByRole('checkbox',{name:/I have reviewed/}).check();await page.getByText('Ready for your recipient',{exact:true}).waitFor();
  if(!long){await tab('Save draft');await page.getByRole('alert').filter({hasText:'Your draft is still here'}).waitFor();assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isDisabled(),true);await tab('Details');assert.equal(await field('recipient_name').inputValue(),recipient);await tab('Review');}
  await save(false);await tab('Library');await page.getByRole('button',{name:/^QA Invoice Journey/}).click();
  for(const[key,value]of Object.entries({recipient_name:recipient,invoice_number:number,reference,due_date:'2027-01-03',issue_date:'2026-12-20'}))assert.equal(await field(key).inputValue(),value);
  const paper=page.getByRole('article',{name:'Document preview'}),total=long?'335.10':'300.30';
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});if(width<=760)await tab('Preview');await paper.waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Invoice fits '+width);
   const text=await paper.innerText();assert.ok(text.includes(recipient)&&text.includes(number)&&text.includes(reference)&&text.includes(total));
   for(let n=1;n<=count;n++)assert.ok(text.includes('QA service line '+String(n).padStart(2,'0')+' TEST ONLY'));
   assert.doesNotMatch(text,/Alex Bennett|Łukasz Zieliński|\[\[|\{\{|Draft for review/);
   assert.equal(await paper.getByRole('link',{name:'Pay online',exact:true}).count(),long?1:0);
   await paper.locator('header').scrollIntoViewIfNeeded();
   if(width===390||width===1440)await page.screenshot({path:`${output}/invoice-${brand}-${width}.png`});
   if(width<=760)await tab('Edit');
  }
  await page.setViewportSize({width:1440,height:1000});await tab('Review');
  for(const[label,extension]of [['Word','docx'],['PDF','pdf']]){
   const pending=page.waitForEvent('download');await tab(label);const path=`${output}/invoice-${brand}.${extension}`;await(await pending).saveAs(path);
   const bytes=await readFile(path);assert.ok(bytes.length>4000);
   if(extension==='docx'){
    const xml=member=>execFileSync('unzip',['-p',path,member],{encoding:'utf8'}),body=xml('word/document.xml');
    for(const text of [recipient,number,reference,total])assert.ok(body.includes(text));
    for(let n=1;n<=count;n++)assert.ok(body.includes('QA service line '+String(n).padStart(2,'0')+' TEST ONLY'));
    assert.doesNotMatch(body,/\[\[|\{\{|DRAFT FOR REVIEW|Alex Bennett|Łukasz Zieliński/);
    assert.match(xml('word/header1.xml'),long?/Atlas Player Advisory/:/Northstar Football Management/);
    assert.doesNotMatch(xml('word/settings.xml'),/w:(?:documentProtection|writeProtection)/);
    if(long)assert.match(xml('word/_rels/document.xml.rels'),/https:\/\/wise.com\/pay\/qa-layout-only/);
   }else assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  }
  await tab('Save as template');for(const key of ['recipient_name','invoice_number','reference','issue_date','due_date'])assert.equal(await field(key).inputValue(),'','Template clears '+key);
  await save(true);await tab('Library');await tab('Use template');assert.equal(await field('due_date').inputValue(),'');assert.notEqual(await field('issue_date').inputValue(),'2026-12-20');
  await tab('Review');assert.equal(await page.getByRole('checkbox',{name:/I have reviewed/}).isChecked(),false);assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isDisabled(),true);
  await tab('Library');await page.getByRole('button',{name:/^QA Invoice Journey/}).click();await tab('Activity');
  await page.getByText('Draft created',{exact:true}).waitFor();assert.equal(await page.getByText('Payment (manually recorded)',{exact:true}).count(),0);
  assert.match(await page.locator('body').innerText(),/Delivery and payment settlement need a connected provider/);
  if(!long){
   for(const[action,label,note]of [['Record sent','Delivery method and reference','QA fixture delivery note only; no external send.'],['Record payment','Payment date and reference','QA fixture payment note only; no money moved.']]){
    await tab(action);const dialog=page.getByRole('dialog',{name:'Document action',exact:true});
    assert.equal(await dialog.getByRole('button',{name:'Confirm manual record',exact:true}).isDisabled(),true);
    await dialog.getByLabel(label,{exact:true}).fill(note);await dialog.getByRole('button',{name:'Confirm manual record',exact:true}).click();
    await page.getByText(action==='Record sent'?'Sent (manually recorded)':'Payment (manually recorded)',{exact:true}).waitFor();
   }
   assert.equal(await page.getByRole('button',{name:'Record payment',exact:true}).isDisabled(),true);
   await tab('Details');assert.equal(await field('recipient_name').isDisabled(),true,'Paid invoice remains immutable');
  }
  const actions=await page.evaluate(()=>window.qaDocumentActions);assert.equal(actions.includes('share'),false);assert.equal(actions.includes('suggest'),false);
  assert.equal(actions.filter(x=>x==='paid').length,long?0:1);assert.equal(actions.filter(x=>x==='sent').length,long?0:1);
  results.push({brand,lines:count,total,widths:[320,390,768,1440],bankOnly:!long,paymentLinkOnly:long,actions});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);await writeFile(output+'/browser-results.json',JSON.stringify({results,errors,warnings},null,2));
 console.log('Invoice: new recipient, dates/recovery, accurate totals, bank/link paths, template dates, manual provenance, two brands, four widths and real editable exports pass.');
}catch(error){if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
