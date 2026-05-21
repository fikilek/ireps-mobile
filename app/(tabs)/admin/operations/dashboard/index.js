import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGeo } from "../../../../../src/context/GeoContext";
import { useWarehouse } from "../../../../../src/context/WarehouseContext";

const WMS_LCT_TYPES = [
  "METER_INSPECTION",
  "METER_DISCONNECTION",
  "METER_RECONNECTION",
  "METER_REMOVAL",
  "METER_READING",
];

const WMS_TYPE_META = {
  METER_INSPECTION: {
    label: "INSP",
    title: "Inspections",
    icon: "clipboard-search-outline",
  },
  METER_DISCONNECTION: {
    label: "DCN",
    title: "Disconnections",
    icon: "power-plug-off-outline",
  },
  METER_RECONNECTION: {
    label: "RCN",
    title: "Reconnections",
    icon: "power-plug-outline",
  },
  METER_REMOVAL: {
    label: "REM",
    title: "Removals",
    icon: "countertop-outline",
  },
  METER_READING: {
    label: "MREAD",
    title: "Meter Readings",
    icon: "counter",
  },
};

const DATE_FILTERS = [
  { key: "TODAY", label: "Today" },
  { key: "YESTERDAY", label: "Yesterday" },
  { key: "THIS_WEEK", label: "This Week" },
  { key: "ALL", label: "All" },
];

const SOURCE_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "OFFICE", label: "Office" },
  { key: "FIELD", label: "Field" },
];

const AWAITING_TOLERANCE_HOURS = 1;
const ACCEPTED_TOLERANCE_HOURS = 4;

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function cleanText(value, fallback = "NAv") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTrnType(trn = {}) {
  return normalizeUpper(
    trn?.accessData?.trnType ||
      trn?.trnType ||
      trn?.assignment?.instruction?.code,
  );
}

function getWorkflowState(trn = {}) {
  return normalizeUpper(trn?.workflow?.state || trn?.workflowState);
}

function getCreatedAt(trn = {}) {
  return trn?.metadata?.createdAt || trn?.createdAt || null;
}

function getUpdatedAt(trn = {}) {
  return trn?.metadata?.updatedAt || trn?.updatedAt || getCreatedAt(trn);
}

function getIssuedByUid(trn = {}) {
  return cleanText(
    trn?.metadata?.createdByUid || trn?.assignment?.issuedByUid,
    null,
  );
}

function getExecutionOutcome(trn = {}) {
  return normalizeUpper(
    trn?.executionOutcome?.code ||
      trn?.executionOutcome?.outcome ||
      trn?.outcome?.code ||
      trn?.outcome ||
      "NAv",
  );
}

function isSuccessOutcome(outcome) {
  return ["SUCCESS", "SUCCESSFUL"].includes(normalizeUpper(outcome));
}

function isNoOutcomeYet(outcome) {
  const clean = normalizeUpper(outcome);

  return (
    !clean ||
    clean === "NAV" ||
    clean === "N/AV" ||
    clean === "N/A" ||
    clean === "NONE" ||
    clean === "PENDING"
  );
}

function getOriginChannel(trn = {}) {
  const channel = normalizeUpper(
    trn?.origin?.channel ||
      trn?.channel ||
      trn?.metadata?.originChannel ||
      "OFFICE",
  );

  if (channel === "FIELD") return "FIELD";

  return "OFFICE";
}

function getBucketName(trn = {}) {
  const rawBucket = cleanText(
    trn?.bucket?.name ||
      trn?.bucket?.id ||
      trn?.assignment?.bucket?.name ||
      trn?.assignment?.bucket?.id,
    "INDIVIDUAL",
  );

  const normalizedBucket = normalizeUpper(rawBucket);

  if (
    !normalizedBucket ||
    normalizedBucket === "GENERAL" ||
    normalizedBucket === "NAV" ||
    normalizedBucket === "N/AV" ||
    normalizedBucket === "N/A"
  ) {
    return "INDIVIDUAL";
  }

  return normalizedBucket;
}

function hoursSince(value) {
  const millis = toMillis(value);
  if (!millis) return 0;

  return Math.max((Date.now() - millis) / (1000 * 60 * 60), 0);
}

