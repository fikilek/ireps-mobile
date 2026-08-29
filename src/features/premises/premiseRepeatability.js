export const REPEATABLE_PROPERTY_TYPES = Object.freeze([
  "Flats",
  "Townhouse Complex",
  "Sectional Title",
  "Backroom",
  "Commercial",
  "Industrial",
  "Estate",
]);

const REPEATABLE_TYPE_SET = new Set(REPEATABLE_PROPERTY_TYPES);
const SHARED_NAME_TYPE_SET = new Set([
  "Flats",
  "Townhouse Complex",
  "Sectional Title",
  "Backroom",
]);
const UNIT_NUMBER_SUPPORTED_TYPE_SET = new Set(REPEATABLE_PROPERTY_TYPES);
const UNIT_NUMBER_REQUIRED_TYPE_SET = new Set([
  "Flats",
  "Sectional Title",
  "Townhouse Complex",
  "Backroom",
]);

export const DUPLICATE_CAPTURE_STATUSES = Object.freeze([
  "Occupied",
  "Unoccupied",
  "Vandalised",
  "Under Construction",
  "Dilapidated",
]);

const DUPLICATE_CAPTURE_STATUS_SET = new Set(DUPLICATE_CAPTURE_STATUSES);

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isRepeatablePropertyType(type) {
  return REPEATABLE_TYPE_SET.has(type);
}

export function requiresPropertyName(type) {
  return (
    type !== "Select..." &&
    type !== "Residential" &&
    type !== "Vacant Land" &&
    trimmed(type).length > 0
  );
}

export function supportsUnitNo(type) {
  return UNIT_NUMBER_SUPPORTED_TYPE_SET.has(type);
}

export function isLegacyBackroomWithoutUnitNo({
  mode,
  originalType,
  originalUnitNo,
} = {}) {
  return (
    (mode === "EDIT" || mode === "QUEUE_EDIT") &&
    originalType === "Backroom" &&
    trimmed(originalUnitNo).length === 0
  );
}

export function requiresUnitNo(type, context = {}) {
  if (!UNIT_NUMBER_REQUIRED_TYPE_SET.has(type)) return false;

  if (
    type === "Backroom" &&
    isLegacyBackroomWithoutUnitNo(context)
  ) {
    return false;
  }

  return true;
}

export function getDefaultPropertyName(type) {
  return type === "Backroom" ? "Backroom" : "";
}

export function getRepeatabilityPolicy(type) {
  if (!isRepeatablePropertyType(type)) return null;

  return {
    type,
    nameBehavior: SHARED_NAME_TYPE_SET.has(type) ? "KEEP" : "CLEAR",
    unitNoBehavior: "CLEAR",
  };
}

export function getDuplicatePropertyTypeTemplate(propertyType = {}) {
  const type = propertyType?.type;
  const policy = getRepeatabilityPolicy(type);

  if (!policy) return null;

  const sourceName = trimmed(propertyType?.name);
  const name =
    policy.nameBehavior === "KEEP"
      ? sourceName || getDefaultPropertyName(type)
      : "";

  return {
    type,
    name,
    unitNo: "",
  };
}

export function getDuplicateInitialStatus(status) {
  return DUPLICATE_CAPTURE_STATUS_SET.has(status) ? status : "Select...";
}

export function reconcilePropertyTypeChange(nextType) {
  return {
    name: getDefaultPropertyName(nextType),
    unitNo: "",
  };
}

export function sanitizePropertyTypeForSubmission(
  propertyType = {},
  { mode = "NEW", originalPropertyType = null } = {},
) {
  const type = propertyType?.type || "Select...";
  const originalType = originalPropertyType?.type || "";
  const preserveHiddenLegacyValues =
    (mode === "EDIT" || mode === "QUEUE_EDIT") && originalType === type;

  const name = requiresPropertyName(type)
    ? trimmed(propertyType?.name)
    : preserveHiddenLegacyValues
      ? trimmed(originalPropertyType?.name)
      : "";

  const unitNo = supportsUnitNo(type)
    ? trimmed(propertyType?.unitNo)
    : preserveHiddenLegacyValues
      ? trimmed(originalPropertyType?.unitNo)
      : "";

  return { type, name, unitNo };
}

export function formatRepeatablePremiseIdentity(propertyType = {}) {
  const type = propertyType?.type;
  if (!isRepeatablePropertyType(type)) return "";

  const name = trimmed(propertyType?.name);
  const unitNo = trimmed(propertyType?.unitNo);

  if (name && unitNo) return `${name} | Unit ${unitNo}`;
  if (name) return name;
  if (unitNo) return `Unit ${unitNo}`;
  return "";
}

export function getDuplicateConfirmationMessage(type) {
  const policy = getRepeatabilityPolicy(type);
  if (!policy) return "This Premise cannot be duplicated.";

  const nameSentence =
    policy.nameBehavior === "KEEP"
      ? "The property/unit name will be prefilled."
      : "The property/unit name will start blank.";

  return [
    `Create another ${type} Premise on this Erf using this Premise as a template.`,
    "Property context, address, property type and property status will be prefilled and remain editable.",
    nameSentence,
    "Unit Number will start blank.",
    "No Access, services/meters, photos and GPS position are not copied.",
  ].join(" ");
}
