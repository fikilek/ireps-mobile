import { AST_FILTER_DATA_ISSUE } from "../../context/AstFilterContext";

export const AST_METER_SERVICE_OPTIONS = [
  {
    value: "ELECTRICITY",
    label: "Electricity",
    description: "Electricity meters.",
  },
  {
    value: "WATER",
    label: "Water",
    description: "Water meters.",
  },
  {
    value: AST_FILTER_DATA_ISSUE,
    label: "Data Issue",
    description: "Meter service is missing or not recognised.",
  },
];

export const AST_METER_CATEGORY_OPTIONS = [
  {
    value: "NORMAL",
    label: "Normal",
    description: "Standard consumer or ordinary meter.",
  },
  {
    value: "BULK",
    label: "Bulk",
    description:
      "Bulk meter used for higher-level or shared supply measurement.",
  },
  {
    value: AST_FILTER_DATA_ISSUE,
    label: "Data Issue",
    description: "Meter category is missing or not recognised.",
  },
];

export const AST_METER_PHASE_OPTIONS = [
  {
    value: "SINGLE",
    label: "Single Phase",
    description: "Single-phase electricity meter.",
  },
  {
    value: "THREE",
    label: "Three Phase",
    description: "Three-phase electricity meter.",
  },
  {
    value: "NOT_APPLICABLE",
    label: "Not Applicable",
    description: "Phase is not applicable, usually for water meters.",
  },
  {
    value: AST_FILTER_DATA_ISSUE,
    label: "Data Issue",
    description: "Phase is required but missing or not recognised.",
  },
];

export const AST_METER_TYPE_OPTIONS = [
  {
    value: "PREPAID",
    label: "Prepaid",
    description: "Prepaid meter.",
  },
  {
    value: "CONVENTIONAL",
    label: "Conventional",
    description: "Conventional meter.",
  },
  {
    value: AST_FILTER_DATA_ISSUE,
    label: "Data Issue",
    description: "Meter type is missing or not recognised.",
  },
];

export const AST_STATUS_OPTIONS = [
  {
    value: "FIELD",
    label: "Field",
    description: "Meter is captured in the field but not yet commissioned.",
  },
  {
    value: "CONNECTED",
    label: "Connected",
    description: "Meter is connected.",
  },
  {
    value: "DISCONNECTED",
    label: "Disconnected",
    description: "Meter is disconnected.",
  },
  {
    value: "REMOVED",
    label: "Removed",
    description: "Meter has been removed from the field.",
  },
  {
    value: "DECOMMISSIONED",
    label: "Decommissioned",
    description: "Meter has been decommissioned.",
  },
  {
    value: AST_FILTER_DATA_ISSUE,
    label: "Data Issue",
    description: "Meter status is missing or not recognised.",
  },
];

export const AST_VISIBILITY_OPTIONS = [
  {
    value: "VISIBLE",
    label: "Visible",
    description: "Prepaid vending history is available in iREPS.",
  },
  {
    value: "INVISIBLE",
    label: "Invisible",
    description:
      "The meter exists in iREPS, but prepaid vending history is not available in the iREPS vending/master view.",
  },
  {
    value: AST_FILTER_DATA_ISSUE,
    label: "Data Issue",
    description: "Visibility is missing or not recognised.",
  },
];

export const AST_GEOFENCE_BASE_OPTIONS = [
  {
    value: "HAS_GEOFENCE",
    label: "Has Geofence",
    description: "Meter belongs to at least one geofence.",
  },
  {
    value: "NO_GEOFENCE",
    label: "No Geofence",
    description: "Meter is not linked to any geofence.",
  },
];

export const AST_OFF_GRID_SUPPLY_OPTIONS = [
  {
    value: "YES",
    label: "Yes",
    description: "Meter has off-grid supply recorded.",
  },
  {
    value: "NO",
    label: "No",
    description: "Meter does not have off-grid supply recorded.",
  },
  {
    value: "NOT_RECORDED",
    label: "Not Recorded",
    description: "Off-grid supply was not recorded.",
  },
];

export const AST_SEAL_STATE_OPTIONS = [
  {
    value: "HAS_SEAL_NUMBER",
    label: "Has Seal Number",
    description: "Meter has a captured seal number.",
  },
  {
    value: "NO_SEAL_NUMBER",
    label: "No Seal Number",
    description: "Meter seal number is missing, blank, or recorded as NAv.",
  },
];

