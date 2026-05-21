import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { format, isValid } from "date-fns";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import { filterTrns } from "../../../src/features/trns/filterTrns";
import { useTrnFilter } from "../../../src/hooks/useTrnFilter";

const MEDIA_LABELS = {
  instructionMedia: "Instruction Media",
  disconnectionInstructionEvidence: "Disconnection Instruction Evidence",

  astNoPhoto: "Meter Number Photo",
  meterReadingPhoto: "Meter Reading Photo",
  meterReadingEvidence: "Meter Reading Evidence",
  disconnectionMeterReadingEvidence: "Disconnection Reading Evidence",
  reconnectionMeterReadingEvidence: "Reconnection Reading Evidence",
  removalMeterReadingEvidence: "Removal Reading Evidence",
  noReadingEvidence: "No Reading Evidence",
  tokenReadingPhoto: "Token Reading Photo",

  anomalyPhoto: "Anomaly Photo",
  normalisationPhoto: "Normalisation Photo",
  noAccessPhoto: "No Access Photo",
  sealPhoto: "Seal Photo",
  keypadPhoto: "Keypad Photo",
  astCbPhoto: "CB Photo",

  vendingEvidence: "Vending Evidence",
  finalSwitchOnEvidence: "Final Switch-on Evidence",
  keypadIssuedEvidence: "Keypad Issued Evidence",

  levelEvidence: "Disconnection Level Evidence",
  disconnectionLevelEvidence: "Disconnection Level Evidence",
  reconnectionEvidence: "Reconnection Evidence",
  removalEvidence: "Removal Evidence",
  safetyEvidence: "Safety Evidence",
};

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean && clean !== "NAv") return clean;
  }

  return "";
}

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getMediaUrl(media = {}) {
  return (
    media?.url ||
    media?.downloadURL ||
    media?.downloadUrl ||
    media?.storageUrl ||
    media?.uri ||
    ""
  );
}

function isImageMedia(media = {}) {
  const type = normalizeLower(media?.type || media?.mimeType || "");
  const url = normalizeLower(getMediaUrl(media));

  return (
    type.includes("image") ||
    url.includes(".jpg") ||
    url.includes(".jpeg") ||
    url.includes(".png") ||
    url.includes(".webp")
  );
}

function getFormMedia(item = {}) {
  const media = Array.isArray(item?.media)
    ? item.media
    : Array.isArray(item?.raw?.media)
      ? item.raw.media
      : [];

  return media.filter((mediaItem) => Boolean(getMediaUrl(mediaItem)));
}

function getMediaDisplayLabel(media = {}, index = 0) {
  return (
    MEDIA_LABELS[media?.tag] ||
    media?.label ||
    media?.name ||
    media?.fileName ||
    media?.filename ||
    media?.tag ||
    `Form photo ${index + 1}`
  );
}

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isBlankValue(value) {
  if (value === null || value === undefined) return true;

  if (typeof value === "string") {
    const clean = value.trim();
    return !clean || clean === "NAv" || clean === "NAV";
  }

  return false;
}

function formatSummaryValue(value) {
  if (isBlankValue(value)) return "NAv";

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "object") {
    const selectText = readFirstString(
      value?.label,
      value?.text,
      value?.name,
      value?.code,
      value?.answer,
    );

    if (selectText) return selectText;

    if (value?.lat !== undefined && value?.lng !== undefined) {
      if (value.lat === null || value.lng === null) return "NAv";
      return `${Number(value.lat).toFixed(7)}, ${Number(value.lng).toFixed(7)}`;
    }

    return JSON.stringify(value);
  }

  return String(value);
}

function addSummaryRow(rows, label, value, { showBlank = false } = {}) {
  const formatted = formatSummaryValue(value);

  if (!showBlank && formatted === "NAv") return rows;

  rows.push({ label, value: formatted });
  return rows;
}

function answerToText(value = {}) {
  if (typeof value === "string") return value;

  return readFirstString(value?.answer, value?.label, value?.code, value?.text);
}

function selectToText(value = {}) {
  if (typeof value === "string") return value;

  if (value?.code === "OTHER" && value?.otherText) return value.otherText;

  return readFirstString(value?.label, value?.text, value?.code, value?.name);
}

function getTrnType(item = {}) {
  return normalizeUpper(
    item?.accessData?.trnType || item?.trnType || "UNKNOWN_TRN",
  );
}

function getCreatedByUser(item = {}) {
  return readFirstString(
    item?.metadata?.createdByUser,
    item?.media?.[0]?.created?.byUser,
    "NAv",
  );
}

