export const SALES_TB_NA_FORM_TYPE = "SALES_TARGETED_BATCH_NO_ACCESS";
export const SALES_TB_SOURCE_MODULE = "SALES_TARGETED_BATCH";
export const SALES_TB_RETURN_ROUTE = "/(tabs)/admin/operations/my-workorders";

const clean = (value) => String(value ?? "").trim();

export function buildTargetedBatchNoAccessContext({ bucket = {}, row = {} } = {}) {
  const context = {
    sourceModule: SALES_TB_SOURCE_MODULE,
    tbId: clean(bucket.id || row.tbId),
    rowId: clean(row.id),
    salesDocId: clean(row.salesDocId || row.salesAllMeterId || row?.source?.recordId),
    erfId: clean(row?.refs?.erfId || row.erfId),
    premiseId: clean(row?.refs?.premiseId) || null,
    targetedMeterNo: clean(row.meterNo),
    erfNo: clean(row.erfNo),
    wardPcode: clean(row?.scope?.wardPcode || bucket?.scope?.wardPcode),
    lmPcode: clean(row?.scope?.lmPcode || bucket?.scope?.lmPcode),
    noAccessCount: Number.isFinite(Number(row.noAccessCount)) ? Number(row.noAccessCount) : 0,
    returnTo: SALES_TB_RETURN_ROUTE,
  };
  for (const field of ["tbId", "rowId", "salesDocId", "erfId", "wardPcode", "lmPcode"]) {
    if (!context[field]) throw new Error(`${field} is required.`);
  }
  return context;
}

export function buildTargetedBatchNoAccessTrnId({ now = Date.now(), random = Math.random() } = {}) {
  return `TRN_MDIS_${now}_NA_${Math.floor(random * 0xffffff).toString(36).toUpperCase().padStart(5, "0")}`;
}

export function validateTargetedBatchNoAccessPayload(payload = {}) {
  const errors = {};
  for (const field of ["trnId", "tbId", "rowId", "salesDocId", "erfId", "capturedAt"]) {
    if (!clean(payload[field])) errors[field] = `${field} is required.`;
  }
  if (!clean(payload.reason)) errors.reason = "No Access reason is required.";
  if (!(payload.media || []).some((item) => item?.tag === "noAccessPhoto" && clean(item?.uri || item?.url))) {
    errors.media = "A No Access photograph is required.";
  }
  const gps = payload?.location?.gps || payload?.location;
  const lat = Number(gps?.lat);
  const lng = Number(gps?.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.location = "A valid GPS location is required.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function buildTargetedBatchNoAccessPayload({ context, trnId, capturedAt, reason, media, location }) {
  return {
    trnId,
    sourceModule: SALES_TB_SOURCE_MODULE,
    tbId: context.tbId,
    rowId: context.rowId,
    salesDocId: context.salesDocId,
    erfId: context.erfId,
    premiseId: context.premiseId || null,
    capturedAt,
    reason: clean(reason),
    media,
    location,
  };
}
