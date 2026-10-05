import { Modal, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";

export function WorkAccessProgress() {
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
      <ActivityIndicator size="small" />
      <Text variant="bodyMedium">Checking work access…</Text>
    </View>
  );
}

export function WorkAccessCheckModal({ visible, onCancel }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <WorkAccessProgress />
          <Button mode="text" onPress={onCancel}>CANCEL</Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 16 },
  sheet: { backgroundColor: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 },
});
