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
  TextInput,
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

  const isStructuredValue =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const rawSelectedValue = isStructuredValue
    ? String(value?.code || value?.label || "").trim()
    : String(value || "").trim();

  const isLegacyOtherValue =
    !isStructuredValue && /^other(?:\s*:|$)/i.test(rawSelectedValue);

  const selectedCode =
    String(rawSelectedValue).toUpperCase() === "OTHER" || isLegacyOtherValue
      ? "OTHER"
      : rawSelectedValue;

  const selectedLabel = isStructuredValue
    ? String(value?.label || value?.code || "").trim()
    : selectedCode === "OTHER"
      ? "Other"
      : rawSelectedValue;

  const selectedOtherText = isStructuredValue
    ? String(value?.otherText || "")
    : isLegacyOtherValue
      ? rawSelectedValue.replace(/^other\s*:?\s*/i, "")
      : "";

  const isOtherSelected = selectedCode === "OTHER";

  const selectedText =
    selectedLabel || selectedCode || "Select reason ...";

  function handleReasonChange(nextValue) {
    const nextCode = String(nextValue || "").trim();
    const isOther = nextCode === "OTHER";
    const nextLabel = isOther ? "Other" : nextCode;

    if (isStructuredValue) {
      onChange?.({
        code: nextCode,
        label: nextLabel,
        otherText: isOther && isOtherSelected ? selectedOtherText : "",
      });
    } else {
      onChange?.(
        isOther
          ? selectedOtherText.trim()
            ? `Other: ${selectedOtherText.trim()}`
            : "Other"
          : nextLabel,
      );
    }

    setModalVisible(false);
  }

  function handleOtherTextChange(text) {
    if (isStructuredValue) {
      onChange?.({
        code: "OTHER",
        label: "Other",
        otherText: text,
      });
      return;
    }

    onChange?.(text.trim() ? `Other: ${text}` : "Other");
  }

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
              {selectedText}
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

          {isOtherSelected ? (
            <TextInput
              mode="outlined"
              label="Other NA Reason"
              value={selectedOtherText}
              onChangeText={handleOtherTextChange}
              placeholder="Enter no-access reason"
              multiline
              numberOfLines={3}
              error={Boolean(reasonErrorText) && !selectedOtherText.trim()}
              style={styles.otherInput}
            />
          ) : null}

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
            onValueChange={handleReasonChange}
            value={selectedCode}
          >
            {NO_ACCESS_REASONS.map((reason) => {
              const reasonValue = reason === "Other" ? "OTHER" : reason;

              return (
                <RadioButton.Item
                  key={reason}
                  label={reason}
                  value={reasonValue}
                />
              );
            })}
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

  otherInput: {
    marginTop: 12,
    backgroundColor: "#fff",
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
