// Current component outcomes determine final QA immediately.
export const MD_BGO_QA_NAV = "QA NAv";
const norm = value => String(value || "").trim().toUpperCase().replace(/_/g, " ");

export function mdBgoTrnId(row = {}) {
  return String(row.refs?.trnId || row.meter?.trnId || row.refs?.meterId || "").trim();
}

export function mdBgoPremiseQa(premise) {
  const status = norm(premise?.qa?.status);
  return ["QA PASS", "QA FAIL", "QA PENDING"].includes(status) ? status : MD_BGO_QA_NAV;
}

export function mdBgoMeterQa(trn) {
  // Same lifecycle authority as the web TRN Registry; never the AST's QA copy.
  const state = norm(trn?.workflow?.state);
  return state === "COMPLETED" ? "QA PENDING" : ["QA PASS", "QA FAIL"].includes(state) ? state : MD_BGO_QA_NAV;
}

export function calculateMdBgoQaFinal(row = {}) {
  if (row.qaReady === false) return MD_BGO_QA_NAV;
  const p = norm(row.qa?.premiseStatus), m = norm(row.qa?.meterStatus);
  if (p === "QA FAIL" || m === "QA FAIL") return "QA FAIL";
  if (p === "QA PASS" && m === "QA PASS") return "QA PASS";
  if ([p, m].every(value => ["QA PASS", "QA PENDING"].includes(value))) return "QA PENDING";
  return MD_BGO_QA_NAV;
}
