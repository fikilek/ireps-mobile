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

const FormSelect = ({
  label,
  name,
  options,
  icon = "form-select",
  disabled = false,
  onValueChange,
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
          <Text style={styles.value}>{value || "Select..."}</Text>
        </View>
        <MaterialCommunityIcons
          name={isDisabled ? "lock" : "chevron-down"}
          size={20}
          color={hasError ? "#ef4444" : "#64748b"}
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
              {options.map((opt) => (
                <List.Item
                  key={opt}
                  title={opt}
                  onPress={() => {
                    setFieldValue(name, opt, true);
                    onValueChange?.(opt);
                    setFieldTouched(name, true, false);
                    setVisible(false);
                  }}
                  right={(p) =>
                    value === opt && (
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
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  value: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  modalSurface: {
    borderRadius: 12,
    backgroundColor: "white",
    overflow: "hidden",
  },
  modalTitle: {
    padding: 16,
    fontWeight: "900",
    color: "#475569",
    textAlign: "center",
  },
});

export default FormSelect;