function getAwaitingStartAt(trn = {}) {
  return getCreatedAt(trn) || getUpdatedAt(trn);
}

function getAcceptedStartAt(trn = {}) {
  return (
    trn?.assignment?.acceptedRejectedAt ||
    getUpdatedAt(trn) ||
    getCreatedAt(trn)
  );
}

function isAwaitingOverTolerance(trn = {}) {
  if (getWorkflowState(trn) !== "ISSUED") return false;

  return hoursSince(getAwaitingStartAt(trn)) >= AWAITING_TOLERANCE_HOURS;
}

function isAcceptedOverTolerance(trn = {}) {
  if (getWorkflowState(trn) !== "ACCEPTED") return false;

  return hoursSince(getAcceptedStartAt(trn)) >= ACCEPTED_TOLERANCE_HOURS;
}

function isUnexpectedWorkflowState(state) {
  const clean = normalizeUpper(state);

  return !["ISSUED", "ACCEPTED", "REJECTED", "COMPLETED", "CANCELLED"].includes(
    clean,
  );
}

function getStartOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isInDateFilter(trn = {}, dateFilter) {
  if (dateFilter === "ALL") return true;

  const createdMillis = toMillis(getCreatedAt(trn) || getUpdatedAt(trn));
  if (!createdMillis) return false;

  const createdDate = new Date(createdMillis);
  const today = getStartOfToday();

  if (dateFilter === "TODAY") {
    return createdDate >= today;
  }

  if (dateFilter === "YESTERDAY") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    return createdDate >= yesterday && createdDate < today;
  }

  if (dateFilter === "THIS_WEEK") {
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    weekStart.setDate(today.getDate() - daysFromMonday);

    return createdDate >= weekStart;
  }

  return true;
}

function buildEmptyCounts() {
  return {
    total: 0,
    issued: 0,
    accepted: 0,
    rejected: 0,
    completed: 0,
    cancelled: 0,
    noOutcomeYet: 0,
    success: 0,
    noAccess: 0,
    noReading: 0,
    otherOutcome: 0,
    dataCheck: 0,
  };
}

function countWmsItems(items = []) {
  return items.reduce((acc, trn) => {
    const state = getWorkflowState(trn);
    const outcome = getExecutionOutcome(trn);

    acc.total += 1;

    if (state === "ISSUED") acc.issued += 1;
    if (state === "ACCEPTED") acc.accepted += 1;
    if (state === "REJECTED") acc.rejected += 1;
    if (state === "COMPLETED") acc.completed += 1;
    if (state === "CANCELLED") acc.cancelled += 1;

    if (isNoOutcomeYet(outcome)) {
      acc.noOutcomeYet += 1;
    } else if (isSuccessOutcome(outcome)) {
      acc.success += 1;
    } else if (outcome === "NO_ACCESS") {
      acc.noAccess += 1;
    } else if (outcome === "NO_READING") {
      acc.noReading += 1;
    } else {
      acc.otherOutcome += 1;
    }

    if (isUnexpectedWorkflowState(state)) acc.dataCheck += 1;

    return acc;
  }, buildEmptyCounts());
}

function buildSourceCounts(items = []) {
  return items.reduce(
    (acc, trn) => {
      const channel = getOriginChannel(trn);

      if (channel === "FIELD") {
        acc.field += 1;
      } else {
        acc.office += 1;
      }

      acc.total += 1;
      return acc;
    },
    {
      total: 0,
      office: 0,
      field: 0,
    },
  );
}

