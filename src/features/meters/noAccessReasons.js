export const NO_ACCESS_REASONS = Object.freeze([
  "Property Locked",
  "Access Refused by Occupant",
  "Unsafe / Dangerous Environment",
  "Meter Box Inaccessible",
  "Meter Obstructed",
  "Property Demolished",
  "Property Vacant",
  "Other",
]);

export function isCompleteNoAccessReason(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const code = String(value?.code || value?.label || "").trim();

    if (!code) return false;
    if (code.toUpperCase() !== "OTHER") return true;

    return Boolean(String(value?.otherText || "").trim());
  }

  const text = String(value || "").trim();

  if (!text) return false;
  if (/^other(?:\s*:)?\s*$/i.test(text)) return false;

  return true;
}
