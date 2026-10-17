import assert from 'node:assert/strict';

// Binding the safe-area environment in CSSOM lets Chromium exercise the actual
// Safari/PWA cascade without adding test-only variables to production styles.
export async function verifyMobileChrome(page, suite, screen, width) {
  if (width > 680 || !['agency', 'settings', 'player'].includes(suite)) return;
  const issues = [];
  if (suite !== 'player') {
    const nav = page.getByRole('navigation', {name: 'Mobile workspace', exact: true});
    if (!await nav.isVisible()) issues.push('shared mobile navigation is missing');
    else {
      assert.deepEqual(await nav.locator(':scope > a, :scope > button').allTextContents(), ['Today', 'Search', 'Tell ReDream', 'People', 'More']);
      const capture = nav.getByRole('button', {name:'Tell ReDream', exact:true});
      await capture.waitFor();
      const iconWidth=await capture.locator('svg').evaluate(n=>n.getBoundingClientRect().width);
      assert.ok(iconWidth>=21 && iconWidth<=24, 'Capture keeps its mobile navigation icon size');
      await capture.click();
      const dialog = page.getByRole('dialog', {name:'Tell ReDream', exact:true});
      await dialog.waitFor();
      await page.getByRole('button', {name:'Close Tell ReDream', exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(await capture.evaluate(n=>document.activeElement===n), true);
    }
  }
  const geometry = await page.evaluate(() => {
    window.scrollTo({top:0,behavior:'instant'});
    const saved=[];
    const bind=rules=>{for(const rule of rules){
      if(rule.style)for(const property of [...rule.style]) {
        const value=rule.style.getPropertyValue(property);
        if(value.includes('env(safe-area-inset-top')) {
          const priority=rule.style.getPropertyPriority(property);saved.push([rule.style,property,value,priority]);
          rule.style.setProperty(property,value.replace(/env\(safe-area-inset-top(?:,\s*[^)]+)?\)/g,'47px'),priority);
        }
      }
      if(rule.cssRules)bind(rule.cssRules);
    }};
    for(const sheet of document.styleSheets){try{bind(sheet.cssRules);}catch{}}
    const header=document.querySelector('.player-workspace-header, [class*=AgencyOperatingWorkspace][class*=pageHead]');
    if(!header)throw new Error('The workspace header is missing');
    const controls=[...header.querySelectorAll('a,button')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
    const result={visible:header.getBoundingClientRect().height>0&&controls.length>=2,top:Math.min(...controls.map(n=>n.getBoundingClientRect().top)),backdrop:getComputedStyle(header).backdropFilter,background:getComputedStyle(header).backgroundImage};
    for(const [style,property,value,priority] of saved)style.setProperty(property,value,priority);
    return result;
  });
  if(!geometry.visible)issues.push('workspace identity/account controls are missing');
  if(geometry.background!=='none')issues.push('decorative header gradient remains');
  if(geometry.top<47)issues.push('logo/account controls overlap the 47px iPhone safe area: '+geometry.top);
  if(geometry.backdrop!=='none')issues.push('header blurs content: '+geometry.backdrop);
  assert.deepEqual(issues,[],suite+'/'+screen+' mobile chrome');
}