function getCreatedAt(item = {}) {
  return readFirstString(
    item?.metadata?.createdAt,
    item?.__createTime__,
    "NAv",
  );
}

function getCompletedByUser(item = {}) {
  const workflowState = normalizeUpper(item?.workflow?.state);
  const outcome = normalizeUpper(item?.executionOutcome?.outcome);
  const hasWorkflowState = Boolean(workflowState);

  return readFirstString(
    item?.workflow?.completedByUser,
    item?.processing?.commissioning?.processedByUser,
    item?.processing?.processedByUser,
    workflowState === "COMPLETED" || outcome === "SUCCESS" || !hasWorkflowState
      ? item?.metadata?.updatedByUser
      : "",
    "NAv",
  );
}

function getCompletedAt(item = {}) {
  const workflowState = normalizeUpper(item?.workflow?.state);
  const outcome = normalizeUpper(item?.executionOutcome?.outcome);
  const hasWorkflowState = Boolean(workflowState);

  return readFirstString(
    item?.workflow?.completedAt,
    item?.processing?.commissioning?.processedAt,
    item?.processing?.processedAt,
    workflowState === "COMPLETED" || outcome === "SUCCESS" || !hasWorkflowState
      ? item?.metadata?.updatedAt
      : "",
    "NAv",
  );
}

function getWorkflowState(item = {}) {
  return readFirstString(
    item?.workflow?.state,
    item?.trnActiveLifecycle?.workflowState,
    "NAv",
  );
}

function formatAssignedTo(target = {}) {
  const name = readFirstString(
    target?.name,
    target?.title,
    target?.displayName,
    target?.id,
  );

  const type = readFirstString(target?.type);

  if (name && type) return `${name} (${type})`;
  if (name) return name;
  if (type) return type;

  return "NAv";
}

function getAssignedTo(item = {}) {
  const targets = Array.isArray(item?.assignment?.targets)
    ? item.assignment.targets
    : [];

  return formatAssignedTo(targets[0] || item?.trnActiveLifecycle?.assignedTo);
}

function getWorkflowStateConfig(value = "") {
  const state = normalizeUpper(value || "NAv");

  if (state === "ISSUED") {
    return {
      label: "ISSUED",
      bg: "#EFF6FF",
      border: "#BFDBFE",
      color: "#1D4ED8",
    };
  }

  if (state === "ACCEPTED") {
    return {
      label: "ACCEPTED",
      bg: "#F5F3FF",
      border: "#DDD6FE",
      color: "#6D28D9",
    };
  }

  if (state === "REASSIGNED") {
    return {
      label: "REASSIGNED",
      bg: "#FFF7ED",
      border: "#FED7AA",
      color: "#C2410C",
    };
  }

  if (state === "IN_PROGRESS") {
    return {
      label: "IN PROGRESS",
      bg: "#ECFEFF",
      border: "#A5F3FC",
      color: "#0E7490",
    };
  }

  if (state === "COMPLETED") {
    return {
      label: "COMPLETED",
      bg: "#DCFCE7",
      border: "#BBF7D0",
      color: "#166534",
    };
  }

  if (state === "REJECTED") {
    return {
      label: "REJECTED",
      bg: "#FEE2E2",
      border: "#FECACA",
      color: "#991B1B",
    };
  }

  if (state === "CANCELLED") {
    return {
      label: "CANCELLED",
      bg: "#F1F5F9",
      border: "#CBD5E1",
      color: "#475569",
    };
  }

  return {
    label: state || "NAv",
    bg: "#F8FAFC",
    border: "#E2E8F0",
    color: "#64748B",
  };
}

function getExecutionOutcome(item = {}) {
  const accessVal = item?.accessData?.access?.hasAccess;
  const hasAccess =
    accessVal === true || accessVal === "yes" || accessVal === "true";

  return readFirstString(
    item?.executionOutcome?.outcome,
    hasAccess ? "SUCCESS" : "NO_ACCESS",
  );
}

function getMeterNo(item = {}) {
  return readFirstString(
    item?.ast?.astData?.astNo,
    item?.inspection?.captured?.ast?.astData?.astNo,
    item?.inspection?.lastKnown?.ast?.astData?.astNo,
    item?.meterNo,
    "NAv",
  );
}

function getMeterKind(item = {}) {
  return readFirstString(
    item?.ast?.astData?.meter?.type,
    item?.inspection?.captured?.ast?.astData?.meter?.type,
    item?.inspection?.lastKnown?.ast?.astData?.meter?.type,
    item?.meterKind,
  );
}

