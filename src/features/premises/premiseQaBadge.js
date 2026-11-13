import { mdBgoPremiseQa } from "../bgoBatches/mdBgoQa.js";

const colours = {
  "QA FAIL": { backgroundColor: "#fef2f2", borderColor: "#fca5a5", color: "#b91c1c" },
  "QA PASS": { backgroundColor: "#f0fdf4", borderColor: "#86efac", color: "#15803d" },
  "QA PENDING": { backgroundColor: "#fffbeb", borderColor: "#fcd34d", color: "#92400e" },
  "QA NAv": { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1", color: "#64748b" },
};

export function getPremiseQaBadge(premise) {
  const label = mdBgoPremiseQa(premise);
  return { label, ...colours[label] };
}
