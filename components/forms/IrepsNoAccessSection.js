import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Divider,
  Modal,
  Portal,
  RadioButton,
  Surface,
} from "react-native-paper";

import { NO_ACCESS_REASONS } from "../../src/features/meters/noAccessReasons";
import { IrepsMedia } from "../media/IrepsMedia";

export function IrepsNoAccessSection({
  visible = false,
  value,
  onChange,
  mediaName = "media",
  mediaTag = "noAccessPhoto",
  agentName,
  agentUid,
  fallbackGps,
  reasonErrorText = "",
  mediaErrorText = "",
}) {
  const [modalVisible, setModalVisible] = useState(false);

  if (!visible) return null;

  return (
    <>
      <Surface style={styles.card}>
        <Surface style={styles.naCard} elevation={2}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="alert-circle"
              size={18}
              color="#dc2626"
            />
            <Text style={styles.sectionTitle}>NA Reason</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.selector,
              Boolean(reasonErrorText) && styles.selectorError,
            ]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.selectorValue}>
              {value || "Select reason ..."}
            </Text>

            <MaterialCommunityIcons
              name="chevron-down"
              size={22}
              color="#dc2626"
            />
          </TouchableOpacity>

          {!!reasonErrorText && (
            <Text style={styles.errorText}>{reasonErrorText}</Text>
          )}

          <Divider style={styles.divider} />

          <IrepsMedia
            name={mediaName}
            tag={mediaTag}
            agentName={agentName}
            agentUid={agentUid}
            fallbackGps={fallbackGps}
            required={true}
          />

          {!!mediaErrorText && (
            <Text style={styles.errorText}>{mediaErrorText}</Text>
          )}
        </Surface>
      </Surface>

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <RadioButton.Group
            onValueChange={(nextValue) => {
              onChange?.(nextValue);
              setModalVisible(false);
            }}
            value={value}
          >
            {NO_ACCESS_REASONS.map((reason) => (
              <RadioButton.Item
                key={reason}
                label={reason}
                value={reason}
              />
            ))}
          </RadioButton.Group>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },

  naCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 16,
  },

  sectionHeader: {
    padding: 10,
    backgroundColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#dc2626",
  },

  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    backgroundColor: "#fff",
  },

  selectorError: {
    borderColor: "#dc2626",
  },

  selectorValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
  },

  divider: {
    marginVertical: 15,
  },

  modalContent: {
    backgroundColor: "white",
    padding: 20,
    margin: 20,
    borderRadius: 12,
  },

  errorText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
});
