import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Modal, Portal, TextInput } from "react-native-paper";
import { FORM_TEXT } from "../src/theme/formColors";

const PRESET_OPTIONS = [
  { key: "TODAY", label: "Today" },
  { key: "YESTERDAY", label: "Yesterday" },
  { key: "PAST_3_DAYS", label: "Past 3 Days" },
  { key: "PAST_5_DAYS", label: "Past 5 Days" },
  { key: "THIS_CALENDAR_WEEK", label: "This Calendar Week" },
  { key: "LAST_CALENDAR_WEEK", label: "Last Calendar Week" },
  { key: "THIS_CALENDAR_MONTH", label: "This Calendar Month" },
  { key: "LAST_CALENDAR_MONTH", label: "Last Calendar Month" },
];

function buildDisplayLabel(value) {
  if (!value?.key) return "This Calendar Month";

  if (value.key === "CUSTOM_RANGE") {
    const from = value?.from || "Date1";
    const to = value?.to || "Date2";
    return `${from} → ${to}`;
  }

  return value?.label || "This Calendar Month";
}

export default function DateWindowPicker({
  value,
  onChange,
  title = "Select Date Window",
}) {
  const [visible, setVisible] = useState(false);
  const [tempFromDate, setTempFromDate] = useState("");
  const [tempToDate, setTempToDate] = useState("");

  const displayLabel = useMemo(() => buildDisplayLabel(value), [value]);

  const handlePresetSelect = (option) => {
    if (option.key === "CUSTOM_RANGE") return;

    onChange?.(option);
    setVisible(false);
  };

  const handleApplyCustomRange = () => {
    const from = String(tempFromDate || "").trim();
    const to = String(tempToDate || "").trim();

    if (!from || !to) return;

    if (from > to) return;

    onChange?.({
      key: "CUSTOM_RANGE",
      label: "Custom Range",
      from,
      to,
    });

    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.dateBadge}
        onPress={() => {
          setTempFromDate(value?.from || "");
          setTempToDate(value?.to || "");
          setVisible(true);
        }}
        activeOpacity={0.8}
      >
        <View style={styles.badgeInner}>
          <MaterialCommunityIcons
            name="calendar-search"
            size={14}
            color="#475569"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.dateText}>{displayLabel}</Text>
        </View>
      </TouchableOpacity>

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          dismissable
          contentContainerStyle={styles.modalOuter}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{title}</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalGrid}>
                {PRESET_OPTIONS.map((option) => {
                  const isActive =
                    value?.key === option.key && option.key !== "CUSTOM_RANGE";

                  return (
                    <Button
                      key={option.key}
                      mode={isActive ? "contained" : "outlined"}
                      onPress={() => handlePresetSelect(option)}
                      style={styles.modalBtn}
                      contentStyle={styles.modalBtnContent}
                      labelStyle={styles.modalBtnLabel}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </View>

              <View style={styles.customRangeWrap}>
                <Text style={styles.customRangeTitle}>Custom Range</Text>

                <TextInput
                  label="From Date (YYYY-MM-DD)"
                  value={tempFromDate}
                  onChangeText={setTempFromDate}
                  mode="outlined"
                  dense
                  style={styles.input}
                />

                <TextInput
                  label="To Date (YYYY-MM-DD)"
                  value={tempToDate}
                  onChangeText={setTempToDate}
                  mode="outlined"
                  dense
                  style={styles.input}
                />

                <Button
                  mode="contained"
                  onPress={handleApplyCustomRange}
                  style={styles.applyBtn}
                >
                  Apply Range
                </Button>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  dateBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },

  badgeInner: {
    flexDirection: "row",
    alignItems: "center",
  },

  dateText: {
    fontSize: 10,
    fontWeight: "800",
    color: FORM_TEXT,
    textTransform: "uppercase",
  },

  modalOuter: {
    marginHorizontal: 20,
    justifyContent: "center",
  },

  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    maxHeight: "82%",
    elevation: 6,
  },

  modalScrollContent: {
    paddingBottom: 8,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 18,
    textAlign: "center",
  },

  modalGrid: {
    flexDirection: "column",
    gap: 10,
  },

  modalBtn: {
    width: "100%",
    borderRadius: 10,
  },

  // modalGrid: {
  //   flexDirection: "row",
  //   flexWrap: "wrap",
  //   justifyContent: "space-between",
  //   gap: 10,
  // },

  // modalBtn: {
  //   width: "48%",
  //   borderRadius: 10,
  // },

  modalBtnContent: {
    minHeight: 44,
  },

  modalBtnLabel: {
    fontSize: 11,
    textAlign: "center",
  },

  customRangeWrap: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 18,
  },

  customRangeTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 12,
  },

  input: {
    backgroundColor: "#fff",
    marginBottom: 12,
  },

  applyBtn: {
    marginTop: 4,
    borderRadius: 10,
  },
});
