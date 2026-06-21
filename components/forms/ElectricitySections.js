import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Checkbox, Surface } from "react-native-paper";
import FormInputMeterNo from "../../src/features/meters/FormInputMeterNo";
import SovereignLocationPicker from "../maps/SovereignLocationPicker";
import { IrepsMedia } from "../media/IrepsMedia";
import { AnomalySection } from "./AnomalySection";
import FormInput from "./FormInput";
import { FormSection } from "./FormSection";
import FormSelect from "./FormSelect";

export const ElectricitySections = ({
  values,
  setFieldValue,
  getOptions,
  disabled,
  agentName,
  agentUid,
  errors,
  erfBoundary,
  erfNo,
  erfCentroid,
  landingPoint,
  icon,
  nearbyErfs = [],
  nearbyPremises = [],
  nearbyMeters = [],
}) => {
  const trnId = values?.id || "";
  const isInstallation = trnId.startsWith("TRN_MINST_");
  const showNormalisation = !isInstallation;
  const isDiscovery = trnId.startsWith("TRN_MDIS_");

  // 🛰️ TRANSFORMING SETTINGS FOR MULTI-SELECT
  // We take the raw strings from Firestore and turn them into {label, value} objects
  const normalizationOptions = (getOptions("norm_actions") || []).map(
    (opt) => ({
      label: opt === "none" ? "NONE (SAFE)" : opt.toUpperCase(),
      value: opt,
    }),
  );

  const handleToggle = (optionValue) => {
    // 🏛️ 1. Get current actions, ensuring we handle undefined safely
    const currentActions = values?.ast?.normalisation?.actionTaken || ["none"];

    let newActions = [];

    // Standardize the incoming value for comparison
    const incomingValue = optionValue.toLowerCase();
    console.log(`incomingValue`, incomingValue);

    if (incomingValue === "none") {
      // ⚔️ If 'NONE' is tapped, it nukes every other selection immediately
      newActions = ["none"];
    } else {
      // ⚔️ If a REAL action is tapped
      if (currentActions.includes(optionValue)) {
        // Toggle OFF: Remove the action
        newActions = currentActions.filter((a) => a !== optionValue);
      } else {
        // Toggle ON: Add the action AND filter out any variation of "none"
        // We use a case-insensitive filter to catch "none", "NONE", or "None"
        newActions = [
          ...currentActions.filter((a) => a.toLowerCase() !== "none"),
          optionValue,
        ];
      }
    }

    // ⚔️ FINAL GUARD: If the user unchecks everything, force "none" back in
    if (newActions.length === 0) {
      newActions = ["none"];
    }

    console.log(`newActions`, newActions);

    setFieldValue("ast.normalisation.actionTaken", newActions);
  };

  return (
    <View style={disabled && { opacity: 0.7 }}>
      {/* ⚡ SECTION 1: CORE METER DATA */}
      <FormSection
        title={`${isInstallation ? "INSTALLTION" : "DISCOVERY"} - Electricity Meter Details`}
      >
        <Surface style={styles.section} elevation={2}>
          <FormInputMeterNo
            label="Meter Number"
            name="ast.astData.astNo"
            disabled={disabled}
          />
          <IrepsMedia
            tag={"astNoPhoto"}
            agentName={agentName}
            agentUid={agentUid}
            fallbackGps={values?.geometry?.centroid}
          />
        </Surface>

        <Surface style={styles.section} elevation={2}>
          <FormSelect
            label="MANUFACTURER"
            name="ast.astData.astManufacturer"
            options={getOptions("elec_manufacturers")}
            disabled={disabled}
          />
          <FormInput
            label="MODEL (NAME)"
            name="ast.astData.astName"
            disabled={disabled}
          />

          <View style={styles.row}>
            <View style={styles.flexHalf}>
              <FormSelect
                label="PHASE"
                name="ast.astData.meter.phase"
                options={["single", "three"]}
                disabled={disabled}
              />
            </View>

            <View style={styles.flexHalf}>
              <FormSelect
                label="TYPE"
                name="ast.astData.meter.type"
                options={["prepaid", "conventional"]}
                disabled={disabled}
              />
            </View>
          </View>

          <FormSelect
            label="CATEGORY"
            name="ast.astData.meter.category"
            options={["Normal", "Bulk"]}
            disabled={disabled}
          />
        </Surface>
      </FormSection>

      {/* ⌨️ SECTION 2: INFRASTRUCTURE */}
      <FormSection title="Infrastructure">
        {/* SEAL */}

        <Surface style={styles.section} elevation={2}>
          <FormInput
            label="SEAL NO"
            name="ast.astData.meter.seal.sealNo"
            disabled={disabled}
          />
          {/* 🛡️ Reactive Logic: Required if Serial is missing */}
          {!values?.ast?.astData?.meter?.seal?.sealNo && (
            <FormInput
              label="SEAL COMMENT (REQUIRED)"
              name="ast.astData.meter.seal.comment"
              placeholder="Why is there no seal?"
              disabled={disabled}
            />
          )}
          <IrepsMedia
            tag={"sealPhoto"}
            agentName={agentName}
            agentUid={agentUid}
            fallbackGps={values?.geometry?.centroid}
          />
        </Surface>

        {/* KEYPAD */}

        {values?.ast?.astData?.meter?.type === "prepaid" && (
          <Surface style={styles.section} elevation={2}>
            <FormInput
              label="KEYPAD SERIAL NO"
              name="ast.astData.meter.keypad.serialNo"
              disabled={disabled}
            />
            <IrepsMedia
              tag={"keypadPhoto"}
              agentName={agentName}
              agentUid={agentUid}
              fallbackGps={values?.geometry?.centroid}
            />
          </Surface>
        )}

        <Surface style={styles.section} elevation={2}>
          {/* CB */}
          <FormInput
            label="CB SIZE (AMPS)"
            name="ast.astData.meter.cb.size"
            keyboardType="numeric"
            disabled={disabled}
          />
          {!values?.ast?.astData?.meter?.cb?.size && (
            <FormInput
              label="CB COMMENT (REQUIRED)"
              name="ast.astData.meter.cb.comment"
              placeholder="Why is the CB size missing?"
              disabled={disabled}
            />
          )}
          <IrepsMedia
            tag={"astCbPhoto"}
            agentName={agentName}
            agentUid={agentUid}
            fallbackGps={values?.geometry?.centroid}
          />
        </Surface>
      </FormSection>

      {/* 📍 SECTION 3: LOCATION (The Sovereign Anchor) */}
      <FormSection title="Meter Location">
        <FormSelect
          label="Meter Placement"
          name="ast.location.placement"
          options={getOptions("placements")}
          disabled={disabled}
        />
        <SovereignLocationPicker
          label="Meter GPS Position"
          name="ast.location.gps"
          initialGps={landingPoint}
          icon={icon}
          referenceBoundary={erfBoundary}
          erfNo={erfNo}
          erfCentroid={erfCentroid}
          nearbyErfs={nearbyErfs}
          nearbyPremises={nearbyPremises}
          nearbyMeters={nearbyMeters}
        />
      </FormSection>

      {/* 🔒 SECTION 4: CONNECTION & STATUS */}
      <FormSection title="Status & Supply">
        {isDiscovery && (
          <FormSelect
            label="METER STATUS"
            name="status.state"
            options={["CONNECTED", "DISCONNECTED"]}
            disabled={disabled}
          />
        )}
        <FormSelect
          label="OFF-GRID SUPPLY?"
          name="ast.ogs.hasOffGridSupply"
          options={["yes", "no"]}
          disabled={disabled}
        />
        {values?.ast?.ogs?.hasOffGridSupply === "yes" && (
          <IrepsMedia
            tag={"ogsPhoto"}
            agentName={agentName}
            agentUid={agentUid}
            fallbackGps={values?.geometry?.centroid}
          />
        )}
      </FormSection>

      {/* 🔒 SECTION : ANOMALY  */}
      <AnomalySection
        values={values}
        getOptions={getOptions}
        agentName={agentName}
        agentUid={agentUid}
        setFieldValue={setFieldValue}
        disabled={disabled}
      />

      {/* 🏛️ REPAIRED SECTION 4: NORMALISATION */}
      {showNormalisation && (
        <FormSection title="Normalisation">
          <View style={styles.checkboxGroup}>
            {normalizationOptions.map((opt) => {
              const isChecked =
                values?.ast?.normalisation?.actionTaken?.includes(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.checkRow, isChecked && styles.checkRowActive]}
                  onPress={() => handleToggle(opt.value)}
                  disabled={disabled}
                >
                  <Checkbox.Android
                    status={isChecked ? "checked" : "unchecked"}
                    color="#2563eb"
                  />
                  <Text
                    style={[
                      styles.checkLabel,
                      isChecked && styles.checkLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 📸 Evidence Logic: Show only if actions > "none" */}
          {values?.ast?.normalisation?.actionTaken?.some(
            (a) => a !== "none",
          ) && (
            <IrepsMedia
              tag="normalisationPhoto"
              agentName={agentName}
              agentUid={agentUid}
              fallbackGps={landingPoint}
            />
          )}
        </FormSection>
      )}
    </View>
  );
};

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
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#475569" },
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
    color: "#475569",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  // row: { flexDirection: "row", gap: 10, paddingTop: 10 },
  toggleBtn: { flex: 1, borderRadius: 10 },
  actionText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#475569",
    marginTop: 4,
  },
  selectorValue: { fontSize: 16, fontWeight: "600", color: "#1E293B" },
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

  headerMeterText: { fontSize: 14, color: "#64748b", fontWeight: "bold" },

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
    color: "#64748B",
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
    color: "#475569",
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

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    // paddingHorizontal: 10, // Optional: keeps it off the screen edges
    width: "100%",
    gap: 10,
  },
  flexHalf: {
    flex: 1,
    // marginHorizontal: 4, // 🎯 This creates the gap in the middle
  },

  checkboxGroup: {
    paddingVertical: 5,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  checkRowActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563eb",
  },
  checkLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginLeft: 10,
  },
  checkLabelActive: {
    color: "#1E293B",
  },
  mediaContainer: {
    marginTop: 10,
    padding: 15,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
  },
  mediaLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#DC2626",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f6fffe",
    marginBottom: 16,
  },
});