function buildAttentionItems(items = []) {
  const counts = items.reduce(
    (acc, trn) => {
      const state = getWorkflowState(trn);
      const outcome = getExecutionOutcome(trn);

      if (state === "REJECTED") acc.rejected += 1;
      if (isAwaitingOverTolerance(trn)) acc.awaitingOverTolerance += 1;
      if (isAcceptedOverTolerance(trn)) acc.acceptedOverTolerance += 1;
      if (outcome === "NO_ACCESS") acc.noAccess += 1;
      if (outcome === "NO_READING") acc.noReading += 1;
      if (isUnexpectedWorkflowState(state)) acc.dataCheck += 1;

      return acc;
    },
    {
      rejected: 0,
      awaitingOverTolerance: 0,
      acceptedOverTolerance: 0,
      noAccess: 0,
      noReading: 0,
      dataCheck: 0,
    },
  );

  return [
    {
      key: "REJECTED",
      icon: "close-octagon-outline",
      title: "Rejected Work",
      count: counts.rejected,
      description: "Immediate manager action required",
      level: counts.rejected > 0 ? "High" : "Clear",
    },
    {
      key: "AWAITING_OVER_TOLERANCE",
      icon: "clock-alert-outline",
      title: `Awaiting Over ${AWAITING_TOLERANCE_HOURS}h`,
      count: counts.awaitingOverTolerance,
      description: "Assigned work not accepted/rejected yet",
      level: counts.awaitingOverTolerance > 0 ? "Medium" : "Clear",
    },
    {
      key: "ACCEPTED_OVER_TOLERANCE",
      icon: "timer-sand",
      title: `Accepted Over ${ACCEPTED_TOLERANCE_HOURS}h`,
      count: counts.acceptedOverTolerance,
      description: "Accepted work still not completed",
      level: counts.acceptedOverTolerance > 0 ? "Medium" : "Clear",
    },
    {
      key: "NO_ACCESS",
      icon: "lock-alert-outline",
      title: "No Access",
      count: counts.noAccess,
      description: "Completed work with no physical meter access",
      level: counts.noAccess > 0 ? "High" : "Clear",
    },
    {
      key: "NO_READING",
      icon: "counter",
      title: "No Reading",
      count: counts.noReading,
      description: "Completed work with no valid meter reading",
      level: counts.noReading > 0 ? "Medium" : "Clear",
    },
    {
      key: "DATA_CHECK",
      icon: "database-alert-outline",
      title: "Data Check",
      count: counts.dataCheck,
      description: "Unexpected or missing workflow state",
      level: counts.dataCheck > 0 ? "Medium" : "Clear",
    },
  ];
}

function buildBucketCards(items = []) {
  const bucketMap = {};

  items.forEach((trn) => {
    const bucketName = getBucketName(trn);

    if (!bucketMap[bucketName]) {
      bucketMap[bucketName] = {
        name: bucketName,
        total: 0,
        completed: 0,
        rejected: 0,
      };
    }

    bucketMap[bucketName].total += 1;

    const state = getWorkflowState(trn);
    if (state === "COMPLETED") bucketMap[bucketName].completed += 1;
    if (state === "REJECTED") bucketMap[bucketName].rejected += 1;
  });

  const buckets = Object.values(bucketMap).sort((a, b) => b.total - a.total);

  if (!buckets.some((bucket) => bucket.name === "INDIVIDUAL")) {
    buckets.unshift({
      name: "INDIVIDUAL",
      total: 0,
      completed: 0,
      rejected: 0,
    });
  }

  return buckets.slice(0, 3);
}

function buildTypeRows(items = []) {
  return WMS_LCT_TYPES.map((type) => {
    const typeItems = items.filter((trn) => getTrnType(trn) === type);
    const counts = countWmsItems(typeItems);
    const meta = WMS_TYPE_META[type];

    return {
      type,
      ...meta,
      counts,
    };
  });
}

