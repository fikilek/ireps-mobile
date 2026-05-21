import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AST_CAPTURE_SOURCE_OPTIONS,
  AST_METER_CATEGORY_OPTIONS,
  AST_METER_PHASE_OPTIONS,
  AST_METER_SERVICE_OPTIONS,
  AST_METER_TYPE_OPTIONS,
  AST_OFF_GRID_SUPPLY_OPTIONS,
  AST_SEAL_STATE_OPTIONS,
  AST_STATUS_OPTIONS,
  AST_VISIBILITY_OPTIONS,
  buildAstCbSizeOptions,
  buildAstGeofenceOptions,
  buildAstManufacturerOptions,
  buildAstPlacementOptions,
  buildAstPropertyTypeOptions,
  getAstCaptureSource,
  getAstCbSizeValue,
  getAstGeofenceFilterValues,
  getAstManufacturerValue,
  getAstMeterCategory,
  getAstMeterPhase,
  getAstMeterService,
  getAstMeterType,
  getAstOffGridSupplyState,
  getAstPlacementValue,
  getAstPropertyTypeValue,
  getAstSealState,
  getAstStatus,
  getAstVisibility,
} from "./filterAsts";

function toggleArrayValue(currentValues = [], nextValue) {
  const safeValues = Array.isArray(currentValues) ? currentValues : [];

  if (safeValues.includes(nextValue)) {
    return safeValues.filter((value) => value !== nextValue);
  }

  return [...safeValues, nextValue];
}

function countByValue(asts = [], getValue) {
  const map = new Map();

  asts.forEach((item) => {
    const value = getValue(item);
    map.set(value, (map.get(value) || 0) + 1);
  });

  return map;
}

function countByAnyValue(asts = [], getValues) {
  const map = new Map();

  asts.forEach((item) => {
    const values = getValues(item);

    values.forEach((value) => {
      map.set(value, (map.get(value) || 0) + 1);
    });
  });

  return map;
}

function withCounts(options = [], countMap) {
  return options.map((option) => ({
    ...option,
    count: countMap.get(option.value) || 0,
  }));
}

function HelpModal({ visible, help, onClose }) {
  if (!help) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.helpBackdrop}>
        <View style={styles.helpSheet}>
          <View style={styles.helpHeader}>
            <View style={styles.helpIcon}>
              <MaterialCommunityIcons
                name="help-circle-outline"
                size={23}
                color="#2563EB"
              />
            </View>

            <View style={styles.helpTitleWrap}>
              <Text style={styles.helpTitle}>{help.title}</Text>
              <Text style={styles.helpSub}>{help.subtitle}</Text>
            </View>

            <TouchableOpacity style={styles.helpClose} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.helpScroll}
            contentContainerStyle={styles.helpScrollContent}
          >
            {(help.lines || []).map((line, index) => (
              <View key={`${help.title}-${index}`} style={styles.helpLine}>
                <MaterialCommunityIcons
                  name="circle-small"
                  size={22}
                  color="#2563EB"
                />
                <Text style={styles.helpText}>{line}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, subtitle, help, onHelpPress, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>

        <TouchableOpacity
          style={styles.sectionHelpButton}
          onPress={() => onHelpPress(help)}
        >
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={18}
            color="#2563EB"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.optionList}>{children}</View>
    </View>
  );
}

