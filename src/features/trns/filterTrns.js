import {
  TRN_DATE_PRESETS,
  TRN_FILTER_DATA_ISSUE,
} from "../../context/TrnFilterContext";

export const TRN_FILTER_VALUES = {
  DATA_ISSUE: TRN_FILTER_DATA_ISSUE,

  WORKFLOW_STATES: {
    ISSUED: "ISSUED",
    ACCEPTED: "ACCEPTED",
    REASSIGNED: "REASSIGNED",
    IN_PROGRESS: "IN_PROGRESS",
    REJECTED: "REJECTED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    DIRECT_SUBMIT: "DIRECT_SUBMIT",
    UNKNOWN: "UNKNOWN",
  },

  ORIGIN_CHANNELS: {
    OFFICE: "OFFICE",
    FIELD: "FIELD",
    API: "API",
    INTEGRATION: "INTEGRATION",
    DATA_ISSUE: TRN_FILTER_DATA_ISSUE,
  },

  EXECUTION_OUTCOMES: {
    SUCCESS: "SUCCESS",
    NO_ACCESS: "NO_ACCESS",
    NO_READING: "NO_READING",
    PENDING: "PENDING",
    DATA_ISSUE: TRN_FILTER_DATA_ISSUE,
  },

  ACCESS_STATES: {
    ACCESS: "ACCESS",
    NO_ACCESS: "NO_ACCESS",
    DATA_ISSUE: TRN_FILTER_DATA_ISSUE,
  },

  METER_SERVICES: {
    ELECTRICITY: "ELECTRICITY",
    WATER: "WATER",
    DATA_ISSUE: TRN_FILTER_DATA_ISSUE,
  },

  METER_CATEGORIES: {
    NORMAL: "NORMAL",
    BULK: "BULK",
    DATA_ISSUE: TRN_FILTER_DATA_ISSUE,
  },

  METER_TYPES: {
    PREPAID: "PREPAID",
    CONVENTIONAL: "CONVENTIONAL",
    DATA_ISSUE: TRN_FILTER_DATA_ISSUE,
  },
};

export const TRN_TYPE_OPTIONS = [
  "METER_DISCOVERY",
  "METER_INSTALLATION",
  "METER_COMMISSIONING",
  "METER_INSPECTION",
  "METER_DISCONNECTION",
  "METER_RECONNECTION",
  "METER_REMOVAL",
  "METER_READING",
  "METER_VENDING",
];

export const TRN_WORKFLOW_STATE_OPTIONS = [
  TRN_FILTER_VALUES.WORKFLOW_STATES.ISSUED,
  TRN_FILTER_VALUES.WORKFLOW_STATES.ACCEPTED,
  TRN_FILTER_VALUES.WORKFLOW_STATES.REASSIGNED,
  TRN_FILTER_VALUES.WORKFLOW_STATES.IN_PROGRESS,
  TRN_FILTER_VALUES.WORKFLOW_STATES.REJECTED,
  TRN_FILTER_VALUES.WORKFLOW_STATES.COMPLETED,
  TRN_FILTER_VALUES.WORKFLOW_STATES.CANCELLED,
];

export const TRN_ORIGIN_CHANNEL_OPTIONS = [
  TRN_FILTER_VALUES.ORIGIN_CHANNELS.OFFICE,
  TRN_FILTER_VALUES.ORIGIN_CHANNELS.FIELD,
  TRN_FILTER_VALUES.ORIGIN_CHANNELS.API,
  TRN_FILTER_VALUES.ORIGIN_CHANNELS.INTEGRATION,
  TRN_FILTER_VALUES.ORIGIN_CHANNELS.DATA_ISSUE,
];

export const TRN_EXECUTION_OUTCOME_OPTIONS = [
  TRN_FILTER_VALUES.EXECUTION_OUTCOMES.SUCCESS,
  TRN_FILTER_VALUES.EXECUTION_OUTCOMES.NO_ACCESS,
  TRN_FILTER_VALUES.EXECUTION_OUTCOMES.NO_READING,
  TRN_FILTER_VALUES.EXECUTION_OUTCOMES.PENDING,
];

export const TRN_ACCESS_STATE_OPTIONS = [
  TRN_FILTER_VALUES.ACCESS_STATES.ACCESS,
  TRN_FILTER_VALUES.ACCESS_STATES.NO_ACCESS,
  TRN_FILTER_VALUES.ACCESS_STATES.DATA_ISSUE,
];