export const AST_CAPTURE_SOURCE_OPTIONS = [
  {
    value: "DISCOVERY",
    label: "Discovery",
    description: "Meter data landed in iREPS through Meter Discovery.",
  },
  {
    value: "INSTALLATION",
    label: "Installation",
    description: "Meter data landed in iREPS through Meter Installation.",
  },
  {
    value: AST_FILTER_DATA_ISSUE,
    label: "Data Issue",
    description: "Meter capture source is missing or not recognised.",
  },
];

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean && clean !== "NAv" && clean !== "NAV") return clean;
  }

  return "";
}

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeCompact(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function titleCase(value) {
  const clean = String(value || "").trim();

  if (!clean) return "NAv";

  return clean
    .split(/\s+/)
    .map((part) => {
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function dynamicValue(prefix, rawValue) {
  return `${prefix}::${String(rawValue || "").trim()}`;
}

function hasSelectedValue(selectedValues = [], actualValue) {
  if (!Array.isArray(selectedValues) || selectedValues.length === 0) {
    return true;
  }

  return selectedValues.includes(actualValue);
}

function hasAnySelectedValue(selectedValues = [], actualValues = []) {
  if (!Array.isArray(selectedValues) || selectedValues.length === 0) {
    return true;
  }

  const safeActualValues = Array.isArray(actualValues) ? actualValues : [];

  return safeActualValues.some((value) => selectedValues.includes(value));
}

function getMeterData(item = {}) {
  return item?.ast?.astData?.meter || {};
}

function getAstData(item = {}) {
  return item?.ast?.astData || {};
}

export function getAstMeterNo(item = {}) {
  return readFirstString(
    item?.ast?.astData?.astNo,
    item?.master?.id,
    item?.id,
    "NAv",
  );
}

export function getAstManufacturer(item = {}) {
  return readFirstString(item?.ast?.astData?.astManufacturer);
}

export function getAstModel(item = {}) {
  return readFirstString(item?.ast?.astData?.astName);
}

export function getAstMeterService(item = {}) {
  const service = normalizeCompact(item?.meterType);

  if (service === "electricity" || service === "elec") return "ELECTRICITY";
  if (service === "water" || service === "wtr") return "WATER";

  return AST_FILTER_DATA_ISSUE;
}

export function getAstMeterCategory(item = {}) {
  const category = normalizeCompact(getMeterData(item)?.category);

  if (category === "normal") return "NORMAL";
  if (category === "bulk") return "BULK";

  return AST_FILTER_DATA_ISSUE;
}

export function getAstMeterPhase(item = {}) {
  const service = getAstMeterService(item);
  const phase = normalizeCompact(getMeterData(item)?.phase);

  if (phase === "single" || phase === "singlephase" || phase === "1phase") {
    return "SINGLE";
  }

  if (
    phase === "three" ||
    phase === "threephase" ||
    phase === "3phase" ||
    phase === "three-phase"
  ) {
    return "THREE";
  }

  if (service === "WATER" && !phase) return "NOT_APPLICABLE";

  return AST_FILTER_DATA_ISSUE;
}

export function getAstMeterType(item = {}) {
  const meterKind = normalizeCompact(getMeterData(item)?.type);

  if (meterKind === "prepaid") return "PREPAID";

  if (
    meterKind === "conventional" ||
    meterKind === "postpaid" ||
    meterKind === "credit"
  ) {
    return "CONVENTIONAL";
  }

  return AST_FILTER_DATA_ISSUE;
}

export function getAstStatus(item = {}) {
  const state = normalizeUpper(item?.status?.state);

  if (
    [
      "FIELD",
      "CONNECTED",
      "DISCONNECTED",
      "REMOVED",
      "DECOMMISSIONED",
    ].includes(state)
  ) {
    return state;
  }

  return AST_FILTER_DATA_ISSUE;
}

export function getAstVisibility(item = {}) {
  const visibility = normalizeUpper(item?.master?.visibility);

  if (visibility === "VISIBLE") return "VISIBLE";
  if (visibility === "INVISIBLE") return "INVISIBLE";

  return AST_FILTER_DATA_ISSUE;
}

export function getAstGeofenceRefs(item = {}) {
  const refs = Array.isArray(item?.geofenceRefs) ? item.geofenceRefs : [];

  return refs.filter((ref) => {
    return readFirstString(ref?.id, ref?.name);
  });
}

export function getAstGeofenceFilterValues(item = {}) {
  const refs = getAstGeofenceRefs(item);

  if (refs.length === 0) return ["NO_GEOFENCE"];

  return [
    "HAS_GEOFENCE",
    ...refs.map((ref) =>
      dynamicValue("GEOFENCE", readFirstString(ref?.id, ref?.name)),
    ),
  ];
}

export function getAstOffGridSupplyState(item = {}) {
  const value = normalizeCompact(item?.ast?.ogs?.hasOffGridSupply);

  if (["yes", "true", "y"].includes(value)) return "YES";
  if (["no", "false", "n"].includes(value)) return "NO";

  return "NOT_RECORDED";
}

export function getAstPlacementValue(item = {}) {
  const placement = readFirstString(item?.ast?.location?.placement);

  if (!placement) return "PLACEMENT::NOT_RECORDED";

  return dynamicValue("PLACEMENT", titleCase(placement));
}

export function getAstSealState(item = {}) {
  const sealNo = readFirstString(getMeterData(item)?.seal?.sealNo);

  return sealNo ? "HAS_SEAL_NUMBER" : "NO_SEAL_NUMBER";
}

export function getAstCbSizeValue(item = {}) {
  const size = readFirstString(getMeterData(item)?.cb?.size);

  if (!size) return "CB_SIZE::NO_CB_SIZE";

  return dynamicValue("CB_SIZE", size);
}

export function getAstManufacturerValue(item = {}) {
  const manufacturer = readFirstString(getAstData(item)?.astManufacturer);

  if (!manufacturer) return AST_FILTER_DATA_ISSUE;

  return dynamicValue("MANUFACTURER", titleCase(manufacturer));
}

export function getAstPropertyTypeValue(item = {}) {
  const propertyType = readFirstString(item?.accessData?.premise?.propertyType);

  if (!propertyType) return AST_FILTER_DATA_ISSUE;

  return dynamicValue("PROPERTY_TYPE", titleCase(propertyType));
}

export function getAstCaptureSource(item = {}) {
  const trnType = normalizeUpper(item?.accessData?.trnType);

  if (trnType === "METER_DISCOVERY") return "DISCOVERY";
  if (trnType === "METER_INSTALLATION") return "INSTALLATION";

  return AST_FILTER_DATA_ISSUE;
}

export function getAstSearchText(item = {}) {
  const meter = getMeterData(item);

  const geofenceNames = getAstGeofenceRefs(item)
    .map((ref) => readFirstString(ref?.name, ref?.id))
    .join(" ");

  return [
    item?.id,
    item?.trnId,
    getAstMeterNo(item),
    getAstManufacturer(item),
    getAstModel(item),
    item?.meterType,
    meter?.category,
    meter?.phase,
    meter?.type,
    item?.status?.state,
    item?.master?.visibility,
    item?.accessData?.erfNo,
    item?.accessData?.parents?.wardPcode,
    item?.accessData?.premise?.address,
    item?.accessData?.premise?.propertyType,
    item?.accessData?.trnType,
    item?.serviceProvider?.name,
    item?.ast?.location?.placement,
    meter?.seal?.sealNo,
    meter?.cb?.size,
    geofenceNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterAsts(asts = [], filterState = {}) {
  const list = Array.isArray(asts) ? asts : [];
  const searchQuery = normalizeLower(filterState?.searchQuery);

  return list.filter((item) => {
    if (searchQuery && !getAstSearchText(item).includes(searchQuery)) {
      return false;
    }

    if (
      !hasSelectedValue(filterState?.meterServices, getAstMeterService(item))
    ) {
      return false;
    }

    if (
      !hasSelectedValue(filterState?.meterCategories, getAstMeterCategory(item))
    ) {
      return false;
    }

    if (!hasSelectedValue(filterState?.meterPhases, getAstMeterPhase(item))) {
      return false;
    }

    if (!hasSelectedValue(filterState?.meterTypes, getAstMeterType(item))) {
      return false;
    }

    if (!hasSelectedValue(filterState?.astStatuses, getAstStatus(item))) {
      return false;
    }

    if (
      !hasSelectedValue(filterState?.visibilityStates, getAstVisibility(item))
    ) {
      return false;
    }

    if (
      !hasAnySelectedValue(
        filterState?.geofenceFilters,
        getAstGeofenceFilterValues(item),
      )
    ) {
      return false;
    }

    if (
      !hasSelectedValue(
        filterState?.offGridSupplyStates,
        getAstOffGridSupplyState(item),
      )
    ) {
      return false;
    }

    if (
      !hasSelectedValue(filterState?.placements, getAstPlacementValue(item))
    ) {
      return false;
    }

    if (!hasSelectedValue(filterState?.sealStates, getAstSealState(item))) {
      return false;
    }

    if (!hasSelectedValue(filterState?.cbSizes, getAstCbSizeValue(item))) {
      return false;
    }

    if (
      !hasSelectedValue(
        filterState?.manufacturers,
        getAstManufacturerValue(item),
      )
    ) {
      return false;
    }

    if (
      !hasSelectedValue(
        filterState?.propertyTypes,
        getAstPropertyTypeValue(item),
      )
    ) {
      return false;
    }

    if (
      !hasSelectedValue(filterState?.captureSources, getAstCaptureSource(item))
    ) {
      return false;
    }

    return true;
  });
}

function buildDynamicOptionsFromList({
  list = [],
  getValue,
  getLabelFromValue,
  dataIssueLabel = "Data Issue",
  dataIssueDescription = "Value is missing or not recognised.",
}) {
  const map = new Map();

  list.forEach((item) => {
    const value = getValue(item);

    if (!value) return;

    if (value === AST_FILTER_DATA_ISSUE) {
      map.set(AST_FILTER_DATA_ISSUE, {
        value: AST_FILTER_DATA_ISSUE,
        label: dataIssueLabel,
        description: dataIssueDescription,
      });
      return;
    }

    map.set(value, {
      value,
      label: getLabelFromValue(value),
      description: "",
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.value === AST_FILTER_DATA_ISSUE) return 1;
    if (b.value === AST_FILTER_DATA_ISSUE) return -1;
    return String(a.label).localeCompare(String(b.label));
  });
}

function readDynamicLabel(value = "", prefix = "") {
  const raw = String(value || "");

  if (!raw.startsWith(`${prefix}::`)) return raw;

  const label = raw.slice(`${prefix}::`.length);

  if (label === "NOT_RECORDED") return "Not Recorded";
  if (label === "NO_CB_SIZE") return "No CB Size";

  return label || "NAv";
}

export function buildAstPlacementOptions(asts = []) {
  return buildDynamicOptionsFromList({
    list: asts,
    getValue: getAstPlacementValue,
    getLabelFromValue: (value) => readDynamicLabel(value, "PLACEMENT"),
  });
}

export function buildAstCbSizeOptions(asts = []) {
  return buildDynamicOptionsFromList({
    list: asts,
    getValue: getAstCbSizeValue,
    getLabelFromValue: (value) => readDynamicLabel(value, "CB_SIZE"),
  });
}

export function buildAstManufacturerOptions(asts = []) {
  return buildDynamicOptionsFromList({
    list: asts,
    getValue: getAstManufacturerValue,
    getLabelFromValue: (value) => readDynamicLabel(value, "MANUFACTURER"),
  });
}

export function buildAstPropertyTypeOptions(asts = []) {
  return buildDynamicOptionsFromList({
    list: asts,
    getValue: getAstPropertyTypeValue,
    getLabelFromValue: (value) => readDynamicLabel(value, "PROPERTY_TYPE"),
  });
}

export function buildAstGeofenceOptions(asts = []) {
  const map = new Map();

  asts.forEach((item) => {
    const refs = getAstGeofenceRefs(item);

    refs.forEach((ref) => {
      const idOrName = readFirstString(ref?.id, ref?.name);
      const label = readFirstString(ref?.name, ref?.id);

      if (!idOrName) return;

      map.set(dynamicValue("GEOFENCE", idOrName), {
        value: dynamicValue("GEOFENCE", idOrName),
        label,
        description: "Specific geofence.",
      });
    });
  });

  return [
    ...AST_GEOFENCE_BASE_OPTIONS,
    ...Array.from(map.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label)),
    ),
  ];
}
