// No Access rules NA-R012 — same box, same words, on every form.
//
// The question "did you reach the meter?" was asked by FIVE private copies of this control,
// one in each of Disconnection, Reconnection, Meter Reading, Removal and Inspection. Four
// were byte-identical. Inspection's had drifted into a different control altogether: a
// different title ("Access Outcome" against "Site Access Outcome"), a different colour, and
// different words on the buttons — so a worker doing an inspection was answering the same
// question through a different door.
//
// This is that control, once. The only thing that legitimately differed between the copies
// was the line telling the worker what happens next, which is this form's own business and
// arrives as `continueLabel`.
//
// Meter Discovery and Meter Installation do not use it: there, access is chosen in the
// mission window before the form opens.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RadioButton, Surface } from "react-native-paper";

import { FORM_TEXT } from "../../src/theme/formColors";

export function IrepsAccessOutcomeCard({
  value,
  setFieldValue,
  continueLabel = "the checks",
}) {
  const hasAccess = String(value || "yes").toLowerCase();

  // Answering YES clears whatever no-access the worker had started. The retired field names
  // are cleared alongside the one shape until stage E has taken them out of these forms.
  const chooseYes = () => {
    setFieldValue("accessData.access.hasAccess", "yes");
    setFieldValue("accessData.access.reasonCode", "");
    setFieldValue("accessData.access.reasonOther", "");
    setFieldValue("accessData.access.appointment", null);
    setFieldValue("accessData.access.reason", "NAv");
  };

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="gate-alert" size={18} color="#DC2626" />
        <Text style={styles.sectionTitle}>Site Access Outcome</Text>
      </View>

      <Text style={styles.helpText}>
        Select YES if you could touch the meter with your hand. Select NO ACCESS if you went
        to the property and could not.
      </Text>

      <RadioButton.Group
        value={hasAccess}
        onValueChange={(next) =>
          next === "yes" ? chooseYes() : setFieldValue("accessData.access.hasAccess", "no")
        }
      >
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choice, hasAccess === "yes" && styles.choiceYes]}
            onPress={chooseYes}
            activeOpacity={0.85}
          >
            <RadioButton value="yes" />
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceTitle}>ACCESS YES</Text>
              <Text style={styles.choiceSub}>Continue with {continueLabel}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.choice, hasAccess === "no" && styles.choiceNo]}
            onPress={() => setFieldValue("accessData.access.hasAccess", "no")}
            activeOpacity={0.85}
          >
            <RadioButton value="no" />
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceTitle}>NO ACCESS</Text>
              <Text style={styles.choiceSub}>Complete as unsuccessful</Text>
            </View>
          </TouchableOpacity>
        </View>
      </RadioButton.Group>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFF", padding: 16, borderRadius: 16, marginBottom: 16 },

  sectionHeader: {
    padding: 10, backgroundColor: "#E2E8F0", flexDirection: "row",
    alignItems: "center", gap: 8, marginBottom: 12,
  },

  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#DC2626" },

  helpText: { fontSize: 12, color: FORM_TEXT, marginBottom: 12, lineHeight: 18 },

  choiceRow: { gap: 10 },

  choice: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10,
    paddingVertical: 10, paddingRight: 12, backgroundColor: "#fff",
  },

  choiceYes: { borderColor: "#047857", backgroundColor: "#ecfdf5" },
  choiceNo: { borderColor: "#DC2626", backgroundColor: "#fef2f2" },

  choiceTextWrap: { flex: 1 },
  choiceTitle: { fontSize: 15, fontWeight: "800", color: FORM_TEXT },
  choiceSub: { fontSize: 12, color: FORM_TEXT },
});
