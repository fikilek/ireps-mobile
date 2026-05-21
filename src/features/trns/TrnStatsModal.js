import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import FilterModalShell from "../filters/FilterModalShell";
import { getTrnFilterStats } from "./filterTrns";

const LABELS = {
  METER_DISCOVERY: "Meter Discovery",
  METER_INSTALLATION: "Meter Installation",
  METER_COMMISSIONING: "Meter Commissioning",
  METER_INSPECTION: "Meter Inspection",
  METER_DISCONNECTION: "Meter Disconnection",
  METER_RECONNECTION: "Meter Reconnection",
  METER_REMOVAL: "Meter Removal",
  METER_READING: "Meter Reading",
  METER_VENDING: "Meter Vending",

  ISSUED: "Awaiting",
  ACCEPTED: "Accepted",
  REASSIGNED: "Reassigned",
  IN_PROGRESS: "In Progress",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DIRECT_SUBMIT: "No WMS Workflow",
  UNKNOWN: "Data Issue",

  OFFICE: "Office",
  FIELD: "Field",
  API: "API",
  INTEGRATION: "Integration",

  SUCCESS: "Success",
  NO_ACCESS: "No Access",
  NO_READING: "No Reading",
  PENDING: "Pending",

  ACCESS: "Access",

  ELECTRICITY: "Electricity",
  WATER: "Water",
  DATA_ISSUE: "Data Issue",

  NORMAL: "Normal",
  BULK: "Bulk",

  PREPAID: "Prepaid",
  CONVENTIONAL: "Conventional",
};

function labelFor(value) {
  return LABELS[value] || String(value || "NAv").replaceAll("_", " ");
}

function sortEntries(map = {}) {
  return Object.entries(map || {}).sort((a, b) => {
    const countDiff = Number(b[1] || 0) - Number(a[1] || 0);
    if (countDiff !== 0) return countDiff;
    return String(a[0]).localeCompare(String(b[0]));
  });
}

function StatSummaryCard({ label, value, subLabel }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      {!!subLabel && <Text style={styles.summarySub}>{subLabel}</Text>}
    </View>
  );
}

function StatSection({ title, statsMap = {} }) {
  const entries = sortEntries(statsMap);

  if (entries.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.emptyText}>No values found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {entries.map(([key, count]) => (
        <View key={`${title}-${key}`} style={styles.statRow}>
          <Text style={styles.statName}>{labelFor(key)}</Text>
          <Text style={styles.statCount}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

export function TrnStatsModal({
  visible,
  onClose,
  allTrns = [],
  displayTrns = [],
  isFiltering = false,
}) {
  const allStats = useMemo(() => getTrnFilterStats(allTrns), [allTrns]);
  const displayStats = useMemo(
    () => getTrnFilterStats(displayTrns),
    [displayTrns],
  );

  const statsToShow = isFiltering ? displayStats : allStats;

  return (
    <FilterModalShell
      visible={visible}
      onClose={onClose}
      title="TRN Stats"
      subtitle={
        isFiltering
          ? "Showing stats for the filtered TRN list."
          : "Showing stats for all TRNs in the current scope."
      }
      applyLabel="CLOSE"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryGrid}>
          <StatSummaryCard label="TOTAL" value={allTrns.length} />
          <StatSummaryCard
            label="FILTERED"
            value={displayTrns.length}
            subLabel={isFiltering ? "Active" : "No filters"}
          />
        </View>

        <StatSection title="TRN Type" statsMap={statsToShow.trnTypes} />
        <StatSection
          title="Workflow State"
          statsMap={statsToShow.workflowStates}
        />
        <StatSection
          title="Origin / Work Source"
          statsMap={statsToShow.originChannels}
        />
        <StatSection
          title="Execution Outcome"
          statsMap={statsToShow.executionOutcomes}
        />
        <StatSection title="Access" statsMap={statsToShow.accessStates} />
        <StatSection
          title="Meter Service"
          statsMap={statsToShow.meterServices}
        />
        <StatSection
          title="Meter Category"
          statsMap={statsToShow.meterCategories}
        />
        <StatSection title="Meter Type" statsMap={statsToShow.meterTypes} />
      </ScrollView>
    </FilterModalShell>
  );
}

export default TrnStatsModal;

const styles = StyleSheet.create({
  scroll: {
    maxHeight: "100%",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 20,
  },

  summaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  summaryCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12,
  },

  summaryLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  summaryValue: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 3,
  },

  summarySub: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  section: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },

  sectionTitle: {
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 12,
    paddingVertical: 9,
    textTransform: "uppercase",
  },

  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  statName: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },

  statCount: {
    minWidth: 34,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  emptyText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    padding: 12,
  },
});
