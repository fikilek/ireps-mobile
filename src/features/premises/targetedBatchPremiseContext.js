export const TARGETED_BATCH_SOURCE_MODULE = "SALES_TARGETED_BATCH";
export const TARGETED_BATCH_OPERATION_TYPE = "METER_DISCOVERY";

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

export function normalizeTargetedBatchContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const sourceModule = String(value?.sourceModule || "")
    .trim()
    .toUpperCase();
  if (sourceModule !== TARGETED_BATCH_SOURCE_MODULE) return null;

  const rowNo = Number(value?.rowNo);
  const sourceAddress =
    value?.sourceAddress && typeof value.sourceAddress === "object"
      ? {
          addressLine1: cleanText(value.sourceAddress.addressLine1),
          town: cleanText(value.sourceAddress.town),
        }
      : { addressLine1: null, town: null };

  return {
    sourceModule: TARGETED_BATCH_SOURCE_MODULE,
    operationType:
      String(value?.operationType || TARGETED_BATCH_OPERATION_TYPE)
        .trim()
        .toUpperCase() || TARGETED_BATCH_OPERATION_TYPE,
    tbId: cleanText(value?.tbId),
    rowId: cleanText(value?.rowId),
    rowNo: Number.isInteger(rowNo) && rowNo > 0 ? rowNo : null,
    salesDocId: cleanText(value?.salesDocId),
    erfId: cleanText(value?.erfId),
    premiseId: cleanText(value?.premiseId),
    targetedMeterNo: firstText(value?.targetedMeterNo, value?.meterNo),
    meterNo: firstText(value?.targetedMeterNo, value?.meterNo),
    returnTo: cleanText(value?.returnTo),
    accountNumber: cleanText(value?.accountNumber),
    customerName: cleanText(value?.customerName),
    sourceAddress,
  };
}

export function getMissingTargetedBatchContextFields(context) {
  if (!context) {
    return ["sourceModule", "tbId", "rowId", "salesDocId", "erfId"];
  }

  const missing = ["tbId", "rowId", "salesDocId", "erfId"].filter(
    (field) => !cleanText(context?.[field]),
  );
  if (context.sourceModule !== TARGETED_BATCH_SOURCE_MODULE) {
    missing.unshift("sourceModule");
  }
  return missing;
}

export function buildTargetedBatchContextFromRow({ row = {}, bucket = {} }) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};

  return normalizeTargetedBatchContext({
    sourceModule: TARGETED_BATCH_SOURCE_MODULE,
    operationType: TARGETED_BATCH_OPERATION_TYPE,
    tbId: firstText(bucket?.id, row?.tbId, raw?.tbId),
    rowId: firstText(row?.id, raw?.id),
    rowNo: row?.rowNo ?? raw?.rowNo,
    salesDocId: firstText(row?.salesDocId, raw?.salesAllMeterId),
    erfId: firstText(row?.erfId, raw?.refs?.erfId),
    premiseId: firstText(row?.refs?.premiseId, raw?.refs?.premiseId),
    targetedMeterNo: firstText(
      row?.meterNo,
      raw?.meter?.numberRaw,
      raw?.meter?.numberNormalized,
    ),
    accountNumber: firstText(
      row?.accountNumber,
      raw?.customer?.accountNumber,
    ),
    customerName: firstText(
      row?.customerName,
      raw?.customer?.customerName,
    ),
    sourceAddress: {
      addressLine1: cleanText(raw?.location?.addressLine1),
      town: cleanText(raw?.location?.town),
    },
    returnTo: "/(tabs)/admin/operations/my-workorders",
  });
}

export function serializeTargetedBatchContext(context) {
  const normalized = normalizeTargetedBatchContext(context);
  if (!normalized) return null;

  const {
    sourceModule,
    operationType,
    tbId,
    rowId,
    rowNo,
    salesDocId,
    erfId,
    premiseId,
    targetedMeterNo,
    returnTo,
    sourceAddress,
  } = normalized;

  return JSON.stringify({
    sourceModule,
    operationType,
    tbId,
    rowId,
    rowNo,
    salesDocId,
    erfId,
    premiseId,
    targetedMeterNo,
    sourceAddress,
    returnTo,
  });
}

export function parseTargetedBatchContextRouteParam(value) {
  const routeValue = Array.isArray(value) ? value[0] : value;
  if (typeof routeValue !== "string" || !routeValue.trim()) return null;

  try {
    return normalizeTargetedBatchContext(JSON.parse(routeValue));
  } catch {
    return null;
  }
}

export function parseTargetedBatchAddress(sourceAddress = {}) {
  const addressLine1 = cleanText(sourceAddress?.addressLine1) || "";
  const town = cleanText(sourceAddress?.town) || "";
  const match = addressLine1.match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/);

  return {
    strNo: match?.[1] || "",
    strName: match?.[2]?.trim() || addressLine1,
    suburbName: town,
    strType: "Select...",
  };
}
