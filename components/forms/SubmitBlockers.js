// Every submit must be honest about why it cannot go yet. A grey button with no
// visible reason leaves the worker guessing, so this lists, above the button,
// everything the form is still waiting for — including checks that have no
// field of their own on screen (photos, eligibility).
import { StyleSheet, Text, View } from "react-native";

export function flattenFormErrors(errors, collected = []) {
  if (!errors) return collected;

  if (typeof errors === "string") {
    collected.push(errors);
    return collected;
  }

  if (Array.isArray(errors)) {
    errors.forEach((entry) => flattenFormErrors(entry, collected));
    return collected;
  }

  if (typeof errors === "object") {
    Object.values(errors).forEach((entry) => flattenFormErrors(entry, collected));
  }

  return collected;
}

export function SubmitBlockers({ errors, extraMessages = [], visible = true }) {
  const messages = [
    ...new Set([
      ...extraMessages.filter(Boolean),
      ...flattenFormErrors(errors),
    ]),
  ];

  if (!visible || messages.length === 0) return null;

  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.title}>Not ready to submit yet</Text>
      {messages.map((message) => (
        <Text key={message} style={styles.item}>
          • {message}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#B91C1C",
    marginBottom: 4,
  },
  item: {
    fontSize: 13,
    color: "#991B1B",
    paddingVertical: 1,
  },
});