function OptionRow({ option, selected, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.optionRow, selected && styles.optionRowSelected]}
      onPress={onPress}
    >
      <View style={styles.optionCheck}>
        <MaterialCommunityIcons
          name={
            selected
              ? "checkbox-marked-circle"
              : "checkbox-blank-circle-outline"
          }
          size={20}
          color={selected ? "#2563EB" : "#94A3B8"}
        />
      </View>

      <View style={styles.optionTextWrap}>
        <Text
          style={[styles.optionLabel, selected && styles.optionLabelSelected]}
        >
          {option.label}
        </Text>
        {option.description ? (
          <Text style={styles.optionDescription}>{option.description}</Text>
        ) : null}
      </View>

      <View style={[styles.countPill, selected && styles.countPillSelected]}>
        <Text style={[styles.countText, selected && styles.countTextSelected]}>
          {option.count || 0}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const HELP = {
  meterService: {
    title: "Meter Service",
    subtitle: "Water or electricity meter service.",
    lines: [
      "Meter Service is read from meterType.",
      "Electricity means the meter is an electricity meter.",
      "Water means the meter is a water meter.",
      "Data Issue means meterType is missing or not recognised.",
    ],
  },
  meterCategory: {
    title: "Meter Category",
    subtitle: "Normal or bulk meter classification.",
    lines: [
      "Meter Category is read from ast.astData.meter.category.",
      "Normal means a standard consumer or ordinary meter.",
      "Bulk means a higher-level or shared supply measurement meter.",
      "Data Issue means the category is missing or not recognised.",
    ],
  },
  meterPhase: {
    title: "Meter Phase",
    subtitle: "Electrical phase information.",
    lines: [
      "Meter Phase is read from ast.astData.meter.phase.",
      "Single Phase means a single-phase electricity meter.",
      "Three Phase means a three-phase electricity meter.",
      "Not Applicable is normally used for water meters.",
      "Data Issue means phase is required but missing or not recognised.",
    ],
  },
  meterType: {
    title: "Meter Type",
    subtitle: "Prepaid or conventional meter type.",
    lines: [
      "Meter Type is read from ast.astData.meter.type.",
      "Prepaid means a prepaid meter.",
      "Conventional means a conventional meter.",
      "Missing water meter.type must not be assumed as conventional.",
      "Missing or invalid meter.type is Data Issue.",
    ],
  },
  meterStatus: {
    title: "Meter Status",
    subtitle: "Current AST/meter state.",
    lines: [
      "Meter Status is read from status.state.",
      "Field means the meter was captured but is not yet commissioned.",
      "Connected means the meter is connected.",
      "Disconnected means the meter is disconnected.",
      "Removed means the meter was removed from the field.",
      "Decommissioned means the meter is no longer active for operations.",
    ],
  },
  visibility: {
    title: "Visibility",
    subtitle: "Prepaid vending history availability.",
    lines: [
      "Visibility is read from master.visibility.",
      "Visible means prepaid vending history is available in iREPS.",
      "Invisible means the meter exists in iREPS, but prepaid vending history is not available in the iREPS vending/master view.",
      "Visibility does not mean the field worker can physically see the meter.",
      "Visibility does not mean the meter is linked to a billing account.",
    ],
  },
  geofence: {
    title: "Geofence",
    subtitle: "Meter grouping through geofenceRefs.",
    lines: [
      "Geofence is read from geofenceRefs.",
      "Has Geofence means the meter belongs to at least one geofence.",
      "No Geofence means geofenceRefs is missing, null, or empty.",
      "Specific geofence options filter meters linked to that geofence.",
    ],
  },
  offGrid: {
    title: "Off-grid Supply",
    subtitle: "Off-grid supply capture status.",
    lines: [
      "Off-grid Supply is read from ast.ogs.hasOffGridSupply.",
      "Yes means off-grid supply is recorded.",
      "No means off-grid supply is recorded as not present.",
      "Not Recorded means this value was not captured.",
    ],
  },
  placement: {
    title: "Placement",
    subtitle: "Where the meter is physically placed.",
    lines: [
      "Placement is read from ast.location.placement.",
      "Examples include Top Pole, Wall Box, Meter Box, or other captured placement values.",
      "Not Recorded means placement is missing.",
    ],
  },
  seal: {
    title: "Seal Number",
    subtitle: "Seal number availability.",
    lines: [
      "Seal Number is read from ast.astData.meter.seal.sealNo.",
      "Has Seal Number means a seal number was captured.",
      "No Seal Number means the seal number is missing, blank, null, or NAv.",
    ],
  },
  cbSize: {
    title: "CB Size",
    subtitle: "Circuit breaker size.",
    lines: [
      "CB Size is read from ast.astData.meter.cb.size.",
      "No CB Size means cb or cb.size is missing, blank, null, or NAv.",
      "Other options are built dynamically from CB sizes found in the visible meter list.",
    ],
  },
  manufacturer: {
    title: "Manufacturer",
    subtitle: "Meter manufacturer.",
    lines: [
      "Manufacturer is read from ast.astData.astManufacturer.",
      "Options are built dynamically from the visible meter list.",
      "Data Issue means manufacturer is missing.",
    ],
  },
  propertyType: {
    title: "Property Type",
    subtitle: "Premise property type.",
    lines: [
      "Property Type is read from accessData.premise.propertyType.",
      "Examples include Residential, Business, Municipal, or other captured property types.",
      "Data Issue means property type is missing.",
    ],
  },
  captureSource: {
    title: "Meter Capture Source",
    subtitle: "How meter data landed in iREPS.",
    lines: [
      "Meter Capture Source is read from accessData.trnType.",
      "Discovery means the meter data landed through Meter Discovery.",
      "Installation means the meter data landed through Meter Installation.",
      "Data Issue means the capture source is missing or not recognised.",
    ],
  },
};

