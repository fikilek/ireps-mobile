import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGeo } from "../../context/GeoContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../hooks/useAuth";
import { useGetServiceProvidersQuery } from "../../redux/spApi";

const getMeterStatusConfig = (state = "") => {
  const s = String(state || "UNKNOWN").toUpperCase();

  if (s === "CONNECTED") {
    return {
      label: "CONNECTED",
      icon: "check-circle",
      color: "#10B981",
      bg: "#ECFDF5",
      border: "#A7F3D0",
    };
  }

  if (s === "DISCONNECTED") {
    return {
      label: "DISCONNECTED",
      icon: "close-circle",
      color: "#EF4444",
      bg: "#FEF2F2",
      border: "#FECACA",
    };
  }

  return {
    label: s,
    icon: "alert-circle",
    color: "#F59E0B",
    bg: "#FFFBEB",
    border: "#FDE68A",
  };
};

const getMeterKindConfig = (kind = "") => {
  const clean = String(kind || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");

  if (clean === "prepaid") {
    return {
      label: "PRE-PAID",
      icon: "cash-multiple",
      color: "#0891B2",
      bg: "#ECFEFF",
      border: "#A5F3FC",
    };
  }

  if (clean === "conventional" || clean === "postpaid" || clean === "credit") {
    return {
      label: "CONVENTIONAL",
      icon: "gauge",
      color: "#7C3AED",
      bg: "#F5F3FF",
      border: "#DDD6FE",
    };
  }

  return {
    label: "UNKNOWN KIND",
    icon: "help-circle-outline",
    color: "#64748B",
    bg: "#F8FAFC",
    border: "#E2E8F0",
  };
};

const formatAstUpdatedAt = (value) => {
  if (!value) return "NAv";

  let dateValue = null;

  if (typeof value?.toDate === "function") {
    dateValue = value.toDate();
  } else if (value?.seconds) {
    dateValue = new Date(value.seconds * 1000);
  } else if (value?.__time__) {
    dateValue = new Date(value.__time__);
  } else {
    dateValue = new Date(value);
  }

  if (Number.isNaN(dateValue?.getTime?.())) return "NAv";

  return dateValue.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseReadingNumber = (value) => {
  const clean = String(value || "")
    .replace(/,/g, "")
    .trim();
  if (!clean) return null;

  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatReadingValue = (value) => {
  const parsed = parseReadingNumber(value);

  if (parsed === null) {
    const clean = String(value || "").trim();
    return clean || "NAv";
  }

  return new Intl.NumberFormat().format(parsed);
};

const formatReadingDateTime = (value) => {
  if (!value) return "NAv";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "NAv";

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeMreadings = (mreadings = []) => {
  return (Array.isArray(mreadings) ? mreadings : [])
    .map((readingItem) => {
      const readingNumber = parseReadingNumber(readingItem?.reading);
      const readingAt = readingItem?.readingAt || "";

      return {
        reading: String(readingItem?.reading || "").trim(),
        readingNumber,
        readingAt,
        trnId: readingItem?.trnId || "NAv",
      };
    })
    .filter(
      (readingItem) =>
        readingItem.readingNumber !== null && readingItem.readingAt,
    )
    .sort((a, b) => Date.parse(b.readingAt) - Date.parse(a.readingAt));
};

const buildMreadingHistoryRows = (mreadings = []) => {
  const sortedReadings = normalizeMreadings(mreadings);

  return sortedReadings.map((readingItem, index) => {
    const olderReading = sortedReadings[index + 1] || null;

    if (!olderReading) {
      return {
        ...readingItem,
        consumption: null,
        daysBetween: null,
        averagePerMonth: null,
      };
    }

    const consumption = readingItem.readingNumber - olderReading.readingNumber;
    const daysBetween =
      (Date.parse(readingItem.readingAt) - Date.parse(olderReading.readingAt)) /
      (1000 * 60 * 60 * 24);

    return {
      ...readingItem,
      consumption,
      daysBetween,
      averagePerMonth:
        daysBetween > 0 ? (consumption / daysBetween) * 30.4375 : null,
    };
  });
};

const formatHistoryMetric = (value, decimals = 0) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "NAv";
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: decimals,
  }).format(Number(value));
};

const ReadingHistoryModal = ({
  visible,
  rows = [],
  meterNo = "NAv",
  unit = "",
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.readingModalBackdrop}>
        <View style={styles.readingModalSheet}>
          <View style={styles.readingModalHeader}>
            <View style={styles.readingModalIcon}>
              <MaterialCommunityIcons
                name="chart-line"
                size={22}
                color="#2563EB"
              />
            </View>

            <View style={styles.readingModalTitleWrap}>
              <Text style={styles.readingModalTitle}>
                Meter Reading History
              </Text>
              <Text style={styles.readingModalSub}>{meterNo}</Text>
            </View>

            <TouchableOpacity
              style={styles.readingModalClose}
              onPress={onClose}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          {rows.length === 0 ? (
            <View style={styles.readingHistoryEmpty}>
              <MaterialCommunityIcons
                name="counter"
                size={32}
                color="#94A3B8"
              />
              <Text style={styles.readingHistoryEmptyTitle}>
                No reading history
              </Text>
              <Text style={styles.readingHistoryEmptyText}>
                Successful conventional readings will appear here.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.readingHistoryList}
              contentContainerStyle={styles.readingHistoryListContent}
            >
              {rows.map((row, index) => (
                <View
                  key={`${row.trnId}-${row.readingAt}-${index}`}
                  style={styles.readingHistoryRow}
                >
                  <View style={styles.readingHistoryRowTop}>
                    <Text style={styles.readingHistoryDate}>
                      {formatReadingDateTime(row.readingAt)}
                    </Text>
                    <Text style={styles.readingHistoryReading}>
                      {formatReadingValue(row.reading)} {unit}
                    </Text>
                  </View>

                  <View style={styles.readingHistoryMetrics}>
                    <View style={styles.readingMetricBox}>
                      <Text style={styles.readingMetricLabel}>Consumption</Text>
                      <Text style={styles.readingMetricValue}>
                        {formatHistoryMetric(row.consumption)}
                      </Text>
                    </View>

                    <View style={styles.readingMetricBox}>
                      <Text style={styles.readingMetricLabel}>Days</Text>
                      <Text style={styles.readingMetricValue}>
                        {formatHistoryMetric(row.daysBetween, 1)}
                      </Text>
                    </View>

                    <View style={styles.readingMetricBox}>
                      <Text style={styles.readingMetricLabel}>Avg / Month</Text>
                      <Text style={styles.readingMetricValue}>
                        {formatHistoryMetric(row.averagePerMonth)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const LifecycleActionButton = ({
  label,
  icon,
  available = true,
  onPress,
  showProgress = false,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.lifecycleActionButton,
        !available && styles.lifecycleActionButtonDisabled,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={available ? "#2563EB" : "#94A3B8"}
      />
      <Text
        style={[
          styles.lifecycleActionText,
          !available && styles.lifecycleActionTextDisabled,
        ]}
      >
        {label}
      </Text>

      {showProgress ? (
        <View pointerEvents="none" style={styles.lifecycleProgressDot}>
          <MaterialCommunityIcons
            name="progress-clock"
            size={10}
            color="#FFFFFF"
          />
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

function formatLifecycleDateTime(value) {
  if (!value) return "NAv";

  let dateValue = null;

  if (typeof value?.toDate === "function") {
    dateValue = value.toDate();
  } else if (value?.seconds) {
    dateValue = new Date(value.seconds * 1000);
  } else if (value?.__time__) {
    dateValue = new Date(value.__time__);
  } else {
    dateValue = new Date(value);
  }

  if (Number.isNaN(dateValue?.getTime?.())) return "NAv";

  return dateValue.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

function formatLifecycleAssignedTo(assignedTo = {}) {
  const name = readFirstString(
    assignedTo?.name,
    assignedTo?.title,
    assignedTo?.displayName,
    assignedTo?.id,
  );
  const type = readFirstString(assignedTo?.type);

  if (name && type) return `${name} (${type})`;
  if (name) return name;
  if (type) return type;

  return "NAv";
}

const MLCT_PROGRESS_CONFIG = {
  METER_INSPECTION: {
    short: "INSP",
    title: "INSPECTION",
    icon: "clipboard-search-outline",
  },
  METER_DISCONNECTION: {
    short: "DCN",
    title: "DISCONNECTION",
    icon: "power-plug-off-outline",
  },
  METER_RECONNECTION: {
    short: "RCN",
    title: "RECONNECTION",
    icon: "power-plug-outline",
  },
  METER_REMOVAL: {
    short: "REM",
    title: "REMOVAL",
    icon: "delete-alert-outline",
  },
  METER_READING: {
    short: "MREAD",
    title: "METER READING",
    icon: "counter",
  },
};

function getLifecycleTrnType(lifecycle = {}) {
  return String(
    lifecycle?.trnType || lifecycle?.type || lifecycle?.lctType || "",
  ).toUpperCase();
}

function getLifecycleProgress(item = {}, trnType = "") {
  const lifecycle = item?.trnActiveLifecycle || item?.activeLifecycle || null;
  const lifecycleTrnType = getLifecycleTrnType(lifecycle);
  const wantedTrnType = String(trnType || "").toUpperCase();

  if (!lifecycle || !wantedTrnType || lifecycleTrnType !== wantedTrnType) {
    return null;
  }

  return lifecycle;
}

function getLifecycleProgressConfig(lifecycle = {}) {
  const trnType = getLifecycleTrnType(lifecycle);

  return (
    MLCT_PROGRESS_CONFIG[trnType] || {
      short: trnType || "MLCT",
      title: trnType || "MLCT",
      icon: "progress-clock",
    }
  );
}

function getLifecycleWorkflowState(lifecycle = {}) {
  return String(
    lifecycle?.workflowState ||
      lifecycle?.workflow?.state ||
      lifecycle?.state ||
      "",
  ).toUpperCase();
}

function isActiveLifecycleProgress(lifecycle = {}) {
  return ["ISSUED", "ACCEPTED", "REASSIGNED", "IN_PROGRESS"].includes(
    getLifecycleWorkflowState(lifecycle),
  );
}

const ProgressInfoRow = ({ label, value }) => {
  return (
    <View style={styles.progressInfoRow}>
      <Text style={styles.progressInfoLabel}>{label}</Text>
      <Text style={styles.progressInfoValue} selectable>
        {value || "NAv"}
      </Text>
    </View>
  );
};

const LifecycleProgressModal = ({ visible, lifecycle, meterNo, onClose }) => {
  const progressConfig = getLifecycleProgressConfig(lifecycle);

  const trnId = readFirstString(lifecycle?.trnId);
  const trnType = readFirstString(lifecycle?.trnType);
  const workflowState = readFirstString(lifecycle?.workflowState);
  const outcome = readFirstString(lifecycle?.outcome);
  const assignedTo = formatLifecycleAssignedTo(lifecycle?.assignedTo);
  const updatedAt = lifecycle?.updatedAt
    ? formatLifecycleDateTime(lifecycle?.updatedAt)
    : "NAv";
  const updatedByUser = readFirstString(lifecycle?.updatedByUser);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.progressModalBackdrop}>
        <View style={styles.progressModalSheet}>
          <View style={styles.progressModalHeader}>
            <View style={styles.progressModalIcon}>
              <MaterialCommunityIcons
                name={progressConfig.icon}
                size={23}
                color="#2563EB"
              />
            </View>

            <View style={styles.progressModalTitleWrap}>
              <Text style={styles.progressModalTitle}>Lifecycle Work</Text>
              <Text style={styles.progressModalSub}>{meterNo || "NAv"}</Text>
            </View>

            <TouchableOpacity
              style={styles.progressModalClose}
              onPress={onClose}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <View style={styles.progressInfoBox}>
            <ProgressInfoRow label="trnId" value={trnId || "NAv"} />
            <ProgressInfoRow label="trnType" value={trnType || "NAv"} />
            <ProgressInfoRow
              label="workflowState"
              value={workflowState || "NAv"}
            />
            <ProgressInfoRow label="outcome" value={outcome || "NAv"} />
            <ProgressInfoRow label="assignedTo" value={assignedTo || "NAv"} />
            <ProgressInfoRow label="updatedAt" value={updatedAt || "NAv"} />
            <ProgressInfoRow
              label="updatedByUser"
              value={updatedByUser || "NAv"}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

function serviceProviderLooksMnc(serviceProvider = {}) {
  const clients = Array.isArray(serviceProvider?.clients)
    ? serviceProvider.clients
    : [];

  return clients.some(
    (client) =>
      String(client?.clientType || "").toUpperCase() === "LM" &&
      String(client?.relationshipType || "").toUpperCase() === "MNC",
  );
}

const AstItem = ({ item }) => {
  // console.log(`AstItem --item`, item);
  const { all } = useWarehouse();
  const { updateGeo, geoState } = useGeo();
  const router = useRouter();
  const { profile, isMNG, isSPV, isFWR } = useAuth();
  const [readingHistoryVisible, setReadingHistoryVisible] = useState(false);
  const [lifecycleProgress, setLifecycleProgress] = useState(null);

  // 🎯 DATA EXTRACTION
  const isWater = item.meterType === "water";
  const meterNo = item.ast?.astData?.astNo || "NO METER NO";
  const manufacturer = item.ast?.astData?.astManufacturer || "Unknown";
  const anomaly = item.ast?.anomalies?.anomaly || "Meter Ok";

  const meterStatusState = item?.status?.state || "UNKNOWN";
  const meterStatusConfig = getMeterStatusConfig(meterStatusState);

  const visibility = item?.master?.visibility || "NAv";
  const isVisible = visibility === "VISIBLE";
  const isInvisible = visibility === "INVISIBLE";

  const astName = item.ast?.astData?.astName || "NAv";
  const erfNo = item.accessData?.erfNo || "NAv";
  const premiseId = item.accessData?.premise?.id || null;

  const parentPremiseDoc = all?.prems?.find((p) => p.id === premiseId);

  const premiseFullAddress = parentPremiseDoc
    ? `${parentPremiseDoc?.address?.strNo || ""} ${parentPremiseDoc?.address?.strName || ""} ${parentPremiseDoc?.address?.strType || ""}`.trim() ||
      "NAv"
    : item.accessData?.premise?.address || "NAv";

  const isPremiseSelected = geoState?.selectedPremise?.id === premiseId;

  const premiseForGeo = parentPremiseDoc || {
    id: premiseId,
    erfId: item?.accessData?.erfId || null,
    erfNo,
    address: item?.accessData?.premise?.address || premiseFullAddress,
    parents: item?.accessData?.parents || {},
  };

  const handleTogglePremiseSelection = () => {
    if (!premiseId) {
      Alert.alert(
        "Premise Not Found",
        "This meter does not have a linked premise id.",
      );
      return;
    }

    if (isPremiseSelected) {
      updateGeo({
        selectedPremise: null,
        selectedMeter: null,
        lastSelectionType: null,
      });
      return;
    }

    updateGeo({
      selectedPremise: premiseForGeo,
      selectedMeter: null,
      lastSelectionType: "PREMISE",
    });
  };

  const wardPcode =
    item?.accessData?.parents?.wardPcode ||
    parentPremiseDoc?.parents?.wardPcode ||
    "";

  const wardNo = (() => {
    const tail = String(wardPcode || "").slice(-3);
    const n = parseInt(tail, 10);
    return Number.isNaN(n) ? "NAv" : String(n);
  })();

  const normalize = (value) =>
    String(value || "")
      .trim()
      .toUpperCase();

  const meterState = normalize(item?.status?.state);
  const meterType = String(item?.meterType || "").toLowerCase();
  const meterKind = String(item?.ast?.astData?.meter?.type || "")
    .trim()
    .toLowerCase();

  const meterKindConfig = getMeterKindConfig(meterKind);
  const updatedAtLabel = formatAstUpdatedAt(item?.metadata?.updatedAt);

  const isValidCommissionMeterType = ["electricity", "water"].includes(
    meterType,
  );

  const isCommissionCandidate =
    meterState === "FIELD" && isValidCommissionMeterType;

  const canInspect = ["FIELD", "CONNECTED", "DISCONNECTED", "REMOVED"].includes(
    meterState,
  );
  const canDisconnect = meterState === "CONNECTED";
  const canReconnect = meterState === "DISCONNECTED";
  const canRemove = meterState !== "REMOVED";

  const actorServiceProviderId =
    profile?.employment?.serviceProvider?.id || null;

  const { data: serviceProviders = [] } = useGetServiceProvidersQuery();

  const actorServiceProvider = useMemo(() => {
    if (!actorServiceProviderId) return null;

    return (
      serviceProviders.find((serviceProvider) => {
        return serviceProvider?.id === actorServiceProviderId;
      }) || null
    );
  }, [serviceProviders, actorServiceProviderId]);

  const isMncSpv = isSPV && serviceProviderLooksMnc(actorServiceProvider);
  const isSubcSpv =
    isSPV &&
    Boolean(actorServiceProvider) &&
    !serviceProviderLooksMnc(actorServiceProvider);

  const canCreateAndSubmitCommissioning = isFWR || isSubcSpv;

  const canCommission =
    isCommissionCandidate && canCreateAndSubmitCommissioning;

  const canOriginateOfficeLct = isMNG || isMncSpv;

  const normalizedMeterKind = String(meterKind || "")
    .trim()
    .toLowerCase();

  // const isPrepaidMeter = normalizedMeterKind === "prepaid";

  const isConventionalMeter = normalizedMeterKind === "conventional";

  const readingUnit = isWater ? "m³" : "kWh";

  const readingHistoryRows = useMemo(() => {
    return buildMreadingHistoryRows(item?.mreadings || []);
  }, [item?.mreadings]);

  const latestReading = readingHistoryRows[0] || null;

  const showReadingPill = isConventionalMeter && Boolean(latestReading);

  const canMeterRead = meterState !== "DECOMMISSIONED" && isConventionalMeter;

  const canStartMeterReading =
    canMeterRead && (canOriginateOfficeLct || isFWR || isSubcSpv);

  const inspectionLifecycle = getLifecycleProgress(item, "METER_INSPECTION");
  const disconnectionLifecycle = getLifecycleProgress(
    item,
    "METER_DISCONNECTION",
  );
  const reconnectionLifecycle = getLifecycleProgress(
    item,
    "METER_RECONNECTION",
  );
  const removalLifecycle = getLifecycleProgress(item, "METER_REMOVAL");
  const meterReadingLifecycle = getLifecycleProgress(item, "METER_READING");

  const hasActiveInspectionLifecycle =
    inspectionLifecycle && isActiveLifecycleProgress(inspectionLifecycle);
  const hasActiveDisconnectionLifecycle =
    disconnectionLifecycle && isActiveLifecycleProgress(disconnectionLifecycle);
  const hasActiveReconnectionLifecycle =
    reconnectionLifecycle && isActiveLifecycleProgress(reconnectionLifecycle);
  const hasActiveRemovalLifecycle =
    removalLifecycle && isActiveLifecycleProgress(removalLifecycle);
  const hasActiveMeterReadingLifecycle =
    meterReadingLifecycle && isActiveLifecycleProgress(meterReadingLifecycle);

  const openLifecycleProgress = (lifecycle) => {
    if (!lifecycle) return;
    setLifecycleProgress(lifecycle);
  };

  const launchTrnOrigin = (trnType) => {
    router.push({
      pathname: "/(tabs)/admin/operations/trn-origin",
      params: {
        trnType,
        astId: item.id,
        premiseId: item?.accessData?.premise?.id || "NAv",
        asset: encodeURIComponent(JSON.stringify(item)),
      },
    });
  };

  const alertNoLifecycleOriginRights = () => {
    Alert.alert(
      "Not Allowed",
      "Lifecycle work must be issued by MNG or SPV from Operations. Field workers must execute assigned work from TrnsScreen.",
    );
  };

  const launchCommissioning = () => {
    if (!isCommissionCandidate) {
      Alert.alert(
        "Not Eligible",
        "Only FIELD electricity or water meters can be commissioned.",
      );
      return;
    }

    if (!canCreateAndSubmitCommissioning) {
      Alert.alert(
        "Not Allowed",
        "Only FWR or SPV(SUBC) may create and submit meter commissioning.",
      );
      return;
    }

    router.push({
      pathname: "/(tabs)/asts/commissioning",
      params: {
        astId: item.id,
        premiseId: item?.accessData?.premise?.id || "NAv",
        action: JSON.stringify({
          trnType: "METER_COMMISSIONING",
          astId: item.id,
          meterType: item?.meterType || "NAv",
          meterNo: item?.ast?.astData?.astNo || "NAv",
          statusBefore: item?.status?.state || "UNKNOWN",
        }),
      },
    });
  };

  const launchRemoval = () => {
    if (hasActiveRemovalLifecycle) {
      openLifecycleProgress(removalLifecycle);
      return;
    }

    if (!canRemove) {
      Alert.alert(
        "Not Eligible",
        "Meter Removal is not available for meters that are already REMOVED.",
      );
      return;
    }

    if (!canOriginateOfficeLct) {
      alertNoLifecycleOriginRights();
      return;
    }

    launchTrnOrigin("METER_REMOVAL");
  };

  const launchInspection = () => {
    if (hasActiveInspectionLifecycle) {
      openLifecycleProgress(inspectionLifecycle);
      return;
    }

    if (!canInspect) {
      Alert.alert(
        "Not Eligible",
        "Inspection is not available for DECOMMISSIONED meters.",
      );
      return;
    }

    if (!canOriginateOfficeLct) {
      alertNoLifecycleOriginRights();
      return;
    }

    launchTrnOrigin("METER_INSPECTION");
  };

  const launchDisconnection = () => {
    if (hasActiveDisconnectionLifecycle) {
      openLifecycleProgress(disconnectionLifecycle);
      return;
    }

    if (!canDisconnect) {
      Alert.alert(
        "Not Eligible",
        "Meter Disconnection is only available for CONNECTED meters.",
      );
      return;
    }

    if (!canOriginateOfficeLct) {
      alertNoLifecycleOriginRights();
      return;
    }

    launchTrnOrigin("METER_DISCONNECTION");
  };

  const launchReconnection = () => {
    if (hasActiveReconnectionLifecycle) {
      openLifecycleProgress(reconnectionLifecycle);
      return;
    }

    if (!canReconnect) {
      Alert.alert(
        "Not Eligible",
        "Meter Reconnection is only available for DISCONNECTED meters.",
      );
      return;
    }

    if (!canOriginateOfficeLct) {
      alertNoLifecycleOriginRights();
      return;
    }

    launchTrnOrigin("METER_RECONNECTION");
  };

  const launchMeterReading = () => {
    if (hasActiveMeterReadingLifecycle) {
      openLifecycleProgress(meterReadingLifecycle);
      return;
    }

    if (!canMeterRead) {
      Alert.alert(
        "Not Eligible",
        "Meter Reading is only available for conventional meters that are not DECOMMISSIONED.",
      );
      return;
    }

    if (canOriginateOfficeLct) {
      launchTrnOrigin("METER_READING");
      return;
    }

    if (isFWR || isSubcSpv) {
      router.push({
        pathname: "/(tabs)/asts/meter-reading",
        params: {
          astId: item.id,
          premiseId: item?.accessData?.premise?.id || "NAv",
          asset: encodeURIComponent(JSON.stringify(item)),
          action: JSON.stringify({
            source: "FIELD",
            trnType: "METER_READING",
            astId: item.id,
            sourceAstId: item.id,
            premiseId: item?.accessData?.premise?.id || "NAv",
            meterType: item?.meterType || "NAv",
            meterNo: item?.ast?.astData?.astNo || "NAv",
            statusBefore: item?.status?.state || "UNKNOWN",
            origin: {
              channel: "FIELD",
              source: "AST_ITEM",
            },
          }),
        },
      });
      return;
    }

    Alert.alert(
      "Not Allowed",
      "Only MNG, SPV(MNC), FWR, or SPV(SUBC) can start Meter Reading.",
    );
  };

  const handleGoToDetails = () => {
    const meterNo = item.ast?.astData?.astNo;
    const docId = item.id;

    router.push({
      pathname: "/(tabs)/asts/details",
      params: {
        docId: docId,
        astNo: meterNo || "NAv",
      },
    });
  };

  const handleGoToReport = () => {
    const meterNo = item?.ast?.astData?.astNo || "NAv";
    const id = item?.id;

    if (!id) {
      console.warn("⚠️ Asset missing AST id, cannot open report");
      return;
    }

    if (!item?.ast?.astData?.astNo) {
      console.warn("⚠️ Asset missing Meter Number, using ID only");
    }

    router.push({
      pathname: "/(tabs)/asts/[id]",
      params: {
        id,
        astNo: meterNo,
      },
    });
  };

  const handleGoToMedia = () => {
    const meterNo = item.ast?.astData?.astNo;
    const id = item.id;

    router.push({
      pathname: "/(tabs)/asts/media",
      params: {
        astNo: meterNo || "NAv",
        id: id,
      },
    });
  };

  const handleGoToMap = () => {
    const meter = item;
    const premiseId = meter?.accessData?.premise?.id;
    const erfId = meter?.accessData?.erfId;

    const parentPremise = all?.prems?.find((p) => p.id === premiseId);
    const parentErf = all?.erfs?.find((e) => e.id === erfId);

    updateGeo({
      selectedErf: parentErf || null,
      lastSelectionType: "ERF",
    });
    updateGeo({
      selectedPremise: parentPremise || null,
      lastSelectionType: "PREMISE",
    });
    updateGeo({
      selectedMeter: meter,
      lastSelectionType: "METER",
    });

    router.push("/(tabs)/maps");
  };

  return (
    <View style={styles.card}>
      <View style={styles.mainContent}>
        {/* 🏛️ LEFT: ICON */}
        <View style={styles.iconContainer}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isWater ? "#EFF6FF" : "#FEFCE8" },
            ]}
          >
            <MaterialCommunityIcons
              name={isWater ? "water-outline" : "lightning-bolt-outline"}
              size={24}
              color={isWater ? "#3B82F6" : "#EAB308"}
            />
          </View>
        </View>

        {/* 🏛️ RIGHT: DATA */}

        <View style={styles.details}>
          <View style={styles.row}>
            <View style={styles.titleBlock}>
              <Text style={styles.meterNo}>{meterNo}</Text>

              <View style={styles.makeModelRow}>
                <Text style={styles.makeModelText}>{manufacturer}</Text>
                <Text style={styles.makeModelDot}>•</Text>
                <Text style={styles.makeModelText}>{astName}</Text>
              </View>
            </View>

            <View style={styles.topRightBadgeCol}>
              <View
                style={[
                  styles.typeBadge,
                  { borderColor: isWater ? "#3B82F6" : "#EAB308" },
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    { color: isWater ? "#3B82F6" : "#EAB308" },
                  ]}
                >
                  {item.meterType?.toUpperCase()}
                </Text>
              </View>

              <Text
                style={[
                  styles.visibilityText,
                  isVisible && styles.visibilityTextVisible,
                  isInvisible && styles.visibilityTextInvisible,
                  !isVisible && !isInvisible && styles.visibilityTextNeutral,
                ]}
              >
                {visibility}
              </Text>
            </View>
          </View>

          {/* Ward No, Erf No, Address - tap to toggle premise scope */}
          <Pressable
            onPress={handleTogglePremiseSelection}
            style={({ pressed }) => [
              styles.geoPressable,
              isPremiseSelected && styles.geoPressableSelected,
              pressed && styles.geoPressablePressed,
            ]}
          >
            <View style={styles.geoRow}>
              <MaterialCommunityIcons
                name={
                  isPremiseSelected ? "map-marker-check" : "map-marker-path"
                }
                size={14}
                color={isPremiseSelected ? "#2563EB" : "#64748B"}
              />

              <Text
                style={[
                  styles.geoText,
                  isPremiseSelected && styles.geoTextSelected,
                ]}
                // numberOfLines={2}
              >
                W{wardNo} • ERF {erfNo} • {premiseFullAddress}
              </Text>

              {/* <View
                style={[
                  styles.geoScopePill,
                  isPremiseSelected && styles.geoScopePillSelected,
                ]}
              >
                <Text
                  style={[
                    styles.geoScopePillText,
                    isPremiseSelected && styles.geoScopePillTextSelected,
                  ]}
                >
                  {isPremiseSelected ? "SELECTED" : "PREMISE"}
                </Text>
              </View> */}
            </View>
          </Pressable>
        </View>
      </View>

      {/* Meter data row */}
      <View style={styles.meterMetaRow}>
        <View
          style={[
            styles.meterKindPill,
            {
              backgroundColor: meterKindConfig.bg,
              borderColor: meterKindConfig.border,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={meterKindConfig.icon}
            size={13}
            color={meterKindConfig.color}
          />
          <Text
            style={[styles.meterKindText, { color: meterKindConfig.color }]}
            numberOfLines={1}
          >
            {meterKindConfig.label}
          </Text>
        </View>

        {showReadingPill ? (
          <TouchableOpacity
            style={styles.lastReadingPill}
            activeOpacity={0.82}
            onPress={() => setReadingHistoryVisible(true)}
          >
            <MaterialCommunityIcons
              name="chart-line"
              size={13}
              color="#166534"
            />
            <Text style={styles.lastReadingText} numberOfLines={1}>
              {formatReadingValue(latestReading?.reading)} {readingUnit}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Row for TRN/action buttons. Buttons stay visible; restrictions are enforced on tap. */}
      <View style={styles.lifecycleActionRow}>
        <LifecycleActionButton
          label="COMM"
          icon="progress-check"
          available={canCommission}
          onPress={launchCommissioning}
        />

        <LifecycleActionButton
          label="INSP"
          icon="clipboard-search-outline"
          available={canInspect}
          onPress={launchInspection}
          showProgress={hasActiveInspectionLifecycle}
        />

        <LifecycleActionButton
          label="DISC"
          icon="power-plug-off-outline"
          available={canDisconnect}
          onPress={launchDisconnection}
          showProgress={hasActiveDisconnectionLifecycle}
        />

        <LifecycleActionButton
          label="RECON"
          icon="power-plug-outline"
          available={canReconnect}
          onPress={launchReconnection}
          showProgress={hasActiveReconnectionLifecycle}
        />

        <LifecycleActionButton
          label="REM"
          icon="delete-alert-outline"
          available={canRemove}
          onPress={launchRemoval}
          showProgress={hasActiveRemovalLifecycle}
        />

        <LifecycleActionButton
          label="MREAD"
          icon="counter"
          available={canStartMeterReading}
          onPress={launchMeterReading}
          showProgress={hasActiveMeterReadingLifecycle}
        />
      </View>

      {/* 🏛️ NEW: EXTREME LEFT-TO-RIGHT ACTION ROW */}
      <View style={styles.fullWidthActionRow}>
        <View style={styles.statusInfo}>
          <View style={styles.statusStack}>
            <View style={styles.statusLine}>
              <MaterialCommunityIcons
                name={anomaly === "Meter Ok" ? "check-circle" : "alert-circle"}
                size={14}
                color={anomaly === "Meter Ok" ? "#10B981" : "#EF4444"}
              />
              <Text
                style={[
                  styles.statusLabel,
                  { color: anomaly === "Meter Ok" ? "#10B981" : "#EF4444" },
                ]}
                numberOfLines={1}
              >
                {anomaly}
              </Text>
            </View>

            <View
              style={[
                styles.meterStateBadge,
                {
                  backgroundColor: meterStatusConfig.bg,
                  borderColor: meterStatusConfig.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={meterStatusConfig.icon}
                size={12}
                color={meterStatusConfig.color}
              />
              <Text
                style={[
                  styles.meterStateText,
                  { color: meterStatusConfig.color },
                ]}
                numberOfLines={1}
              >
                {meterStatusConfig.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            onPress={handleGoToDetails}
            style={styles.actionButton}
          >
            <MaterialCommunityIcons
              name="information-outline"
              size={20}
              color="#475569"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGoToMedia}
            style={styles.actionButton}
          >
            <MaterialCommunityIcons
              name="camera-outline"
              size={20}
              color="#475569"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGoToReport}
            style={styles.actionButton}
          >
            <MaterialCommunityIcons
              name="file-chart-outline"
              size={20}
              color="#475569"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGoToMap}
            style={[styles.actionButton, styles.mapButtonHighlight]}
          >
            <MaterialCommunityIcons
              name="map-marker-radius"
              size={20}
              color="#3B82F6"
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardUpdatedFooter}>
        <MaterialCommunityIcons
          name="clock-edit-outline"
          size={10}
          color="#94A3B8"
        />
        <Text style={styles.cardUpdatedFooterText} numberOfLines={1}>
          Updated {updatedAtLabel}
        </Text>
      </View>

      <LifecycleProgressModal
        visible={Boolean(lifecycleProgress)}
        lifecycle={lifecycleProgress || {}}
        meterNo={meterNo}
        onClose={() => setLifecycleProgress(null)}
      />

      <ReadingHistoryModal
        visible={readingHistoryVisible}
        rows={readingHistoryRows}
        meterNo={meterNo}
        unit={readingUnit}
        onClose={() => setReadingHistoryVisible(false)}
      />
    </View>
  );
};

export default AstItem;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "600",
  },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 8 },

  iconContainer: { marginRight: 16 },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  details: { flex: 1 },
  row: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  meterNo: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  typeBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeText: { fontSize: 9, fontWeight: "900" },

  subDetail: { fontSize: 13, color: "#64748B", marginBottom: 8 },
  statusRow: { flexDirection: "row", alignItems: "center" },
  // statusInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  statusLabel: { fontSize: 12, fontWeight: "700", marginLeft: 4 },
  mapButton: { padding: 8, backgroundColor: "#F1F5F9", borderRadius: 8 },

  // buttonGroup: {
  //   flexDirection: "row",
  //   gap: 8,
  //   alignItems: "center",
  // },
  // actionButton: {
  //   padding: 8,
  //   backgroundColor: "#F1F5F9",
  //   borderRadius: 8,
  //   borderWidth: 1,
  //   borderColor: "#E2E8F0",
  // },
  mapButtonHighlight: {
    backgroundColor: "#EFF6FF",
    borderColor: "#DBEAFE",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  addressText: {
    marginLeft: 4,
    color: "#1E293B",
    fontWeight: "600",
    fontSize: 12,
  },

  card: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    marginBottom: 12,
    elevation: 3,
    // Remove flexDirection: 'row' here so content stacks vertically
  },
  mainContent: {
    flex: 1,
    flexDirection: "row", // Keep icon and text side-by-side
    padding: 16,
    alignItems: "center",
  },
  fullWidthActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9", // Subtle divider
    backgroundColor: "#F8FAFC", // Light slate floor
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  topRightBadgeCol: {
    alignItems: "flex-end",
  },

  visibilityText: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "900",
  },

  visibilityTextVisible: {
    color: "#047857",
  },

  visibilityTextInvisible: {
    color: "#B91C1C",
  },

  visibilityTextNeutral: {
    color: "#64748B",
  },

  titleBlock: {
    flex: 1,
    paddingRight: 10,
  },

  makeModelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },

  makeModelText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "700",
  },

  makeModelDot: {
    marginHorizontal: 6,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "900",
  },

  // geoRow: {
  //   flexDirection: "row",
  //   alignItems: "center",
  //   marginTop: 8,
  // },

  // geoText: {
  //   marginLeft: 4,
  //   color: "#1E293B",
  //   fontWeight: "600",
  //   fontSize: 12,
  //   flex: 1,
  // },

  // statusStack: {
  //   flex: 1,
  //   justifyContent: "center",
  // },

  statusLine: {
    flexDirection: "row",
    alignItems: "center",
  },

  meterStateBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },

  meterStateText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  statusInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },

  statusStack: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  statusBadge: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },

  statusBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  buttonGroup: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flexShrink: 0,
  },

  actionButton: {
    padding: 7,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  lifecycleActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },

  lifecycleActionButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },

  lifecycleProgressDot: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F97316",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  lifecycleActionButtonDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },

  lifecycleActionText: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: "900",
    color: "#2563EB",
  },

  lifecycleActionTextDisabled: {
    color: "#94A3B8",
  },

  // progressModalBackdrop: {
  //   flex: 1,
  //   justifyContent: "flex-end",
  //   backgroundColor: "rgba(15, 23, 42, 0.45)",
  // },

  // progressModalSheet: {
  //   maxHeight: "82%",
  //   backgroundColor: "#FFFFFF",
  //   borderTopLeftRadius: 24,
  //   borderTopRightRadius: 24,
  //   paddingHorizontal: 16,
  //   paddingTop: 16,
  //   paddingBottom: 24,
  // },

  progressModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  progressModalIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  progressModalTitleWrap: {
    flex: 1,
  },

  progressModalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },

  progressModalSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },

  progressModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  progressStatePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },

  progressStateText: {
    fontSize: 11,
    color: "#1D4ED8",
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  progressInfoBox: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    overflow: "hidden",
  },

  progressInfoRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  progressInfoLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  progressInfoValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },

  meterMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },

  meterKindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: "45%",
  },

  meterKindText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  lastReadingPill: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: "52%",
  },

  lastReadingText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#166534",
  },

  cardUpdatedFooter: {
    minHeight: 22,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },

  cardUpdatedFooterText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94A3B8",
  },

  readingModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.52)",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 48,
  },

  readingModalSheet: {
    maxHeight: "74%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
  },

  readingModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  readingModalIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },

  readingModalTitleWrap: {
    flex: 1,
  },

  readingModalTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },

  readingModalSub: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  readingModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  readingHistoryEmpty: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 16,
  },

  readingHistoryEmptyTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },

  readingHistoryEmptyText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  readingHistoryList: {
    maxHeight: 420,
  },

  readingHistoryListContent: {
    gap: 8,
    paddingBottom: 6,
  },

  readingHistoryRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 10,
  },

  readingHistoryRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  readingHistoryDate: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },

  readingHistoryReading: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },

  readingHistoryMetrics: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },

  readingMetricBox: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 6,
  },

  readingMetricLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  readingMetricValue: {
    color: "#0F172A",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2,
  },

  progressModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    paddingHorizontal: 16,
  },

  progressModalSheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "72%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },

  geoPressable: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 7,
  },

  geoPressableSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },

  geoPressablePressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },

  geoRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  geoText: {
    marginLeft: 5,
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 10,
    flex: 1,
    lineHeight: 16,
  },

  geoTextSelected: {
    color: "#1D4ED8",
  },

  geoScopePill: {
    marginLeft: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },

  geoScopePillSelected: {
    backgroundColor: "#DBEAFE",
  },

  geoScopePillText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#475569",
    letterSpacing: 0.4,
  },

  geoScopePillTextSelected: {
    color: "#1D4ED8",
  },
});
