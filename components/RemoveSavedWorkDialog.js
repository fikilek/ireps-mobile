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
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "react-native-paper";

import {
  assessRemoval,
  canRemoveUnsentWork,
  isRefusedByOffice,
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setError("");
    }
  }, [visible, item?.id]);

  const alreadySent = isSentToOffice(item || {});
  const refused = isRefusedByOffice(item || {});
  const maySupervise = canRemoveUnsentWork(role);
  // The gate is gone (owner, 3 Oct 2026): nothing is blocked. The wording still tells the
  // worker what they are about to lose, which is the part that was ever worth having.
  const blocked = false;

  // The reason recorded when the rules ask for none.
  const removalReasonFor = (code) =>
    code === "ALREADY_SENT" ? "Already with the office" : "Refused by the office";

  // ONE decision, asked once. This used to work the rules out again for itself, and twice
  // disagreed with assessRemoval - first offering a Remove button the rules refused, then
  // demanding a removal reason the dialog never asks for on a refused form. Both times the
  // worker tapped Remove and nothing happened at all (owner's phone, 3 Oct 2026).
  const handleConfirm = () => {
    const verdict = assessRemoval({ item: item || {}, role });

    if (!verdict.allowed) {
      setError(verdict.message || "This cannot be removed.");
      return;
    }

    onConfirm?.({ reason: verdict.reason || removalReasonFor(verdict.code) });
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
              {/* One confirmation, nothing else. The worker is removing something from their
                  own phone and does not need the reasoning explained back to them. */}
              <Text style={styles.title}>Remove this item?</Text>
              <Text style={styles.body}>
                {alreadySent
                  ? "The office already has it. Nothing is lost."
                  : "It has not been sent to the office, so it will be lost."}
              </Text>

              {/* Cancel and Remove. Nothing is ever blocked now, so both are always here -
                  a confirmation a worker cannot get out of is worse than no confirmation. */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, styles.cancelBtn]}
                  onPress={onCancel}
                  disabled={busy}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.removeBtn, { opacity: busy ? 0.6 : 1 }]}
                  onPress={handleConfirm}
                  disabled={busy}
                >
                  <Text style={styles.removeText}>OK</Text>
                </TouchableOpacity>
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
  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#f8fafc",
  },
  reasonPicked: {
    borderColor: "#b91c1c",
    backgroundColor: "#fef2f2",
  },
  tick: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#94a3b8",
  },
  tickPicked: {
    borderColor: "#b91c1c",
    backgroundColor: "#b91c1c",
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
  },
  reasonTextPicked: {
    fontWeight: "700",
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
