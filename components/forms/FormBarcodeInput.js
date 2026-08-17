import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { getIn, useFormikContext } from "formik";
import { useRef, useState } from "react";
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Modal, Portal } from "react-native-paper";

const FormBarcodeInput = ({
  label,
  name,
  disabled,
  placeholder = "Enter or Scan Barcode",
  scanPrompt = "Align Barcode",
}) => {
  const { setFieldValue, values, errors, handleBlur, isSubmitting } =
    useFormikContext();
  const [scannerVisible, setScannerVisible] = useState(false);
  const scanHandledRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  const currentValue = getIn(values, name);
  const error = getIn(errors, name);
  const hasError = !!error;
  const inputDisabled = disabled || isSubmitting;

  const handleOpenScanner = async () => {
    Keyboard.dismiss();

    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }

    scanHandledRef.current = false;
    setScannerVisible(true);
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanHandledRef.current) return;

    scanHandledRef.current = true;
    setScannerVisible(false);
    setFieldValue(name, normalizeIdentifier(data));
  };

  const handleCloseScanner = () => {
    scanHandledRef.current = false;
    setScannerVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, hasError && styles.errorLabel]}>{label}</Text>

      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            hasError && styles.inputError,
            inputDisabled && styles.disabledInput,
          ]}
          value={currentValue || ""}
          onChangeText={(value) =>
            setFieldValue(name, normalizeIdentifier(value))
          }
          onBlur={handleBlur(name)}
          editable={!inputDisabled}
          autoCapitalize="words"
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
        />

        <TouchableOpacity
          style={styles.iconButton}
          onPress={
            currentValue ? () => setFieldValue(name, "") : handleOpenScanner
          }
          disabled={inputDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            currentValue ? `Clear ${label}` : `Scan ${label} barcode`
          }
        >
          <MaterialCommunityIcons
            name={currentValue ? "close-circle" : "barcode-scan"}
            size={22}
            color={currentValue ? "#ef4444" : "#3b82f6"}
          />
        </TouchableOpacity>
      </View>

      {hasError && <Text style={styles.errorText}>{error}</Text>}

      {scannerVisible && (
        <Portal>
          <Modal
            visible
            onDismiss={handleCloseScanner}
            contentContainerStyle={styles.scannerModal}
          >
            <CameraView
              style={StyleSheet.absoluteFill}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.overlay}>
              <View style={styles.reticle} />
              <Text style={styles.scanText}>{scanPrompt}</Text>
            </View>
            <Button
              mode="contained"
              onPress={handleCloseScanner}
              style={styles.cancelButton}
              buttonColor="#ef4444"
            >
              Cancel
            </Button>
          </Modal>
        </Portal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 12, width: "100%" },
  label: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  errorLabel: { color: "#ef4444" },
  inputWrapper: {
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
  },
  inputError: {
    borderLeftWidth: 5,
    borderLeftColor: "#ef4444",
    backgroundColor: "#fff1f2",
  },
  disabledInput: { opacity: 0.5, backgroundColor: "#e2e8f0" },
  iconButton: {
    position: "absolute",
    right: 0,
    padding: 12,
  },
  errorText: {
    fontSize: 10,
    color: "#ef4444",
    marginTop: 2,
    fontWeight: "700",
  },
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
  cancelButton: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
});

export default FormBarcodeInput;

function normalizeIdentifier(value) {
  return String(value ?? "").trim().toUpperCase();
}
