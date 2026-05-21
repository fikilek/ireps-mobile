import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  initialTrnFilterState,
  toggleFilterArrayValue,
  TRN_DATE_PRESETS,
} from "../../context/TrnFilterContext";

import { FilterHelpModal } from "../filters/FilterHelpModal";
import { FilterModalShell } from "../filters/FilterModalShell";
import { FilterOptionRow } from "../filters/FilterOptionRow";
import { FilterSection } from "../filters/FilterSection";

import {
  getDateRangeForPreset,
  getTrnFilterStats,
  TRN_ACCESS_STATE_OPTIONS,
  TRN_EXECUTION_OUTCOME_OPTIONS,
  TRN_METER_CATEGORY_OPTIONS,
  TRN_METER_SERVICE_OPTIONS,
  TRN_METER_TYPE_OPTIONS,
  TRN_ORIGIN_CHANNEL_OPTIONS,
  TRN_TYPE_OPTIONS,
  TRN_WORKFLOW_STATE_OPTIONS,
} from "./filterTrns";

const workflowDiagramSource = require("../../../assets/help/ireps-trn-workflow-v2.png");

const DATE_PRESET_OPTIONS = [
  TRN_DATE_PRESETS.ALL,
  TRN_DATE_PRESETS.TODAY,
  TRN_DATE_PRESETS.YESTERDAY,
  TRN_DATE_PRESETS.THIS_WEEK,
  TRN_DATE_PRESETS.LAST_7_DAYS,
  TRN_DATE_PRESETS.THIS_MONTH,
  TRN_DATE_PRESETS.LAST_MONTH,
  TRN_DATE_PRESETS.CUSTOM_DURATION,
];

