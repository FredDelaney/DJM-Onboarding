import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.CALENDAR_CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({viewport: {width, height: 844}, reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL(process.env.WORKSPACE_FLOW_QA_URL || 'http://127.0.0.1:3113/workspace/qa-find-flow');
    url.search = '?view=opportunities&tab=overview&scenario=need-review';
    for(let attempt=0; attempt<50; attempt++) {
      try { await page.goto(url.href); break; }
      catch(error) {if(attempt===49) throw error; await page.waitForTimeout(250);}
    }
    await page.locator('[data-qa-ready="true"]').waitFor();
    const overview = page.getByRole('region', {name:'All agency opportunities'});
    await overview.waitFor({timeout:10000});
    await overview.getByRole('heading',{name:'Every opportunity, in one place.'}).waitFor();
    const attention = overview.getByRole('button',{name:/^Needs attention/});
    const all = overview.getByRole('button',{name:'All work', exact:true});
    assert.equal(await all.getAttribute('aria-pressed'),'true');
    await attention.click();
    assert.equal(await attention.getAttribute('aria-pressed'),'true');
    await all.click();
    assert.equal(await all.getAttribute('aria-pressed'),'true');
    const search = overview.getByRole('textbox',{name:'Search all opportunities'});
    await search.fill('Never-matching-test-value');
    assert.equal(await search.inputValue(),'Never-matching-test-value');
    await overview.getByRole('button',{name:'Clear search'}).click();
    assert.equal(await search.inputValue(),'');
    const bounds = await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,overviewWidth:document.querySelector('section[aria-label="All agency opportunities"]')?.getBoundingClientRect().width}));
    assert.ok(bounds.documentWidth <= bounds.width + 1,'Overview overflows '+width+': '+JSON.stringify(bounds));
    assert.ok(bounds.overviewWidth > 0 && bounds.overviewWidth <= bounds.width,'Overview bounds invalid at '+width+': '+JSON.stringify(bounds));
    if(width<=420){
      const tabBounds=await page.locator('[aria-label="Opportunity view"]').evaluate(el=>{
        const r=el.getBoundingClientRect();
        const buttons=[...el.querySelectorAll('button')].map(b=>{
          const rect=b.getBoundingClientRect();
          return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
        });
        return {left:r.left,right:r.right,display:getComputedStyle(el).display,rows:new Set(buttons.map(b=>Math.round(b.top))).size,buttons};
      });
      assert.equal(tabBounds.display,'grid','Narrow phone should keep four accessible tabs in a grid');
      assert.equal(tabBounds.rows,2,'Narrow phone should display two rows of tabs');
      assert.equal(tabBounds.buttons.length,4);
      assert.ok(tabBounds.buttons.every(b=>b.left>=-1&&b.right<=width+1&&b.bottom-b.top>=44),
        'Every opportunity tab must fit and remain tappable at '+width+': '+JSON.stringify(tabBounds));
    }
    assert.deepEqual(errors,[]);
    if(width===390 || width===1440){
      const path='/tmp/redream-opportunity-overview-qa';
      await mkdir(path,{recursive:true});
      await overview.screenshot({path:`${path}/overview-${width}.png`});
    }
    await page.close();
    console.log('PASS: Opt-in Opportunities overview responsive and interactive at',width);
  }
} finally {await browser.close();}
