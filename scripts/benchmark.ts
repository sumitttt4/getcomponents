import fs from 'node:fs/promises';
import { extractCatalogue } from '../src/lib/extractor';
import { exportReact } from '../src/lib/export';
import ts from 'typescript';

const sites = [
  { category:'Utility-CSS marketing page', url:'https://tailwindcss.com/' },
  { category:'CSS-in-JS dashboard', url:'https://mui.com/material-ui/getting-started/templates/dashboard/' },
  { category:'Design-system docs', url:'https://kumo-ui.com/components/button/' },
];
async function main() {
  const results = [];
  for (const site of sites) {
    console.log(`Testing ${site.category}: ${site.url}`);
    try {
      const result = await extractCatalogue(site.url,(stage,p)=>console.log(`  ${p}% ${stage}`));
      const differences = result.components.flatMap(c=>c.snapshots.filter(s=>s.state==='default').map(s=>s.pixelDifference)).filter((d):d is number=>d!==null);
      const compileFailures = result.components.filter(c=>ts.transpileModule(exportReact(c),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}).diagnostics?.length).length;
      results.push({...site,status:'completed',groups:result.components.length,styles:new Set(result.components.flatMap(c=>c.snapshots.map(s=>`${c.id}/${s.variant}`))).size,scanned:result.scanned,variantCoverage:{hover:result.components.filter(c=>c.snapshots.some(s=>s.state==='hover')).length,focus:result.components.filter(c=>c.snapshots.some(s=>s.state==='focus')).length},visualDiff:differences.length?{comparisons:differences.length,meanPercent:differences.reduce((a,b)=>a+b,0)/differences.length}:null,standaloneCompileFailures:compileFailures,componentsMissed:'Not assessed: requires a manual source inventory.',duplicates:'Not assessed: requires manual review of semantic boundaries.',wrongBoundaries:'Not assessed: requires manual source comparison.',warnings:result.warnings});
      await fs.mkdir('test-results',{recursive:true});
      await fs.writeFile(`test-results/${new URL(site.url).hostname}.json`,JSON.stringify(result,null,2));
    } catch(error) { results.push({...site,status:'failed',error:(error as Error).message,componentsMissed:'Unknown — source could not be inspected.',duplicates:'Not measured',wrongBoundaries:'Not measured',variantCoverage:'Not measured',visualDiff:null,standaloneCompileFailures:null}); }
  }
  await fs.writeFile('BENCHMARK.json',JSON.stringify({runAt:new Date().toISOString(),results},null,2));
  console.log(JSON.stringify(results,null,2));
  if (results.some(result => result.status === 'failed')) process.exitCode = 1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