const FILTER_LABELS = {
  ALL: "All",
  TODAY: "Today",
  YESTERDAY: "Yesterday",
  THIS_WEEK: "This Week",
  LAST_7_DAYS: "Last 7 Days",
  THIS_MONTH: "This Month",
  LAST_MONTH: "Last Month",
  CUSTOM_DURATION: "Custom Duration",

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
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",

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

const HELP_CONTENT = {
  datePreset: {
    title: "Date Preset Help",
    subtitle: "What the date filters mean",
    definition:
      "Date Preset filters TRNs by the date and time when the TRN was created in iREPS. It uses metadata.createdAt, with __createTime__ as fallback.",
    items: [
      {
        title: "All",
        description: "Shows all TRNs in the current scope, regardless of date.",
      },
      { title: "Today", description: "Shows TRNs created today." },
      { title: "Yesterday", description: "Shows TRNs created yesterday." },
      {
        title: "This Week",
        description:
          "Shows TRNs created from Monday 00H00 of the current week up to 23H59 today.",
      },
      {
        title: "Last 7 Days",
        description:
          "Shows TRNs created during the last seven calendar days, including today.",
      },
      {
        title: "This Month",
        description:
          "Shows TRNs created from the first day of this month up to 23H59 today.",
      },
      {
        title: "Last Month",
        description: "Shows TRNs created during the previous calendar month.",
      },
      {
        title: "Custom Duration",
        description:
          "Shows TRNs created between a selected start date and end date. The start date begins at 00H00 and the end date ends at 23H59.",
      },
    ],
  },

  trnType: {
    title: "TRN Type Help",
    subtitle: "What each TRN type means",
    definition:
      "TRN Type filters transactions by the kind of transaction or work record.",
    items: [
      {
        title: "Meter Discovery",
        description: "A TRN used to capture or discover a meter in the field.",
      },
      {
        title: "Meter Installation",
        description: "A TRN used to record the installation of a meter.",
      },
      {
        title: "Meter Commissioning",
        description:
          "A TRN used to confirm that an installed meter is ready for use and can be switched on or commissioned.",
      },
      {
        title: "Meter Inspection",
        description:
          "A TRN used to inspect a meter, compare field findings with existing iREPS data, and capture anomalies or normalisation actions.",
      },
      {
        title: "Meter Disconnection",
        description: "A TRN used to disconnect a meter or supply.",
      },
      {
        title: "Meter Reconnection",
        description:
          "A TRN used to reconnect a previously disconnected meter or supply.",
      },
      {
        title: "Meter Removal",
        description: "A TRN used to remove a meter from the field.",
      },
      {
        title: "Meter Reading",
        description:
          "A TRN used to capture a conventional meter reading only. It is not used for prepaid/token meters in the current design.",
      },
      {
        title: "Meter Vending",
        description:
          "A TRN used to record a vending-related transaction, where applicable.",
      },
    ],
  },

  workflowState: {
    title: "Workflow State Help",
    subtitle: "How work moves through iREPS",
    definition:
      "Workflow State filters TRNs by where office-originated work is in the work process.",
    imageSource: workflowDiagramSource,
    imageCaption:
      "Office work can be awaited, accepted, rejected, reassigned, completed, or cancelled. Field-origin work is captured directly.",
    items: [
      {
        title: "Awaiting",
        description:
          "The TRN has been created and assigned, and is waiting for the assigned field user to respond.",
        bullets: ["Internal state: ISSUED"],
      },
      {
        title: "Accepted",
        description:
          "The assigned field user accepted the work and is expected to execute it.",
        bullets: ["After a user accepts work, the user cannot reject it."],
      },
      {
        title: "Rejected",
        description:
          "The assigned field user rejected the work before accepting it, and the work goes back for manager action.",
        bullets: ["A user can reject work only before accepting it."],
      },
      {
        title: "Reassigned",
        description:
          "The MNG or SPV(MNC) assigned the work to another user or target after manager review.",
        bullets: [
          "Awaiting work can be reassigned where allowed.",
          "Accepted work is not directly reassigned in v1; it should be cancelled and new work issued where needed.",
        ],
      },
      {
        title: "In Progress",
        description:
          "The work has been opened and saved locally by the executor, but has not yet been finally submitted to the server.",
        bullets: [
          "This work is local-only.",
          "It does not appear in TrnsScreen.",
          "It does not count in TRN stats.",
          "The server does not know about it until final submission succeeds.",
        ],
      },
      {
        title: "Completed",
        description:
          "The final execution result was submitted to the server and saved in the TRNs collection.",
        bullets: [
          "Completed does not always mean Success.",
          "Use Execution Outcome to see whether the result was Success, No Access, or No Reading.",
        ],
      },
      {
        title: "Cancelled",
        description:
          "The MNG or SPV(MNC) cancelled the TRN, and the work will not continue.",
        bullets: [
          "Pending work cannot be rejected by the executor after acceptance.",
          "If accepted work will not be executed, MNG or SPV(MNC) may cancel it with a reason and issue new work where needed.",
        ],
      },
    ],
  },

  origin: {
    title: "Origin / Work Source Help",
    subtitle: "Where the TRN started",
    definition:
      "Origin / Work Source filters TRNs by where the transaction started.",
    items: [
      {
        title: "Office",
        description:
          "The TRN started as an office-originated work instruction, usually created by MNG or SPV(MNC).",
      },
      {
        title: "Field",
        description:
          "The TRN started directly in the field, usually created by FWR or SPV(SUBC).",
      },
      {
        title: "API",
        description:
          "The TRN was created by an external system or application interface. Example: meter readings received from an AMI system interface.",
      },
      {
        title: "Integration",
        description:
          "The TRN was created through a system-to-system integration process.",
      },
      {
        title: "Data Issue",
        description:
          "The TRN origin is missing, invalid, or not properly classified.",
      },
    ],
  },

  executionOutcome: {
    title: "Execution Outcome Help",
    subtitle: "What happened when work was executed",
    definition:
      "Execution Outcome filters TRNs by the final execution result, or by work that has been accepted but not yet submitted.",
    items: [
      {
        title: "Success",
        description:
          "The meter was physically accessed, all required checks or work were completed, and all required data was obtained.",
      },
      {
        title: "No Access",
        description:
          "The meter could not be physically touched or worked on by the field user.",
        bullets: [
          "A visible meter is still No Access if it is behind glass, behind a locked barrier, inside a locked yard, blocked by animals, or otherwise physically obstructed.",
        ],
      },
      {
        title: "No Reading",
        description:
          "The field user had the meter context, but a usable conventional meter reading could not be captured.",
      },
      {
        title: "Pending",
        description:
          "Work has been accepted by the user but not yet submitted to the server.",
        bullets: [
          "Pending work cannot be rejected by the executor after acceptance.",
          "If accepted work will not be executed, MNG or SPV(MNC) may cancel it with a reason and issue new work where needed.",
        ],
      },
    ],
  },

  access: {
    title: "Access Help",
    subtitle: "Physical access to the meter",
    definition:
      "Access filters TRNs by whether physical access to the meter was available.",
    items: [
      {
        title: "Access",
        description:
          "The field user could physically reach and touch the meter and its surroundings, and could verify the required information directly from the meter.",
      },
      {
        title: "No Access",
        description:
          "The field user could not physically reach or touch the meter.",
        bullets: [
          "A meter is still No Access if it is visible but behind glass, locked inside a property, behind a locked gate, blocked by animals, unsafe, or otherwise unreachable.",
        ],
      },
      {
        title: "Data Issue",
        description: "Access information is missing, unclear, or invalid.",
      },
    ],
  },

  meterService: {
    title: "Meter Service Help",
    subtitle: "Electricity or water",
    definition:
      "Meter Service filters TRNs by service type using the TRN meterType field.",
    items: [
      {
        title: "Electricity",
        description: "TRNs related to electricity meters.",
      },
      { title: "Water", description: "TRNs related to water meters." },
      {
        title: "Data Issue",
        description:
          "The TRN meter service is missing, invalid, or not properly classified.",
      },
    ],
  },

  meterCategory: {
    title: "Meter Category Help",
    subtitle: "Normal or bulk meter",
    definition: "Meter Category filters TRNs by ast.astData.meter.category.",
    items: [
      {
        title: "Normal",
        description: "A standard consumer or ordinary meter.",
      },
      {
        title: "Bulk",
        description:
          "A bulk meter used for larger or higher-level supply measurement.",
      },
      {
        title: "Data Issue",
        description:
          "The meter category is missing, invalid, or not properly classified.",
      },
    ],
  },

  meterType: {
    title: "Meter Type Help",
    subtitle: "Prepaid or conventional",
    definition: "Meter Type filters TRNs by ast.astData.meter.type.",
    items: [
      { title: "Prepaid", description: "A prepaid meter." },
      {
        title: "Conventional",
        description: "A conventional credit or postpaid meter.",
      },
      {
        title: "Data Issue",
        description:
          "The meter type is missing, invalid, or not properly classified.",
        bullets: [
          "Missing water meter.type must not be assumed to be conventional.",
          "Missing or invalid meter.type is treated as Data Issue.",
        ],
      },
    ],
  },
};

function labelFor(value) {
  return FILTER_LABELS[value] || String(value || "NAv").replaceAll("_", " ");
}

function countFor(statsMap = {}, value) {
  return Number(statsMap?.[value] || 0);
}

function formatLongDate(date) {
  if (!date) return "NAv";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateRangeDescription(datePreset, filterState) {
  if (datePreset === TRN_DATE_PRESETS.ALL) {
    return "All TRNs in the current scope.";
  }

  if (datePreset === TRN_DATE_PRESETS.CUSTOM_DURATION) {
    const start = String(filterState?.customDateStart || "").trim();
    const end = String(filterState?.customDateEnd || "").trim();

    if (!start || !end) return "Choose start date and end date.";

    return `00H00 : ${start} to 23H59 : ${end}`;
  }

  const range = getDateRangeForPreset(datePreset, filterState);
  if (!range?.start || !range?.end) return "NAv";

  const startDate = range.start;
  const endDate = new Date(range.end);
  endDate.setDate(endDate.getDate() - 1);

  if (formatLongDate(startDate) === formatLongDate(endDate)) {
    return `00H00 to 23H59 : ${formatLongDate(startDate)}`;
  }

  return `00H00 : ${formatLongDate(startDate)} to 23H59 : ${formatLongDate(
    endDate,
  )}`;
}

function FilterOptionSection({
  title,
  subtitle,
  icon,
  options = [],
  selectedValues = [],
  statsMap = {},
  onToggle,
  onHelpPress,
}) {
  return (
    <FilterSection
      title={title}
      subtitle={subtitle}
      icon={icon}
      count={options.length}
      isEmpty={options.length === 0}
      onHelpPress={onHelpPress}
    >
      {options.map((value, index) => (
        <FilterOptionRow
          key={value}
          index={index}
          title={labelFor(value)}
          count={countFor(statsMap, value)}
          selected={selectedValues.includes(value)}
          onPress={() => onToggle(value)}
        />
      ))}
    </FilterSection>
  );
}

export function TrnFilterModal({
  visible,
  onClose,
  filterState,
  setFilterState,
  allTrns = [],
  filteredCount = 0,
}) {
  const [helpKey, setHelpKey] = useState(null);
  const stats = useMemo(() => getTrnFilterStats(allTrns), [allTrns]);

  const toggleArrayFilter = (fieldName, value) => {
    setFilterState((prev) => ({
      ...prev,
      [fieldName]: toggleFilterArrayValue(prev?.[fieldName], value),
    }));
  };

  const setSingleFilter = (fieldName, value) => {
    setFilterState((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const setCustomDate = (fieldName, value) => {
    setFilterState((prev) => ({
      ...prev,
      [fieldName]: value,
      datePreset: TRN_DATE_PRESETS.CUSTOM_DURATION,
    }));
  };

  const resetFilters = () => {
    setFilterState(initialTrnFilterState);
  };

  const selectedDatePreset = filterState?.datePreset || TRN_DATE_PRESETS.ALL;

  return (
    <>
      <FilterModalShell
        visible={visible}
        onClose={onClose}
        title="TRN Filters"
        subtitle="Filter transactions by date, type, workflow, source, outcome, access, and meter data."
        onReset={resetFilters}
        applyLabel={`APPLY TO ${filteredCount || 0} TRNS`}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <FilterSection
            title="Date Preset"
            subtitle="Uses TRN created date: metadata.createdAt."
            icon="calendar-outline"
            count={DATE_PRESET_OPTIONS.length}
            onHelpPress={() => setHelpKey("datePreset")}
          >
            {DATE_PRESET_OPTIONS.map((value, index) => (
              <FilterOptionRow
                key={value}
                index={index}
                title={labelFor(value)}
                description={formatDateRangeDescription(value, filterState)}
                selected={selectedDatePreset === value}
                showCheckbox
                onPress={() => setSingleFilter("datePreset", value)}
              />
            ))}

            {selectedDatePreset === TRN_DATE_PRESETS.CUSTOM_DURATION && (
              <View style={styles.customDateBox}>
                <Text style={styles.customDateTitle}>Custom Duration</Text>
                <Text style={styles.customDateHint}>
                  Use YYYY-MM-DD. Start date begins at 00H00. End date ends at
                  23H59.
                </Text>

                <TextInput
                  style={styles.customDateInput}
                  placeholder="Start date: YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  value={filterState?.customDateStart || ""}
                  onChangeText={(text) =>
                    setCustomDate("customDateStart", text)
                  }
                />

                <TextInput
                  style={styles.customDateInput}
                  placeholder="End date: YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  value={filterState?.customDateEnd || ""}
                  onChangeText={(text) => setCustomDate("customDateEnd", text)}
                />
              </View>
            )}
          </FilterSection>

          <FilterOptionSection
            title="TRN Type"
            subtitle="Specific transaction type."
            icon="file-document-outline"
            options={TRN_TYPE_OPTIONS}
            selectedValues={filterState?.trnTypes || []}
            statsMap={stats.trnTypes}
            onToggle={(value) => toggleArrayFilter("trnTypes", value)}
            onHelpPress={() => setHelpKey("trnType")}
          />

          <FilterOptionSection
            title="Workflow State"
            subtitle="Office work movement through the WMS process."
            icon="progress-check"
            options={TRN_WORKFLOW_STATE_OPTIONS}
            selectedValues={filterState?.workflowStates || []}
            statsMap={stats.workflowStates}
            onToggle={(value) => toggleArrayFilter("workflowStates", value)}
            onHelpPress={() => setHelpKey("workflowState")}
          />

          <FilterOptionSection
            title="Origin / Work Source"
            subtitle="Office, Field, API, Integration, or Data Issue."
            icon="source-branch"
            options={TRN_ORIGIN_CHANNEL_OPTIONS}
            selectedValues={filterState?.originChannels || []}
            statsMap={stats.originChannels}
            onToggle={(value) => toggleArrayFilter("originChannels", value)}
            onHelpPress={() => setHelpKey("origin")}
          />

          <FilterOptionSection
            title="Execution Outcome"
            subtitle="Success, No Access, No Reading, or Pending."
            icon="checkbox-marked-circle-outline"
            options={TRN_EXECUTION_OUTCOME_OPTIONS}
            selectedValues={filterState?.executionOutcomes || []}
            statsMap={stats.executionOutcomes}
            onToggle={(value) => toggleArrayFilter("executionOutcomes", value)}
            onHelpPress={() => setHelpKey("executionOutcome")}
          />

          <FilterOptionSection
            title="Access"
            subtitle="Physical access to the meter."
            icon="shield-key-outline"
            options={TRN_ACCESS_STATE_OPTIONS}
            selectedValues={filterState?.accessStates || []}
            statsMap={stats.accessStates}
            onToggle={(value) => toggleArrayFilter("accessStates", value)}
            onHelpPress={() => setHelpKey("access")}
          />

          <FilterOptionSection
            title="Meter Service"
            subtitle="meterType: electricity or water. Anything else is Data Issue."
            icon="water-outline"
            options={TRN_METER_SERVICE_OPTIONS}
            selectedValues={filterState?.meterServices || []}
            statsMap={stats.meterServices}
            onToggle={(value) => toggleArrayFilter("meterServices", value)}
            onHelpPress={() => setHelpKey("meterService")}
          />

          <FilterOptionSection
            title="Meter Category"
            subtitle="ast.astData.meter.category: normal or bulk."
            icon="shape-outline"
            options={TRN_METER_CATEGORY_OPTIONS}
            selectedValues={filterState?.meterCategories || []}
            statsMap={stats.meterCategories}
            onToggle={(value) => toggleArrayFilter("meterCategories", value)}
            onHelpPress={() => setHelpKey("meterCategory")}
          />

          <FilterOptionSection
            title="Meter Type"
            subtitle="ast.astData.meter.type: prepaid or conventional."
            icon="counter"
            options={TRN_METER_TYPE_OPTIONS}
            selectedValues={filterState?.meterTypes || []}
            statsMap={stats.meterTypes}
            onToggle={(value) => toggleArrayFilter("meterTypes", value)}
            onHelpPress={() => setHelpKey("meterType")}
          />
        </ScrollView>
      </FilterModalShell>

      <FilterHelpModal
        visible={!!helpKey}
        onClose={() => setHelpKey(null)}
        content={HELP_CONTENT[helpKey]}
      />
    </>
  );
}

export default TrnFilterModal;

const styles = StyleSheet.create({
  scroll: {
    maxHeight: "100%",
  },

  scrollContent: {
    paddingBottom: 14,
  },

  customDateBox: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 12,
  },

  customDateTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },

  customDateHint: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 10,
  },

  customDateInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 12,
    marginTop: 8,
  },
});
