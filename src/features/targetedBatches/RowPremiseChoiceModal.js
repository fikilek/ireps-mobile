// Targeted Batch rules TB-R067 (1.3.73): pressing Premise on a batch row opens this choice, not a premise.
//
// At ERF 689 thirteen businesses share one street address. The row knows the meter, the account and the
// account holder; the premise knows its business name and its unit number. Nothing in iREPS can match the
// two, and guessing at one address with thirteen shops is worse than not joining at all — so the worker,
// who is standing in the shop and has just asked whose account it is, picks (TB-R067 2).
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { choiceStatusText } from "./rowPremiseChoice";

export default function RowPremiseChoiceModal({
  visible,
  meterNo = "",
  accountNo = "",
  customerName = "",
  choices = [],
  onPick,
  onCopy,
  onNew,
  onClose,
}) {
  // Tapping "Copy a premise" turns the same list into the one to copy from. A premise already joined to
  // another shop can be copied - that is the usual way, one shop copied to make the one next door - it just
  // cannot be joined twice (TB-R067 4, 5).
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!visible) setCopying(false);
  }, [visible]);

  const handlePress = (choice) => {
    if (copying) {
      setCopying(false);
      onCopy?.(choice.premiseId);
      return;
    }

    if (!choice.selectable) return;
    onPick?.(choice.premiseId);
  };

  return (
    <Modal visible={Boolean(visible)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.icon}>
              <MaterialCommunityIcons name="home-search-outline" size={22} color="#1d4ed8" />
            </View>

            <View style={styles.headerMain}>
              <Text style={styles.title}>
                {copying ? "Copy which premise?" : "Which premise is this?"}
              </Text>
              <Text style={styles.sub}>
                {copying
                  ? "Tap the one to copy. You change its name and number next."
                  : `Meter ${meterNo || "NAv"}`}
              </Text>
              {!copying && (accountNo || customerName) ? (
                <Text style={styles.sub}>
                  {[accountNo, customerName].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>

            <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {choices.map((choice) => {
              const disabled = !copying && !choice.selectable;

              return (
                <Pressable
                  key={choice.premiseId}
                  style={[styles.row, disabled && styles.rowDisabled, choice.isOwnRow && !copying && styles.rowOwn]}
                  onPress={() => handlePress(choice)}
                  disabled={disabled}
                >
                  <View style={styles.rowMain}>
                    <Text style={[styles.rowTitle, disabled && styles.rowTextDisabled]}>{choice.title}</Text>
                    <Text style={[styles.rowStatus, disabled && styles.rowTextDisabled]}>
                      {choiceStatusText(choice)}
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name={copying ? "content-copy" : disabled ? "lock-outline" : "chevron-right"}
                    size={20}
                    color={disabled ? "#94a3b8" : "#1d4ed8"}
                  />
                </Pressable>
              );
            })}
          </ScrollView>

          {copying ? (
            <Pressable style={styles.secondaryButton} onPress={() => setCopying(false)}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.buttons}>
              <Pressable style={styles.primaryButton} onPress={onNew}>
                <MaterialCommunityIcons name="plus" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>New premise</Text>
              </Pressable>

              <Pressable
                style={[styles.secondaryButton, choices.length === 0 && styles.buttonDisabled]}
                onPress={() => setCopying(true)}
                disabled={choices.length === 0}
              >
                <MaterialCommunityIcons name="content-copy" size={18} color="#1d4ed8" />
                <Text style={styles.secondaryButtonText}>Copy a premise</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: "85%" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" },
  headerMain: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  sub: { fontSize: 12, color: "#475569", marginTop: 2 },
  close: { padding: 4 },
  list: { maxHeight: 340 },
  listContent: { gap: 8, paddingBottom: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#ffffff",
  },
  rowOwn: { borderColor: "#1d4ed8", backgroundColor: "#eff6ff" },
  rowDisabled: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  rowStatus: { fontSize: 12, color: "#475569", marginTop: 2 },
  rowTextDisabled: { color: "#94a3b8" },
  buttons: { flexDirection: "row", gap: 10, marginTop: 14 },
  primaryButton: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: 12, backgroundColor: "#1d4ed8",
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  secondaryButton: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#1d4ed8", backgroundColor: "#ffffff",
    marginTop: 14,
  },
  secondaryButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
});