export const TRN_METER_SERVICE_OPTIONS = [
  TRN_FILTER_VALUES.METER_SERVICES.ELECTRICITY,
  TRN_FILTER_VALUES.METER_SERVICES.WATER,
  TRN_FILTER_VALUES.METER_SERVICES.DATA_ISSUE,
];

export const TRN_METER_CATEGORY_OPTIONS = [
  TRN_FILTER_VALUES.METER_CATEGORIES.NORMAL,
  TRN_FILTER_VALUES.METER_CATEGORIES.BULK,
  TRN_FILTER_VALUES.METER_CATEGORIES.DATA_ISSUE,
];

export const TRN_METER_TYPE_OPTIONS = [
  TRN_FILTER_VALUES.METER_TYPES.PREPAID,
  TRN_FILTER_VALUES.METER_TYPES.CONVENTIONAL,
  TRN_FILTER_VALUES.METER_TYPES.DATA_ISSUE,
];

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean && clean !== "NAv") return clean;
  }

  return "";
}

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeKey(value) {
  return normalizeUpper(value).replace(/[\s-]+/g, "_");
}

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function includesSelected(selectedValues = [], value) {
  const values = safeArray(selectedValues);
  if (values.length === 0) return true;
  return values.includes(value);
}

export function getTrnType(item = {}) {
  const trnType = normalizeKey(
    readFirstString(item?.accessData?.trnType, item?.trnType),
  );

  return trnType || "UNKNOWN_TRN";
}

export function getWorkflowState(item = {}) {
  const workflowState = normalizeKey(
    readFirstString(
      item?.workflow?.state,
      item?.trnActiveLifecycle?.workflowState,
    ),
  );

  if (!workflowState) {
    return TRN_FILTER_VALUES.WORKFLOW_STATES.DIRECT_SUBMIT;
  }

  if (
    workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.ISSUED ||
    workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.ACCEPTED ||
    workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.REASSIGNED ||
    workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.IN_PROGRESS ||
    workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.REJECTED ||
    workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.COMPLETED ||
    workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.CANCELLED
  ) {
    return workflowState;
  }

  return TRN_FILTER_VALUES.WORKFLOW_STATES.UNKNOWN;
}

export function getOriginChannel(item = {}) {
  const originChannel = normalizeKey(
    readFirstString(
      item?.origin?.channel,
      item?.workflow?.createdMode,
      item?.bucket?.createdMode,
    ),
  );

  if (originChannel === "OFFICE") return TRN_FILTER_VALUES.ORIGIN_CHANNELS.OFFICE;
  if (originChannel === "FIELD") return TRN_FILTER_VALUES.ORIGIN_CHANNELS.FIELD;
  if (originChannel === "API") return TRN_FILTER_VALUES.ORIGIN_CHANNELS.API;
  if (originChannel === "INTEGRATION") {
    return TRN_FILTER_VALUES.ORIGIN_CHANNELS.INTEGRATION;
  }

  return TRN_FILTER_VALUES.ORIGIN_CHANNELS.DATA_ISSUE;
}

export function getExecutionOutcome(item = {}) {
  const outcome = normalizeKey(item?.executionOutcome?.outcome);

  if (outcome === "SUCCESS") {
    return TRN_FILTER_VALUES.EXECUTION_OUTCOMES.SUCCESS;
  }

  if (outcome === "NO_ACCESS") {
    return TRN_FILTER_VALUES.EXECUTION_OUTCOMES.NO_ACCESS;
  }

  if (outcome === "NO_READING") {
    return TRN_FILTER_VALUES.EXECUTION_OUTCOMES.NO_READING;
  }

  if (!outcome) {
    const workflowState = getWorkflowState(item);

    if (
      workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.ACCEPTED ||
      workflowState === TRN_FILTER_VALUES.WORKFLOW_STATES.IN_PROGRESS
    ) {
      return TRN_FILTER_VALUES.EXECUTION_OUTCOMES.PENDING;
    }

    return TRN_FILTER_VALUES.EXECUTION_OUTCOMES.DATA_ISSUE;
  }

  return TRN_FILTER_VALUES.EXECUTION_OUTCOMES.DATA_ISSUE;
}

export function getAccessState(item = {}) {
  const rawAccess = item?.accessData?.access?.hasAccess;

  if (rawAccess === true) return TRN_FILTER_VALUES.ACCESS_STATES.ACCESS;
  if (rawAccess === false) return TRN_FILTER_VALUES.ACCESS_STATES.NO_ACCESS;

  const access = normalizeLower(rawAccess);

  if (access === "yes" || access === "true") {
    return TRN_FILTER_VALUES.ACCESS_STATES.ACCESS;
  }

  if (access === "no" || access === "false") {
    return TRN_FILTER_VALUES.ACCESS_STATES.NO_ACCESS;
  }

  return TRN_FILTER_VALUES.ACCESS_STATES.DATA_ISSUE;
}

