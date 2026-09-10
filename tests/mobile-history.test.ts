import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { buildMobileHistorySnapshot, MAX_HISTORY_BYTES } from '../packages/core/mobile-history.js';
import type { VaultState, ApprovedRecord } from '../packages/core/types.js';

function fixture() {
  const patientId = randomUUID(), otherPatientId = randomUUID(), encounterId = randomUUID(), deviceId = randomUUID(), token = 'synthetic-phone-token';
  const state: VaultState = {
    version: 1, patients: [{id:patientId,alias:'Synthetic patient A',createdAt:new Date().toISOString()},{id:otherPatientId,alias:'Synthetic patient B',createdAt:new Date().toISOString()}],
    encounters: [], records: [], devices: [{id:deviceId,name:'Synthetic phone',tokenHash:createHash('sha256').update(token).digest('hex'),createdAt:new Date().toISOString(),revoked:false,encounterId,historyEnabled:true}],
    transfers: [], runs: [],
  };
  function record(patient: string=patientId, id: string=randomUUID(), text='Printed synthetic note: sleep review.') {
    const eid = state.encounters.length === 0 ? encounterId : randomUUID();
    state.encounters.push({id:eid,patientId:patient,createdAt:'2026-09-09T00:00:00Z',capture:null,source:{revision:1,text,reviewed:true},draft:null,status:'approved'});
    const value: ApprovedRecord = {id,patientId:patient,encounterId:eid,sourceRevision:1,sourceText:text,text,draftId:randomUUID(),modelDraftText:'excluded',clinicianEdited:false,approvedAt:'2026-09-09T00:00:00Z',supersededAt:null,context:[],draftingMetrics:{testDouble:true}};
    state.records.push(value); return value;
  }
  record();
  return {state,input:{deviceId,token,encounterId},patientId,otherPatientId,record};
}
test('export uses authoritative patient and only current approved revisions', () => {
  const f=fixture(); const second=f.record(); f.record(f.otherPatientId); const old=f.record(); old.supersededAt='2026-09-10T00:00:00Z';
  const result=buildMobileHistorySnapshot(f.state,f.input);
  assert.equal(result.patient.id,f.patientId); assert.equal(result.records.length,2);
  assert.ok(result.records.some(r=>r.id===second.id));
  assert.deepEqual(Object.keys(result.records[0]).sort(),['id','patientId','encounterId','sourceRevision','approvedAt','text','sourceText'].sort());
  assert.ok(!JSON.stringify(result).includes('tokenHash')); assert.ok(!JSON.stringify(result).includes('draftingMetrics'));
});
test('old capture grants, revocations, wrong token and cross-encounter reads fail', () => {
  for(const change of [
    (f:ReturnType<typeof fixture>)=>delete f.state.devices[0].historyEnabled,
    (f:ReturnType<typeof fixture>)=>{f.state.devices[0].revoked=true;},
    (f:ReturnType<typeof fixture>)=>{f.input.token='wrong-token';},
    (f:ReturnType<typeof fixture>)=>{f.input.encounterId=randomUUID();},
  ]) {const f=fixture();change(f);assert.throws(()=>buildMobileHistorySnapshot(f.state,f.input));}
});
test('invalid identities and corrupted stored token digests fail closed', () => {
  const f=fixture(); assert.throws(()=>buildMobileHistorySnapshot(f.state,{...f.input,deviceId:'../../patient'}));
  f.state.devices[0].tokenHash='short';assert.throws(()=>buildMobileHistorySnapshot(f.state,f.input),/not authorized/);
});
test('changed or unreviewed encounter source excludes old approval', () => {
  for(const changed of [true,false]) {const f=fixture();if(changed)f.state.encounters[0].source.revision=2;else f.state.encounters[0].source.reviewed=false;
    assert.equal(buildMobileHistorySnapshot(f.state,f.input).records.length,0);}
});
test('snapshots replace obsolete records rather than merging cached history', () => {
  const f=fixture(); const before=buildMobileHistorySnapshot(f.state,f.input);
  f.state.records[0].supersededAt='2026-09-10T00:00:00Z';
  const after=buildMobileHistorySnapshot(f.state,f.input);
  assert.notEqual(before.snapshotId,after.snapshotId);assert.equal(after.records.length,0);assert.equal(after.coverage.partial,false);
});
test('record limit and byte limit disclose omissions and never clip full records', () => {
  const f=fixture(); for(let i=0;i<65;i++)f.record(f.patientId,randomUUID(),'漢'.repeat(30000));
  const result=buildMobileHistorySnapshot(f.state,f.input);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<MAX_HISTORY_BYTES-29);
  assert.ok(result.records.length<=50);assert.equal(result.coverage.totalRecords,66);assert.equal(result.coverage.partial,true);
  assert.ok(result.records.every(r=>r.text===f.state.records.find(x=>x.id===r.id)?.text));
});
test('duplicates, overlong text and malformed dates are omitted with partial coverage', () => {
  const f=fixture();f.record(f.patientId,f.state.records[0].id);f.record(f.patientId,randomUUID(),'x'.repeat(30001));f.record().approvedAt='not-date';
  const result=buildMobileHistorySnapshot(f.state,f.input);
  assert.equal(result.records.length,1);assert.equal(result.coverage.totalRecords,4);assert.equal(result.coverage.partial,true);
});
test('snapshot is detached from mutable record and patient objects', () => {
  const f=fixture();const result=buildMobileHistorySnapshot(f.state,f.input);
  f.state.records[0].text='changed';f.state.patients[0].alias='changed';
  assert.notEqual(result.records[0].text,'changed');assert.equal(result.patient.alias,'Synthetic patient A');
});
