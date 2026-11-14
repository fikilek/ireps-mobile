import test from 'node:test';
import assert from 'node:assert/strict';
import { object, string } from 'yup';
import { bulkInstructionSchema, BULK_CONTRACT } from './bulkInstructionPolicy.js';
const schema=object({assignment:object({instructionSelect:string().required()}),evidence:string().required()});
const action={instructionTrnId:'T1',origin:{trnBgo:{contractVersion:BULK_CONTRACT,batchId:'B1',rowId:'R1',sourceFileId:'S1'}}};
test('bulk capture removes the office instruction requirement while retaining evidence validation',async()=>{
 await bulkInstructionSchema(schema,action).validate({assignment:{},evidence:'photo'});
 await assert.rejects(bulkInstructionSchema(schema,action).validate({assignment:{}}),/evidence/);
 await assert.rejects(bulkInstructionSchema(schema,{}).validate({assignment:{},evidence:'photo'}),/instructionSelect/);
 await assert.rejects(bulkInstructionSchema(schema,{...action,instructionTrnId:null}).validate({assignment:{},evidence:'photo'}),/instructionSelect/);
});
