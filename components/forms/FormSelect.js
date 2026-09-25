import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getIn, useFormikContext } from "formik";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Divider, List, Modal, Portal, Surface } from "react-native-paper";

function normalizeOption(option) {
  if (option && typeof option === "object") {
    const optionValue = option.value ?? option.label;
    return {
      label: String(option.label ?? optionValue ?? ""),
      value: optionValue,
    };
  }

  return {
    label: String(option ?? ""),
    value: option,
  };
}

const FormSelect = ({
  label,
  name,
  options = [],
  icon = "form-select",
  disabled = false,
  onValueChange,
  clearable = false,
  clearLabel = "Select (clear)",
}) => {
  const {
    values,
    setFieldValue,
    setFieldTouched,
    errors,
    isSubmitting,
  } = useFormikContext();
  const [visible, setVisible] = useState(false);

  const value = getIn(values, name);
  const error = getIn(errors, name);
  const hasError = !!error;
  const isDisabled = disabled || isSubmitting;

  const normalizedOptions = [
    ...(clearable ? [{ label: clearLabel, value: "" }] : []),
    ...(Array.isArray(options) ? options : [])
      .map(normalizeOption)
      .filter((option) => !(clearable && option.value === "")),
  ];

  const selectedOption = normalizedOptions.find(
    (option) => option.value === value,
  );

  const displayValue =
    selectedOption?.label ||
    (value !== undefined && value !== null && value !== ""
      ? String(value)
      : "Select...");

  return (
    <>
      <TouchableOpacity
        disabled={isDisabled}
        style={[
          styles.selector,
          hasError && styles.selectorError,
          isDisabled && { opacity: 0.5 },
        ]}
        onPress={() => setVisible(true)}
      >
        <View>
          <Text style={[styles.label, hasError && { color: "#ef4444" }]}>
            {label}
          </Text>
          <Text style={styles.value}>{displayValue}</Text>
        </View>
        <MaterialCommunityIcons
          name={isDisabled ? "lock" : "chevron-down"}
          size={20}
          color={hasError ? "#ef4444" : "#000000"}
        />
      </TouchableOpacity>

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={{ padding: 20 }}
        >
          <Surface style={styles.modalSurface}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Divider />
            <ScrollView style={{ maxHeight: 350 }}>
              {normalizedOptions.map((option, index) => (
                <List.Item
                  key={`${String(option.value)}_${index}`}
                  title={option.label}
                  // The choices a worker picks from, in black, said here rather than left to
                  // react-native-paper's own colour. The owner photographed this list pale five times over
                  // (25 September 2026): "field workers can't see grey". Nothing grey is written in this
                  // file to find, which is exactly why it survived every sweep - so it is written now.
                  titleStyle={styles.optionTitle}
                  onPress={() => {
                    setFieldValue(name, option.value, true);
                    onValueChange?.(option.value);
                    setFieldTouched(name, true, false);
                    setVisible(false);
                  }}
                  right={(p) =>
                    value === option.value && (
                      <List.Icon {...p} icon="check" color="#059669" />
                    )
                  }
                />
              ))}
            </ScrollView>
          </Surface>
        </Modal>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
  },
  selectorError: {
    borderLeftWidth: 5,
    borderLeftColor: "#ef4444",
    backgroundColor: "#fff1f2",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: "#000000",
    textTransform: "uppercase",
  },
  value: { fontSize: 15, fontWeight: "600", color: "#000000" },
  optionTitle: { color: "#000000", fontSize: 15, fontWeight: "600" },
  modalSurface: {
    borderRadius: 12,
    backgroundColor: "white",
    overflow: "hidden",
  },
  modalTitle: {
    padding: 16,
    fontWeight: "900",
    color: "#000000",
    textAlign: "center",
  },
});

export default FormSelect;
