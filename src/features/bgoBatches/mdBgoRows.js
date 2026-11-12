import { readErfCentroid } from "../targetedBatches/targetedBatchMapPoints.js";
import { mdBgoTrnId, mdBgoPremiseQa, mdBgoMeterQa } from "./mdBgoQa.js";

const text = (v) => String(v ?? "").trim();
export function parseMdBgoContext(raw) {
  if (!raw) return null;
  let value = raw;
  if (typeof raw === "string" || Array.isArray(raw)) {
    try { value = JSON.parse(Array.isArray(raw) ? raw[0] : raw); } catch { throw new Error("Invalid MD BGO capture context."); }
  }
  for (const key of ["batchId", "rowId", "erfId"]) {
    if (!text(value?.[key]) || text(value[key]).includes("/")) throw new Error(`MD BGO ${key} is missing or invalid.`);
  }
  if (value.batchMode !== "BMD") throw new Error("Invalid MD BGO batch mode.");
  return { ...value, returnTo: "/(tabs)/admin/operations/my-workorders" };
}

export function buildMdBgoCaptureContext(bucket, row) {
  return parseMdBgoContext({ batchId: bucket.id, rowId: row.id, erfId: row.erfId || row.erf?.id,
    premiseId: row.refs?.premiseId || null, batchMode: "BMD" });
}

export function carryMdBgoContext(erf, context) {
  if (!erf) return erf;
  const { bmdContext: _old, ...plain } = erf;
  return context?.batchMode === "BMD" && context.erfId === erf.id ? { ...plain, bmdContext: context } : plain;
}

// Same-ERF navigation must not drop the batch before a flat is duplicated.
export function preserveMdBgoErfSelection(previousErf, nextErf) {
  if (!nextErf || Object.prototype.hasOwnProperty.call(nextErf, "bmdContext")) return nextErf;
  return carryMdBgoContext(nextErf, previousErf?.bmdContext);
}

export function buildMdBgoMobileRows({ rows = [], premises = [], meters = [], trns = [], erfs = [], geoLibrary = {}, qaReady = true }) {
  const premiseById = new Map(premises.map((p) => [p.id, p]));
  const meterById = new Map(meters.map((m) => [m.id, m]));
  const erfById = new Map(erfs.map((e) => [e.id, e]));
  const trnById = new Map(trns.map(t => [t.id, t]));
  return rows.filter((r) => r.workflow?.state !== "CANCELLED").map((row) => {
    const premise = premiseById.get(row.refs?.premiseId);
    const meter = meterById.get(row.refs?.meterId);
    const trn = trnById.get(mdBgoTrnId(row));
    const premiseStatus = qaReady ? mdBgoPremiseQa(premise) : "QA NAv";
    const meterStatus = qaReady ? mdBgoMeterQa(trn) : "QA NAv";
    const erfId = row.erf?.id;
    const erf = erfById.get(erfId);
    const address = premise?.premiseAddress || [premise?.address?.strNo, premise?.address?.strName, premise?.address?.strType].filter(Boolean).join(" ") || row.erf?.address || "NAv";
    const addressLine = [address, premise?.propertyType?.name, premise?.propertyType?.unitNo].filter(Boolean).join(" • ");
    const state = row.workflow?.state;
    const fieldPosition = readErfCentroid(meter?.ast?.location?.gps) || readErfCentroid(meter?.ast?.location) || readErfCentroid(premise?.geometry);
    const position = fieldPosition ||
      readErfCentroid(geoLibrary[erfId]) || readErfCentroid(erf?.centroid) || readErfCentroid(erf?.geometry) || readErfCentroid(row.erf?.centroid);
    return {
      ...row, raw: row, sourceModule: "BULK_METER_DISCOVERY", erfId,
      erfNo: row.erf?.erfNo || erf?.erfNo || "NAv", refs: { ...row.refs, erfId },
      premise: premise ? { ...premise, qaStatus: premiseStatus } : null,
      fieldMeter: meter ? { ...meter, qaStatus: meterStatus } : null,
      qaReady, qa: { premiseStatus, meterStatus }, trn: trn || null,
      meterNo: row.meter?.meterNo || meter?.ast?.astData?.astNo || "NAv",
      address, addressLine, propertyName: premise?.propertyType?.name || "",
      displayStatus: state === "COMPLETED" ? "COMPLETED" : state === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED",
      executionStatus: state === "COMPLETED" ? "COMPLETED" : state === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED",
      noAccessCount: row.noAccessCount ?? row.refs?.noAccessTrnIds?.length ?? 0,
      latestActivityAt: row.metadata?.updatedAt || row.metadata?.createdAt || null,
      lastWorkedAt: state === "IN_PROGRESS" || state === "COMPLETED" ? Date.parse(row.metadata?.updatedAt) || 0 : 0,
      mapPosition: position,
      mapSource: fieldPosition ? "GPS" : "ERF",
    };
  });
}

// Same map grouping/status semantics as TB; locations are actual field/ERF data.
export function buildMdBgoMapPoints(rows = []) {
  const byPoint = new Map(), unplaced = [];
  for (const row of rows) {
    const p = row.mapPosition;
    if (!p) { unplaced.push(row); continue; }
    const key = `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
    if (!byPoint.has(key)) byPoint.set(key, { ...p, key, source: row.mapSource || "ERF", rows: [], statusCounts: { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0 } });
    const group = byPoint.get(key); group.rows.push(row); group.statusCounts[row.displayStatus]++;
  }
  const groups = [...byPoint.values()].map((g) => ({ ...g, status: g.statusCounts.NOT_STARTED ? "NOT_STARTED" : g.statusCounts.IN_PROGRESS ? "IN_PROGRESS" : "COMPLETED" }));
  return { groups, unplaced, coordinates: groups.map(({ latitude, longitude }) => ({ latitude, longitude })) };
}
