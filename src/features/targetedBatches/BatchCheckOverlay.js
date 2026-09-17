import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

// TB-R051: what the calling screen shows while a live batch check runs.
export const BATCH_CHECK_MESSAGES = Object.freeze({
  METER: "Checking the batch meter…",
  PREMISE: "Checking the batch premise…",
});

// Back does nothing while checking: the check gives up on its own after 10 seconds.
function ignoreRequestClose() {}

// TB-R051: no silent waits. The calling screen shows this for the whole live
// batch check (askBatchOrOtherDiscovery / askBatchOrOrdinaryPremise
// onCheckingChange), so taps cannot start another action meanwhile.
export default function BatchCheckOverlay({ visible, message }) {
  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={ignoreRequestClose}
    >
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessible
          accessibilityRole="progressbar"
          accessibilityLiveRegion="polite"
          accessibilityLabel={message || BATCH_CHECK_MESSAGES.METER}
        >
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.message}>
            {message || BATCH_CHECK_MESSAGES.METER}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    elevation: 4,
  },
  message: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
});