export default function WmsDashboardScreen() {
  const router = useRouter();
  const { geoState } = useGeo();
  const { all, sync, loading } = useWarehouse();

  const [dateFilter, setDateFilter] = useState("TODAY");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [attentionTermsVisible, setAttentionTermsVisible] = useState(false);

  const selectedLm = geoState?.selectedLm || null;
  const selectedWard = geoState?.selectedWard || null;

  const lmPcode = sync?.scope?.lmPcode || selectedLm?.pcode || selectedLm?.id;
  const wardPcode =
    sync?.scope?.wardPcode || selectedWard?.pcode || selectedWard?.id;

  const scopeReady = Boolean(lmPcode && wardPcode);

  const wmsItems = useMemo(() => {
    const trns = Array.isArray(all?.trns) ? all.trns : [];

    return trns
      .filter((trn) => WMS_LCT_TYPES.includes(getTrnType(trn)))
      .filter((trn) => isInDateFilter(trn, dateFilter))
      .filter((trn) => {
        if (sourceFilter === "ALL") return true;
        return getOriginChannel(trn) === sourceFilter;
      });
  }, [all?.trns, dateFilter, sourceFilter]);

  const officeWmsItems = useMemo(() => {
    return wmsItems.filter((trn) => getOriginChannel(trn) === "OFFICE");
  }, [wmsItems]);

  const summaryCounts = useMemo(() => countWmsItems(wmsItems), [wmsItems]);
  const sourceCounts = useMemo(() => buildSourceCounts(wmsItems), [wmsItems]);

  const managerCounts = useMemo(
    () => countWmsItems(officeWmsItems),
    [officeWmsItems],
  );

  const showManagerControlCard = sourceFilter !== "FIELD";

  const bucketCards = useMemo(() => buildBucketCards(wmsItems), [wmsItems]);

  const typeRows = useMemo(() => buildTypeRows(wmsItems), [wmsItems]);

  const attentionItems = useMemo(
    () => buildAttentionItems(wmsItems),
    [wmsItems],
  );

  const wardLabel =
    selectedWard?.name ||
    selectedWard?.label ||
    selectedWard?.code ||
    wardPcode ||
    "No Ward";

  const lmLabel = selectedLm?.name || selectedLm?.label || lmPcode || "No LM";

  const showFutureReleaseAlert = (featureName) => {
    Alert.alert(
      "Future Release",
      `${featureName} will be available in WDB v2. This v1 dashboard currently supports individual user assignment activity only.`,
    );
  };

  const handleOpenManagerControl = () => {
    router.push({
      pathname: "/admin/operations/dashboard/control",
      params: {
        dateFilter,
        sourceFilter: "OFFICE",
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="view-dashboard-outline"
              size={28}
              color="#ffffff"
            />
          </View>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>WMS Dashboard</Text>
            <Text style={styles.headerSubtitle}>
              {wardLabel} • {lmLabel}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <HeaderSourceSplitBadge counts={sourceCounts} />
          )}
        </View>

        {/* Date Filters */}
        <Text style={styles.filterTitle}>Date Filter</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {DATE_FILTERS.map((filter) => {
            const active = dateFilter === filter.key;

            return (
              <Pressable
                key={filter.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setDateFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Office / Field Filters */}
        <Text style={styles.filterTitle}>Work Source</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {SOURCE_FILTERS.map((filter) => {
            const active = sourceFilter === filter.key;

            return (
              <Pressable
                key={filter.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSourceFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!scopeReady ? (
          <View style={styles.emptyScopeCard}>
            <MaterialCommunityIcons
              name="map-marker-radius-outline"
              size={42}
              color="#94a3b8"
            />
            <Text style={styles.emptyScopeTitle}>Select a ward</Text>
            <Text style={styles.emptyScopeText}>
              WDB is ward-scoped. Select an active ward before viewing WMS
              workorder dashboard data.
            </Text>
          </View>
        ) : (
          <>
            {showManagerControlCard ? (
              <Pressable
                style={styles.managerControlCard}
                activeOpacity={0.78}
                onPress={handleOpenManagerControl}
              >
                <View style={styles.managerTopRow}>
                  <View style={styles.managerIconWrap}>
                    <MaterialCommunityIcons
                      name="account-cog-outline"
                      size={30}
                      color="#1d4ed8"
                    />
                  </View>

                  <View style={styles.managerTextWrap}>
                    <Text style={styles.managerTitle}>Manager Control</Text>
                    <Text style={styles.managerSubtitle}>
                      Office-issued WMS workorders in this ward
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={26}
                    color="#64748b"
                  />
                </View>

                <View style={styles.statsRow}>
                  <StatPill label="Total" value={managerCounts.total} />
                  <StatPill label="Awaiting" value={managerCounts.issued} />
                  <StatPill label="Accepted" value={managerCounts.accepted} />
                  <StatPill label="Rejected" value={managerCounts.rejected} />
                  <StatPill label="Completed" value={managerCounts.completed} />
                  <StatPill label="Cancelled" value={managerCounts.cancelled} />
                </View>
              </Pressable>
            ) : null}

            <Text style={styles.sectionTitle}>Ward Summary</Text>

            <View style={styles.summaryGroupWrap}>
              <SummaryGroup title="Work Source">
                <SummaryTile label="Total" value={summaryCounts.total} wide />
                <SummaryTile label="Office" value={sourceCounts.office} />
                <SummaryTile label="Field" value={sourceCounts.field} />
              </SummaryGroup>

              <SummaryGroup title="Workflow State">
                <SummaryTile label="Awaiting" value={summaryCounts.issued} />
                <SummaryTile label="Accepted" value={summaryCounts.accepted} />
                <SummaryTile label="Rejected" value={summaryCounts.rejected} />
                <SummaryTile
                  label="Completed"
                  value={summaryCounts.completed}
                />
                <SummaryTile
                  label="Cancelled"
                  value={summaryCounts.cancelled}
                />
              </SummaryGroup>

              <SummaryGroup title="Execution Outcome">
                <SummaryTile
                  label="No Outcome Yet"
                  value={summaryCounts.noOutcomeYet}
                />
                <SummaryTile label="Success" value={summaryCounts.success} />
                <SummaryTile label="No Access" value={summaryCounts.noAccess} />
                <SummaryTile
                  label="No Reading"
                  value={summaryCounts.noReading}
                />
                <SummaryTile label="Other" value={summaryCounts.otherOutcome} />
              </SummaryGroup>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Buckets</Text>
              <Text style={styles.sectionLink}>View all</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bucketRow}
            >
              {bucketCards.map((bucket) => (
                <BucketCard key={bucket.name} bucket={bucket} />
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>MLCT Breakdown</Text>

            <View style={styles.typeCard}>
              {typeRows.map((row, index) => (
                <TypeRow
                  key={row.type}
                  row={row}
                  last={index === typeRows.length - 1}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Activity Views</Text>

            <View style={styles.menuCard}>
              <MenuRow
                icon="account-outline"
                title="User Activity"
                subtitle="Work assigned to individual users"
                onPress={() =>
                  router.push({
                    pathname: "/admin/operations/dashboard/user-activity",
                    params: {
                      dateFilter,
                      sourceFilter,
                    },
                  })
                }
              />

              <MenuRow
                icon="account-group-outline"
                title="Team Activity"
                subtitle="Future release: team-based work grouping"
                onPress={() => showFutureReleaseAlert("Team Activity")}
              />

              <MenuRow
                icon="domain"
                title="SP Activity"
                subtitle="Future release: SP-based work grouping"
                onPress={() => showFutureReleaseAlert("SP Activity")}
                last
              />
            </View>

            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Attention Queue</Text>
                <Text style={styles.sectionHint}>
                  Same ward/date/source filter • tolerance-based
                </Text>
              </View>

              <Pressable
                style={styles.sectionHelpButton}
                onPress={() => setAttentionTermsVisible(true)}
              >
                <MaterialCommunityIcons
                  name="help-circle-outline"
                  size={16}
                  color="#1d4ed8"
                />
                <Text style={styles.sectionHelpText}>Help</Text>
              </Pressable>
            </View>

            <View style={styles.attentionCard}>
              {attentionItems.map((item, index) => (
                <AttentionRow
                  key={item.key}
                  item={item}
                  last={index === attentionItems.length - 1}
                />
              ))}
            </View>

            <AttentionQueueTermsModal
              visible={attentionTermsVisible}
              onClose={() => setAttentionTermsVisible(false)}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeaderSourceSplitBadge({ counts }) {
  return (
    <View style={styles.headerSourceBadge}>
      <View style={styles.headerSourceCol}>
        <Text style={styles.headerSourceLabel}>Office</Text>
        <Text style={styles.headerSourceValue}>{counts?.office || 0}</Text>
      </View>

      <View style={styles.headerSourceDivider} />

      <View style={styles.headerSourceCol}>
        <Text style={styles.headerSourceLabel}>Field</Text>
        <Text style={styles.headerSourceValue}>{counts?.field || 0}</Text>
      </View>
    </View>
  );
}

function StatPill({ label, value }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value || 0}</Text>
    </View>
  );
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryTopRow}>
        <View
          style={[styles.summaryIconWrap, { backgroundColor: `${color}18` }]}
        >
          <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>

        <Text style={styles.summaryLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <Text style={styles.summaryValue}>{value || 0}</Text>
    </View>
  );
}

function SummaryGroup({ title, children }) {
  return (
    <View style={styles.summaryGroupCard}>
      <Text style={styles.summaryGroupTitle}>{title}</Text>
      <View style={styles.summaryGroupGrid}>{children}</View>
    </View>
  );
}

function SummaryTile({ label, value, wide = false }) {
  return (
    <View style={[styles.summaryTile, wide && styles.summaryTileWide]}>
      <Text style={styles.summaryTileValue}>{value || 0}</Text>
      <Text style={styles.summaryTileLabel}>{label}</Text>
    </View>
  );
}

function BucketCard({ bucket }) {
  const progress =
    bucket.total > 0 ? Math.round((bucket.completed / bucket.total) * 100) : 0;

  return (
    <View
      style={[
        styles.bucketCard,
        bucket.name === "INDIVIDUAL" && styles.bucketCardPrimary,
      ]}
    >
      <View style={styles.bucketTopRow}>
        <MaterialCommunityIcons
          name={bucket.name === "INDIVIDUAL" ? "account-outline" : "layers"}
          size={20}
          color={bucket.name === "INDIVIDUAL" ? "#1d4ed8" : "#64748b"}
        />

        <Text
          style={[
            styles.bucketName,
            bucket.name === "INDIVIDUAL" && styles.bucketNamePrimary,
          ]}
        >
          {bucket.name}
        </Text>
      </View>

      <Text style={styles.bucketTotal}>{bucket.total}</Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <Text style={styles.bucketMeta}>
        {progress}% complete • {bucket.rejected} rejected
      </Text>
    </View>
  );
}

function TypeRow({ row, last }) {
  return (
    <View style={[styles.typeRow, last && styles.typeRowLast]}>
      <View style={styles.typeLeft}>
        <View style={styles.typeIconWrap}>
          <MaterialCommunityIcons name={row.icon} size={19} color="#1d4ed8" />
        </View>

        <View>
          <Text style={styles.typeTitle}>{row.label}</Text>
          <Text style={styles.typeSubtitle}>{row.title}</Text>
        </View>
      </View>

      <View style={styles.typeCounts}>
        <SmallCount label="Awaiting" value={row.counts.issued} />
        <SmallCount label="Accepted" value={row.counts.accepted} />
        <SmallCount label="Done" value={row.counts.completed} />
      </View>
    </View>
  );
}

function SmallCount({ label, value }) {
  return (
    <View style={styles.smallCount}>
      <Text style={styles.smallCountValue}>{value || 0}</Text>
      <Text style={styles.smallCountLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ icon, title, subtitle, last = false, onPress }) {
  const RowWrapper = onPress ? Pressable : View;

  return (
    <RowWrapper
      onPress={onPress}
      style={[styles.menuRow, last && styles.menuRowLast]}
    >
      <View style={styles.menuIconWrap}>
        <MaterialCommunityIcons name={icon} size={22} color="#475569" />
      </View>

      <View style={styles.menuTextWrap}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={23} color="#94a3b8" />
    </RowWrapper>
  );
}

function AttentionRow({ item, last }) {
  const isClear = item.level === "Clear";
  const isHigh = item.level === "High";

  return (
    <View style={[styles.attentionRow, last && styles.attentionRowLast]}>
      <View
        style={[
          styles.attentionIconWrap,
          isClear && styles.attentionIconWrapClear,
          !isClear && !isHigh && styles.attentionIconWrapMedium,
        ]}
      >
        <MaterialCommunityIcons
          name={item.icon}
          size={20}
          color={isClear ? "#16a34a" : isHigh ? "#dc2626" : "#d97706"}
        />
      </View>

      <View style={styles.attentionMain}>
        <View style={styles.attentionTopLine}>
          <Text style={styles.attentionTitle}>{item.title}</Text>
          <Text style={styles.attentionCount}>{item.count || 0}</Text>
        </View>

        <Text style={styles.attentionDescription}>{item.description}</Text>
      </View>

      <View
        style={[
          styles.levelBadge,
          isClear && styles.levelBadgeClear,
          !isClear && !isHigh && styles.levelBadgeMedium,
        ]}
      >
        <Text
          style={[
            styles.levelText,
            isClear && styles.levelTextClear,
            !isClear && !isHigh && styles.levelTextMedium,
          ]}
        >
          {item.level}
        </Text>
      </View>
    </View>
  );
}

function AttentionTermSection({ title, children }) {
  return (
    <View style={styles.attentionTermSection}>
      <Text style={styles.attentionTermSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function AttentionTermItem({ title, children }) {
  return (
    <View style={styles.attentionTermItem}>
      <Text style={styles.attentionTermTitle}>{title}</Text>
      <Text style={styles.attentionTermText}>{children}</Text>
    </View>
  );
}

function AttentionQueueTermsModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.attentionModalOverlay}>
        <View style={styles.attentionModalCard}>
          <View style={styles.attentionModalHeader}>
            <View>
              <Text style={styles.attentionModalTitle}>
                Attention Queue Help
              </Text>
              <Text style={styles.attentionModalSubtitle}>
                What needs manager attention now
              </Text>
            </View>

            <Pressable style={styles.attentionModalClose} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color="#0f172a" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.attentionModalScroll}
            contentContainerStyle={styles.attentionModalContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.attentionIntroText}>
              The Attention Queue shows work that may need manager attention. It
              uses the same dashboard filters: selected ward, selected date
              filter, and selected work source filter. It does not show every
              workorder. It only shows work that meets an attention rule.
            </Text>

            <AttentionTermSection title="Attention Rules">
              <AttentionTermItem title="Rejected Work">
                Work rejected by a field user. This requires immediate manager
                action such as reassignment or cancellation.
              </AttentionTermItem>

              <AttentionTermItem
                title={`Awaiting Over ${AWAITING_TOLERANCE_HOURS}h`}
              >
                Work that is still awaiting response after the tolerance time.
                The assigned user has not accepted or rejected it yet.
              </AttentionTermItem>

              <AttentionTermItem
                title={`Accepted Over ${ACCEPTED_TOLERANCE_HOURS}h`}
              >
                Work accepted by a field user but not completed after the
                tolerance time.
              </AttentionTermItem>

              <AttentionTermItem title="No Access">
                Completed work where the user could not physically access or
                touch the meter with their hands. The meter may still be visible
                or readable, but proper access was not possible.
              </AttentionTermItem>

              <AttentionTermItem title="No Reading">
                Completed work where the user had access to the meter area but
                could not capture a valid reading.
              </AttentionTermItem>

              <AttentionTermItem title="Data Check">
                Work with unexpected or missing workflow data. This may require
                review before the numbers can be trusted.
              </AttentionTermItem>
            </AttentionTermSection>

            <AttentionTermSection title="Tolerance Times">
              <AttentionTermItem title="Awaiting tolerance">
                {AWAITING_TOLERANCE_HOURS} hour.
              </AttentionTermItem>

              <AttentionTermItem title="Accepted tolerance">
                {ACCEPTED_TOLERANCE_HOURS} hours.
              </AttentionTermItem>
            </AttentionTermSection>

            <View style={styles.attentionImportantBox}>
              <Text style={styles.attentionImportantTitle}>Important</Text>
              <Text style={styles.attentionImportantText}>
                Rejected, No Access, No Reading, and Data Check can appear
                immediately. Awaiting and Accepted only appear after their
                tolerance time has passed.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },

  headerCard: {
    backgroundColor: "#0f172a",
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#1d4ed8",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  headerSubtitle: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  headerSourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },

  headerSourceCol: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
  },

  headerSourceLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: "#bfdbfe",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },

  headerSourceValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "900",
    color: "#ffffff",
  },

  headerSourceDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.24)",
  },

  filterTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  filterScroll: {
    marginBottom: 14,
  },

  filterRow: {
    gap: 8,
    paddingRight: 16,
  },

  filterChip: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  filterChipActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },

  filterChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },

  filterChipTextActive: {
    color: "#ffffff",
  },

  emptyScopeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 22,
    alignItems: "center",
    marginTop: 20,
  },

  emptyScopeTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 12,
  },

  emptyScopeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 7,
  },

  managerControlCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    padding: 16,
    marginBottom: 18,
  },

  managerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  managerIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  managerTextWrap: {
    flex: 1,
  },

  managerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },

  managerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 3,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },

  statPill: {
    width: "31.6%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },

  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },

  statValue: {
    fontSize: 19,
    fontWeight: "900",
    color: "#1d4ed8",
    marginTop: 2,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },

  sectionLink: {
    fontSize: 11,
    fontWeight: "900",
    color: "#1d4ed8",
    marginBottom: 10,
  },

  sectionHint: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: -7,
    marginBottom: 10,
  },

  sectionHelpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginBottom: 10,
  },

  sectionHelpText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },

  summaryCard: {
    width: "47.9%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 13,
    minHeight: 92,
    justifyContent: "space-between",
  },

  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  summaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  summaryLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    color: "#475569",
  },

  summaryValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 10,
  },

  summaryGroupWrap: {
    gap: 10,
    marginBottom: 18,
  },

  summaryGroupCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
  },

  summaryGroupTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginBottom: 9,
  },

  summaryGroupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  summaryTile: {
    width: "30.9%",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: "center",
  },

  summaryTileWide: {
    width: "100%",
    alignItems: "flex-start",
    paddingHorizontal: 12,
  },

  summaryTileValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },

  summaryTileLabel: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textAlign: "center",
  },

  bucketRow: {
    gap: 10,
    paddingRight: 16,
    marginBottom: 18,
  },

  bucketCard: {
    width: 155,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 13,
  },

  bucketCardPrimary: {
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },

  bucketTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  bucketName: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
  },

  bucketNamePrimary: {
    color: "#1d4ed8",
  },

  bucketTotal: {
    fontSize: 27,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 10,
  },

  progressTrack: {
    height: 7,
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 8,
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#1d4ed8",
    borderRadius: 999,
  },

  bucketMeta: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 7,
  },

  typeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 18,
    overflow: "hidden",
  },

  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  typeRowLast: {
    borderBottomWidth: 0,
  },

  typeLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  typeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  typeTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  typeSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 1,
  },

  typeCounts: {
    flexDirection: "row",
    gap: 8,
  },

  smallCount: {
    alignItems: "center",
    minWidth: 38,
  },

  smallCountValue: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  smallCountLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#64748b",
  },

  menuCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 18,
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  menuRowLast: {
    borderBottomWidth: 0,
  },

  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  menuTextWrap: {
    flex: 1,
  },

  menuTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  menuSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },

  attentionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },

  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  attentionRowLast: {
    borderBottomWidth: 0,
  },

  attentionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  attentionIconWrapClear: {
    backgroundColor: "#dcfce7",
  },

  attentionIconWrapMedium: {
    backgroundColor: "#fef3c7",
  },

  attentionMain: {
    flex: 1,
    minWidth: 0,
  },

  attentionTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  attentionTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  attentionCount: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
  },

  attentionDescription: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },

  levelBadge: {
    backgroundColor: "#fee2e2",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },

  levelBadgeClear: {
    backgroundColor: "#dcfce7",
  },

  levelBadgeMedium: {
    backgroundColor: "#fef3c7",
  },

  levelText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#b91c1c",
  },

  levelTextClear: {
    color: "#15803d",
  },

  levelTextMedium: {
    color: "#b45309",
  },

  attentionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },

  attentionModalCard: {
    width: "100%",
    maxHeight: "84%",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },

  attentionModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  attentionModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },

  attentionModalSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },

  attentionModalClose: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  attentionModalScroll: {
    maxHeight: 560,
  },

  attentionModalContent: {
    padding: 16,
    paddingBottom: 22,
  },

  attentionIntroText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    lineHeight: 18,
    marginBottom: 14,
  },

  attentionTermSection: {
    marginBottom: 16,
  },

  attentionTermSectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  attentionTermItem: {
    marginBottom: 10,
  },

  attentionTermTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  attentionTermText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    lineHeight: 16,
  },

  attentionImportantBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 12,
  },

  attentionImportantTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  attentionImportantText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    lineHeight: 16,
  },
});
