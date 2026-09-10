// Read-only structural validator for the SYNTHETIC chart-review suite.
// NOT A REAL PATIENT. Loads no model, writes nothing, reads only the two JSON
// files next to it. Run from anywhere:
//   node diagnostics/qvac-spike/chart-review/suite/validate-suite.mjs
// Checks the build-time invariants listed in SUITE-SCHEMA.md section 6.
// Exit code 0 = all invariants hold, 1 = at least one defect (each printed).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const dir=dirname(fileURLToPath(import.meta.url));
const bad=[]; const KINDS=['new','changed','unchanged','resolved','conflict','unknown'];
for(const [file,expected,split] of [['draft-v1.json',16,'held-out'],['dev-v1.json',4,'dev']]){
  const raw=readFileSync(`${dir}/${file}`,'utf8');
  let j; try{ j=JSON.parse(raw); }catch(e){ bad.push(`${file}: JSON.parse failed: ${e.message}`); continue; }
  console.log(`${file}: parsed OK, ${raw.length} bytes, cases=${j.cases.length}, split=${j.split}, frozen=${j.frozen}`);
  if(j.cases.length!==expected) bad.push(`${file}: expected ${expected} cases, got ${j.cases.length}`);
  if(/[^\x00-\x7F]/.test(raw)) bad.push(`${file}: non-ASCII byte in file`);
  const ids=new Set();
  for(const c of j.cases){
    if(ids.has(c.id)) bad.push(`${file}/${c.id}: duplicate id`); ids.add(c.id);
    if(c.split!==split) bad.push(`${file}/${c.id}: split is ${c.split}`);
    for(const k of ['id','split','category','categories','title','patient','current','historical','goldFindings','expectedClarifications','prohibited','abstentionExpected','question','notes'])
      if(!(k in c)) bad.push(`${file}/${c.id}: missing field ${k}`);
    const avail=['C1',...c.historical.filter(h=>!h.superseded).map((_,i)=>`H${i+1}`)];
    const enc=[c.current.encounterId,...c.historical.map(h=>h.encounterId)];
    if(new Set(enc).size!==enc.length) bad.push(`${file}/${c.id}: duplicate encounterId`);
    const rec=c.historical.map(h=>h.recordId);
    if(new Set(rec).size!==rec.length) bad.push(`${file}/${c.id}: duplicate recordId`);
    for(const t of [c.current.text,...c.historical.map(h=>h.text)]){
      if(!t.startsWith('SYNTHETIC OUTPATIENT NOTE - NOT A REAL PATIENT')) bad.push(`${file}/${c.id}: text header`);
      if(t.includes('\t')) bad.push(`${file}/${c.id}: tab in text`);
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(c.current.sourceDate)) bad.push(`${file}/${c.id}: bad current sourceDate`);
    let prev=null;
    for(const h of c.historical){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(h.sourceDate)) bad.push(`${file}/${c.id}: bad historical sourceDate ${h.sourceDate}`);
      if(prev&&h.sourceDate<prev) bad.push(`${file}/${c.id}: historical not oldest-first (${prev} then ${h.sourceDate})`);
      if(h.sourceDate>c.current.sourceDate) bad.push(`${file}/${c.id}: historical ${h.sourceDate} after current`);
      prev=h.sourceDate;
    }
    const fset=new Set();
    for(const f of c.goldFindings){
      if(fset.has(f.id)) bad.push(`${file}/${c.id}: dup finding id`); fset.add(f.id);
      if(!KINDS.includes(f.kind)) bad.push(`${file}/${c.id}/${f.id}: kind ${f.kind} not in union`);
      const low=f.statement.toLowerCase();
      for(const t of f.requiredTerms) if(!low.includes(t)) bad.push(`${file}/${c.id}/${f.id}: term "${t}" not in statement`);
      for(const e of f.permittedEvidenceIds) if(!avail.includes(e)) bad.push(`${file}/${c.id}/${f.id}: evidence ${e} unavailable`);
    }
    const forb=c.prohibited.flatMap(p=>p.forbiddenTerms);
    for(const f of c.goldFindings) for(const t of forb) if(f.statement.toLowerCase().includes(t)) bad.push(`${file}/${c.id}/${f.id}: forbidden "${t}" in gold statement`);
    for(const q of c.expectedClarifications){
      const low=q.exampleQuestion.toLowerCase();
      for(const t of q.requiredTerms) if(!low.includes(t)) bad.push(`${file}/${c.id}/${q.id}: term "${t}" not in exampleQuestion`);
      for(const t of forb) if(low.includes(t)) bad.push(`${file}/${c.id}/${q.id}: forbidden "${t}" in exampleQuestion`);
    }
    if(c.abstentionExpected&&!c.question) bad.push(`${file}/${c.id}: abstention without question`);
  }
}
console.log(bad.length?`FAIL (${bad.length})`:'PASS: all invariants hold');
for(const b of bad) console.log('  '+b);
process.exit(bad.length?1:0);
