import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { getIn, useFormikContext } from "formik";
import { useState } from "react";
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
import { useWarehouse } from "../../context/WarehouseContext";
import { cleanMeterNumberInput } from "./meterNumberRule";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../theme/formColors";

const FormInputMeterNo = ({ label, name, disabled }) => {
  const { setFieldValue, values, errors, handleBlur, isSubmitting } =
    useFormikContext();
  const { all } = useWarehouse();

  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // 🎯 Formik State Extraction
  const currentValue = getIn(values, name);
  const error = getIn(errors, name);
  // const isTouched = getIn(touched, name);
  const hasError = !!error;

  const validateMeterNo = (val) => {
    const cleanedVal = cleanMeterNumberInput(val);
    setFieldValue(name, cleanedVal);

    if (cleanedVal.length > 3) {
      const duplicate =
        (all?.meters || []).find((m) => m.meterNo === cleanedVal) ||
        (all?.prems || []).find(
          (p) =>
            p.ast?.astData?.astNo === cleanedVal ||
            p.services?.waterMeterNo === cleanedVal ||
            p.services?.electricityMeterNo === cleanedVal,
        );

      if (duplicate) {
        Alert.alert(
          "🚨 DUPLICATE METER DETECTED",
          `Meter [${cleanedVal}] is already linked to:\n📍 ${duplicate.address?.strNo || ""} ${duplicate.address?.StrName || ""}`,
          [
            {
              text: "I WILL FIX IT",
              style: "destructive",
              onPress: () => setFieldValue(name, ""),
            },
          ],
        );
      }
    }
  };

  const handleOpenScanner = async () => {
    Keyboard.dismiss();
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    setScannerVisible(true);
  };

  const onBarCodeScanned = ({ data }) => {
    setScannerVisible(false);
    validateMeterNo(data);
  };

  return (
    <View style={styles.container}>
      {/* 🏷️ THE SOVEREIGN LABEL */}
      <Text style={[styles.label, hasError && { color: "#ef4444" }]}>
        {label}
      </Text>

      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[
              styles.input,
              hasError && styles.inputError, // 🎯 Sexy Red Left Border
              (disabled || isSubmitting) && styles.disabledInput,
            ]}
            value={currentValue || ""}
            onChangeText={validateMeterNo}
            onBlur={handleBlur(name)}
            editable={!disabled && !isSubmitting}
            autoCapitalize="characters"
            placeholder="Enter or Scan Meter No"
            placeholderTextColor={FORM_PLACEHOLDER}
          />

          {/* 🔄 DYNAMIC ICON OVERLAY */}
          <View style={styles.iconOverlay}>
            <TouchableOpacity
              onPress={
                currentValue ? () => setFieldValue(name, "") : handleOpenScanner
              }
              disabled={disabled || isSubmitting}
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

      {/* 🚨 ERROR MESSAGE */}
      {hasError && <Text style={styles.errorText}>{error}</Text>}

      {/* PORTAL SCANNER MODAL */}
      <Portal>
        <Modal
          visible={scannerVisible}
          onDismiss={() => setScannerVisible(false)}
          contentContainerStyle={styles.scannerModal}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={scannerVisible ? onBarCodeScanned : undefined}
          />
          <View style={styles.overlay}>
            <View style={styles.reticle} />
            <Text style={styles.scanText}>ALIGN METER BARCODE</Text>
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

const styles = StyleSheet.create({
  container: { marginBottom: 12, width: "100%" },
  label: {
    fontSize: 10,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputWrapper: {
    flex: 1,
    position: "relative", // 🎯 For the icon overlay
    justifyContent: "center",
  },
  input: {
    backgroundColor: "#f8fafc",
    padding: 12,
    paddingRight: 45, // 🎯 Leave room for the scan icon
    borderRadius: 8,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: FORM_TEXT,
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

  // SCANNER STYLES
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

export default FormInputMeterNo;
