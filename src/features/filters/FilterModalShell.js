import { StyleSheet, View } from "react-native";
import { Button, IconButton, Modal, Portal, Text } from "react-native-paper";

export function FilterModalShell({
  visible,
  onClose,
  title = "Filters",
  subtitle = "",
  onReset,
  resetLabel = "RESET",
  applyLabel = "APPLY",
  onApply,
  children,
}) {
  const handleApply = () => {
    if (onApply) {
      onApply();
      return;
    }

    onClose?.();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        style={styles.modalWrap}
        contentContainerStyle={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>

          <View style={styles.headerActions}>
            {!!onReset && (
              <Button onPress={onReset} textColor="#ef4444" compact>
                {resetLabel}
              </Button>
            )}

            <IconButton
              icon="close"
              size={22}
              iconColor="#0f172a"
              style={styles.closeBtn}
              onPress={onClose}
            />
          </View>
        </View>

        <View style={styles.body}>{children}</View>

        <View style={styles.footer}>
          <Button mode="contained" onPress={handleApply} style={styles.applyBtn}>
            {applyLabel}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

export default FilterModalShell;

const styles = StyleSheet.create({
  modalWrap: {
    justifyContent: "center",
  },

  container: {
    backgroundColor: "#ffffff",
    margin: 20,
    borderRadius: 20,
    maxHeight: "86%",
    overflow: "hidden",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  titleWrap: {
    flex: 1,
    paddingRight: 10,
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1e293b",
  },

  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  closeBtn: {
    margin: 0,
    backgroundColor: "#e2e8f0",
  },

  body: {
    flexShrink: 1,
  },

  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    backgroundColor: "#ffffff",
  },

  applyBtn: {
    borderRadius: 12,
    paddingVertical: 6,
    backgroundColor: "#2563eb",
  },
});
