import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tradeMatrix,tradeRobustness,captureInvestigation,validateInvestigation,compareTradeSelections} from '../investigation-model.mjs';
import {createTradeWorkspace} from '../trade-workspace-model.mjs';
import {initialSelection} from '../workspace-contract.mjs';
import {summarizeEnergyFlows} from '../energy-flow-model.mjs';
const read=name=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const economy=read('economy'),flows=read('energy-flows'),fiscal=read('provincial-impacts');
test('matrix retains direction, zero, missing and selection boundaries',()=>{
 const summary=summarizeEnergyFlows(flows,{commodity:'electricity',regions:['AB','BC'],linkScope:'between'}),m=tradeMatrix(summary);
 assert.equal(m.length,13);assert.equal(m.flatMap(r=>r.cells).length,169);
 assert.equal(m.find(r=>r.origin==='AB').cells.find(c=>c.destination==='BC').value,60.209);
 assert.equal(m.find(r=>r.origin==='BC').cells.find(c=>c.destination==='AB').value,420.803);
 assert.equal(m[0].cells[0].status,'same-region');assert.equal(m[0].cells[1].status,'outside-selection');
 const synthetic=tradeMatrix({links:[{origin:'AB',destination:'BC',value:0,status:'available'},{origin:'BC',destination:'AB',value:null,status:'suppressed'}]});
 assert.equal(synthetic.find(r=>r.origin==='AB').cells.find(c=>c.destination==='BC').value,0);
 assert.equal(synthetic.find(r=>r.origin==='BC').cells.find(c=>c.destination==='AB').status,'suppressed');
});
test('reference-year robustness preserves scope and cancellation at every year',()=>{
 const result=tradeRobustness(flows,{tradeCommodity:'electricity',priceShock:-10});
 for(const year of result.years){const records=result.rows.map(r=>r.years.find(y=>y.year===year));assert.ok(Math.abs(records.reduce((s,r)=>s+r.netChange,0))<1e-6);}
 const zero=tradeRobustness(flows,{regions:['AB'],priceShock:0});assert.ok(zero.rows[0].years.every(r=>r.netChange===0));
});
test('saved investigation is pinned, roundtrips, rejects incomplete or invalid controls',()=>{
 const workspace=createTradeWorkspace({economy,flows,fiscal,regions:['AB']});const selection={...initialSelection(workspace),priceShock:-10};
 const captured=captureInvestigation({workspace,selection,question:'Oil trade'}),restored=validateInvestigation(JSON.parse(JSON.stringify(captured)));
 assert.deepEqual(restored.selection,selection);assert.notEqual(captured.workspace,workspace);assert.equal(restored.workspace.tradeSnapshot.dataVersion,flows.dataVersion);
 const bad=structuredClone(captured);bad.selection.tradeYear=1900;assert.throws(()=>validateInvestigation(bad));
 const missing=structuredClone(captured);delete missing.workspace.economySnapshot;assert.throws(()=>validateInvestigation(missing));
 const compared=compareTradeSelections(workspace,selection,{...selection,priceShock:10});assert.equal(compared.rows[0].left,-compared.rows[0].right);
});
