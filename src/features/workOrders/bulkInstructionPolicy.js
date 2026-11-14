import { mixed } from "yup";
export const BULK_CONTRACT = "TRN_BGO_11COL_REASON_FREE_V1";
export function isBulkInstruction(action) {
 const link=action?.origin?.trnBgo;
 return Boolean(action?.instructionTrnId && link?.contractVersion===BULK_CONTRACT && link.batchId && link.rowId && link.sourceFileId);
}
// Client presentation only. The server independently verifies stored origin/membership.
export function bulkInstructionSchema(schema,action) {
 if(!isBulkInstruction(action)||!schema.fields?.assignment?.shape)return schema;
 return schema.shape({assignment:schema.fields.assignment.shape({instructionSelect:mixed().notRequired()})});
}