export function AstFilterModal({
  visible,
  onClose,
  filterState,
  setFilterState,
  resetFilters,
  asts = [],
}) {
  const [help, setHelp] = useState(null);

  const toggle = (key, value) => {
    setFilterState((prev) => ({
      ...prev,
      [key]: toggleArrayValue(prev?.[key], value),
    }));
  };

  const serviceOptions = useMemo(() => {
    return withCounts(
      AST_METER_SERVICE_OPTIONS,
      countByValue(asts, getAstMeterService),
    );
  }, [asts]);

  const categoryOptions = useMemo(() => {
    return withCounts(
      AST_METER_CATEGORY_OPTIONS,
      countByValue(asts, getAstMeterCategory),
    );
  }, [asts]);

  const phaseOptions = useMemo(() => {
    return withCounts(
      AST_METER_PHASE_OPTIONS,
      countByValue(asts, getAstMeterPhase),
    );
  }, [asts]);

  const meterTypeOptions = useMemo(() => {
    return withCounts(
      AST_METER_TYPE_OPTIONS,
      countByValue(asts, getAstMeterType),
    );
  }, [asts]);

  const statusOptions = useMemo(() => {
    return withCounts(AST_STATUS_OPTIONS, countByValue(asts, getAstStatus));
  }, [asts]);

  const visibilityOptions = useMemo(() => {
    return withCounts(
      AST_VISIBILITY_OPTIONS,
      countByValue(asts, getAstVisibility),
    );
  }, [asts]);

  const geofenceOptions = useMemo(() => {
    return withCounts(
      buildAstGeofenceOptions(asts),
      countByAnyValue(asts, getAstGeofenceFilterValues),
    );
  }, [asts]);

  const offGridOptions = useMemo(() => {
    return withCounts(
      AST_OFF_GRID_SUPPLY_OPTIONS,
      countByValue(asts, getAstOffGridSupplyState),
    );
  }, [asts]);

  const placementOptions = useMemo(() => {
    return withCounts(
      buildAstPlacementOptions(asts),
      countByValue(asts, getAstPlacementValue),
    );
  }, [asts]);

  const sealOptions = useMemo(() => {
    return withCounts(
      AST_SEAL_STATE_OPTIONS,
      countByValue(asts, getAstSealState),
    );
  }, [asts]);

  const cbSizeOptions = useMemo(() => {
    return withCounts(
      buildAstCbSizeOptions(asts),
      countByValue(asts, getAstCbSizeValue),
    );
  }, [asts]);

  const manufacturerOptions = useMemo(() => {
    return withCounts(
      buildAstManufacturerOptions(asts),
      countByValue(asts, getAstManufacturerValue),
    );
  }, [asts]);

  const propertyTypeOptions = useMemo(() => {
    return withCounts(
      buildAstPropertyTypeOptions(asts),
      countByValue(asts, getAstPropertyTypeValue),
    );
  }, [asts]);

  const captureSourceOptions = useMemo(() => {
    return withCounts(
      AST_CAPTURE_SOURCE_OPTIONS,
      countByValue(asts, getAstCaptureSource),
    );
  }, [asts]);

  const renderOptions = (key, options) => {
    const selectedValues = Array.isArray(filterState?.[key])
      ? filterState[key]
      : [];

    return options.map((option) => (
      <OptionRow
        key={`${key}-${option.value}`}
        option={option}
        selected={selectedValues.includes(option.value)}
        onPress={() => toggle(key, option.value)}
      />
    ));
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.titleWrap}>
                <Text style={styles.title}>Meter Filters</Text>
                <Text style={styles.subtitle}>
                  Filter the current ward meter list.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={resetFilters}
              >
                <Text style={styles.resetText}>RESET</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color="#0F172A"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Section
                title="Meter Service"
                subtitle="Water / Electricity"
                help={HELP.meterService}
                onHelpPress={setHelp}
              >
                {renderOptions("meterServices", serviceOptions)}
              </Section>

              <Section
                title="Meter Category"
                subtitle="Normal / Bulk"
                help={HELP.meterCategory}
                onHelpPress={setHelp}
              >
                {renderOptions("meterCategories", categoryOptions)}
              </Section>

              <Section
                title="Meter Phase"
                subtitle="Single / Three / Not Applicable"
                help={HELP.meterPhase}
                onHelpPress={setHelp}
              >
                {renderOptions("meterPhases", phaseOptions)}
              </Section>

              <Section
                title="Meter Type"
                subtitle="Prepaid / Conventional"
                help={HELP.meterType}
                onHelpPress={setHelp}
              >
                {renderOptions("meterTypes", meterTypeOptions)}
              </Section>

              <Section
                title="Meter Status"
                subtitle="FIELD / CONNECTED / DISCONNECTED / REMOVED"
                help={HELP.meterStatus}
                onHelpPress={setHelp}
              >
                {renderOptions("astStatuses", statusOptions)}
              </Section>

              <Section
                title="Visibility"
                subtitle="Prepaid vending history availability"
                help={HELP.visibility}
                onHelpPress={setHelp}
              >
                {renderOptions("visibilityStates", visibilityOptions)}
              </Section>

              <Section
                title="Geofence"
                subtitle="Geofence membership"
                help={HELP.geofence}
                onHelpPress={setHelp}
              >
                {renderOptions("geofenceFilters", geofenceOptions)}
              </Section>

              <Section
                title="Off-grid Supply"
                subtitle="Recorded off-grid supply"
                help={HELP.offGrid}
                onHelpPress={setHelp}
              >
                {renderOptions("offGridSupplyStates", offGridOptions)}
              </Section>

              <Section
                title="Placement"
                subtitle="Physical placement"
                help={HELP.placement}
                onHelpPress={setHelp}
              >
                {renderOptions("placements", placementOptions)}
              </Section>

              <Section
                title="Seal Number"
                subtitle="Has seal / missing seal"
                help={HELP.seal}
                onHelpPress={setHelp}
              >
                {renderOptions("sealStates", sealOptions)}
              </Section>

              <Section
                title="CB Size"
                subtitle="Circuit breaker size"
                help={HELP.cbSize}
                onHelpPress={setHelp}
              >
                {renderOptions("cbSizes", cbSizeOptions)}
              </Section>

              <Section
                title="Manufacturer"
                subtitle="Meter manufacturer"
                help={HELP.manufacturer}
                onHelpPress={setHelp}
              >
                {renderOptions("manufacturers", manufacturerOptions)}
              </Section>

              <Section
                title="Property Type"
                subtitle="Premise property type"
                help={HELP.propertyType}
                onHelpPress={setHelp}
              >
                {renderOptions("propertyTypes", propertyTypeOptions)}
              </Section>

              <Section
                title="Meter Capture Source"
                subtitle="How meter data landed in iREPS"
                help={HELP.captureSource}
                onHelpPress={setHelp}
              >
                {renderOptions("captureSources", captureSourceOptions)}
              </Section>
            </ScrollView>

            <TouchableOpacity style={styles.applyButton} onPress={onClose}>
              <Text style={styles.applyText}>APPLY FILTERS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <HelpModal
        visible={Boolean(help)}
        help={help}
        onClose={() => setHelp(null)}
      />
    </>
  );
}

