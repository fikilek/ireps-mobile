import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Checkbox } from "react-native-paper";
import { FormSection } from "./FormSection";

function normalizeOption(option) {
  if (option && typeof option === "object") {
    const value = option.value ?? option.label;
    return {
      label: String(option.label ?? value ?? ""),
      value,
    };
  }

  return {
    label: String(option ?? ""),
    value: option,
  };
}

export const OtherAnomalySection = ({
  values,
  setFieldValue,
  options = [],
  disabled = false,
}) => {
  const selected = Array.isArray(values?.ast?.anomalies?.otherAnomalies)
    ? values.ast.anomalies.otherAnomalies
    : [];

  const handleToggle = (optionValue) => {
    const nextValues = selected.includes(optionValue)
      ? selected.filter((value) => value !== optionValue)
      : [...selected, optionValue];

    setFieldValue("ast.anomalies.otherAnomalies", nextValues, true);
  };

  return (
    <FormSection title="Other Anomaly">
      <View style={styles.checkboxGroup}>
        {options.map(normalizeOption).map((option) => {
          const isChecked = selected.includes(option.value);

          return (
            <TouchableOpacity
              key={String(option.value)}
              style={[styles.checkRow, isChecked && styles.checkRowActive]}
              onPress={() => handleToggle(option.value)}
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
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </FormSection>
  );
};

const styles = StyleSheet.create({
  checkboxGroup: {
    gap: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    paddingRight: 12,
  },
  checkRowActive: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  checkLabelActive: {
    color: "#1d4ed8",
  },
});
