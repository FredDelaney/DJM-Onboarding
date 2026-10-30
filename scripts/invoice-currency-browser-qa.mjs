// Real editor/recipient/exporters; non-deployed synthetic fixture, no external action.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const output=process.env.INVOICE_CURRENCY_QA_OUTPUT||'/tmp/redream-platform-programme/invoice-currency';
await mkdir(output,{recursive:true});
const root=new URL(process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
try{
 page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[],results=[],warnings=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='warning'&&/wrap|page|height/i.test(msg.text()))warnings.push(msg.text());});
 await page.addInitScript(()=>{window.qaSavedDocument=null;window.addEventListener('qa-document-saved',event=>window.qaSavedDocument=event.detail);});
 await page.route('https://brand-assets.supabase.co/**',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" fill="#23483F"/><text x="120" y="60" font-size="32" text-anchor="middle" fill="white">QA AGENCY</text></svg>'}));
 const tab=name=>page.getByRole('button',{name,exact:true}).click(),field=key=>page.locator('#document-field-'+key);
 const go=async query=>{const url=new URL('/qa-documents?'+query,root);for(let n=0;n<60;n++){try{await page.goto(url.href);break;}catch(error){if(n===59)throw error;await page.waitForTimeout(250);}}};
 const preview=async()=>{if(page.viewportSize().width<=760)await tab('Preview');return page.getByRole('article',{name:'Document preview'});};
 const download=async(name,extension)=>{const waiting=page.waitForEvent('download');await tab(name);return waiting.then(async file=>{const path=`${output}/${download.prefix}.${extension}`;await file.saveAs(path);return path;});};
 for(const[currency,price,quantity,bad,total,brand]of [['JPY','100','2.5','100.01','300','northstar'],['EUR','100.10','2.5','100.101','300.30','atlas'],['KWD','1.234','1.5','1.2341','2.221','northstar'],['CLF','1.2345','1.5','1.23451','2.2222','atlas']]){
  await go('reviewBrand='+brand);await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Invoice.*Create document/}).click();
  for(const[key,value]of Object.entries({currency,invoice_number:'QA-PRECISION-'+currency,recipient_name:'QA Precision Club '+currency,recipient_address:'QA Example Address, no payment requested',issue_date:'2026-11-01',due_date:'2026-11-15',tax_rate:'20'}))await field(key).fill(value);
  if(currency!=='EUR')await page.getByText(currency==='JPY'?'JPY uses whole-unit amounts.':`${currency} uses ${currency==='KWD'?3:4} decimal places.`,{exact:true}).waitFor();
  await page.getByLabel('Bank details',{exact:true}).fill('QA TEST ONLY, not an account or payment instruction');
  await page.getByLabel('Service 1',{exact:true}).fill('QA currency evaluation only');await page.getByLabel('Quantity',{exact:true}).fill(quantity);await page.getByLabel('Unit price',{exact:true}).fill(bad);
  await tab('Review');const precisionMessage=currency==='JPY'?'Use whole-unit prices for this JPY invoice':`Use up to ${currency==='EUR'?2:currency==='KWD'?3:4} decimal places for this ${currency} invoice`;
  await page.getByRole('button',{name:precisionMessage,exact:true}).click();
  assert.equal(await page.locator('#document-line-items').evaluate(node=>node===document.activeElement),true);
  await page.getByLabel('Unit price',{exact:true}).fill(price);await tab('Content');
  for(let n=1;n<=2;n++){
   const wording=page.getByRole('textbox',{name:'Section '+n+' wording',exact:true});
   if(!await wording.isVisible())await page.getByLabel('Section '+n,{exact:true}).locator('summary').click();
   await wording.fill('QA fictional currency validation only. No service, obligation or payment is requested.');
  }
  await tab('Review');await page.getByRole('checkbox',{name:/I have reviewed/}).check();await page.getByText('Ready for your recipient',{exact:true}).waitFor();
  await tab('Save draft');await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
  const saved=await page.evaluate(()=>window.qaSavedDocument);assert.equal(saved.content.invoiceCurrencyVersion,1);
  await tab('Library');await page.getByRole('button',{name:'Invoice for QA Precision Club '+currency,exact:false}).click();assert.equal(await field('currency').inputValue(),currency);assert.equal(await page.getByLabel('Unit price',{exact:true}).inputValue(),price);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});const paper=await preview();await paper.waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,currency+' fits '+width);
   assert.ok((await paper.innerText()).includes(total));assert.doesNotMatch(await paper.innerText(),/Draft for review|\[unit price\]|\[amount\]/i);
   if(width===390){await paper.locator('header').scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${currency}-390.png`});}
   if(width<=760)await tab('Edit');
  }
  await tab('Review');download.prefix=currency;
  const word=await download('Word','docx'),pdf=await download('PDF','pdf');
  const xml=execFileSync('unzip',['-p',word,'word/document.xml'],{encoding:'utf8'});
  assert.ok(xml.includes(total)&&xml.includes('QA currency evaluation only'));
  assert.doesNotMatch(xml,/Draft for review|\[amount\]|\[unit price\]/i);
  assert.doesNotMatch(execFileSync('unzip',['-p',word,'word/settings.xml'],{encoding:'utf8'}),/w:(?:documentProtection|writeProtection)/);
  assert.equal((await readFile(pdf)).subarray(0,5).toString(),'%PDF-');
  // Exercise the actual recipient component and request header with the saved format.
  let opens=0;
  await page.route('https://example.supabase.co/rest/v1/rpc/redream_document_open',route=>{
   opens++;assert.equal(route.request().headers()['x-redream-invoice-currency'],'1');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({title:saved.title,kind:'invoice',status:'ready',content:saved.content})});
  });
  await page.goto(new URL('/workspace/qa-agency/documents/view/'+'a'.repeat(64),root).href);
  assert.equal(opens,0);await tab('View document');await page.getByRole('article',{name:'Document preview'}).waitFor();
  assert.ok((await page.getByRole('article',{name:'Document preview'}).innerText()).includes(total));assert.equal(opens,1);
  await page.unroute('https://example.supabase.co/rest/v1/rpc/redream_document_open');
  results.push({currency,brand,total,widths:[320,390,768,1440],editableWord:true,recipientHeader:true});
 }
 await go('reviewBrand=northstar&legacyCurrency=1');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/^QA historical KWD invoice/}).click();
 let paper=await preview();assert.ok((await paper.innerText()).includes('1.85'));assert.doesNotMatch(await paper.innerText(),/Draft for review/i);await tab('Edit');await tab('Review');
 const warning='Duplicate this invoice to use current currency precision';await page.getByRole('button',{name:warning,exact:true}).click();assert.equal(await page.locator('#document-duplicate').evaluate(node=>node===document.activeElement),true);
 assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isDisabled(),true);
 await tab('Activity');await page.getByRole('status').filter({hasText:'Loading activity'}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Record payment',exact:true}).isDisabled(),false);
 await tab('Record payment');const dialog=page.getByRole('dialog',{name:'Document action',exact:true});await dialog.getByLabel('Payment date and reference',{exact:true}).fill('QA original KWD 1.85 only; no money moved.');await dialog.getByRole('button',{name:'Confirm manual record',exact:true}).click();await page.getByText('Payment (manually recorded)',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Record payment',exact:true}).isDisabled(),true);await tab('Details');assert.equal(await field('currency').isDisabled(),true);
 await tab('Review');await tab('Duplicate document');assert.equal(await page.getByLabel('Unit price',{exact:true}).inputValue(),'1.23');await tab('Review');assert.equal(await page.getByRole('checkbox',{name:/I have reviewed/}).isChecked(),false);
 paper=await preview();assert.ok((await paper.innerText()).includes('1.845'));await tab('Edit');await tab('Library');await page.getByRole('button',{name:/^QA historical KWD invoice/}).click();paper=await preview();assert.ok((await paper.innerText()).includes('1.85'));
 await tab('Edit');await tab('Review');download.prefix='legacy-KWD';await download('Word','docx');await download('PDF','pdf');
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);await writeFile(output+'/browser-results.json',JSON.stringify({results,legacy:{amount:'1.85',newCopy:'1.845',paidImmutable:true},errors,warnings},null,2));
 console.log('Invoice currency: four scales, explicit correction, four widths, saved/recipient formats, historical amount/manual payment/copy and real exports pass.');
}catch(error){if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