function isConventionalMeter(item = {}) {
  const meterKind = normalizeLower(getMeterKind(item)).replace(/[\s_-]/g, "");
  return ["conventional", "postpaid", "credit"].includes(meterKind);
}

function formatSummaryDateTime(value) {
  if (!value || value === "NAv") return "NAv";

  const raw = value?.__time__ || value;
  const date = raw ? new Date(raw) : null;

  return date && isValid(date) ? format(date, "MMM dd, yyyy HH:mm") : "NAv";
}

function getReadingParts(item = {}) {
  const inspectionReading = item?.inspection?.captured?.mreading || {};
  const mread = item?.meterReading || {};
  const disconnection = item?.disconnection || {};
  const reconnection = item?.reconnection || {};
  const removal = item?.removal || {};

  const reading = readFirstString(
    inspectionReading?.reading,
    typeof mread === "object" ? mread?.reading : mread,
    disconnection?.meterReading,
    reconnection?.meterReading,
    removal?.meterReading,
    item?.ast?.meterReading,
  );

  const tokenReading = readFirstString(
    inspectionReading?.tokenReading,
    typeof mread === "object" ? mread?.tokenReading : "",
    disconnection?.tokenReading,
    reconnection?.tokenReading,
    removal?.tokenReading,
  );

  const noReadingReason = readFirstString(
    inspectionReading?.noReadingReason,
    typeof mread === "object" ? mread?.noReadingReason : "",
    disconnection?.noReadingReason,
    reconnection?.noReadingReason,
    removal?.noReadingReason,
  );

  const readingAt = readFirstString(
    inspectionReading?.readingAt,
    typeof mread === "object" ? mread?.readingAt : "",
  );

  const readingGps =
    (typeof mread === "object" ? mread?.readingGps : null) ||
    inspectionReading?.readingGps ||
    null;

  return {
    reading,
    tokenReading,
    noReadingReason,
    readingAt,
    readingGps,
    executorNotes: typeof mread === "object" ? mread?.executorNotes : "",
  };
}

function getConventionalReading(item = {}) {
  const parts = getReadingParts(item);

  return {
    reading: parts.reading,
    readingAt: parts.readingAt,
    noReadingReason: parts.noReadingReason,
  };
}

function buildCommonSummaryRows(item = {}) {
  const trnType = getTrnType(item);
  const accessVal = item?.accessData?.access?.hasAccess;
  const hasAccess =
    accessVal === true || accessVal === "yes" || accessVal === "true";
  const wardPcode = item?.accessData?.parents?.wardPcode || "";
  const wardNo = wardPcode ? wardPcode.slice(-3).replace(/^0+/, "") : "NAv";
  const rows = [];

  addSummaryRow(rows, "TRN Type", trnType.replaceAll("_", " "), {
    showBlank: true,
  });
  addSummaryRow(rows, "TRN ID", item?.id, { showBlank: true });
  addSummaryRow(rows, "Workflow", getWorkflowState(item), { showBlank: true });
  addSummaryRow(rows, "Assigned To", getAssignedTo(item), { showBlank: true });
  addSummaryRow(rows, "Outcome", getExecutionOutcome(item), {
    showBlank: true,
  });
  addSummaryRow(rows, "Access", hasAccess ? "YES" : "NO", { showBlank: true });
  addSummaryRow(rows, "No Access Reason", item?.accessData?.access?.reason);
  addSummaryRow(rows, "Status", item?.status?.state);
  addSummaryRow(rows, "Meter Type", item?.meterType, { showBlank: true });
  addSummaryRow(rows, "Meter Kind", getMeterKind(item), { showBlank: true });
  addSummaryRow(rows, "Meter No", getMeterNo(item), { showBlank: true });
  addSummaryRow(rows, "ERF No", item?.accessData?.erfNo, { showBlank: true });
  addSummaryRow(rows, "Ward", wardNo, { showBlank: true });
  addSummaryRow(rows, "Address", item?.accessData?.premise?.address, {
    showBlank: true,
  });
  addSummaryRow(rows, "Property Type", item?.accessData?.premise?.propertyType);
  addSummaryRow(rows, "Created By", getCreatedByUser(item), {
    showBlank: true,
  });
  addSummaryRow(rows, "Created At", formatSummaryDateTime(getCreatedAt(item)), {
    showBlank: true,
  });
  addSummaryRow(rows, "Completed By", getCompletedByUser(item), {
    showBlank: true,
  });
  addSummaryRow(
    rows,
    "Completed At",
    formatSummaryDateTime(getCompletedAt(item)),
    { showBlank: true },
  );

  return rows;
}

