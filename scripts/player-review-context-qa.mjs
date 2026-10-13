import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const url=new URL('/qa-player-review',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(500);}}
  await page.getByRole('heading',{name:'Dylan Gardiner',exact:true}).waitFor();
  assert.equal(await page.getByText('Career statistics changed',{exact:true}).count(),1,'The player profile must explain why data needs review');
  await page.getByRole('button',{name:'Review updated data',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Review current player data'});
  await dialog.waitFor();
  await dialog.getByText('Appearances',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('8',{exact:true}).count(),1,'Current statistics must be visible before human verification');
  await dialog.getByRole('button',{name:'Confirm & verify',exact:true}).click();
  await page.getByText('Current player data verified.',{exact:true}).waitFor();
  assert.equal(await page.getByText('Career statistics changed',{exact:true}).count(),0,'Confirmed review disappears after the real profile reload');
  assert.equal(await page.getByRole('dialog').count(),0);
  console.log('Player review: actual reason, visible statistics and explicit verification passed.');
} finally {await browser.close();}
