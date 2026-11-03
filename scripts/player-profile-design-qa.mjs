import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow';
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   for(let attempt=0;attempt<50;attempt++){try{await page.goto(root+'?view=players&player=qa-player-0&profile=1');break;}catch(error){if(attempt===49)throw error;await page.waitForTimeout(250);}}
   await page.getByRole('heading',{name:'José Silva',exact:true}).waitFor({timeout:12000});
   const primary=page.getByRole('button',{name:'Verify & publish',exact:true});
   await primary.waitFor();
   assert.ok((await primary.boundingBox()).height>=44,'Profile action height at '+width);
   assert.equal(await page.getByRole('button',{name:'Edit profile',exact:true}).count(),1,'Profile editing remains reachable');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Profile must not overflow at '+width);
   if(width===390||width===1440)await page.screenshot({path:'/tmp/redream-players-refined/profile-final-'+width+'.png',fullPage:false});
 }
 console.log('PLAYER PROFILE DESIGN QA PASS 320/390/768/1440');
}finally{await browser.close();}
