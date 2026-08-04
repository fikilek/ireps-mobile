// src/components/modals/MissionDiscoveryModal.js

import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, Modal, Portal, Surface, Text } from "react-native-paper";
import { useDiscovery } from "../src/context/DiscoveryContext";
import { useGeo } from "../src/context/GeoContext";
import { serializeTargetedBatchContext } from "../src/features/premises/targetedBatchPremiseContext";

export default function MissionDiscoveryModal() {
  const router = useRouter();
  const { updateGeo } = useGeo();
  const { isVisible, mission, closeMissionDiscovery } = useDiscovery();

  const premiseId = mission?.premiseId || mission?.premise?.id;
  const targetedBatchContext = serializeTargetedBatchContext(mission?.targetedBatchContext);
  const targetedBatchParams = targetedBatchContext ? { targetedBatchContext } : {};

  /* ----------------------------
     Handlers (AUTO ACTION)
  ----------------------------- */

  const goNoAccess = () => {
    closeMissionDiscovery();

    updateGeo({
      selectedPremise: mission?.premise || null,
      lastSelectionType: "PREMISE",
    });

    router.push({
      pathname: "/(tabs)/premises/form",
      params: {
        premiseId,
        action: JSON.stringify({ access: "no", meterType: "" }),
        ...targetedBatchParams,
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
              onPress={goWater}
              style={{ flex: 1, marginRight: 6 }}
            >
              WATER
            </Button>

            <Button
              mode="contained"
              onPress={goElectricity}
              style={{ flex: 1 }}
            >
              ELEC
            </Button>
          </View>
        </Surface>

        {/* ---------- NO ACCESS ---------- */}

        <Surface style={styles.modalCard} elevation={1}>
          <Button mode="contained" buttonColor="#B22222" onPress={goNoAccess}>
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
