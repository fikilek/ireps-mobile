import { useGetServiceProvidersQuery } from "@/src/redux/spApi";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  Avatar,
  Button,
  Chip,
  Modal,
  Portal,
  Switch,
  Text,
} from "react-native-paper";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useUpdateProfileMutation } from "../../../../src/redux/authApi";
import { useGetUsersQuery } from "../../../../src/redux/usersApi";
import { FORM_TEXT } from "../../../../src/theme/formColors";

export default function UsersListScreen() {
  const router = useRouter();
  const { profile, isSPU, isADM, isMNG, isSPV, isFWR } = useAuth();

  const [filterVisible, setFilterVisible] = useState(false);

  // APPLIED FILTERS
  const [appliedFilters, setAppliedFilters] = useState({
    role: "ALL",
    onboardingStatus: "ALL",
    accountStatus: "ALL",
    serviceProvider: "ALL",
  });

  // DRAFT FILTERS (inside modal)
  const [draftFilters, setDraftFilters] = useState({
    role: "ALL",
    onboardingStatus: "ALL",
    accountStatus: "ALL",
    serviceProvider: "ALL",
  });

  const { data: serviceProviders = [] } = useGetServiceProvidersQuery();

  const { data: users = [], isLoading, error } = useGetUsersQuery();
  const [updateProfile] = useUpdateProfileMutation();

  const roleOptions = ["ALL", "SPU", "ADM", "MNG", "SPV", "FWR"];

  const onboardingOptions = useMemo(() => {
    const values = [
      ...new Set(
        (users || []).map((u) => u?.onboarding?.status).filter(Boolean),
      ),
    ].sort((a, b) => String(a).localeCompare(String(b)));

    return ["ALL", ...values];
  }, [users]);

  const accountStatusOptions = useMemo(() => {
    const values = [
      ...new Set((users || []).map((u) => u?.accountStatus).filter(Boolean)),
    ].sort((a, b) => String(a).localeCompare(String(b)));

    return ["ALL", ...values];
  }, [users]);

  const serviceProviderOptions = useMemo(() => {
    const values = [
      ...new Set(
        (users || [])
          .map((u) => u?.employment?.serviceProvider?.name)
          .filter(Boolean),
      ),
    ].sort((a, b) => String(a).localeCompare(String(b)));

    return ["ALL", ...values];
  }, [users]);

  const visibleUsers = useMemo(() => {
    if (!users || users.length === 0) return [];

    const viewerSpId = profile?.employment?.serviceProvider?.id || null;

    // 🔴 FWR — NO ACCESS
    if (isFWR) return [];

    // 🟢 SPU / ADM — SEE ALL
    if (isSPU || isADM) return users;

    // 🔍 Find viewer SP
    const viewerSp =
      (serviceProviders || []).find((sp) => sp?.id === viewerSpId) || null;

    // 🔍 Determine if viewer SP is SUBC
    const viewerIsSubc =
      viewerSp?.clients?.some(
        (client) =>
          client?.clientType === "SP" && client?.relationshipType === "SUBC",
      ) || false;

    // 🔍 Find SUBCs under viewer MNC
    const descendantSubcIds = (serviceProviders || [])
      .filter((sp) =>
        (sp?.clients || []).some(
          (client) =>
            client?.clientType === "SP" &&
            client?.relationshipType === "SUBC" &&
            client?.id === viewerSpId,
        ),
      )
      .map((sp) => sp?.id)
      .filter(Boolean);

    return (users || []).filter((u) => {
      const userSpId = u?.employment?.serviceProvider?.id || null;

      // 🟡 MNG → own SP + SUBCs
      if (isMNG) {
        return [viewerSpId, ...descendantSubcIds].includes(userSpId);
      }

      // 🟣 SPV
      if (isSPV) {
        // SPV-SUBC → own SP only
        if (viewerIsSubc) {
          return userSpId === viewerSpId;
        }

        // SPV-MNC → same as MNG
        return [viewerSpId, ...descendantSubcIds].includes(userSpId);
      }

      return false;
    });
  }, [users, serviceProviders, profile, isSPU, isADM, isMNG, isSPV, isFWR]);

  const filteredUsers = useMemo(() => {
    return [...(visibleUsers || [])]
      .filter((u) => {
        if (!u?.profile) return false;

        if (
          appliedFilters.role !== "ALL" &&
          u?.employment?.role !== appliedFilters.role
        ) {
          return false;
        }

        if (
          appliedFilters.onboardingStatus !== "ALL" &&
          u?.onboarding?.status !== appliedFilters.onboardingStatus
        ) {
          return false;
        }

        if (
          appliedFilters.accountStatus !== "ALL" &&
          u?.accountStatus !== appliedFilters.accountStatus
        ) {
          return false;
        }

        if (
          appliedFilters.serviceProvider !== "ALL" &&
          u?.employment?.serviceProvider?.name !==
            appliedFilters.serviceProvider
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a?.metadata?.updatedAt || 0).getTime();
        const bTime = new Date(b?.metadata?.updatedAt || 0).getTime();
        return bTime - aTime;
      });
  }, [users, appliedFilters]);

  const activeFilterCount = useMemo(() => {
    return Object.values(appliedFilters).filter((value) => value !== "ALL")
      .length;
  }, [appliedFilters]);

  const handleToggleStatus = async (user, currentStatus) => {
    const newStatus = currentStatus === "DISABLED" ? "ACTIVE" : "DISABLED";
    try {
      await updateProfile({
        uid: user.uid,
        updates: { accountStatus: newStatus },
      }).unwrap();
    } catch (err) {
      console.error("Failed to override user status:", err);
    }
  };

  const openFilterModal = () => {
    setDraftFilters(appliedFilters);
    setFilterVisible(true);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setFilterVisible(false);
  };

  const clearFilters = () => {
    const cleared = {
      role: "ALL",
      onboardingStatus: "ALL",
      accountStatus: "ALL",
      serviceProvider: "ALL",
    };
    setDraftFilters(cleared);
    setAppliedFilters(cleared);
    setFilterVisible(false);
  };

  const setDraftValue = (key, value) => {
    setDraftFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const renderOptionChips = (options = [], selectedValue, onSelect) => {
    return (
      <View style={styles.chipsWrap}>
        {options.map((option) => {
          const isSelected = option === selectedValue;

          return (
            <Chip
              key={option}
              mode={isSelected ? "flat" : "outlined"}
              selected={isSelected}
              onPress={() => onSelect(option)}
              style={[
                styles.filterChip,
                isSelected && styles.filterChipSelected,
              ]}
              textStyle={[
                styles.filterChipText,
                isSelected && styles.filterChipTextSelected,
              ]}
            >
              {String(option).replace(/_/g, " ")}
            </Chip>
          );
        })}
      </View>
    );
  };

  if (isLoading) {
    return <Text style={styles.center}>Synchronizing Registry...</Text>;
  }

  if (error) {
    return <Text style={styles.center}>Registry Access Denied</Text>;
  }

  return (
    <View style={styles.container}>
      {/* HEADER CONTROLS */}
      <View style={styles.header}>
        <Pressable style={styles.filterTrigger} onPress={openFilterModal}>
          <Text style={styles.filterTriggerText}>
            Broad Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Text>
        </Pressable>

        <View style={styles.actions}>
          {isSPU && (
            <Button
              mode="contained"
              compact
              onPress={() => router.push("/admin/users/create-admin")}
              style={styles.actionBtn}
            >
              + Admin
            </Button>
          )}

          {(isSPU || isADM) && (
            <Button
              mode="contained-tonal"
              compact
              onPress={() => router.push("/admin/users/create-manager")}
              style={styles.actionBtn}
            >
              + Manager
            </Button>
          )}

          {isMNG && (
            <Button
              mode="contained-tonal"
              compact
              onPress={() => router.push("/admin/users/create-supervisor")}
              style={styles.actionBtn}
            >
              + Supervisor
            </Button>
          )}
        </View>
      </View>

      {/* ACTIVE FILTER SUMMARY */}
      <View style={styles.summaryRow}>
        <Chip style={styles.summaryChip}>
          Role: {appliedFilters.role.replace(/_/g, " ")}
        </Chip>
        <Chip style={styles.summaryChip}>
          Onboarding: {appliedFilters.onboardingStatus.replace(/_/g, " ")}
        </Chip>
        <Chip style={styles.summaryChip}>
          Account: {appliedFilters.accountStatus.replace(/_/g, " ")}
        </Chip>
        <Chip style={styles.summaryChip}>
          SP: {appliedFilters.serviceProvider}
        </Chip>
      </View>

      {/* THE LIST */}
      <FlashList
        data={filteredUsers}
        keyExtractor={(item) => item?.uid || Math.random().toString()}
        estimatedItemSize={160}
        renderItem={({ item }) => {
          const name = item?.profile?.name || "Pending";
          const surname = item?.profile?.surname || "";
          const role = item?.employment?.role || "GST";
          const workbase = item?.access?.activeWorkbase?.name || "Global";
          const onboardingStatus = item?.onboarding?.status || "PENDING";
          const accountStatus = item?.accountStatus || "ACTIVE";
          const serviceProvider =
            item?.employment?.serviceProvider?.name || "NAv";

          return (
            <Pressable
              onPress={() => router.push(`/admin/users/${item.uid}`)}
              style={({ pressed }) => [
                styles.userCard,
                pressed && { opacity: 0.9 },
              ]}
            >
              {/* IDENTITY SECTION */}
              <View style={styles.cardHeader}>
                <Avatar.Text
                  size={36}
                  label={`${name?.[0] || "?"}${surname?.[0] || ""}`}
                  style={styles.avatar}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {name} {surname}
                  </Text>
                  <Text style={styles.email}>{item?.profile?.email}</Text>
                </View>
                <Chip textStyle={styles.roleText} style={styles.roleChip}>
                  {role}
                </Chip>
              </View>

              {/* CONTEXTUAL METRICS */}
              <View style={styles.contextRow}>
                <View style={styles.contextItem}>
                  <Text style={styles.contextLabel}>ACTIVE WORKBASE</Text>
                  <Text style={styles.contextValue} numberOfLines={1}>
                    {workbase}
                  </Text>
                </View>
                <View style={styles.contextItem}>
                  <Text style={styles.contextLabel}>ONBOARDING</Text>
                  <Text
                    style={[
                      styles.status,
                      onboardingStatus === "COMPLETED"
                        ? styles.statusActive
                        : styles.statusPending,
                    ]}
                  >
                    {onboardingStatus.replace(/_/g, " ")}
                  </Text>
                </View>
              </View>

              {/* FOOTER */}
              <View style={styles.cardFooter}>
                <View style={styles.footerBlock}>
                  <Text style={styles.contextLabel}>ACCOUNT STATUS</Text>
                  <Text
                    style={[
                      styles.accountStatusText,
                      accountStatus === "DISABLED" && { color: "#ef4444" },
                      accountStatus === "PENDING" && { color: "#2563eb" },
                      accountStatus === "REJECTED" && { color: "#dc2626" },
                    ]}
                  >
                    {accountStatus}
                  </Text>
                </View>

                <View style={styles.footerBlock}>
                  <Text style={styles.contextLabel}>SERVICE PROVIDER</Text>
                  <Text style={styles.contextValue} numberOfLines={1}>
                    {serviceProvider}
                  </Text>
                </View>

                {(isSPU || isADM) && (
                  <View style={styles.switchContainer}>
                    <Switch
                      value={accountStatus === "ACTIVE"}
                      onValueChange={() =>
                        handleToggleStatus(item, accountStatus)
                      }
                      color="#2563eb"
                    />
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.center}>No users found in this sector</Text>
        }
      />

      {/* BROAD FILTER MODAL */}
      <Portal>
        <Modal
          visible={filterVisible}
          onDismiss={() => setFilterVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleMedium" style={styles.modalTitle}>
            Broad Filter
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalSectionTitle}>Role</Text>
            {renderOptionChips(roleOptions, draftFilters.role, (value) =>
              setDraftValue("role", value),
            )}

            <Text style={styles.modalSectionTitle}>Onboarding Status</Text>
            {renderOptionChips(
              onboardingOptions,
              draftFilters.onboardingStatus,
              (value) => setDraftValue("onboardingStatus", value),
            )}

            <Text style={styles.modalSectionTitle}>Account Status</Text>
            {renderOptionChips(
              accountStatusOptions,
              draftFilters.accountStatus,
              (value) => setDraftValue("accountStatus", value),
            )}

            <Text style={styles.modalSectionTitle}>Service Provider</Text>
            {renderOptionChips(
              serviceProviderOptions,
              draftFilters.serviceProvider,
              (value) => setDraftValue("serviceProvider", value),
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={clearFilters}>
              Clear Filters
            </Button>
            <Button mode="contained" onPress={applyFilters}>
              Apply Filters
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { borderRadius: 8 },
  filterTrigger: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterTriggerText: {
    color: FORM_TEXT,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  summaryChip: {
    backgroundColor: "#eef2ff",
  },
  userCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  avatar: { backgroundColor: "#e2e8f0" },
  name: { fontSize: 16, fontWeight: "900", color: FORM_TEXT },
  email: { fontSize: 12, color: FORM_TEXT },
  roleChip: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  roleText: { fontSize: 10, fontWeight: "900", color: "#2563eb" },
  contextRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingVertical: 10,
    gap: 15,
  },
  contextItem: { flex: 1 },
  contextLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: FORM_TEXT,
    letterSpacing: 0.5,
  },
  contextValue: {
    fontSize: 12,
    fontWeight: "700",
    color: FORM_TEXT,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingTop: 10,
    gap: 12,
  },
  footerBlock: {
    flex: 1,
    minWidth: 0,
  },
  accountStatusText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#059669",
    marginTop: 2,
  },
  status: { fontSize: 11, fontWeight: "900", marginTop: 2 },
  statusActive: { color: "#059669" },
  statusPending: { color: "#2563eb" },
  center: {
    textAlign: "center",
    marginTop: 40,
    color: FORM_TEXT,
    fontWeight: "700",
  },
  modal: {
    backgroundColor: "white",
    padding: 20,
    margin: 20,
    borderRadius: 16,
    maxHeight: "80%",
  },
  modalTitle: {
    marginBottom: 16,
    fontWeight: "900",
    color: FORM_TEXT,
  },
  modalSectionTitle: {
    marginTop: 8,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "900",
    color: FORM_TEXT,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    backgroundColor: "#fff",
  },
  filterChipSelected: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  filterChipText: {
    color: "#475569",
    fontWeight: "700",
  },
  filterChipTextSelected: {
    color: "#1d4ed8",
    fontWeight: "900",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  switchContainer: { paddingLeft: 10 },
});
