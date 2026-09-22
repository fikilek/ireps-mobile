import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Checkbox, RadioButton, Surface } from "react-native-paper";
import FormInputMeterNo from "../../src/features/meters/FormInputMeterNo";
import {
  NORMALISATION_JOB_ACTIONS,
  NORMALISATION_NONE,
  NO_ACTION_REASONS,
  NO_ACTION_REASON_OTHER,
  getExpectedNormalisationAction,
  getFormOptions,
  getNormalisationOptions,
  isNoActionReasonRequired,
  isNormalisationRequired,
  normalisationPhotoRequired,
} from "../../src/features/meters/formOptions";
import { removeRemainingCreditPhoto } from "../../src/features/meters/remainingCreditContract";
import SovereignLocationPicker from "../maps/SovereignLocationPicker";
import { IrepsMedia } from "../media/IrepsMedia";
import { AnomalySection } from "./AnomalySection";
import FormBarcodeInput from "./FormBarcodeInput";
import FormInput from "./FormInput";
import { OtherAnomalySection } from "./OtherAnomalySection";
import { FormSection } from "./FormSection";
import FormSelect from "./FormSelect";
import { RemainingCreditSection } from "./RemainingCreditSection";

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
  isDiscovery = false,
}) => {
  const trnId = values?.id || "";
  const isInstallation = trnId.startsWith("TRN_MINST_");
  const showNormalisation = !isInstallation;

  // MN-R001: the finding decides what is offered. None disappears as soon as the
  // anomaly is not Meter Ok.
  const anomaly = values?.ast?.anomalies?.anomaly;
  const normalisationActions = values?.ast?.normalisation?.actionTaken || [];
  const normalizationOptions = getNormalisationOptions(anomaly);
  const expectedAction = getExpectedNormalisationAction(anomaly);
  const needsReason = isNoActionReasonRequired({
    anomaly,
    actionTaken: normalisationActions,
  });

  const normalisationActionsKey = normalisationActions.join("|");
  const normalisationOptionsKey = normalizationOptions
    .map((opt) => opt.value)
    .join("|");

  const handleToggle = (optionValue) => {
    const currentActions = values?.ast?.normalisation?.actionTaken || [
      NORMALISATION_NONE,
    ];

    let newActions = [];

    if (optionValue === NORMALISATION_NONE) {
      // None clears everything else, and only Meter Ok can reach it.
      newActions = [NORMALISATION_NONE];
    } else if (currentActions.includes(optionValue)) {
      newActions = currentActions.filter((a) => a !== optionValue);
    } else {
      // One job per finding: ticking one job clears the other.
      const isJob = NORMALISATION_JOB_ACTIONS.includes(optionValue);
      newActions = [
        ...currentActions.filter(
          (a) =>
            a !== NORMALISATION_NONE &&
            !(isJob && NORMALISATION_JOB_ACTIONS.includes(a)),
        ),
        optionValue,
      ];
    }

    // Nothing ticked means nothing was done: the record says none, and where the
    // finding is not Meter Ok the reason below becomes compulsory.
    if (newActions.length === 0) {
      newActions = [NORMALISATION_NONE];
    }

    setFieldValue("ast.normalisation.actionTaken", newActions);
  };

  // A finding can be changed after actions were ticked. Keep the record honest:
  // drop anything the new finding does not offer, and clear a reason no longer
  // asked for.
  useEffect(() => {
    const offered = normalisationOptionsKey.split("|");
    const current = normalisationActionsKey ? normalisationActionsKey.split("|") : [];
    const kept = current.filter((action) => offered.includes(action));
    const next = kept.length ? kept : [NORMALISATION_NONE];

    if (next.join("|") !== normalisationActionsKey) {
      setFieldValue("ast.normalisation.actionTaken", next);
      return;
    }

    if (!needsReason && values?.ast?.normalisation?.noActionReason) {
      setFieldValue("ast.normalisation.noActionReasonOther", "", false);
      setFieldValue("ast.normalisation.noActionReason", "");
    }
    // setFieldValue is stable for the life of the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalisationOptionsKey, normalisationActionsKey, needsReason]);

  // One reason only. The typed words are cleared first, without a check, so the
  // check that runs on the reason itself sees the whole answer.
  const handleReasonSelect = (reason) => {
    if (reason !== NO_ACTION_REASON_OTHER) {
      setFieldValue("ast.normalisation.noActionReasonOther", "", false);
    }

    setFieldValue("ast.normalisation.noActionReason", reason);
  };

  return (
    <View style={disabled && { opacity: 0.7 }}>
      {/* ⚡ SECTION 1: CORE METER DATA */}
      <FormSection
        title={`${isInstallation ? "INSTALLATION" : "DISCOVERY"} - Electricity Meter Details`}
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
            onValueChange={(nextValue) => {
              if (isDiscovery && nextValue !== "Other") {
                setFieldValue("ast.astData.astManufacturerOther", "", false);
              }
            }}
          />
          {isDiscovery &&
            values?.ast?.astData?.astManufacturer === "Other" && (
              <FormInput
                label="Other Manufacturer"
                name="ast.astData.astManufacturerOther"
                placeholder="Enter Manufacturer"
                disabled={disabled}
              />
            )}
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
                options={
                  getFormOptions("meter_phases")
                }
                disabled={disabled}
              />
            </View>

            <View style={styles.flexHalf}>
              <FormSelect
                label="TYPE"
                name="ast.astData.meter.type"
                options={
                  getFormOptions("meter_types")
                }
                disabled={disabled}
                onValueChange={(nextValue) => {
                  if (isDiscovery && nextValue === "conventional") {
                    setFieldValue(
                      "ast.astData.meter.remainingCredit",
                      "",
                      false,
                    );
                    setFieldValue(
                      "ast.astData.meter.remainingCreditComment",
                      "",
                      false,
                    );
                    setFieldValue(
                      "ast.astData.meter.remainingCreditCommentOther",
                      "",
                      false,
                    );
                    setFieldValue(
                      "media",
                      removeRemainingCreditPhoto(values?.media || []),
                      false,
                    );
                  }
                }}
              />
            </View>
          </View>

          <FormSelect
            label="CATEGORY"
            name="ast.astData.meter.category"
            options={
              getFormOptions("meter_categories")
            }
            disabled={disabled}
          />
        </Surface>
      </FormSection>

      <RemainingCreditSection
        values={values}
        setFieldValue={setFieldValue}
        getOptions={getOptions}
        disabled={disabled}
        agentName={agentName}
        agentUid={agentUid}
        landingPoint={landingPoint}
        isDiscovery={isDiscovery}
      />

      {/* ⌨️ SECTION 2: INFRASTRUCTURE */}
      <FormSection title="Infrastructure">
        {/* SEAL */}

        <Surface style={styles.section} elevation={2}>
          <FormBarcodeInput
            label="SEAL NO"
            name="ast.astData.meter.seal.sealNo"
            placeholder="Enter or Scan Seal No"
            scanPrompt="Align Seal Barcode"
            disabled={disabled}
          />
          {!values?.ast?.astData?.meter?.seal?.sealNo && (
            <>
              <FormSelect
                label="Seal Number Comment"
                name="ast.astData.meter.seal.comment"
                options={getFormOptions("seal_number_comment_reasons")}
                disabled={disabled}
                clearable
                onValueChange={(nextValue) => {
                  if (nextValue !== "Other") {
                    setFieldValue(
                      "ast.astData.meter.seal.commentOther",
                      "",
                      false,
                    );
                  }
                }}
              />
              {values?.ast?.astData?.meter?.seal?.comment === "Other" && (
                <FormInput
                  label="Other Reason"
                  name="ast.astData.meter.seal.commentOther"
                  placeholder="Enter Seal Number Reason"
                  disabled={disabled}
                />
              )}
            </>
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
            <FormBarcodeInput
              label="KEYPAD SERIAL NO"
              name="ast.astData.meter.keypad.serialNo"
              placeholder="Enter or Scan Keypad Serial No"
              scanPrompt="Align Keypad Barcode"
              disabled={disabled}
            />
            {!values?.ast?.astData?.meter?.keypad?.serialNo && (
              <>
                <FormSelect
                  label="Keypad Serial Number Comment"
                  name="ast.astData.meter.keypad.comment"
                  options={getFormOptions("keypad_serial_number_comment_reasons")}
                  disabled={disabled}
                  clearable
                  onValueChange={(nextValue) => {
                    if (nextValue !== "Other") {
                      setFieldValue(
                        "ast.astData.meter.keypad.commentOther",
                        "",
                        false,
                      );
                    }
                  }}
                />
                {values?.ast?.astData?.meter?.keypad?.comment === "Other" && (
                  <FormInput
                    label="Other Reason"
                    name="ast.astData.meter.keypad.commentOther"
                    placeholder="Enter Keypad Serial Number Reason"
                    disabled={disabled}
                  />
                )}
              </>
            )}
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
            <>
              <FormSelect
                label="CB Comment"
                name="ast.astData.meter.cb.comment"
                options={getFormOptions("cb_comment_reasons")}
                disabled={disabled}
                clearable
                onValueChange={(nextValue) => {
                  if (nextValue !== "Other") {
                    setFieldValue(
                      "ast.astData.meter.cb.commentOther",
                      "",
                      false,
                    );
                  }
                }}
              />
              {values?.ast?.astData?.meter?.cb?.comment === "Other" && (
                <FormInput
                  label="Other Reason"
                  name="ast.astData.meter.cb.commentOther"
                  placeholder="Enter Circuit Breaker Reason"
                  disabled={disabled}
                />
              )}
            </>
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
          options={getFormOptions("placements")}
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
            options={getOptions("meter_statuses")}
            disabled={disabled}
          />
        )}
        <FormSelect
          label="OFF-GRID SUPPLY?"
          name="ast.ogs.hasOffGridSupply"
          options={
            getFormOptions("off_grid_supply")
          }
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

      {isDiscovery && (
        <OtherAnomalySection
          values={values}
          setFieldValue={setFieldValue}
          options={getOptions("other_anomalies")}
          disabled={disabled}
        />
      )}

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

          {isNormalisationRequired(anomaly) && !!expectedAction && (
            <Text style={styles.normalisationNote}>
              {needsReason
                ? `This meter needs to be ${
                    expectedAction === "Disconnect meter"
                      ? "disconnected"
                      : "replaced"
                  }. Tick it, or say below why it was not done.`
                : `${expectedAction} recorded.`}
            </Text>
          )}

          {needsReason && (
            <View style={styles.reasonBlock}>
              <Text style={styles.reasonTitle}>Reason for not acting</Text>

              {NO_ACTION_REASONS.map((reason) => {
                const isChosen =
                  values?.ast?.normalisation?.noActionReason === reason;

                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.checkRow, isChosen && styles.checkRowActive]}
                    onPress={() => handleReasonSelect(reason)}
                    disabled={disabled}
                  >
                    <RadioButton.Android
                      value={reason}
                      status={isChosen ? "checked" : "unchecked"}
                      color="#2563eb"
                      onPress={() => handleReasonSelect(reason)}
                      disabled={disabled}
                    />
                    <Text
                      style={[
                        styles.checkLabel,
                        isChosen && styles.checkLabelActive,
                      ]}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {values?.ast?.normalisation?.noActionReason ===
                NO_ACTION_REASON_OTHER && (
                <FormInput
                  label="Type the reason"
                  name="ast.normalisation.noActionReasonOther"
                  placeholder="What stopped the work"
                  editable={!disabled}
                />
              )}

              {!!errors?.ast?.normalisation?.noActionReason && (
                <Text style={styles.reasonError}>
                  {errors.ast.normalisation.noActionReason}
                </Text>
              )}
            </View>
          )}

          {/* 📸 A photo for work that leaves a mark. A disconnection proves
              itself in the disconnection form that follows. */}
          {normalisationPhotoRequired(normalisationActions) && (
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
  normalisationNote: {
    fontSize: 13,
    color: "#B45309",
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  reasonBlock: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 8,
    marginTop: 4,
  },
  reasonTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#475569",
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  reasonError: {
    fontSize: 12,
    color: "#DC2626",
    paddingHorizontal: 10,
    paddingTop: 4,
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
