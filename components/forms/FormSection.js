import { StyleSheet, View } from "react-native";
import { Divider, Surface, Text } from "react-native-paper";
import { FORM_TEXT } from "../../src/theme/formColors";

export const FormSection = ({ title, children }) => (
  <Surface style={styles.sectionCard} elevation={2}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <Divider />
    <View style={{ padding: 10 }}>{children}</View>
  </Surface>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  sectionCard: {
    margin: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  sectionHeader: {
    padding: 10,
    backgroundColor: "#E2E8F0",
    flexDirection: "row",
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: FORM_TEXT },
  input: { marginBottom: 10, backgroundColor: "#fff" },
  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    margin: 20,
    borderRadius: 12,
  },

  card: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  naCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: FORM_TEXT,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", gap: 10, padding: 10 },
  toggleBtn: { flex: 1, borderRadius: 10 },
  actionText: {
    fontSize: 10,
    fontWeight: "bold",
    color: FORM_TEXT,
    marginTop: 4,
  },
  selectorValue: { fontSize: 16, fontWeight: "600", color: FORM_TEXT },
  footer: { flexDirection: "row", gap: 12, marginTop: 20, padding: 20 },
  submitBtn: { flex: 2, borderRadius: 10 },
  resetBtn: { flex: 1, borderRadius: 10 },
  watermarkOverlay: {
    position: "absolute",
    bottom: 20,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 10,
    borderRadius: 5,
  },
  watermarkText: { color: "white", fontSize: 10, fontWeight: "bold" },
  cameraControls: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  captureBtnInternal: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "white",
  },
  gpsBadge: {
    marginTop: 10,
    padding: 5,
    backgroundColor: "#dcfce7",
    borderRadius: 5,
  },
  gpsBadgeText: { fontSize: 10, color: "#166534", fontWeight: "bold" },

  headerMeterText: { fontSize: 14, color: FORM_TEXT, fontWeight: "bold" },

  actionBlock: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#dc2626",
  },

  thumbnailContainer: {
    width: 110,
    height: 110,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  removePhotoBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 2,
  },

  inspectionModal: {
    margin: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  inspectionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: "100%",
    height: "80%", // Leaves room for the close button and footer
  },
  closeInspectionBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },
  inspectionFooter: {
    position: "absolute",
    bottom: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  inspectionText: {
    color: "white",
    fontWeight: "bold",
    letterSpacing: 1,
  },

  modalContainer: {
    backgroundColor: "white",
    padding: 10,
    margin: 20,
    borderRadius: 20,
    height: "70%",
  },
  cameraWrapper: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 15,
    backgroundColor: "#000",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scanTarget: {
    width: 250,
    height: 150,
    borderWidth: 2,
    borderColor: "#00FF00",
    backgroundColor: "transparent",
  },
  scanText: {
    color: "white",
    marginTop: 20,
    fontWeight: "bold",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 5,
  },
  closeBtn: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
  },
  successModal: {
    backgroundColor: "white",
    padding: 30,
    margin: 40,
    borderRadius: 20,
    alignItems: "center",
  },
  successContent: {
    alignItems: "center",
    width: "100%",
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#22C55E", // Success Green
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    // Shadow for depth
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 1,
  },
  successSub: {
    fontSize: 14,
    color: FORM_TEXT,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  continueBtn: {
    backgroundColor: "#0F172A",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  continueBtnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },

  integratedMediaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "#F1F5F9", // Subtle background to "group" the media tools
    borderRadius: 12,
    padding: 8,
    height: 120, // Enough height for 100px thumbnails + padding
  },
  cameraSlot: {
    width: 90,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#CBD5E1",
    paddingRight: 8,
  },
  ribbonSlot: {
    flex: 1, // Takes all remaining space
    height: "100%",
  },
  tinyLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: FORM_TEXT,
    marginTop: 2,
  },
  inputContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0", // Normal border
    overflow: "hidden", // Keeps the left border sharp
  },
  errorIndicator: {
    borderLeftWidth: 5, // 🎯 The "Sexy" thin indicator
    borderLeftColor: "#EF4444", // Forensic Red
    backgroundColor: "#FEF2F2", // Very light red tint (Optional)
  },

  mapModalContainer: { padding: 10, flex: 1, justifyContent: "center" },
  mapPickerSurface: {
    borderRadius: 20,
    height: "70%",
    overflow: "hidden",
    backgroundColor: "white",
  },
  pickerMap: { flex: 1 },
  modalHeader: {
    padding: 15,
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 15,
    backgroundColor: "#f8fafc",
  },

  iconCircleSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  centroidLabel: {
    backgroundColor: "rgba(15, 23, 42, 0.7)", // Dark slate semi-transparent
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  centroidText: {
    color: "#FFD700",
    fontSize: 10,
    fontWeight: "900",
  },
  // selector: {
  //   flexDirection: "row",
  //   justifyContent: "space-between",
  //   alignItems: "center",
  //   padding: 12,
  //   borderRadius: 12,
  //   backgroundColor: "#f8fafc", // Sexy Light Grey
  //   borderWidth: 1,
  //   borderColor: "#e2e8f0",
  //   elevation: 2,
  // },
  // label: {
  //   fontSize: 11,
  //   fontWeight: "900",
  //   color: FORM_TEXT,
  //   marginBottom: 8,
  //   textTransform: "uppercase",
  //   letterSpacing: 1,
  // },
  // actionText: {
  //   fontSize: 10,
  //   color: FORM_TEXT,
  //   fontWeight: "600",
  //   marginTop: 2,
  // },
});
