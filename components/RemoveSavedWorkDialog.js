// OF-R002 (1.0.0) section 7: work that has not reached the office is removed only by a supervisor,
// only with a reason, and the removal is recorded.
//
// One dialog for every queue on the phone, so a worker gets the same answer wherever they tap
// Remove.
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "react-native-paper";

import {
  REASON_MIN_LENGTH,
  canRemoveUnsentWork,
  isSentToOffice,
  validateRemovalReason,
} from "../src/features/savedWork/savedWorkRemovalRules";

export default function RemoveSavedWorkDialog({
  visible,
  item,
  role,
  busy = false,
  whatIsIt = "this work",
  onCancel,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setReason("");
      setError("");
    }
  }, [visible, item?.id]);

  const alreadySent = isSentToOffice(item || {});
  const maySupervise = canRemoveUnsentWork(role);
  const blocked = !alreadySent && !maySupervise;

  const handleConfirm = () => {
    if (alreadySent) {
      onConfirm?.({ reason: "Already with the office" });
      return;
    }

    const check = validateRemovalReason(reason);

    if (!check.valid) {
      setError(check.message);
      return;
    }

    onConfirm?.({ reason: check.reason });
  };

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.centerer}
        >
          <View style={styles.card}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {alreadySent ? (
                <>
                  <Text style={styles.title}>Remove this from the list?</Text>
                  <Text style={styles.body}>
                    The office already has {whatIsIt}. Removing it here only tidies
                    this phone; nothing is lost.
                  </Text>
                </>
              ) : blocked ? (
                <>
                  <Text style={styles.title}>This work is still to go</Text>
                  <Text style={styles.body}>
                    {whatIsIt.charAt(0).toUpperCase() + whatIsIt.slice(1)} has not
                    reached the office yet. Only a supervisor can remove it, and
                    they must give a reason.
                  </Text>
                  <Text style={styles.body}>
                    Leave it here. It goes by itself as soon as there is signal.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.title}>
                    This work has never reached the office
                  </Text>
                  <Text style={styles.body}>
                    Removing {whatIsIt} throws away work a field worker captured.
                    It cannot be got back. Say why, in words the worker would
                    understand.
                  </Text>

                  <TextInput
                    style={styles.input}
                    value={reason}
                    onChangeText={(text) => {
                      setReason(text);
                      if (error) setError("");
                    }}
                    placeholder="Why is this being removed?"
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={3}
                    editable={!busy}
                    textAlignVertical="top"
                  />

                  {error ? (
                    <Text style={styles.error}>{error}</Text>
                  ) : (
                    <Text style={styles.hint}>
                      At least {REASON_MIN_LENGTH} characters. The reason is kept
                      on this phone with your name.
                    </Text>
                  )}
                </>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, styles.cancelBtn]}
                  onPress={onCancel}
                  disabled={busy}
                >
                  <Text style={styles.cancelText}>
                    {blocked ? "Leave it here" : "Cancel"}
                  </Text>
                </TouchableOpacity>

                {!blocked && (
                  <TouchableOpacity
                    style={[
                      styles.btn,
                      styles.removeBtn,
                      { opacity: busy ? 0.6 : 1 },
                    ]}
                    onPress={handleConfirm}
                    disabled={busy}
                  >
                    <Text style={styles.removeText}>
                      {alreadySent ? "Remove" : "Remove this work"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  centerer: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    maxHeight: "85%",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    minHeight: 84,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  hint: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 6,
  },
  error: {
    fontSize: 13,
    color: "#b91c1c",
    marginTop: 6,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#e2e8f0",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  removeBtn: {
    backgroundColor: "#b91c1c",
  },
  removeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});