function buildMeterSummaryRows(item = {}) {
  const astData =
    item?.ast?.astData || item?.inspection?.lastKnown?.ast?.astData || {};
  const meter = astData?.meter || {};
  const rows = [];

  addSummaryRow(rows, "Manufacturer", astData?.astManufacturer);
  addSummaryRow(rows, "Meter Model", astData?.astName);
  addSummaryRow(rows, "Meter Category", meter?.category);
  addSummaryRow(rows, "Phase", meter?.phase);
  addSummaryRow(rows, "CB Size", meter?.cb?.size);
  addSummaryRow(rows, "Seal No", meter?.seal?.sealNo);
  addSummaryRow(rows, "Keypad Serial", meter?.keypad?.serialNo);
  addSummaryRow(rows, "Placement", item?.ast?.location?.placement);
  addSummaryRow(rows, "Known GPS", item?.ast?.location?.gps);
  addSummaryRow(rows, "Off-grid Supply", item?.ast?.ogs?.hasOffGridSupply);

  return rows;
}

function buildReadingSummaryRows(item = {}) {
  const rows = [];
  const parts = getReadingParts(item);

  if (parts.reading) {
    addSummaryRow(rows, "Meter Reading", parts.reading, { showBlank: true });
    addSummaryRow(rows, "Reading At", formatSummaryDateTime(parts.readingAt));
    addSummaryRow(rows, "Reading GPS", parts.readingGps);
  }

  if (parts.tokenReading) {
    addSummaryRow(rows, "Token Reading", parts.tokenReading, {
      showBlank: true,
    });
  }

  if (parts.noReadingReason) {
    addSummaryRow(rows, "No Reading Reason", parts.noReadingReason, {
      showBlank: true,
    });
  }

  if (parts.executorNotes) {
    addSummaryRow(rows, "Executor Notes", parts.executorNotes);
  }

  return rows;
}

function buildFormSummaryRows(item = {}) {
  const trnType = getTrnType(item);
  const rows = [];

  if (trnType === "METER_DISCOVERY" || trnType === "METER_INSTALLATION") {
    addSummaryRow(rows, "Anomaly", item?.ast?.anomalies?.anomaly);
    addSummaryRow(rows, "Anomaly Detail", item?.ast?.anomalies?.anomalyDetail);
    addSummaryRow(rows, "Derived AST ID", item?.derived?.astId);
    addSummaryRow(
      rows,
      "Master Meter ID",
      item?.derived?.master?.id || item?.master?.id,
    );
    addSummaryRow(
      rows,
      "Master Visibility",
      item?.derived?.master?.visibility || item?.master?.visibility,
    );
    return rows;
  }

  if (trnType === "METER_COMMISSIONING") {
    addSummaryRow(
      rows,
      "Vending Confirmed",
      answerToText(item?.commissioning?.vendingConfirmed),
    );
    addSummaryRow(
      rows,
      "Final Switch-on Tested",
      answerToText(item?.commissioning?.finalSwitchOnTested),
    );
    addSummaryRow(
      rows,
      "Keypad Issued",
      answerToText(item?.commissioning?.keypadIssued),
    );
    addSummaryRow(
      rows,
      "Water Meter Operational",
      answerToText(item?.commissioning?.waterMeterOperational),
    );
    addSummaryRow(
      rows,
      "Water Reading / Flow Confirmed",
      answerToText(item?.commissioning?.waterReadingOrFlowConfirmed),
    );
    addSummaryRow(
      rows,
      "Processing State",
      item?.processing?.commissioning?.state,
    );
    addSummaryRow(
      rows,
      "Processing Message",
      item?.processing?.commissioning?.message,
    );
    return rows;
  }

  if (trnType === "METER_INSPECTION") {
    const inspection = item?.inspection || {};
    const capturedAst = inspection?.captured?.ast || {};
    const normalisation = capturedAst?.normalisation || {};
    const comparison = inspection?.comparison || {};

    addSummaryRow(
      rows,
      "Inspected At",
      formatSummaryDateTime(inspection?.inspectedAt),
    );
    addSummaryRow(rows, "Anomaly", capturedAst?.anomalies?.anomaly);
    addSummaryRow(
      rows,
      "Anomaly Detail",
      capturedAst?.anomalies?.anomalyDetail,
    );
    addSummaryRow(
      rows,
      "Normalisation",
      normalisation?.actionText || normalisation?.actionTaken,
    );
    addSummaryRow(rows, "Comparison Differences", comparison?.differenceCount);
    addSummaryRow(
      rows,
      "Differences Confirmed",
      comparison?.confirmation?.confirmed === true ? "YES" : "NO",
    );
    return rows;
  }

  if (trnType === "METER_DISCONNECTION") {
    addSummaryRow(
      rows,
      "Disconnection Level",
      selectToText(item?.disconnection?.level),
    );
    addSummaryRow(
      rows,
      "Supply Disconnected",
      answerToText(item?.disconnection?.supplyDisconnected),
    );
    addSummaryRow(
      rows,
      "Safety Confirmed",
      answerToText(item?.disconnection?.safetyConfirmed),
    );
    return rows;
  }

  if (trnType === "METER_RECONNECTION") {
    addSummaryRow(
      rows,
      "Supply Reconnected",
      answerToText(item?.reconnection?.supplyReconnected),
    );
    addSummaryRow(
      rows,
      "Safety Confirmed",
      answerToText(item?.reconnection?.safetyConfirmed),
    );
    addSummaryRow(
      rows,
      "Reconnection Outcome",
      item?.reconnection?.outcome || item?.executionOutcome?.outcome,
    );
    return rows;
  }

  if (trnType === "METER_REMOVAL") {
    addSummaryRow(
      rows,
      "Meter Removed",
      answerToText(item?.removal?.meterRemoved),
    );
    addSummaryRow(
      rows,
      "Safety Confirmed",
      answerToText(item?.removal?.safetyConfirmed),
    );
    addSummaryRow(
      rows,
      "Removal Outcome",
      item?.removal?.outcome || item?.executionOutcome?.outcome,
    );
    return rows;
  }

  if (trnType === "METER_READING") {
    addSummaryRow(rows, "Instruction", item?.assignment?.instruction?.text);
    addSummaryRow(rows, "Origin Channel", item?.origin?.channel);
    addSummaryRow(rows, "Origin Source", item?.origin?.source);
    return rows;
  }

  return rows;
}

