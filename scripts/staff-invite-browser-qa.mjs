import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:600}}),errors=[],writes=[];
 page.on('pageerror',error=>errors.push(error.message));
 let fail=true,inviteEmail='invited@example.test',registrationMode='error',inactive=false;
 const user={id:'10000000-0000-4000-8000-000000000001',email:'invited@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 await page.route('https://example.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,body=req.postData()?req.postDataJSON():{};
  let status=200,data=[];
  if(path.endsWith('/agency-staff-invite-public')){
   if(body.action==='preflight'){
    status=fail?503:200;data=fail?{error:'Unavailable'}:{invite:inactive?null:{email:inviteEmail,role:'agent',tenant:{slug:'qa-invite'},branding:{display_name:'Example Agency'}}};
   }else{
    writes.push(body);
    if(registrationMode==='error'){status=400;data={error:'Invitation email does not match'};}
    else if(registrationMode==='existing'){status=409;data={account_exists:true,error:'Sign in to accept the invitation.'};}
    else if(registrationMode==='inactive')data={invite:null};
    else data={ok:true};
   }
  }else if(path.endsWith('/auth/v1/token'))data=session;
  else if(path.endsWith('/auth/v1/user'))data=user;
  else if(path.endsWith('/agency-staff-invite')){writes.push(body);data={ok:true};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 const url=new URL('/workspace/join/synthetic-invite-token',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 await page.getByRole('heading',{name:'Invitation unavailable',exact:true}).waitFor();
 assert.equal(await page.getByText('This invitation is no longer active.',{exact:true}).count(),0,'A network failure must not claim the invite expired');
 fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
 await page.getByRole('heading',{name:'Join the agency workspace.',exact:true}).waitFor();
 await page.getByText('Enter your full name to continue.',{exact:true}).waitFor();
 // Locate by the form's actual submit semantics to retain the existing label.
 const join=page.locator('form button:not([type="button"])');
 assert.equal(await join.isEnabled(),false);
 await page.getByLabel('Full name',{exact:true}).fill('Synthetic Agent');
 await page.getByText('Meet each password requirement above to join.',{exact:true}).waitFor();
 await page.getByLabel('Password',{exact:true}).fill('Synthetic-Example1!');
 assert.equal(await join.isEnabled(),true);
 for(const width of [320,390,430,768,1440]){
  await page.setViewportSize({width,height:600});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No invite overflow at ${width}`);
  await join.scrollIntoViewIfNeeded();
 }
 await join.click();await page.getByRole('alert').filter({hasText:'Invitation email does not match'}).waitFor();
 assert.equal(await join.isEnabled(),true,'A failed registration can be retried');
 registrationMode='inactive';await join.click();await page.getByRole('alert').filter({hasText:'This invitation is no longer active.'}).waitFor();
 assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Synthetic Agent');
 registrationMode='success';await join.click();await page.waitForURL('**/workspace/qa-invite');
 assert.equal(writes.length,3);assert.equal(writes[0].action,'register');assert.equal(writes[0].email,inviteEmail);assert.equal(writes[0].role,undefined,'Role comes from the signed invitation');
 inviteEmail='other-invited@example.test';await page.goto(url.href);
 await page.getByRole('heading',{name:'Use the invited email.',exact:true}).waitFor();
 await page.getByRole('button',{name:'Sign out and continue',exact:true}).waitFor();
 await page.getByRole('button',{name:'Sign out and continue',exact:true}).click();await page.getByRole('heading',{name:'Sign in to accept.',exact:true}).waitFor();
 assert.equal(writes.length,3,'A mismatched account cannot accept another person’s invitation');
 inviteEmail='invited@example.test';registrationMode='existing';
 await page.evaluate(()=>localStorage.clear());await page.goto(url.href);
 await page.getByLabel('Full name',{exact:true}).fill('Existing Colleague');
 await page.getByLabel('Password',{exact:true}).fill('Synthetic-Example1!');
 await page.locator('form button:not([type="button"])').click();
 await page.getByRole('heading',{name:'Sign in to accept.',exact:true}).waitFor();
 await page.getByText('An account already exists for this email. Sign in to accept the invitation.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Sign in and join',exact:true}).click();await page.waitForURL('**/workspace/qa-invite');
 for(const state of ['expired','revoked','used']){inactive=true;await page.goto(url.href);await page.getByRole('heading',{name:'This invitation is no longer active.',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Activate agency access',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Go to sign in',exact:true}).getAttribute('href'),'/sign-in');}
 assert.deepEqual(errors,[]);
 console.log('Staff invitations: actionable server errors, retry, existing-account recovery, mobile controls, exact workspace destination and wrong-account protection passed.');
}finally{await browser.close();}
