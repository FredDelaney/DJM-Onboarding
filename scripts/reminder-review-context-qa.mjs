import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const url=new URL('/qa-reminder-review',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(500);}}
  await page.getByText('Call the club (2 open copies)',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Open calendar',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Check similar reminders',exact:true}).count(),1,'Explain the concrete review instead of requesting undefined judgement');
  assert.doesNotMatch(await page.locator('body').innerText(),/semantics|explicitly approved/,'Implementation approval language must not leak into the product');
  assert.equal(await page.getByRole('button',{name:'Confirm action',exact:true}).count(),0,'Possible copies are not silently merged');
  console.log('Reminder review: plain explanation and explicit navigation without merging passed.');
} finally {await browser.close();}
