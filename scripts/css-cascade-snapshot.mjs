import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';

// Optional before/after evidence for CSS pruning. Capture the rendered cascade,
// including pseudo elements, rather than testing how the stylesheet is written.
export async function captureCascade(page){
 await page.evaluate(()=>document.fonts.ready);
 return page.evaluate(()=>{
  const props=['display','position','top','right','bottom','left','width','height','min-width','min-height','max-width','max-height','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','gap','grid-template-columns','flex-direction','align-items','justify-content','color','background-color','background-image','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','font-family','font-size','font-weight','line-height','letter-spacing','white-space','overflow-x','overflow-y','opacity','backdrop-filter','-webkit-backdrop-filter'];
  const pseudoProps=['content','display','width','height','background-color','background-image','border-radius','box-shadow'];
  const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
  const path=node=>{const parts=[];while(node&&node!==document.body){parts.unshift(node.localName+':'+[...node.parentElement.children].indexOf(node));node=node.parentElement;}return parts.join('/');};
  return [...document.body.querySelectorAll('main,section,header,nav,aside,footer,article,div,p,span,small,label,h1,h2,h3,h4,a,button,input,select,textarea,summary,svg')].filter(visible).map(node=>{
   const css=getComputedStyle(node);return [path(node),props.map(prop=>css.getPropertyValue(prop)),['::before','::after'].map(pseudo=>{const css=getComputedStyle(node,pseudo);return pseudoProps.map(prop=>css.getPropertyValue(prop));})];
  });
 });
}
export async function finishCascade(snapshots){
 if(process.env.CSS_CASCADE_SNAPSHOT)await writeFile(process.env.CSS_CASCADE_SNAPSHOT,JSON.stringify(snapshots));
 if(!process.env.CSS_CASCADE_COMPARE)return;
 const before=JSON.parse(await readFile(process.env.CSS_CASCADE_COMPARE,'utf8')),changes=[];
 for(const [screen,after] of Object.entries(snapshots)){
  if(!before[screen]){changes.push(screen+': missing baseline');continue;}
  try{assert.deepEqual(after,before[screen]);}catch{
   const previous=new Map(before[screen].map(row=>[row[0],row]));
   for(const row of after){try{assert.deepEqual(row,previous.get(row[0]));}catch{changes.push({screen,path:row[0],before:previous.get(row[0])?.slice(1),after:row.slice(1)});}}
   if(after.length!==before[screen].length)changes.push(screen+': visible element count changed');
  }
 }
 assert.equal(changes.length,0,'CSS pruning changed the rendered cascade: '+JSON.stringify(changes.slice(0,8)));
 console.log('CSS cascade unchanged across '+Object.keys(snapshots).length+' page/viewport combinations');
}
