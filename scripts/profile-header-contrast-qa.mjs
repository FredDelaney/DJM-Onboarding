import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage();
 const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow';
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(let attempt=0;attempt<60;attempt++){try{await page.goto(root+'?view=players&player=qa-player-0&profile=1');break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}}
  await page.getByRole('region',{name:'Player data',exact:true}).waitFor();
  const hero=page.locator('section').filter({has:page.getByRole('heading',{name:'José Silva',exact:true})});
  const more=hero.locator('summary').filter({hasText:/^More\s*$/});
  await more.waitFor();
  const issues=await hero.evaluate(hero=>{
   const rgb=value=>{const values=value.match(/[\d.]+/g)?.map(Number)||[];return [values[0]||0,values[1]||0,values[2]||0,values.length>3?values[3]:1];};
   const blend=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
   const background=node=>{const layers=[];for(let el=node;el;el=el.parentElement)layers.unshift(rgb(getComputedStyle(el).backgroundColor));return layers.reduce((base,layer)=>blend(layer,base),[255,255,255]);};
   const luminance=color=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const issues=[];
   for(const node of hero.querySelectorAll('button,a,summary,[class*="statusRow"] span,[class*="readiness"] p,[class*="readinessTop"] span,[class*="readinessTop"] strong,[class*="__photo"]')){
    const box=node.getBoundingClientRect();if(!box.width||!box.height||!node.textContent.trim())continue;
    const bg=background(node),fg=blend(rgb(getComputedStyle(node).color),bg),a=luminance(bg),b=luminance(fg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    const minimum=parseFloat(getComputedStyle(node).fontSize)>=24?3:4.5;
    if(ratio<minimum)issues.push({text:node.textContent.trim(),contrast:Math.round(ratio*100)/100});
    if(node.matches('button,a,summary')&&box.height<43.5)issues.push({text:node.textContent.trim(),height:box.height});
   }
   return issues;
  });
  assert.deepEqual(issues,[],'Player profile controls and status must remain readable on the light header at '+width);
  await more.click();
  await hero.getByRole('button',{name:'Edit profile',exact:true}).waitFor();
  await hero.getByRole('button',{name:'Preview',exact:true}).waitFor();
 }
 console.log('Player profile header contrast, touch targets and discoverable editing tools passed at four viewport widths.');
} finally {await browser.close();}
