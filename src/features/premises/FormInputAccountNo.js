import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { getIn, useFormikContext } from "formik";
import { useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Modal, Portal } from "react-native-paper";

function normalizeAccountNo(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function readAccountIndex(name) {
  const match = String(name || "").match(/accounts\.(\d+)\.accountNo/);
  if (!match) return -1;
  return Number(match[1]);
}

const FormInputAccountNo = ({ label, name, disabled }) => {
  const { setFieldValue, values, errors, handleBlur, isSubmitting } =
    useFormikContext();

  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const currentValue = getIn(values, name) || "";
  const error = getIn(errors, name);
  const hasError = !!error;
  const accountIndex = useMemo(() => readAccountIndex(name), [name]);

  const isDuplicateInsideForm = (nextValue) => {
    const cleanNext = normalizeAccountNo(nextValue);
    if (!cleanNext) return false;

    const accounts = Array.isArray(values?.accounts) ? values.accounts : [];

    return accounts.some((account, index) => {
      if (index === accountIndex) return false;
      return normalizeAccountNo(account?.accountNo) === cleanNext;
    });
  };

  const updateAccountNo = (value, { fromScan = false } = {}) => {
    const cleanedValue = normalizeAccountNo(value);

    if (fromScan && isDuplicateInsideForm(cleanedValue)) {
      Alert.alert(
        "Duplicate Account Number",
        `Account [${cleanedValue}] is already captured in this form.`,
      );
      return;
    }

    setFieldValue(name, cleanedValue, true);
  };

  const handleOpenScanner = async () => {
    Keyboard.dismiss();

    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }

    setScannerVisible(true);
  };

  const onBarcodeScanned = ({ data }) => {
    setScannerVisible(false);
    updateAccountNo(data, { fromScan: true });
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, hasError && styles.labelError]}>{label}</Text>

      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[
              styles.input,
              hasError && styles.inputError,
              (disabled || isSubmitting) && styles.disabledInput,
            ]}
            value={currentValue || ""}
            onChangeText={(value) => updateAccountNo(value)}
            onBlur={handleBlur(name)}
            editable={!disabled && !isSubmitting}
            autoCapitalize="characters"
            keyboardType="default"
            placeholder="Enter or scan account no"
            placeholderTextColor="#94a3b8"
          />

          <View style={styles.iconOverlay}>
            <TouchableOpacity
              onPress={currentValue ? () => setFieldValue(name, "", true) : handleOpenScanner}
              disabled={disabled || isSubmitting}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={currentValue ? "close-circle" : "barcode-scan"}
                size={22}
                color={currentValue ? "#ef4444" : "#3b82f6"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {hasError && <Text style={styles.errorText}>{error}</Text>}

      <Portal>
        <Modal
          visible={scannerVisible}
          onDismiss={() => setScannerVisible(false)}
          contentContainerStyle={styles.scannerModal}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={scannerVisible ? onBarcodeScanned : undefined}
          />

          <View style={styles.overlay}>
            <View style={styles.reticle} />
            <Text style={styles.scanText}>ALIGN ACCOUNT BARCODE</Text>
          </View>

          <Button
            mode="contained"
            onPress={() => setScannerVisible(false)}
            style={styles.cancelBtn}
            buttonColor="#ef4444"
          >
            CANCEL
          </Button>
        </Modal>
      </Portal>
    </View>
  );
};

export default FormInputAccountNo;

const styles = StyleSheet.create({
  container: { marginBottom: 12, width: "100%" },
  label: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  labelError: { color: "#ef4444" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputWrapper: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
  },
  input: {
    backgroundColor: "#f8fafc",
    padding: 12,
    paddingRight: 45,
    borderRadius: 8,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#1e293b",
    fontWeight: "600",
    height: 50,
  },
  inputError: {
    borderLeftWidth: 5,
    borderLeftColor: "#ef4444",
    backgroundColor: "#fff1f2",
  },
  iconOverlay: {
    position: "absolute",
    right: 12,
  },
  errorText: {
    fontSize: 10,
    color: "#ef4444",
    marginTop: 2,
    fontWeight: "700",
  },
  disabledInput: { opacity: 0.5, backgroundColor: "#e2e8f0" },
  scannerModal: { flex: 1, backgroundColor: "black" },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  reticle: {
    width: 280,
    height: 150,
    borderWidth: 2,
    borderColor: "#4CD964",
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  scanText: {
    color: "white",
    marginTop: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cancelBtn: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
});
