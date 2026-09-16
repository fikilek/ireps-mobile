import { MaterialCommunityIcons } from "@expo/vector-icons";
import { anomalyTone } from "../meters/formOptions";
import { StyleSheet, Text, View } from "react-native";
import { Divider, Surface } from "react-native-paper";
import { TrnMiniMap } from "../../../components/maps/TrnMiniMap";
import IrepsMediaViewer from "../../../components/media/IrepsMediaViewer";

export default function TrnReportWater({ data }) {
  const { ast, accessData } = data;
  const meterReading = ast?.meterReading;
  const anomaly = ast?.anomalies?.anomaly;
  // Meter Ok with a bridge or bypass suspicion reads amber, not green.
  const tone = anomalyTone(anomaly, ast?.anomalies?.anomalyDetail);
  const address = accessData?.premise?.address;
  const gps = ast?.location?.gps;

  return (
    <View style={styles.container}>
      {/* 📸 SECTION 1: VISUAL FORENSICS */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>WATER SERVICE EVIDENCE</Text>
        <IrepsMediaViewer
          media={data.media}
          tags={["astNoPhoto", "meterReadingPhoto", "anomalyPhoto"]}
          address={address}
        />
      </View>

      {/* 💧 SECTION 2: WATER METER SPECIFICATIONS */}
      <Surface style={styles.specsCard} elevation={0}>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.label}>SERIAL NUMBER</Text>
            <Text style={styles.value}>{ast?.astData?.astNo || "N/A"}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>DIAL READING</Text>
            <Text style={[styles.value, { color: "#3B82F6" }]}>
              {meterReading || "0.000"} m³
            </Text>
          </View>
        </View>
      </Surface>

      <Divider style={styles.divider} />

      {/* ⚠️ SECTION 3: ANOMALY & CONDITION */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CONDITION REPORT</Text>
        <View
          style={[
            styles.anomalyBox,
            { backgroundColor: tone === "ok" ? "#F0FDF4" : tone === "suspicion" ? "#FFFBEB" : "#FFF1F2" },
          ]}
        >
          <View style={styles.row}>
            <MaterialCommunityIcons
              name={tone === "ok" ? "check-circle" : "alert-circle"}
              size={22}
              color={tone === "ok" ? "#22C55E" : tone === "suspicion" ? "#F59E0B" : "#F43F5E"}
            />
            <Text
              style={[
                styles.anomalyTitle,
                { color: tone === "ok" ? "#166534" : tone === "suspicion" ? "#B45309" : "#9F1239" },
              ]}
            >
              {anomaly || "Not Reported"}
            </Text>
          </View>
          {ast?.anomalies?.anomalyDetail && (
            <Text style={styles.anomalyDetail}>
              {ast.anomalies.anomalyDetail}
            </Text>
          )}
        </View>
      </View>

      {/* 🏗️ SECTION 4: INSTALLATION DETAILS */}
      <View style={styles.footerData}>
        <TrnMiniMap gps={gps} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#94A3B8",
    letterSpacing: 1.5,
    marginBottom: 10,
  },

  specsCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItem: { width: "48%", marginBottom: 12 },
  label: { fontSize: 10, color: "#64748B", fontWeight: "800" },
  value: { fontSize: 15, color: "#1E293B", fontWeight: "900", marginTop: 2 },

  divider: { marginVertical: 12, backgroundColor: "#F1F5F9" },

  anomalyBox: { padding: 16, borderRadius: 12, borderLeftWidth: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  anomalyTitle: { fontSize: 16, fontWeight: "900" },
  anomalyDetail: {
    fontSize: 13,
    color: "#475569",
    marginTop: 6,
    lineHeight: 18,
  },

  footerData: { marginTop: 10, gap: 8 },
  miniDetail: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 12, color: "#64748B", fontWeight: "600" },
});
