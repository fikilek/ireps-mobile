import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function FieldAnalytics() {
  // TB-R051 (1.3.38): one title bar in Operations. The stack title bar ("Field Analytics")
  // carries the only back arrow, so this screen draws no back arrow or title row of its own.
  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 📊 MISSION VELOCITY SUMMARY */}
        <View style={styles.statsGrid}>
          <MetricCard
            label="Total Trans"
            value="1,094"
            icon="database-check"
            color="#2563eb"
          />
          <MetricCard
            label="Completion"
            value="78%"
            icon="progress-check"
            color="#059669"
          />
          <MetricCard
            label="Avg Time"
            value="12m"
            icon="timer-outline"
            color="#ea580c"
          />
          <MetricCard
            label="Failed"
            value="42"
            icon="alert-circle-outline"
            color="#ef4444"
          />
        </View>

        {/* 📉 PERFORMANCE CHARTS (Placeholders) */}
        <Section title="Completion Velocity (Daily)">
          <View style={styles.chartPlaceholder}>
            <View style={[styles.bar, { height: "40%" }]} />
            <View style={[styles.bar, { height: "65%" }]} />
            <View
              style={[
                styles.bar,
                { height: "90%", backgroundColor: "#2563eb" },
              ]}
            />
            <View style={[styles.bar, { height: "75%" }]} />
            <View style={[styles.bar, { height: "55%" }]} />
            <View style={[styles.bar, { height: "85%" }]} />
          </View>
        </Section>

        <Section title="Task Distribution">
          <View style={styles.card}>
            <DistributionRow label="Inspections" percent={45} color="#2563eb" />
            <DistributionRow label="Discoveries" percent={30} color="#8b5cf6" />
            <DistributionRow label="No Access" percent={15} color="#64748b" />
            <DistributionRow label="Technical" percent={10} color="#f59e0b" />
          </View>
        </Section>

        {/* 🏆 TOP PERFORMERS REGISTRY */}
        <Section title="Agent Performance (Top 5)">
          <View style={styles.card}>
            <AgentRow name="John Doe" count={142} rank={1} />
            <AgentRow name="Jane Smith" count={128} rank={2} />
            <AgentRow name="Bob Miller" count={115} rank={3} />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- INTERNAL COMPONENTS ---------------- */

const MetricCard = ({ label, value, icon, color }) => (
  <View style={styles.metricCard}>
    <MaterialCommunityIcons name={icon} size={20} color={color} />
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const DistributionRow = ({ label, percent, color }) => (
  <View style={styles.distRow}>
    <View style={styles.distInfo}>
      <Text style={styles.distLabel}>{label}</Text>
      <Text style={styles.distPercent}>{percent}%</Text>
    </View>
    <View style={styles.distTrack}>
      <View
        style={[
          styles.distFill,
          { width: `${percent}%`, backgroundColor: color },
        ]}
      />
    </View>
  </View>
);

const AgentRow = ({ name, count, rank }) => (
  <View style={styles.agentRow}>
    <Text style={styles.rankText}>#{rank}</Text>
    <Text style={styles.agentName}>{name}</Text>
    <Text style={styles.agentCount}>{count} Trns</Text>
  </View>
);

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { padding: 16 },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1e293b",
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
  },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  chartPlaceholder: {
    height: 150,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    padding: 16,
  },
  bar: { width: "10%", backgroundColor: "#cbd5e1", borderRadius: 4 },

  distRow: { marginBottom: 12 },
  distInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  distLabel: { fontSize: 12, fontWeight: "700", color: "#334155" },
  distPercent: { fontSize: 11, fontWeight: "900", color: "#1e293b" },
  distTrack: {
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
  },
  distFill: { height: "100%" },

  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  rankText: { fontSize: 12, fontWeight: "900", color: "#2563eb", width: 30 },
  agentName: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1e293b" },
  agentCount: { fontSize: 12, fontWeight: "800", color: "#64748b" },
});
