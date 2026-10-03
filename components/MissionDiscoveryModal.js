// src/components/modals/MissionDiscoveryModal.js

import { useRouter } from "expo-router";
import { Alert, StyleSheet, View } from "react-native";
import { Button, Modal, Portal, Surface, Text } from "react-native-paper";
import { useDiscovery } from "../src/context/DiscoveryContext";
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
import {
  normalizeTargetedBatchContext,
  serializeTargetedBatchContext,
} from "../src/features/premises/targetedBatchPremiseContext";

export default function MissionDiscoveryModal() {
  const router = useRouter();
  const { updateGeo } = useGeo();
  const { isVisible, mission, closeMissionDiscovery } = useDiscovery();

  const premiseId = mission?.premiseId || mission?.premise?.id;
  const targetedBatchContext = serializeTargetedBatchContext(
    mission?.targetedBatchContext,
  );
  const targetedBatchParams = targetedBatchContext
    ? { targetedBatchContext }
    : {};

  /* ----------------------------
     Handlers (AUTO ACTION)
  ----------------------------- */

  // No Access rules NA-R003 (1.2.0): ONE No Access button, ONE destination, and it is NOT a
  // transaction form.
  //
  // This used to fork - work carried from a batch row went to a separate No Access screen,
  // work that was not went into the Meter Discovery form in no-access mode. The worker tapped
  // the same button and could not tell which they had been given, and the two were written by
  // different code holding different standards.
  //
  // A worker who has no access never opens a transaction form. There is nothing in it for
  // them: the form exists to record a meter, and there is no meter.
  // TB-R059/TB-R062 (1.3.91) - THE FRONT GATE. The owner, 3 October: "the field worker should
  // never be allowed to even open the form if the work is not theirs." He proved the cost on
  // ERF 5212: reason, photograph, appointment - twice - and only learned at submit that the
  // ERF was another team's.
  //
  // EVERY way out of this modal goes through here, so a route added later cannot quietly miss
  // it. UNCHECKED opens the form: the submit path asks the server again, and that answer is
  // the binding one.
  const withFrontGate = async (open) => {
    const gate = await checkBatchWorkBeforeForm({
      erfId:
        mission?.premise?.erfId || mission?.targetedBatchContext?.erfId || "",
      premiseId: premiseId || "",
    });

    if (gate.state === BATCH_WORK_BLOCKED) {
      // The server's own sentence, word for word - it names the batch, the geofence, the team
      // and the date. The phone adds only what the worker should do next.
      Alert.alert(
        BATCH_WORK_BLOCKED_TITLE,
        `${gate.message}

${BATCH_WORK_BLOCKED_FOOTER}`,
      );
      return;
    }

    open();
  };

  const goNoAccess = () => {
    closeMissionDiscovery();

    const batch = normalizeTargetedBatchContext(mission?.targetedBatchContext);
    const premise = mission?.premise || null;

    router.push({
      pathname: "/(tabs)/admin/operations/no-access",
      params: {
        context: JSON.stringify({
          trnType: "METER_DISCOVERY",
          // NA-R043: the ERF is what the worker could not reach. It comes from the premise when
          // there is one and from the batch row when there is not - the row always has one.
          erfId: premise?.erfId || batch?.erfId || "",
          erfNo: premise?.erfNo || batch?.erfNo || "",
          // NA-R084.1: carried only if it exists now. Never looked up, never filled in later.
          premiseId: premiseId || batch?.premiseId || null,
          premiseAddress: premiseAddressWords(premise),
          premisePropertyType: premisePropertyTypeWords(premise),
          // The premise already knows where it is. The server still confirms it from the
          // ERF, but the record is never left with nothing because one of them was absent.
          wardPcode: premise?.parents?.wardPcode || "",
          lmPcode: premise?.parents?.lmPcode || "",
          meterNo: batch?.targetedMeterNo || "",
          tbId: batch?.tbId || "",
          targetedBatchContext: batch || null,
          returnTo: batch?.returnTo || "/(tabs)/premises",
        }),
      },
    });
  };

  const goWater = () => {
    closeMissionDiscovery();

    updateGeo({
      selectedPremise: mission?.premise || null,
      lastSelectionType: "PREMISE",
    });

    router.push({
      pathname: "/(tabs)/premises/form",
      params: {
        premiseId,
        action: JSON.stringify({ access: "yes", meterType: "water" }),
        ...targetedBatchParams,
      },
    });
  };

  const goElectricity = () => {
    closeMissionDiscovery();

    updateGeo({
      selectedPremise: mission?.premise || null,
      lastSelectionType: "PREMISE",
    });

    router.push({
      pathname: "/(tabs)/premises/form",
      params: {
        premiseId,
        action: JSON.stringify({ access: "yes", meterType: "electricity" }),
        ...targetedBatchParams,
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
        onDismiss={closeMissionDiscovery}
        contentContainerStyle={styles.modalContainer}
      >
        <Text variant="headlineSmall" style={styles.modalTitle}>
          Mission Discovery
        </Text>

        {/* ---------- ACCESS OPTIONS ---------- */}

        <Surface style={styles.modalCard} elevation={1}>
          <Text variant="labelLarge">Resource Type</Text>

          <View style={styles.toggleRow}>
            <Button
              mode="contained"
              onPress={() => withFrontGate(goWater)}
              style={{ flex: 1, marginRight: 6 }}
            >
              WATER
            </Button>

            <Button
              mode="contained"
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
            onPress={() => withFrontGate(goNoAccess)}
          >
            NO ACCESS (NA)
          </Button>
        </Surface>

        {/* ---------- DISMISS ---------- */}

        <Button
          mode="text"
          onPress={closeMissionDiscovery}
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

  toggleRow: {
    flexDirection: "row",
    marginTop: 8,
  },

  dismissButton: {
    marginTop: 4,
  },
});
