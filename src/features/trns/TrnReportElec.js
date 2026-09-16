import { MaterialCommunityIcons } from "@expo/vector-icons";
import { anomalyTone } from "../meters/formOptions";
import { StyleSheet, Text, View } from "react-native";
import { Chip, Divider } from "react-native-paper";
import { TrnMiniMap } from "../../../components/maps/TrnMiniMap";
import IrepsMediaViewer from "../../../components/media/IrepsMediaViewer";

export default function TrnReportElec({ data }) {
  const { accessData, ast, meterType } = data;
  const normalisationActions = ast?.normalisation?.actionTaken || [];
  const anomaly = ast?.anomalies?.anomaly;
  const anomalyDetail = ast?.anomalies?.anomalyDetail;
  // Meter Ok with a bridge or bypass suspicion reads amber, not green.
  const tone = anomalyTone(anomaly, anomalyDetail);
  const gps = ast?.location?.gps;

  return (
    <View style={styles.container}>
      {/* 📸 SECTION 1: FORENSIC EVIDENCE */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TECHNICAL EVIDENCE</Text>
        <IrepsMediaViewer
          media={data.media}
          tags={["astNoPhoto", "normalisationPhoto", "anomalyPhoto"]}
        />
      </View>

      {/* 🛠️ SECTION 2: NORMALISATION ACTIONS */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>NORMALISATION PERFORMED</Text>
        <View style={styles.chipGroup}>
          {normalisationActions?.map((action, idx) => (
            <Chip
              key={idx}
              icon="check-circle"
              style={[
                styles.actionChip,
                { backgroundColor: action === "None" ? "#F1F5F9" : "#DCFCE7" },
              ]}
              textStyle={{
                color: action === "None" ? "#64748B" : "#166534",
                fontWeight: "800",
              }}
            >
              {action.replace("_", " ")}
            </Chip>
          ))}
        </View>
      </View>

      <Divider style={styles.divider} />

      {/* ⚡ SECTION 3: METER SPECIFICATIONS */}
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.label}>METER NO</Text>
          <Text style={styles.value}>{ast?.astData?.astNo}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.label}>TYPE</Text>
          <Text style={styles.value}>
            {ast?.astData?.meter?.type?.toUpperCase()}
          </Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.label}>PHASE</Text>
          <Text style={styles.value}>{ast?.astData?.meter?.phase}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.label}>CB SIZE</Text>
          <Text style={styles.value}>{ast?.astData?.meter?.cb?.size}A</Text>
        </View>
      </View>

      <Divider style={styles.divider} />

      {/* ⚠️ SECTION 4: ANOMALY REPORT */}
      <View
        style={[
          styles.section,
          styles.anomalyBox,
          { borderColor: tone === "ok" ? "#E2E8F0" : tone === "suspicion" ? "#FDE68A" : "#FECACA" },
        ]}
      >
        <View style={styles.row}>
          <MaterialCommunityIcons
            name={tone === "ok" ? "check-decagram" : "alert-octagon"}
            size={20}
            color={tone === "ok" ? "#10B981" : tone === "suspicion" ? "#F59E0B" : "#EF4444"}
          />
          <Text
            style={[
              styles.anomalyTitle,
              { color: tone === "ok" ? "#10B981" : tone === "suspicion" ? "#B45309" : "#B91C1C" },
            ]}
          >
            {anomaly}
          </Text>
        </View>
        {anomalyDetail && (
          <Text style={styles.anomalyDetail}>{anomalyDetail}</Text>
        )}
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
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionChip: { borderRadius: 8 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItem: { width: "48%", marginBottom: 16 },
  label: { fontSize: 10, color: "#64748B", fontWeight: "700" },
  value: { fontSize: 14, color: "#1E293B", fontWeight: "900", marginTop: 2 },
  divider: { marginVertical: 10, backgroundColor: "#F1F5F9" },
  anomalyBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "#FFF",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  anomalyTitle: { fontSize: 15, fontWeight: "900" },
  anomalyDetail: {
    fontSize: 13,
    color: "#475569",
    marginTop: 4,
    fontStyle: "italic",
  },
});
