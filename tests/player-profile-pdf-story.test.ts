import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {transpileModule, ModuleKind, JsxEmit} from 'typescript';
import {cloneElement} from 'react';
import {pdf} from '@react-pdf/renderer';

// Run the actual export component, including React PDF's page layout engine.
async function withDocument(run: (build: (args: any) => any) => Promise<void>) {
  const dir = mkdtempSync(resolve('node_modules/.profile-pdf-test-'));
  try {
    const source = readFileSync('components/ClubCvPdf.tsx', 'utf8')
      .replaceAll("'@/lib/dossier'", JSON.stringify(pathToFileURL(resolve('lib/dossier.ts')).href))
      .replaceAll("'@/lib/research-links'", JSON.stringify(pathToFileURL(resolve('lib/research-links.ts')).href));
    writeFileSync(dir + '/component.mjs', transpileModule(source, {compilerOptions: {module: ModuleKind.ESNext, jsx: JsxEmit.ReactJSX}}).outputText);
    const {ClubCvPdfDocument} = await import(pathToFileURL(dir + '/component.mjs').href);
    await run(ClubCvPdfDocument);
  } finally {rmSync(dir, {recursive: true, force: true});}
}
const collect = (node: any): string => typeof node === 'string' ? node :
  Array.isArray(node) ? node.map(collect).join('') : collect(node?.props?.children || []);

const overview = 'Opening paragraph.\n\n' + 'A left footed defender who builds play and creates space for team mates. '.repeat(14) + '\n\nFINAL OVERVIEW PARAGRAPH.';
const summary = 'Career context.\n\n' + 'First team experience recorded across successive seasons. '.repeat(15) + '\n\nFINAL CAREER PARAGRAPH.';
const base = {display_name: 'Example Player', primary_position: 'Left back', preferred_foot: 'Left', current_club: 'Example FC', age_display: '26', nationalities: ['New Zealand'], key_stats: [{label: 'Apps', value: '24'}], career_timeline: [{season: '2026', club_name: 'Example FC', appearances: 24}], why_review: overview, career_summary: summary};

test('PDF includes every overview and career paragraph instead of silently shortening them', async () => {
  await withDocument(async build => {
    const text = collect(build({profile: base, agency: {display_name: 'Example Agency'}}));
    assert.ok(text.includes(overview), 'The full overview, including its final paragraph, reaches the PDF');
    assert.ok(text.includes(summary), 'The full career summary reaches the PDF');
  });
});

test('long legacy stories paginate inside the PDF content area without overlapping the footer', async () => {
  await withDocument(async build => {
    let layout: any;
    const document = cloneElement(build({profile: {...base, why_review: overview.repeat(5), career_summary: summary.repeat(3)}, agency: {display_name: 'Example Agency'}}), {onRender: (result: any) => {layout = result._INTERNAL__LAYOUT__DATA_;}});
    const stream = await pdf(document).toBuffer();
    for await (const _chunk of stream) { /* Consume the generated PDF. */ }
    assert.ok(layout.children.length >= 3, 'Long records continue onto additional pages');
    let printed = '';
    for (const page of layout.children) {
      const walk = (node: any, top: number, fixed = false) => {
        fixed ||= node.props?.fixed === true;
        const y = top + (node.box?.top || 0);
        if (node.type === 'TEXT' && node.lines?.length) {
          printed += node.lines.map((line: any) => line.string || '').join('');
          if (!fixed) {
            assert.ok(y + node.box.height <= page.box.height - 38 + 1, `Story text stays above the reserved footer area: ${y + node.box.height}, ${node.lines[0]?.string}`);
          }
        }
        for (const child of node.children || []) walk(child, y, fixed);
      };
      walk(page, 0);
    }
    assert.equal(printed.split('FINAL OVERVIEW PARAGRAPH.').length - 1, 5, 'All overview endings are printed');
    assert.equal(printed.split('FINAL CAREER PARAGRAPH.').length - 1, 3, 'All summary endings are printed');
  });
});


test('hidden narratives stay out of PDF exports', async () => {
  await withDocument(async build => {
    const text = collect(build({profile: {...base, hidden_sections: ['why_review', 'summary']}}));
    assert.ok(!text.includes('FINAL OVERVIEW PARAGRAPH.'));
    assert.ok(!text.includes('FINAL CAREER PARAGRAPH.'));
  });
});

test('a standalone career summary is exported even without supporting records', async () => {
  await withDocument(async build => {
    const text = collect(build({profile: {display_name: 'Example Player', career_summary: summary, hidden_sections: ['why_review']}}));
    assert.ok(text.includes(summary));
  });
});

test('career heading has deliberate space after the performance chart in the rendered PDF',async()=>{
 await withDocument(async build=>{
  let layout:any;
  const document=cloneElement(build({profile:{...base,why_review:'Recorded fixture facts.',career_summary:'Career overview.',career_timeline:[{season:'2026',club_name:'Example FC',appearances:24,minutes:1800},{season:'2025',club_name:'Example United',appearances:20,minutes:1600,goals:1}]},agency:{display_name:'Example Agency'}}),{onRender:(result:any)=>{layout=result._INTERNAL__LAYOUT__DATA_;}});
  const stream=await pdf(document).toBuffer();for await(const _chunk of stream){}
  const texts:Array<{text:string;y:number;bottom:number}>=[];
  for(const page of layout.children){
   const walk=(node:any,top:number)=>{const y=top+(node.box?.top||0);if(node.type==='TEXT'&&node.lines?.length)texts.push({text:node.lines.map((line:any)=>line.string||'').join(''),y,bottom:y+node.box.height});for(const child of node.children||[])walk(child,y);};walk(page,0);
  }
  assert.ok(texts.some(x=>/\b1 goal\b/.test(x.text)),'Singular career statistics read correctly in the actual export');
  assert.ok(!texts.some(x=>/\b1 goals\b/.test(x.text)));
  const heading=texts.find(x=>x.text==='CAREER RECORD'),chartValue=texts.find(x=>/1,600\s*mins/.test(x.text));
  assert.ok(heading&&chartValue,'Actual rendered career and performance sections are present');
  assert.ok(heading.y-chartValue.bottom>=24,'The career heading is separated from the performance chart rather than touching its edge');
 });
});


test('PDF shows the approved contract expiry and avoids a duplicate identity headline', async () => {
  await withDocument(async build => {
    const document = build({profile: {...base, headline: 'Left back · Example FC', contract_expiry: '2027-06-30', current_status: 'under_contract'}});
    const text = collect(document);
    const hero = collect(document.props.children[0].props.children[0]);
    assert.ok(text.includes('Contract until 30 Jun 2027'));
    assert.ok(text.includes('Under Contract'));
    assert.equal(hero.split('Left back · Example FC').length - 1, 1);
    for (const expiry of [null, undefined, '2027-02-29']) {
      assert.ok(!collect(build({profile: {...base, contract_expiry: expiry}})).includes('Contract until'));
    }
  });
});
