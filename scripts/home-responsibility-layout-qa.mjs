import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser = await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const people = [{user_id:'10000000-0000-4000-8000-000000000001',display_name:'Jesse Edge'},{user_id:'10000000-0000-4000-8000-000000000002',display_name:'Dapo Kayode'}];
try {
 const page = await browser.newPage({viewport:{width:390,height:844}});
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://example.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()||{};
  let value={};
  if(body.action==='tenants')value={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'Example Agency'}]};
  else if(body.action==='home_focus')value={home:{attention:{judgement:[
   {command_id:'task:first',source_type:'task',source_id:'60000000-0000-4000-8000-000000000001',title:'Lachlan Sattout: catch up',why_now:'Confirm availability for the club trial.',actionability:{mode:'review_only',cta:'Review'}},
   {command_id:'task:second',source_type:'task',source_id:'60000000-0000-4000-8000-000000000002',title:'Review James Mitchell data',why_now:'Career statistics changed.',actionability:{mode:'review_only',cta:'Review player data'}}
  ]}}};
  else if(path.endsWith('/redream_work_responsibility_v1'))value={user_ids:[people[0].user_id],people:[people[0]],revision:1};
  else if(path.endsWith('/redream_calendar_task_assignees_v1'))value={items:people};
  else if(path.endsWith('/redream_assigned_work_page_v1'))value={items:[],next_cursor:null};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 const url=new URL('/qa-command',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let attempt=0;attempt<60;attempt++){try{await page.goto(url.href);break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}}
 const row=page.locator('article').filter({hasText:'Lachlan Sattout: catch up'});
 await row.getByLabel('Change responsible people',{exact:true}).filter({hasText:'Jesse Edge'}).waitFor();
 for(const width of [320,390,430,768,1440]){
  await page.setViewportSize({width,height:844});
  const action=row.getByRole('button',{name:'Update',exact:true});
  assert.ok(await action.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=12),'Home actions must show a readable label at '+width);
  await row.getByLabel('Change responsible people',{exact:true}).click();
  await row.getByLabel('Choose responsible people',{exact:true}).click();
  await row.getByRole('checkbox',{name:'Dapo Kayode',exact:true}).waitFor();
  const metrics=await row.evaluate(node=>{
   const visible=node=>{const box=node.getBoundingClientRect();return box.width>0&&box.height>0;};
   return {overflow:document.documentElement.scrollWidth-innerWidth,small:[...node.querySelectorAll('button,summary,input:not([type=checkbox])')].filter(visible).filter(control=>control.getBoundingClientRect().height<43.5).map(control=>control.getAttribute('aria-label')||control.textContent.trim())};
  });
  assert.ok(metrics.overflow<=1,'The Home responsibility picker must fit the viewport at '+width);
  assert.deepEqual(metrics.small,[],'Expanded Home controls need comfortable touch targets at '+width);
  await row.getByRole('button',{name:'Done',exact:true}).click();
  await row.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 assert.deepEqual(errors,[]);
 console.log('Home task actions and expanded responsibility editing passed at five viewport widths.');
} finally {await browser.close();}
