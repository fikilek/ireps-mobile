// src/components/modals/MissionDiscoveryModal.js

import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, Modal, Portal, Surface, Text } from "react-native-paper";
import { useGeo } from "../src/context/GeoContext";
import { useInstallation } from "../src/context/InstallationContext";

export default function MissionInstallationModal() {
  const router = useRouter();
  const { updateGeo } = useGeo();
  const { isVisible, mission, closeMissionInstallation } = useInstallation();

  const premiseId = mission?.premiseId || mission?.premise?.id;

  /* ----------------------------
     Handlers (AUTO ACTION)
  ----------------------------- */

  // No Access rules NA-R003 (1.3.0): a worker who has no access never opens a transaction
  // form. The Installation form no longer contains a no access, so this goes to the one No
  // Access screen, exactly as Meter Discovery's gate does.
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
          premiseAddress: premise?.address || "",
          premisePropertyType: premise?.propertyType || "",
          erfId: premise?.erfId || "",
          erfNo: premise?.erfNo || "NAv",
          wardPcode: premise?.parents?.wardPcode || "",
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
        onDismiss={closeMissionInstallation}
        contentContainerStyle={styles.modalContainer}
      >
        <Text variant="headlineSmall" style={styles.modalTitle}>
          Mission Installation
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
          onPress={closeMissionInstallation}
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
