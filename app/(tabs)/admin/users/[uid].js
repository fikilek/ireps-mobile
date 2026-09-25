// app/admin/users/[uid].js
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  List,
  Modal,
  Portal,
  Text,
} from "react-native-paper";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useUpdateProfileMutation } from "../../../../src/redux/authApi";
import { useGetLmsByCountryQuery } from "../../../../src/redux/geoApi";
import { useGetUsersQuery } from "../../../../src/redux/usersApi";
import { FORM_TEXT } from "../../../../src/theme/formColors";

export default function UserDetailEditor() {
  const { uid } = useLocalSearchParams();
  const router = useRouter();
  const { isSPU, isADM } = useAuth();

  // 🛰️ DATA FETCHING
  const { data: users = [] } = useGetUsersQuery();
  const { data: lms = [] } = useGetLmsByCountryQuery("ZA");
  const [updateProfile, { isLoading: isUpdating }] = useUpdateProfileMutation();

  // 🕵️ LOCATE TARGET USER
  const targetUser = users.find((u) => u.uid === uid);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // Temporary "holding pen" for checkboxes

  // 🔍 IDENTIFY UNCLAIMED TERRITORIES
  const unallocatedLms = useMemo(() => {
    const currentIds = new Set(
      (targetUser?.access?.workbases || []).map((wb) => wb.id),
    );
    return lms
      .filter((lm) => !currentIds.has(lm.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lms, targetUser?.access?.workbases]);

  // 🔨 THE BULK FORGE
  // const handleBulkAdd = async () => {
  //   if (selectedIds.length === 0) return setModalVisible(false);

  //   // Map IDs back to the full objects {id, name}
  //   const newAdditions = lms
  //     .filter((lm) => selectedIds.includes(lm.id))
  //     .map((lm) => ({ id: lm.id, name: lm.name }));

  //   const currentList = targetUser?.access?.workbases || [];
  //   const newList = [...currentList, ...newAdditions];

  //   try {
  //     await updateProfile({
  //       uid: targetUser.uid,
  //       update: {
  //         "access.workbases": newList,
  //         ...(!targetUser.access?.activeWorkbase && {
  //           "access.activeWorkbase": newAdditions[0],
  //         }),
  //       },
  //     }).unwrap();

  //     setSelectedIds([]); // Clear the pen
  //     setModalVisible(false); // Close the gates
  //   } catch (err) {
  //     console.error("Bulk Assignment Failed:", err);
  //   }
  // };

  const handleToggleAccount = async () => {
    const currentStatus = targetUser?.accountStatus || "ACTIVE";
    const newStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";

    try {
      await updateProfile({
        uid: targetUser.uid,
        update: { accountStatus: newStatus },
      }).unwrap();
      // 🚀 The live stream will update the 'STATUS' badge in the Card automatically
    } catch (err) {
      console.error("❌ [COMMAND]: Account override failed", err);
    }
  };

  // ✂️ SHRED: Revoke a jurisdiction
  // const handleRemoveWorkbase = async (wbId) => {
  //   const currentList = targetUser?.access?.workbases || [];
  //   const newList = currentList.filter((w) => w.id !== wbId);

  //   // Check if we are removing the jurisdiction they are currently "active" in
  //   const isActive = targetUser?.access?.activeWorkbase?.id === wbId;

  //   try {
  //     await updateProfile({
  //       uid: targetUser.uid,
  //       update: {
  //         "access.workbases": newList,
  //         // If we removed the active one, teleport them to the next available or null
  //         ...(isActive && {
  //           "access.activeWorkbase": newList.length > 0 ? newList[0] : null,
  //         }),
  //       },
  //     }).unwrap();
  //   } catch (err) {
  //     console.error("Failed to revoke workbase:", err);
  //   }
  // };

  if (!targetUser) return <Text style={styles.center}>User Not Found</Text>;

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Title
          title={`${targetUser.profile?.name} ${targetUser.profile?.surname}`}
          subtitle={targetUser.profile?.email}
        />
        <Card.Content>
          <View style={styles.badgeRow}>
            <Text style={styles.roleLabel}>
              ROLE: {targetUser.employment?.role}
            </Text>
            <Text style={styles.statusLabel}>
              STATUS: {targetUser.accountStatus || "ACTIVE"}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Text style={styles.sectionTitle}>JURISDICTION MANAGEMENT</Text>

      {/* 🛰️ JURISDICTION MANAGEMENT SECTION */}
      <View style={styles.selectorBox}>
        <View style={styles.rowHeader}>
          <Text style={styles.subLabel}>Allocated Jurisdictions</Text>
          {/* {(isSPU || isADM) && (
            <Button
              mode="contained"
              onPress={() => setModalVisible(true)}
              compact
              style={styles.addBtn}
            >
              + Assign
            </Button>
          )} */}
        </View>

        <View style={styles.chipContainer}>
          {(targetUser?.access?.workbases || []).map((wb) => (
            <Chip
              key={wb.id}
              // onClose={() => handleRemoveWorkbase(wb.id)}
              style={styles.wbChip}
            >
              {wb.name}
            </Chip>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>OPERATIONAL CONTROL</Text>

      <View style={styles.selectorBox}>
        <View style={styles.rowHeader}>
          <View>
            <Text style={styles.subLabel}>Account Visibility</Text>
            <Text
              style={[
                styles.statusText,
                targetUser?.accountStatus === "DISABLED" && styles.disabledText,
              ]}
            >
              {targetUser?.accountStatus || "ACTIVE"}
            </Text>
          </View>

          {(isSPU || isADM) && (
            <Button
              mode="contained"
              onPress={handleToggleAccount}
              loading={isUpdating}
              buttonColor={
                targetUser?.accountStatus === "DISABLED" ? "#059669" : "#ef4444"
              }
              textColor="white"
              style={styles.controlBtn}
            >
              {targetUser?.accountStatus === "DISABLED"
                ? "ENABLE ACCOUNT"
                : "DISABLE ACCOUNT"}
            </Button>
          )}
        </View>

        <Text style={styles.infoNote}>
          {targetUser?.accountStatus === "DISABLED"
            ? "⚠️ User is currently blocked from syncing data or accessing the map."
            : "✅ User has full operational access to assigned jurisdictions."}
        </Text>
      </View>

      {/* 🏛️ THE SELECTION PORTAL (MODAL) */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={styles.modalScroll}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Jurisdictions</Text>
            <Text style={styles.modalSub}>
              Showing all unallocated municipalities
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 400 }}>
            {unallocatedLms.map((lm) => (
              <List.Item
                key={lm.id}
                title={lm.name}
                onPress={() => {
                  setSelectedIds((prev) =>
                    prev.includes(lm.id)
                      ? prev.filter((id) => id !== lm.id)
                      : [...prev, lm.id],
                  );
                }}
                left={(props) => (
                  <Checkbox
                    status={
                      selectedIds.includes(lm.id) ? "checked" : "unchecked"
                    }
                  />
                )}
                style={styles.modalItem}
              />
            ))}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button
              onPress={() => {
                setModalVisible(false);
                setSelectedIds([]);
              }}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              // onPress={handleBulkAdd}
              disabled={selectedIds.length === 0}
            >
              Confirm ({selectedIds.length})
            </Button>
          </View>
        </Modal>
      </Portal>

      <Divider style={styles.divider} />

      <Button
        mode="outlined"
        onPress={() => router.back()}
        style={styles.backBtn}
      >
        Return to Registry
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },
  card: { borderRadius: 16, marginBottom: 20, backgroundColor: "#fff" },
  badgeRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  roleLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#2563eb",
    backgroundColor: "#eff6ff",
    padding: 4,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#059669",
    backgroundColor: "#ecfdf5",
    padding: 4,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 10,
    letterSpacing: 1,
  },
  selectorBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  currentWb: { fontWeight: "700", color: FORM_TEXT, marginBottom: 12 },
  search: { elevation: 0, backgroundColor: "#f1f5f9", borderRadius: 8 },
  results: { marginTop: 10 },
  // listItem: { borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  divider: { marginVertical: 20 },
  backBtn: { marginBottom: 40 },
  center: { marginTop: 50, textAlign: "center", fontWeight: "bold" },

  subLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  wbChip: { backgroundColor: "#eff6ff", borderRadius: 8, height: 32 },
  wbChipText: { fontSize: 12, color: "#1e40af", fontWeight: "700" },
  emptyText: {
    fontSize: 12,
    fontStyle: "italic",
    color: FORM_TEXT,
    marginBottom: 10,
  },
  innerDivider: { marginVertical: 15, backgroundColor: "#f1f5f9" },
  listItem: { paddingVertical: 0, height: 50 },

  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  addBtn: { borderRadius: 6, backgroundColor: "#2563eb" },
  modalScroll: {
    backgroundColor: "white",
    margin: 20,
    borderRadius: 16,
    padding: 0,
    overflow: "hidden",
  },
  modalHeader: {
    padding: 20,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: FORM_TEXT },
  modalSub: { fontSize: 11, color: FORM_TEXT, marginTop: 2 },
  modalItem: { borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 15,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
});