function buildMediaRows(item = {}) {
  return getFormMedia(item).map((mediaItem, index) => ({
    mediaItem,
    index,
    url: getMediaUrl(mediaItem),
    isImage: isImageMedia(mediaItem),
    label: getMediaDisplayLabel(mediaItem, index),
  }));
}

const TrnItem = ({ item }) => {
  const [summaryVisible, setSummaryVisible] = useState(false);

  const trnType = item?.accessData?.trnType || "UNKNOWN_TRN";

  const trnTypeLabelMap = {
    METER_DISCOVERY: "METER DISCOVERY",
    METER_INSTALLATION: "METER INSTALLATION",
    METER_COMMISSIONING: "METER COMMISSIONING",
    METER_INSPECTION: "METER INSPECTION",
    METER_DISCONNECTION: "METER DISCONNECTION",
    METER_RECONNECTION: "METER RECONNECTION",
    METER_REMOVAL: "METER REMOVAL",
    METER_READING: "METER READING",
    METER_VENDING: "METER VENDING",
  };

  const trnTypeIconMap = {
    METER_DISCOVERY: "magnify-scan",
    METER_INSTALLATION: "tools",
    METER_COMMISSIONING: "progress-check",
    METER_INSPECTION: "clipboard-search-outline",
    METER_DISCONNECTION: "power-plug-off-outline",
    METER_RECONNECTION: "power-plug-outline",
    METER_REMOVAL: "delete-alert-outline",
    METER_READING: "counter",
    METER_VENDING: "cash-register",
  };

  const trnTypeColorMap = {
    METER_DISCOVERY: "#6366F1",
    METER_INSTALLATION: "#2563EB",
    METER_COMMISSIONING: "#16A34A",
    METER_INSPECTION: "#7C3AED",
    METER_DISCONNECTION: "#DC2626",
    METER_RECONNECTION: "#059669",
    METER_REMOVAL: "#EA580C",
    METER_READING: "#0891B2",
    METER_VENDING: "#0891B2",
  };

  const trnTypeLabel = trnTypeLabelMap[trnType] || trnType.replaceAll("_", " ");

  const trnTypeIcon = trnTypeIconMap[trnType] || "file-document-outline";
  const trnTypeColor = trnTypeColorMap[trnType] || "#475569";

  const isWater = item.meterType === "water";

  const accessVal = item.accessData?.access?.hasAccess;

  const hasAccess =
    accessVal === true || accessVal === "yes" || accessVal === "true";

  const isNoAccess = !hasAccess;

  const iconName = isNoAccess
    ? "shield-alert-outline"
    : isWater
      ? "water"
      : "lightning-bolt";

  const boundaryColor = !hasAccess
    ? "#EF4444"
    : isWater
      ? "#3B82F6"
      : "#EAB308";

  // const trnRef = item.id?.split("_").pop() || "N/A";

  const createdByName = getCreatedByUser(item) || "NAv";
  const assignedToName = getAssignedTo(item) || "NAv";
  const workflowState = getWorkflowState(item) || "NAv";

  const workflowStateConfig = getWorkflowStateConfig(workflowState);

  const meterNo = hasAccess
    ? getMeterNo(item) || "NO METER"
    : "NO METER NUMBER";

  const dateAt = item.metadata?.updatedAt;

  const rawDate = dateAt?.__time__ || dateAt;

  const parsedDate = rawDate ? new Date(rawDate) : null;

  const timeLabel =
    parsedDate && isValid(parsedDate) ? format(parsedDate, "HH:mm") : "--:--";

  const dateLabel =
    parsedDate && isValid(parsedDate) ? format(parsedDate, "MMM dd") : "";

  const wardPcode = item.accessData?.parents?.wardPcode || "";

  const wardNo = wardPcode ? wardPcode.slice(-3).replace(/^0+/, "") : "?";

  const formMedia = getFormMedia(item);

  return (
    <View
      style={[
        styles.card,
        { borderRightWidth: 6, borderRightColor: boundaryColor },
      ]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.trnTypeBanner,
            {
              backgroundColor: `${trnTypeColor}12`,
              borderColor: `${trnTypeColor}55`,
            },
          ]}
        >
          <View style={styles.trnTypeLeft}>
            <MaterialCommunityIcons
              name={trnTypeIcon}
              size={18}
              color={trnTypeColor}
            />
            <Text style={[styles.trnTypeBannerText, { color: trnTypeColor }]}>
              {trnTypeLabel}
            </Text>
          </View>
        </View>

        <View style={[styles.header, { alignItems: "center" }]}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              flex: 1,
            }}
          >
            <View
              style={[
                styles.typeTag,
                { backgroundColor: `${boundaryColor}10` },
              ]}
            >
              <MaterialCommunityIcons
                name={iconName}
                size={22}
                color={boundaryColor}
              />
            </View>

            <View style={styles.meterNumberContainer}>
              <Text style={styles.meterNumberText} numberOfLines={1}>
                {meterNo}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.timeText}>{timeLabel}</Text>
              <Text
                style={{ fontSize: 9, color: "#94A3B8", fontWeight: "800" }}
              >
                {dateLabel}
              </Text>
            </View>

            <TouchableOpacity onPress={() => setSummaryVisible(true)}>
              <MaterialCommunityIcons
                name="file-document-edit-outline"
                size={26}
                color="#2563eb"
              />
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 5,
            justifyContent: "space-between",
          }}
        >
          {/* colLeft - Adr and prop type */}
          <View>
            <Text
              style={[styles.addressText, { marginTop: 8 }]}
              numberOfLines={1}
            >
              {item.accessData?.premise?.address || "Street Address N/A"}
            </Text>
            <Text
              style={[styles.propertyTypeText, { marginTop: 4 }]}
              numberOfLines={1}
            >
              {item.accessData?.premise?.propertyType || "Property Type N/A"}
            </Text>
          </View>
          {/* colRight - WardNo and erfNo   */}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, color: "#a3b5ce", marginTop: 8 }}>
              Ward No: {wardNo || "No Ward number"}
            </Text>
            <Text style={{ fontSize: 12, color: "#a3b5ce", marginTop: 4 }}>
              Erf No: {item.accessData?.erfNo || "No ErfNo"}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.agentInfo}>
            <MaterialCommunityIcons
              name="account-search-outline"
              size={14}
              color="#64748B"
            />

            <View style={styles.agentTextWrap}>
              <Text style={styles.agentLine} numberOfLines={1}>
                <Text style={styles.agentRoleLabel}>Created by </Text>
                {createdByName}
              </Text>

              <Text style={styles.agentLine} numberOfLines={1}>
                <Text style={styles.agentRoleLabel}>Assigned To </Text>
                {assignedToName}
              </Text>
            </View>

            {/* <Text style={styles.idBadge}>#{trnRef}</Text> */}
          </View>

          <View
            style={[
              styles.workflowStateBadge,
              {
                backgroundColor: workflowStateConfig.bg,
                borderColor: workflowStateConfig.border,
              },
            ]}
          >
            <Text
              style={[
                styles.workflowStateText,
                { color: workflowStateConfig.color },
              ]}
              numberOfLines={1}
            >
              {workflowStateConfig.label}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: hasAccess ? "#DCFCE7" : "#FEE2E2" },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: hasAccess ? "#166534" : "#991B1B" },
              ]}
            >
              {hasAccess ? "ACCESS" : "NO ACCESS"}
            </Text>
          </View>
        </View>
      </View>

      <FormSummaryModal
        visible={summaryVisible}
        item={item}
        mediaItems={formMedia}
        onClose={() => setSummaryVisible(false)}
      />
    </View>
  );
};

