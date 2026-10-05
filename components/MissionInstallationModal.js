import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Modal,
  Portal,
  Surface,
  Text,
} from "react-native-paper";
import {
  BATCH_WORK_BLOCKED,
  BATCH_WORK_BLOCKED_FOOTER,
  BATCH_WORK_BLOCKED_TITLE,
  checkBatchWorkBeforeForm,
} from "../src/features/meters/batchWorkGate";
import {
  premiseAddressWords,
  premisePropertyTypeWords,
} from "../src/features/meters/accessGate";
import { useGeo } from "../src/context/GeoContext";
import { useInstallation } from "../src/context/InstallationContext";

export default function MissionInstallationModal() {
  const router = useRouter();
  const { updateGeo } = useGeo();
  const { isVisible, mission, closeMissionInstallation } = useInstallation();
  const [checkingWork, setCheckingWork] = useState(false);
  const pendingCheck = useRef(null);

  useEffect(() => {
    setCheckingWork(false);
    // A result belongs only to the chooser and premise that started it.
    return () => {
      pendingCheck.current = null;
    };
  }, [isVisible, mission]);

  const dismiss = () => {
    pendingCheck.current = null;
    setCheckingWork(false);
    closeMissionInstallation();
  };

  const premiseId = mission?.premiseId || mission?.premise?.id;

  /* ----------------------------
     Handlers (AUTO ACTION)
  ----------------------------- */

  // No Access rules NA-R003 (1.3.0): a worker who has no access never opens a transaction
  // form. The Installation form no longer contains a no access, so this goes to the one No
  // Access screen, exactly as Meter Discovery's gate does.
  // TB-R059/TB-R062 (1.3.91) - THE FRONT GATE. The owner, 3 October: "the field worker should
  // never be allowed to even open the form if the work is not theirs." He proved the cost on
  // ERF 5212: reason, photograph, appointment - twice - and only learned at submit that the
  // ERF was another team's.
  //
  // EVERY way out of this modal goes through here, so a route added later cannot quietly miss
  // it. UNCHECKED opens the form: the submit path asks the server again, and that answer is
  // the binding one.
  const withFrontGate = async (open) => {
    // Lock synchronously: a second tap can arrive before disabled buttons render.
    if (!isVisible || pendingCheck.current) return;
    const attempt = {};
    pendingCheck.current = attempt;
    setCheckingWork(true);
    try {
      const gate = await checkBatchWorkBeforeForm({
        erfId:
          mission?.premise?.erfId || mission?.targetedBatchContext?.erfId || "",
        premiseId: premiseId || "",
      });

      if (pendingCheck.current !== attempt) return;

      if (gate.state === BATCH_WORK_BLOCKED) {
        // Keep the server's explanation and the existing next-step guidance.
        Alert.alert(
          BATCH_WORK_BLOCKED_TITLE,
          `${gate.message}

${BATCH_WORK_BLOCKED_FOOTER}`,
        );
        return;
      }

      open();
    } finally {
      if (pendingCheck.current === attempt) {
        pendingCheck.current = null;
        setCheckingWork(false);
      }
    }
  };

  const goNoAccess = () => {
    closeMissionInstallation();

    const premise = mission?.premise || null;

    router.push({
      pathname: "/(tabs)/admin/operations/no-access",
      params: {
        context: JSON.stringify({
          trnType: "METER_INSTALLATION",
          // NA-R044: a no access is to a premise. The gate is opened from one, so it is here.
          premiseId: premiseId || null,
          premiseAddress: premiseAddressWords(premise),
          premisePropertyType: premisePropertyTypeWords(premise),
          erfId: premise?.erfId || "",
          erfNo: premise?.erfNo || "NAv",
          // The premise already knows where it is. The server still confirms it from the
          // ERF, but the record is never left with nothing because one of them was absent.
          wardPcode: premise?.parents?.wardPcode || "",
          lmPcode: premise?.parents?.lmPcode || "",
          returnTo: "/(tabs)/premises",
        }),
      },
    });
  };

  const goWater = () => {
    closeMissionInstallation();

    updateGeo({
      selectedPremise: mission?.premise || null,
      lastSelectionType: "PREMISE",
    });

    router.push({
      pathname: "/(tabs)/premises/form-meter-installation",
      params: {
        premiseId,
        action: JSON.stringify({ access: "yes", meterType: "water" }),
      },
    });
  };

  const goElectricity = () => {
    closeMissionInstallation();

    updateGeo({
      selectedPremise: mission?.premise || null,
      lastSelectionType: "PREMISE",
    });

    router.push({
      pathname: "/(tabs)/premises/form-meter-installation",
      params: {
        premiseId,
        action: JSON.stringify({ access: "yes", meterType: "electricity" }),
      },
    });
  };

  /* ----------------------------
     Render
  ----------------------------- */

  return (
    <Portal>
      <Modal
        visible={isVisible}
        onDismiss={dismiss}
        contentContainerStyle={styles.modalContainer}
      >
        <Text variant="headlineSmall" style={styles.modalTitle}>
          Mission Installation
        </Text>

        {checkingWork && (
          <View style={styles.progress} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" />
            <Text variant="bodyMedium">Checking work access…</Text>
          </View>
        )}

        {/* ---------- ACCESS OPTIONS ---------- */}

        <Surface style={styles.modalCard} elevation={1}>
          <Text variant="labelLarge">Resource Type</Text>

          <View style={styles.toggleRow}>
            <Button
              mode="contained"
              disabled={checkingWork}
              onPress={() => withFrontGate(goWater)}
              style={{ flex: 1, marginRight: 6 }}
            >
              WATER
            </Button>

            <Button
              mode="contained"
              disabled={checkingWork}
              onPress={() => withFrontGate(goElectricity)}
              style={{ flex: 1 }}
            >
              ELEC
            </Button>
          </View>
        </Surface>

        {/* ---------- NO ACCESS ---------- */}

        <Surface style={styles.modalCard} elevation={1}>
          <Button
            mode="contained"
            buttonColor="#B22222"
            disabled={checkingWork}
            onPress={() => withFrontGate(goNoAccess)}
          >
            NO ACCESS (NA)
          </Button>
        </Surface>

        {/* ---------- DISMISS ---------- */}

        <Button
          mode="text"
          onPress={dismiss}
          style={styles.dismissButton}
        >
          CANCEL
        </Button>
      </Modal>
    </Portal>
  );
}

/* ----------------------------
   Styles
----------------------------- */

const styles = StyleSheet.create({
  modalContainer: {
    marginHorizontal: 16,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
  },

  modalTitle: {
    marginBottom: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  modalCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
  },

  progress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },

  toggleRow: {
    flexDirection: "row",
    marginTop: 8,
  },

  dismissButton: {
    marginTop: 4,
  },
});