export default AstFilterModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
  },
  header: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 8,
  },
  titleWrap: { flex: 1 },
  title: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  resetButton: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  resetText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#DC2626",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { maxHeight: "78%" },
  scrollContent: {
    padding: 12,
    paddingBottom: 18,
  },
  section: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionTitleWrap: { flex: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },
  sectionSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
  },
  sectionHelpButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  optionList: {
    paddingVertical: 4,
  },
  optionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  optionRowSelected: {
    backgroundColor: "#EFF6FF",
  },
  optionCheck: {
    width: 28,
    alignItems: "flex-start",
  },
  optionTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#334155",
  },
  optionLabelSelected: {
    color: "#1D4ED8",
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "650",
    color: "#64748B",
    lineHeight: 14,
  },
  countPill: {
    minWidth: 34,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  countPillSelected: {
    backgroundColor: "#2563EB",
  },
  countText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748B",
  },
  countTextSelected: {
    color: "#FFFFFF",
  },
  applyButton: {
    minHeight: 48,
    margin: 12,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  helpBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  helpSheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "75%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 14,
  },
  helpHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  helpIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  helpTitleWrap: { flex: 1 },
  helpTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  helpSub: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  helpClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  helpScroll: {
    maxHeight: 420,
  },
  helpScrollContent: {
    gap: 8,
    paddingBottom: 6,
  },
  helpLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingRight: 10,
    paddingVertical: 8,
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    lineHeight: 17,
    paddingTop: 2,
  },
});