function SummaryRow({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || "NAv"}</Text>
    </View>
  );
}

function SummarySection({ title, icon = "information-outline", rows = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <View style={styles.summarySection}>
      <View style={styles.summarySectionHeader}>
        <MaterialCommunityIcons name={icon} size={17} color="#2563eb" />
        <Text style={styles.summarySectionTitle}>{title}</Text>
        <Text style={styles.summarySectionCount}>{rows.length}</Text>
      </View>

      <View style={styles.summaryGrid}>
        {rows.map((row, index) => (
          <SummaryRow
            key={`${title}-${row.label}-${index}`}
            label={row.label}
            value={row.value}
          />
        ))}
      </View>
    </View>
  );
}

function FormSummaryModal({ visible, item, mediaItems = [], onClose }) {
  const commonRows = buildCommonSummaryRows(item);
  const meterRows = buildMeterSummaryRows(item);
  const formRows = buildFormSummaryRows(item);
  const readingRows = buildReadingSummaryRows(item);
  const mediaRows = buildMediaRows(item);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.formSummarySheet}>
          <View style={styles.formSummaryHeader}>
            <View style={styles.formSummaryIcon}>
              <MaterialCommunityIcons
                name="file-document-edit-outline"
                size={22}
                color="#2563eb"
              />
            </View>

            <View style={styles.formSummaryHeaderMain}>
              <Text style={styles.formSummaryTitle}>Form Summary</Text>
              <Text style={styles.formSummarySub} numberOfLines={1}>
                {item?.id || "NAv"}
              </Text>
            </View>

            <TouchableOpacity style={styles.formSummaryClose} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formSummaryScroll}
            contentContainerStyle={styles.formSummaryContent}
            showsVerticalScrollIndicator={false}
          >
            <SummarySection
              title="Common TRN Summary"
              icon="clipboard-text-outline"
              rows={commonRows}
            />

            <SummarySection
              title="Meter Snapshot"
              icon="counter"
              rows={meterRows}
            />

            <SummarySection
              title="Form Details"
              icon="form-select"
              rows={formRows}
            />

            <SummarySection
              title="Reading / Token Summary"
              icon="counter"
              rows={readingRows}
            />

            <View style={styles.formMediaSectionHeader}>
              <Text style={styles.formMediaSectionTitle}>Photos / Media</Text>
              <Text style={styles.formMediaSectionCount}>
                {mediaRows.length}
              </Text>
            </View>

            {mediaRows.length === 0 ? (
              <View style={styles.noFormMediaBox}>
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={30}
                  color="#94a3b8"
                />
                <Text style={styles.noFormMediaTitle}>No form media</Text>
                <Text style={styles.noFormMediaText}>
                  This transaction does not have attached form media.
                </Text>
              </View>
            ) : (
              mediaRows.map((mediaRow) => {
                const { mediaItem, index, url, isImage, label } = mediaRow;

                return (
                  <View
                    key={`${label}-${index}-${url}`}
                    style={styles.formMediaCard}
                  >
                    <View style={styles.formMediaCardHeader}>
                      <MaterialCommunityIcons
                        name={isImage ? "image-outline" : "file-eye-outline"}
                        size={17}
                        color="#2563eb"
                      />
                      <Text style={styles.formMediaLabel}>{label}</Text>
                      <Text style={styles.formMediaTag}>
                        {mediaItem?.tag || "NAv"}
                      </Text>
                    </View>

                    {isImage ? (
                      <View style={styles.formMediaImageFrame}>
                        <Image
                          source={{ uri: url }}
                          style={styles.formMediaImage}
                          resizeMode="contain"
                        />
                      </View>
                    ) : (
                      <View style={styles.formMediaUnsupportedBox}>
                        <MaterialCommunityIcons
                          name="file-eye-outline"
                          size={28}
                          color="#94a3b8"
                        />
                        <Text style={styles.formMediaUnsupportedText}>
                          Preview not enabled for this media type.
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function TrnsScreen() {
  const { filtered, sync } = useWarehouse();
  const { filterState, isFiltering } = useTrnFilter();

  const baseTrns = useMemo(() => filtered?.trns || [], [filtered?.trns]);

  const displayTrns = useMemo(() => {
    return filterTrns(baseTrns, filterState);
  }, [baseTrns, filterState]);

  const trnsSync = sync?.trns || {};
  const scopeSync = sync?.scope || {};

  const isLoading = trnsSync?.status === "syncing";
  const noWard = scopeSync?.status === "awaiting-ward";

  if (noWard) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>
          Select a ward to view field transactions.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Syncing Audit Logs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={displayTrns}
        renderItem={({ item }) => <TrnItem item={item} />}
        keyExtractor={(item) => item?.id}
        estimatedItemSize={120}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={[styles.center, { paddingTop: 40 }]}>
            <Text style={styles.loadingText}>
              {baseTrns.length === 0
                ? "No transactions in this ward."
                : isFiltering
                  ? "No transactions match the current filters."
                  : "No transactions in this ward."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: { marginTop: 10, color: "#64748B", fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#64748B", fontWeight: "500", marginTop: 8 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    overflow: "hidden",
  },
  accentBar: { width: 5 },
  content: { flex: 1, padding: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "900",
    marginLeft: 4,
    color: "#475569",
  },
  timeText: { fontSize: 11, color: "#94A3B8", fontWeight: "800" },
  addressText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#334155",
  },
  propertyTypeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#8d99ab",
    marginBottom: 10,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
  },
  agentInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },
  agentTextWrap: {
    flex: 1,
  },
  agentLine: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
  },
  agentRoleLabel: {
    color: "#94A3B8",
    fontWeight: "900",
  },
  agentName: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  idBadge: {
    fontSize: 10,
    color: "#94A3B8",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 9, fontWeight: "900" },

  workflowStateBadge: {
    maxWidth: 96,
    flexShrink: 0,
    marginHorizontal: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  workflowStateText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.25,
  },

  meterNumberContainer: {
    backgroundColor: "#F1F5F9", // Subtle grey background
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  meterNumberText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A", // Darker navy for contrast
    letterSpacing: 0.5,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", // 🎯 Technical look
  },

  trnTypeBanner: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  trnTypeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },

  trnTypeBannerText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },

  formSummarySheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "88%",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
  },

  formSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  formSummaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },

  formSummaryHeaderMain: {
    flex: 1,
  },

  formSummaryTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },

  formSummarySub: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },

  formSummaryClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },

  formSummaryScroll: {
    maxHeight: "100%",
  },

  formSummaryContent: {
    paddingBottom: 18,
  },

  summarySection: {
    marginBottom: 14,
  },

  summarySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },

  summarySectionTitle: {
    flex: 1,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },

  summarySectionCount: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 22,
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  summaryRow: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },

  summaryLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  summaryValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
    lineHeight: 16,
  },

  readingSummaryBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    padding: 10,
  },

  readingSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 6,
  },

  readingSummaryTitle: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  readingSummaryValue: {
    color: "#14532d",
    fontSize: 22,
    fontWeight: "900",
  },

  readingSummaryMeta: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  formMediaSectionHeader: {
    marginTop: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  formMediaSectionTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },

  formMediaSectionCount: {
    minWidth: 26,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 24,
  },

  noFormMediaBox: {
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 6,
  },

  noFormMediaTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },

  noFormMediaText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  formMediaCard: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 9,
  },

  formMediaCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },

  formMediaLabel: {
    flex: 1,
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },

  formMediaTag: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  formMediaImageFrame: {
    width: "100%",
    minHeight: 240,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#020617",
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  formMediaImage: {
    width: "100%",
    height: 230,
    borderRadius: 10,
    backgroundColor: "#020617",
  },

  formMediaUnsupportedBox: {
    minHeight: 130,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 8,
  },

  formMediaUnsupportedText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  trnTypeRawText: {
    fontSize: 8,
    fontWeight: "900",
    opacity: 0.75,
  },
});