export function getMeterService(item = {}) {
  const meterService = normalizeLower(item?.meterType);

  if (meterService === "electricity") {
    return TRN_FILTER_VALUES.METER_SERVICES.ELECTRICITY;
  }

  if (meterService === "water") {
    return TRN_FILTER_VALUES.METER_SERVICES.WATER;
  }

  return TRN_FILTER_VALUES.METER_SERVICES.DATA_ISSUE;
}

function getMeterSnapshot(item = {}) {
  return (
    item?.ast?.astData?.meter ||
    item?.inspection?.captured?.ast?.astData?.meter ||
    item?.inspection?.lastKnown?.ast?.astData?.meter ||
    {}
  );
}

export function getMeterCategory(item = {}) {
  const meter = getMeterSnapshot(item);
  const category = normalizeLower(meter?.category);

  if (category === "normal") {
    return TRN_FILTER_VALUES.METER_CATEGORIES.NORMAL;
  }

  if (category === "bulk") {
    return TRN_FILTER_VALUES.METER_CATEGORIES.BULK;
  }

  return TRN_FILTER_VALUES.METER_CATEGORIES.DATA_ISSUE;
}

export function getMeterType(item = {}) {
  const meter = getMeterSnapshot(item);
  const meterType = normalizeLower(meter?.type);

  if (meterType === "prepaid") {
    return TRN_FILTER_VALUES.METER_TYPES.PREPAID;
  }

  if (meterType === "conventional") {
    return TRN_FILTER_VALUES.METER_TYPES.CONVENTIONAL;
  }

  return TRN_FILTER_VALUES.METER_TYPES.DATA_ISSUE;
}

function toDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object" && value?.seconds !== undefined) {
    const date = new Date(Number(value.seconds) * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = value?.__time__ || value;
  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getStartOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getStartOfNextDay(date) {
  const next = getStartOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function getStartOfWeek(date) {
  const next = getStartOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function getStartOfMonth(date) {
  const next = getStartOfDay(date);
  next.setDate(1);
  return next;
}

function getStartOfPreviousMonth(date) {
  const next = getStartOfMonth(date);
  next.setMonth(next.getMonth() - 1);
  return next;
}

function parseDateInput(value) {
  const clean = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;

  const [year, month, day] = clean.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : getStartOfDay(date);
}

export function getDateRangeForPreset(datePreset, filterState = {}) {
  const now = new Date();
  const todayStart = getStartOfDay(now);
  const tomorrowStart = getStartOfNextDay(now);

  if (!datePreset || datePreset === TRN_DATE_PRESETS.ALL) {
    return null;
  }

  if (datePreset === TRN_DATE_PRESETS.TODAY) {
    return { start: todayStart, end: tomorrowStart };
  }

  if (datePreset === TRN_DATE_PRESETS.YESTERDAY) {
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return { start: yesterdayStart, end: todayStart };
  }

  if (datePreset === TRN_DATE_PRESETS.THIS_WEEK) {
    return { start: getStartOfWeek(now), end: tomorrowStart };
  }

  if (datePreset === TRN_DATE_PRESETS.LAST_7_DAYS) {
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    return { start: sevenDaysAgo, end: tomorrowStart };
  }

  if (datePreset === TRN_DATE_PRESETS.THIS_MONTH) {
    return { start: getStartOfMonth(now), end: tomorrowStart };
  }

  if (datePreset === TRN_DATE_PRESETS.LAST_MONTH) {
    const start = getStartOfPreviousMonth(now);
    const end = getStartOfMonth(now);
    return { start, end };
  }

  if (datePreset === TRN_DATE_PRESETS.CUSTOM_DURATION) {
    const start = parseDateInput(filterState?.customDateStart);
    const endStart = parseDateInput(filterState?.customDateEnd);

    if (!start || !endStart) return null;

    return { start, end: getStartOfNextDay(endStart) };
  }

  return null;
}

export function getTrnCreatedDate(item = {}) {
  return toDate(readFirstString(item?.metadata?.createdAt, item?.__createTime__));
}

function matchesDatePreset(item = {}, filterState = {}) {
  const datePreset = filterState?.datePreset || TRN_DATE_PRESETS.ALL;

  if (datePreset === TRN_DATE_PRESETS.ALL) return true;

  const range = getDateRangeForPreset(datePreset, filterState);
  if (!range) return true;

  const trnDate = getTrnCreatedDate(item);
  if (!trnDate) return false;

  return trnDate >= range.start && trnDate < range.end;
}

function formatAssignedToText(item = {}) {
  const targets = Array.isArray(item?.assignment?.targets)
    ? item.assignment.targets
    : [];

  return targets
    .map((target) =>
      readFirstString(
        target?.name,
        target?.title,
        target?.displayName,
        target?.id,
        target?.type,
      ),
    )
    .filter(Boolean)
    .join(" ");
}

function getNoReadingReason(item = {}) {
  return readFirstString(
    item?.meterReading?.noReadingReason,
    item?.inspection?.captured?.mreading?.noReadingReason,
    item?.disconnection?.noReadingReason,
    item?.reconnection?.noReadingReason,
    item?.removal?.noReadingReason,
  );
}

function getSearchHaystack(item = {}) {
  const meter = getMeterSnapshot(item);

  return [
    item?.id,
    item?.accessData?.trnType,
    getTrnType(item),

    item?.ast?.astData?.astNo,
    item?.inspection?.captured?.ast?.astData?.astNo,
    item?.inspection?.lastKnown?.ast?.astData?.astNo,

    item?.accessData?.erfNo,
    item?.accessData?.parents?.wardPcode,
    item?.accessData?.premise?.address,
    item?.accessData?.premise?.propertyType,

    item?.metadata?.createdByUser,
    item?.metadata?.updatedByUser,
    item?.workflow?.completedByUser,
    item?.processing?.commissioning?.processedByUser,
    item?.processing?.processedByUser,

    formatAssignedToText(item),

    getWorkflowState(item),
    getOriginChannel(item),
    getExecutionOutcome(item),
    getAccessState(item),
    getMeterService(item),
    getMeterCategory(item),
    getMeterType(item),

    item?.accessData?.access?.reason,
    item?.assignment?.instruction?.code,
    item?.assignment?.instruction?.text,
    item?.assignment?.instruction?.notes,
    item?.origin?.channel,
    item?.origin?.source,

    getNoReadingReason(item),

    meter?.category,
    meter?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesSearch(item = {}, filterState = {}) {
  const query = String(filterState?.searchQuery || "")
    .trim()
    .toLowerCase();

  if (!query) return true;

  return getSearchHaystack(item).includes(query);
}

export function filterTrns(list = [], filterState = {}) {
  const source = Array.isArray(list) ? list : [];

  return source.filter((item) => {
    if (!matchesSearch(item, filterState)) return false;
    if (!matchesDatePreset(item, filterState)) return false;

    if (!includesSelected(filterState?.trnTypes, getTrnType(item))) {
      return false;
    }

    if (!includesSelected(filterState?.workflowStates, getWorkflowState(item))) {
      return false;
    }

    if (!includesSelected(filterState?.originChannels, getOriginChannel(item))) {
      return false;
    }

    if (
      !includesSelected(
        filterState?.executionOutcomes,
        getExecutionOutcome(item),
      )
    ) {
      return false;
    }

    if (!includesSelected(filterState?.accessStates, getAccessState(item))) {
      return false;
    }

    if (!includesSelected(filterState?.meterServices, getMeterService(item))) {
      return false;
    }

    if (!includesSelected(filterState?.meterCategories, getMeterCategory(item))) {
      return false;
    }

    if (!includesSelected(filterState?.meterTypes, getMeterType(item))) {
      return false;
    }

    return true;
  });
}

export function countTrnFilterValues(list = [], getter) {
  const counts = {};

  (Array.isArray(list) ? list : []).forEach((item) => {
    const value = getter(item);
    counts[value] = (counts[value] || 0) + 1;
  });

  return counts;
}

export function getTrnFilterStats(list = []) {
  const source = Array.isArray(list) ? list : [];

  return {
    total: source.length,
    trnTypes: countTrnFilterValues(source, getTrnType),
    workflowStates: countTrnFilterValues(source, getWorkflowState),
    originChannels: countTrnFilterValues(source, getOriginChannel),
    executionOutcomes: countTrnFilterValues(source, getExecutionOutcome),
    accessStates: countTrnFilterValues(source, getAccessState),
    meterServices: countTrnFilterValues(source, getMeterService),
    meterCategories: countTrnFilterValues(source, getMeterCategory),
    meterTypes: countTrnFilterValues(source, getMeterType),
  };
}
