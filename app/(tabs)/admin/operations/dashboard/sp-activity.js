import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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

const DATE_FILTERS = [
  { key: "TODAY", label: "Today" },
  { key: "YESTERDAY", label: "Yesterday" },
  { key: "THIS_WEEK", label: "This Week" },
  { key: "ALL", label: "All" },
];

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

function formatDateTime(value) {
  const millis = toMillis(value);
  if (!millis) return "NAv";

  return new Date(millis).toLocaleString();
}

function getAgeLabel(value) {
  const millis = toMillis(value);
  if (!millis) return "NAv";

  const seconds = Math.max(Math.floor((Date.now() - millis) / 1000), 0);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function isOpenState(state) {
  return ["ISSUED", "ACCEPTED"].includes(normalizeUpper(state));
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

function getAssignmentTargets(trn = {}) {
  const targets = Array.isArray(trn?.assignment?.targets)
    ? trn.assignment.targets
    : [];

  return targets
    .map((target) => ({
      type: normalizeUpper(target?.type),
      id: cleanText(target?.id, ""),
      name: cleanText(target?.name || target?.title || target?.id),
    }))
    .filter((target) => target.id || target.name !== "NAv");
}

function getSpTargets(trn = {}) {
  const directSpTargets = getAssignmentTargets(trn).filter(
    (target) => target.type === "SP",
  );

  if (directSpTargets.length) return directSpTargets;

  const serviceProviderId = cleanText(
    trn?.serviceProvider?.id ||
      trn?.assignment?.serviceProvider?.id ||
      trn?.metadata?.serviceProvider?.id,
    "",
  );

  const serviceProviderName = cleanText(
    trn?.serviceProvider?.name ||
      trn?.assignment?.serviceProvider?.name ||
      trn?.metadata?.serviceProvider?.name,
    "",
  );

  if (serviceProviderId || serviceProviderName) {
    return [
      {
        type: "SP",
        id: serviceProviderId || serviceProviderName,
        name: serviceProviderName || serviceProviderId,
      },
    ];
  }

  return [
    {
      type: "SP",
      id: "NAv",
      name: "No Service Provider",
    },
  ];
}

function getUserTargets(trn = {}) {
  return getAssignmentTargets(trn).filter((target) => target.type === "USER");
}

function getTeamTargets(trn = {}) {
  return getAssignmentTargets(trn).filter((target) => target.type === "TEAM");
}

function getAssignedTargetSummary(trn = {}) {
  const targets = getAssignmentTargets(trn);

  if (!targets.length) return "NAv";

  return targets.map((target) => `${target.type}: ${target.name}`).join(" • ");
}

function getSpKey(sp = {}) {
  const id = String(sp?.id || "").trim();
  if (id) return `SP:${id}`;

  const name = String(sp?.name || "").trim();
  if (name && name !== "NAv") return `SP_NAME:${name.toUpperCase()}`;

  return "SP:NAv";
}

function createEmptySpRow(sp = {}) {
  return {
    key: getSpKey(sp),
    spId: cleanText(sp?.id, ""),
    spName: cleanText(sp?.name || "No Service Provider"),

    userIds: new Set(),
    teamIds: new Set(),
    trnIds: new Set(),

    assigned: 0,
    waiting: 0,
    accepted: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0,
    noAccess: 0,
    noReading: 0,

    oldestOpenAt: null,
    oldestOpenTrnId: "",
    lastActivityAt: null,
    latestAssignedTarget: "NAv",
  };
}

function touchSpRow(rowsBySp, sp = {}) {
  const key = getSpKey(sp);

  if (!rowsBySp[key]) {
    rowsBySp[key] = createEmptySpRow(sp);
  }

  const row = rowsBySp[key];

  if (row.spName === "NAv" && sp.name) row.spName = cleanText(sp.name);

  return row;
}

function updateLastActivity(row, value) {
  const millis = toMillis(value);
  if (!millis) return;

  const current = toMillis(row.lastActivityAt);
  if (!current || millis > current) {
    row.lastActivityAt = value;
  }
}

function updateOldestOpen(row, trn = {}) {
  const state = getWorkflowState(trn);
  if (!isOpenState(state)) return;

  const startAt =
    state === "ACCEPTED"
      ? trn?.assignment?.acceptedRejectedAt || getUpdatedAt(trn)
      : getCreatedAt(trn);

  const startMillis = toMillis(startAt);
  if (!startMillis) return;

  const currentOldestMillis = toMillis(row.oldestOpenAt);

  if (!currentOldestMillis || startMillis < currentOldestMillis) {
    row.oldestOpenAt = startAt;
    row.oldestOpenTrnId = trn?.id || "NAv";
  }
}

function addTrnToSpRow(row, trn = {}) {
  const trnId = trn?.id || "NAv";

  if (!row.trnIds.has(trnId)) {
    row.assigned += 1;
    row.trnIds.add(trnId);
  }

  const state = getWorkflowState(trn);
  const outcome = getExecutionOutcome(trn);

  if (state === "ISSUED") row.waiting += 1;
  if (state === "ACCEPTED") row.accepted += 1;
  if (state === "REJECTED") row.rejected += 1;
  if (state === "COMPLETED") row.completed += 1;
  if (state === "CANCELLED") row.cancelled += 1;

  if (outcome === "NO_ACCESS") row.noAccess += 1;
  if (outcome === "NO_READING") row.noReading += 1;

  getUserTargets(trn).forEach((target) => {
    if (target.id) row.userIds.add(target.id);
  });

  getTeamTargets(trn).forEach((target) => {
    if (target.id) row.teamIds.add(target.id);
  });

  row.latestAssignedTarget = getAssignedTargetSummary(trn);

  updateLastActivity(row, getUpdatedAt(trn));
  updateOldestOpen(row, trn);
}

function buildSpActivityRows(items = []) {
  const rowsBySp = {};

  items.forEach((trn) => {
    const spTargets = getSpTargets(trn);

    spTargets.forEach((sp) => {
      const row = touchSpRow(rowsBySp, sp);
      addTrnToSpRow(row, trn);
    });
  });

  return Object.values(rowsBySp)
    .map((row) => ({
      ...row,
      userCount: row.userIds.size,
      teamCount: row.teamIds.size,
      total: row.trnIds.size,
      userIds: undefined,
      teamIds: undefined,
      trnIds: undefined,
    }))
    .sort((a, b) => {
      const bActive = b.waiting + b.accepted + b.rejected;
      const aActive = a.waiting + a.accepted + a.rejected;

      if (bActive !== aActive) return bActive - aActive;
      return toMillis(b.lastActivityAt) - toMillis(a.lastActivityAt);
    });
}

export default function SpActivityScreen() {
  const { geoState } = useGeo();
  const { all, sync, loading } = useWarehouse();

  const [dateFilter, setDateFilter] = useState("TODAY");

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
      .filter((trn) => isInDateFilter(trn, dateFilter));
  }, [all?.trns, dateFilter]);

  const spRows = useMemo(() => buildSpActivityRows(wmsItems), [wmsItems]);

  const wardLabel =
    selectedWard?.name ||
    selectedWard?.label ||
    selectedWard?.code ||
    wardPcode ||
    "No Ward";

  const lmLabel = selectedLm?.name || selectedLm?.label || lmPcode || "No LM";

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="domain"
              size={28}
              color="#ffffff"
            />
          </View>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>SP Activity</Text>
            <Text style={styles.headerSubtitle}>
              {wardLabel} • {lmLabel}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <View style={styles.headerCountBadge}>
              <Text style={styles.headerCountText}>{spRows.length}</Text>
            </View>
          )}
        </View>

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

        {!scopeReady ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="map-marker-radius-outline"
              size={42}
              color="#94a3b8"
            />
            <Text style={styles.emptyTitle}>Select a ward</Text>
            <Text style={styles.emptyText}>
              SP Activity is ward-scoped. Select an active ward before viewing
              WMS service provider activity.
            </Text>
          </View>
        ) : spRows.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="domain"
              size={42}
              color="#94a3b8"
            />
            <Text style={styles.emptyTitle}>No SP activity</Text>
            <Text style={styles.emptyText}>
              No WMS service provider activity was found for this ward and date
              filter.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Ward SP Activity</Text>

            {spRows.map((row) => (
              <SpActivityCard key={row.key} row={row} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SpActivityCard({ row }) {
  const activeCount = row.waiting + row.accepted + row.rejected;
  const progress =
    row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;

  return (
    <View style={styles.spCard}>
      <View style={styles.spHeader}>
        <View style={styles.avatarCircle}>
          <MaterialCommunityIcons name="domain" size={22} color="#1d4ed8" />
        </View>

        <View style={styles.spMain}>
          <Text style={styles.spName}>{row.spName}</Text>
          <Text style={styles.spMeta}>
            Users: {row.userCount} • Teams: {row.teamCount}
          </Text>
        </View>

        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeText}>{row.total}</Text>
        </View>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressTopRow}>
          <Text style={styles.progressText}>{progress}% complete</Text>
          <Text style={styles.progressMeta}>{activeCount} active</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <MiniStat label="Assigned" value={row.assigned} />
        <MiniStat label="Waiting" value={row.waiting} />
        <MiniStat label="Accepted" value={row.accepted} />
        <MiniStat label="Completed" value={row.completed} />
        <MiniStat label="Rejected" value={row.rejected} />
        <MiniStat label="Cancelled" value={row.cancelled} />
        <MiniStat label="No Access" value={row.noAccess} />
        <MiniStat label="No Reading" value={row.noReading} />
      </View>

      <View style={styles.footerRow}>
        <View style={styles.footerItem}>
          <MaterialCommunityIcons
            name="account-arrow-right-outline"
            size={15}
            color="#64748b"
          />
          <Text style={styles.footerText}>
            Latest target: {row.latestAssignedTarget || "NAv"}
          </Text>
        </View>

        <View style={styles.footerItem}>
          <MaterialCommunityIcons
            name="clock-alert-outline"
            size={15}
            color="#64748b"
          />
          <Text style={styles.footerText}>
            Oldest open:{" "}
            {row.oldestOpenAt
              ? `${getAgeLabel(row.oldestOpenAt)} • ${row.oldestOpenTrnId}`
              : "NAv"}
          </Text>
        </View>

        <View style={styles.footerItem}>
          <MaterialCommunityIcons
            name="history"
            size={15}
            color="#64748b"
          />
          <Text style={styles.footerText}>
            Last activity: {formatDateTime(row.lastActivityAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MiniStat({ label, value }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniValue}>{value || 0}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
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

  headerCountBadge: {
    minWidth: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#1d4ed8",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  headerCountText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
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

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 22,
    alignItems: "center",
    marginTop: 20,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 12,
  },

  emptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 7,
  },

  spCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 12,
  },

  spHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },

  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  spMain: {
    flex: 1,
  },

  spName: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
  },

  spMeta: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  totalBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  totalBadgeText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  progressBlock: {
    marginBottom: 12,
  },

  progressTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  progressText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  progressMeta: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
  },

  progressTrack: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#1d4ed8",
    borderRadius: 999,
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  miniStat: {
    width: "22.8%",
    backgroundColor: "#f8fafc",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 8,
    alignItems: "center",
  },

  miniValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
  },

  miniLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    marginTop: 2,
    textAlign: "center",
  },

  footerRow: {
    marginTop: 12,
    gap: 6,
  },

  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  footerText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },
});
