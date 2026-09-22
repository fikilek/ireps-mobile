// app/(tabs)/admin/operations/teams.js

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useGetServiceProvidersQuery } from "../../../../src/redux/spApi";
import {
  useAddTeamMemberMutation,
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useGetTeamsQuery,
  useRemoveTeamMemberMutation,
  useRenameTeamMutation,
} from "../../../../src/redux/teamsApi";
import { useGetUsersQuery } from "../../../../src/redux/usersApi";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../../../src/theme/formColors";

export default function OperationalTeams() {
  const { profile, isSPU, isADM, isMNG, isSPV } = useAuth();

  const [createTeam] = useCreateTeamMutation();
  const [addTeamMember] = useAddTeamMemberMutation();
  const [removeTeamMember] = useRemoveTeamMemberMutation();
  const [renameTeam] = useRenameTeamMutation();
  const [deleteTeam] = useDeleteTeamMutation();

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  const [selectedUserForTeam, setSelectedUserForTeam] = useState(null);

  const { data: users = [], isLoading: usersLoading } = useGetUsersQuery();
  const { data: teams = [], isLoading: teamsLoading } = useGetTeamsQuery();
  const { data: serviceProviders = [], isLoading: spsLoading } =
    useGetServiceProvidersQuery();

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // =====================================================
  // HELPERS
  // =====================================================

  const getUserRole = (user) => user?.employment?.role || "GST";

  const getUserSP = (user) => user?.employment?.serviceProvider || null;

  const getUserDisplayName = (user) => user?.profile?.displayName || "NAv";

  const getUserTrnCount = () => {
    // TODO:
    // later wire this to LM-scoped user activity registry
    // using activeWorkbase / current LM context
    return 0;
  };

  const getSPName = (spId) => {
    const sp = serviceProviders.find((item) => item?.id === spId);

    return sp?.profile?.tradingName || sp?.name || "Unknown SP";
  };

  const buildMncSubcMap = (allServiceProviders = []) => {
    const map = {};

    allServiceProviders.forEach((sp) => {
      const spId = sp?.id;
      if (!spId) return;

      const clients = Array.isArray(sp?.clients) ? sp.clients : [];

      const isMNC = clients.some(
        (client) =>
          client?.clientType === "LM" && client?.relationshipType === "MNC",
      );

      if (isMNC) {
        map[spId] = {
          mncId: spId,
          subcIds: [],
        };
      }
    });

    allServiceProviders.forEach((sp) => {
      const spId = sp?.id;
      if (!spId) return;

      const clients = Array.isArray(sp?.clients) ? sp.clients : [];

      const parentLink = clients.find(
        (client) =>
          client?.clientType === "SP" && client?.relationshipType === "SUBC",
      );

      if (parentLink?.id && map[parentLink.id]) {
        map[parentLink.id].subcIds.push(spId);
      }
    });

    return map;
  };

  const getCurrentUserMncId = (currentProfile, allServiceProviders = []) => {
    const userSpId = currentProfile?.employment?.serviceProvider?.id || null;
    if (!userSpId) return null;

    const userSp = allServiceProviders.find((sp) => sp?.id === userSpId);
    if (!userSp) return null;

    const clients = Array.isArray(userSp?.clients) ? userSp.clients : [];

    const isMNC = clients.some(
      (client) =>
        client?.clientType === "LM" && client?.relationshipType === "MNC",
    );

    if (isMNC) return userSpId;

    const parentLink = clients.find(
      (client) =>
        client?.clientType === "SP" && client?.relationshipType === "SUBC",
    );

    return parentLink?.id || null;
  };

  const getAllowedServiceProviderIds = ({
    isSPU,
    isADM,
    isMNG,
    isSPV,
    profile,
    serviceProviders = [],
  }) => {
    if (isSPU || isADM) {
      return serviceProviders.map((sp) => sp?.id).filter(Boolean);
    }

    if (isMNG || isSPV) {
      const userSpId = profile?.employment?.serviceProvider?.id || null;
      if (!userSpId) return [];

      const mncSubcMap = buildMncSubcMap(serviceProviders);
      const resolvedMncId = getCurrentUserMncId(profile, serviceProviders);

      const baseMncId = resolvedMncId || userSpId;
      const subcIds = mncSubcMap[baseMncId]?.subcIds || [];

      return [baseMncId, ...subcIds].filter(Boolean);
    }

    return [];
  };

  const getSPClassification = (spId) => {
    const sp = serviceProviders.find((item) => item?.id === spId);
    if (!sp) return "NAv";

    const clients = Array.isArray(sp?.clients) ? sp.clients : [];

    const isMNC = clients.some(
      (client) =>
        client?.clientType === "LM" && client?.relationshipType === "MNC",
    );

    if (isMNC) return "MNC";

    const isSUBC = clients.some(
      (client) =>
        client?.clientType === "SP" && client?.relationshipType === "SUBC",
    );

    if (isSUBC) return "SUBC";

    return "NAv";
  };

  // =====================================================
  // CREATE TEAM
  // =====================================================

  const openCreateTeamModal = () => {
    setNewTeamName("");
    setIsCreateModalVisible(true);
  };

  const closeCreateTeamModal = () => {
    if (isCreatingTeam) return;

    setIsCreateModalVisible(false);
    setNewTeamName("");
    setIsEditMode(false);
    setSelectedTeam(null);
  };

  // const closeCreateTeamModal = () => {
  //   if (isCreatingTeam) return;
  //   setIsCreateModalVisible(false);
  //   setNewTeamName("");
  // };

  const handleCreateOrUpdateTeam = async () => {
    const cleanName = String(newTeamName || "").trim();
    if (!cleanName) return;

    try {
      setIsCreatingTeam(true);

      if (isEditMode && selectedTeam?.id) {
        await renameTeam({
          teamId: selectedTeam.id,
          name: cleanName,
        }).unwrap();
      } else {
        await createTeam({
          name: cleanName,
          description: "NAv",
        }).unwrap();
      }

      closeCreateTeamModal();
    } catch (error) {
      console.log("team save UI ERROR", error);

      Alert.alert(
        isEditMode ? "Rename Failed" : "Team Creation Failed",
        error?.message || "Operation failed.",
      );
    } finally {
      setIsCreatingTeam(false);
    }
  };

  // const handleCreateTeam = async () => {
  //   const cleanName = String(newTeamName || "").trim();
  //   if (!cleanName) return;

  //   try {
  //     setIsCreatingTeam(true);

  //     await createTeam({
  //       name: cleanName,
  //       description: "NAv",
  //     }).unwrap();

  //     closeCreateTeamModal();
  //   } catch (error) {
  //     console.log("createTeam UI ERROR", error);
  //     Alert.alert(
  //       "Team Creation Failed",
  //       error?.message || "Could not create team.",
  //     );
  //   } finally {
  //     setIsCreatingTeam(false);
  //   }
  // };

  // =====================================================
  // ADD USER TO TEAM
  // =====================================================

  const handleAssignUserToTeam = async (teamId) => {
    if (!selectedUserForTeam?.uid) return;

    try {
      await addTeamMember({
        teamId,
        userUid: selectedUserForTeam.uid,
      }).unwrap();

      setSelectedUserForTeam(null);
    } catch (error) {
      console.log("addTeamMember UI ERROR", error);

      Alert.alert(
        "Allocation Failed",
        error?.message || "Could not add user to team.",
      );

      setSelectedUserForTeam(null);
    }
  };

  // =====================================================
  // EDIT TEAM
  // =====================================================
  const openEditTeamModal = (team) => {
    setSelectedTeam(team);
    setNewTeamName(team?.team?.name || "");
    setIsEditMode(true);
    setIsCreateModalVisible(true);
  };

  // =====================================================
  // DELETE TEAM
  // =====================================================
  const handleDeleteTeam = (team) => {
    const members = getTeamMembers(team);

    // 🚫 BLOCK if members exist
    if (members.length > 0) {
      Alert.alert(
        "Cannot Delete Team",
        "Team cannot be deleted if it has members.\nFirst remove all members.",
      );
      return;
    }

    // ✅ CONFIRM delete
    Alert.alert("Delete Team", "Are you sure you want to delete this team?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTeam({ teamId: team.id }).unwrap();
          } catch (error) {
            console.log("deleteTeam UI ERROR", error);

            Alert.alert(
              "Delete Failed",
              error?.message || "Could not delete team.",
            );
          }
        },
      },
    ]);
  };

  // =====================================================
  // REMOVE USER FROM TEAM
  // =====================================================

  const handleRemoveUserFromTeam = async (teamId, userUid) => {
    try {
      await removeTeamMember({
        teamId,
        userUid,
      }).unwrap();
    } catch (error) {
      console.log("removeTeamMember UI ERROR", error);

      Alert.alert(
        "Remove Failed",
        error?.message || "Could not remove user from team.",
      );
    }
  };

  // =====================================================
  // FILTER OPERATIONAL USERS
  // FWR + SPV
  // =====================================================

  const operationalUsers = useMemo(() => {
    return users.filter((user) => {
      const userRole = getUserRole(user);
      const accountStatus = user?.accountStatus || "NAv";
      const onboardingStatus = user?.onboarding?.status || "NAv";

      const isOperationalRole = userRole === "FWR" || userRole === "SPV";
      const isActive = accountStatus === "ACTIVE";
      const isOnboardingComplete = onboardingStatus === "COMPLETED";

      return isOperationalRole && isActive && isOnboardingComplete;
    });
  }, [users]);

  // =====================================================
  // ROLE-BASED VISIBILITY
  // SPU / ADM -> all
  // MNG / SPV -> own MNC + SUBCs
  // =====================================================

  const allowedSpIds = useMemo(() => {
    return getAllowedServiceProviderIds({
      isSPU,
      isADM,
      isMNG,
      isSPV,
      profile,
      serviceProviders,
    });
  }, [isSPU, isADM, isMNG, isSPV, profile, serviceProviders]);

  const visibleOperationalUsers = useMemo(() => {
    if (!serviceProviders.length) return [];

    return operationalUsers.filter((user) => {
      const spId = user?.employment?.serviceProvider?.id || null;
      return allowedSpIds.includes(spId);
    });
  }, [operationalUsers, allowedSpIds, serviceProviders.length]);

  const visibleTeams = useMemo(() => {
    if (!serviceProviders.length) return [];

    if (isSPU || isADM) {
      return [...teams].sort((a, b) => {
        const aTime = a?.metadata?.updatedAt || a?.metadata?.createdAt || "";
        const bTime = b?.metadata?.updatedAt || b?.metadata?.createdAt || "";
        return String(bTime).localeCompare(String(aTime));
      });
    }

    const filteredTeams = teams.filter((team) => {
      const teamSpIds = Array.isArray(team?.scope?.serviceProviderIds)
        ? team.scope.serviceProviderIds
        : [];

      const teamMncId = team?.ownership?.mncServiceProviderId || null;

      const matchesMemberScope = teamSpIds.some((spId) =>
        allowedSpIds.includes(spId),
      );

      const matchesOwnershipScope =
        !!teamMncId && allowedSpIds.includes(teamMncId);

      return matchesMemberScope || matchesOwnershipScope;
    });

    return filteredTeams.sort((a, b) => {
      const aTime = a?.metadata?.updatedAt || a?.metadata?.createdAt || "";
      const bTime = b?.metadata?.updatedAt || b?.metadata?.createdAt || "";
      return String(bTime).localeCompare(String(aTime));
    });
  }, [teams, allowedSpIds, isSPU, isADM, serviceProviders.length]);

  // =====================================================
  // GROUP USERS BY SP
  // =====================================================

  const usersBySP = useMemo(() => {
    const map = {};

    visibleOperationalUsers.forEach((user) => {
      const sp = getUserSP(user);
      const spId = sp?.id || "unknown";

      if (!map[spId]) {
        map[spId] = {
          serviceProviderId: spId,
          serviceProviderName: getSPName(spId),
          users: [],
        };
      }

      map[spId].users.push(user);
    });

    return Object.values(map).sort((a, b) =>
      String(a.serviceProviderName).localeCompare(
        String(b.serviceProviderName),
      ),
    );
  }, [visibleOperationalUsers, serviceProviders]);

  // =====================================================
  // TEAM MEMBERS RESOLVER
  // usersApi gives uid, not id
  // =====================================================

  const getTeamMembers = (team) => {
    const memberUserIds = Array.isArray(team?.scope?.memberUserIds)
      ? team.scope.memberUserIds
      : [];

    return users.filter((user) => memberUserIds.includes(user.uid));
  };

  const isLoading = usersLoading || teamsLoading || spsLoading;

  // =====================================================
  // UI
  // =====================================================

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <View style={styles.mainWrapper}>
        {/* LEFT: Personnel */}
        <View style={styles.col}>
          <View style={styles.headerRow}>
            <Text style={styles.header}>Personnel Registry</Text>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <Text style={styles.empty}>Loading personnel...</Text>
            ) : usersBySP.length === 0 ? (
              <Text style={styles.empty}>No operational users found.</Text>
            ) : (
              usersBySP.map((sp) => (
                <View key={sp.serviceProviderId}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={styles.spLabel}
                    >{`${sp.serviceProviderName}`}</Text>
                    <Text
                      style={{
                        fontSize: 8,
                        marginTop: 12,
                        marginBottom: 6,
                        color: "#64748b",
                      }}
                    >
                      [{getSPClassification(sp.serviceProviderId)}]
                    </Text>
                  </View>

                  {sp.users.map((user) => {
                    const isSelected = selectedUserForTeam?.uid === user.uid;

                    return (
                      <Pressable
                        key={user.uid}
                        style={[
                          styles.userItem,
                          isSelected && styles.userItemSelected,
                        ]}
                        onLongPress={() => setSelectedUserForTeam(user)}
                      >
                        <Text style={styles.userName}>
                          {getUserDisplayName(user)}
                        </Text>
                        <Text style={styles.userMeta}>
                          {`Role: ${getUserRole(user)} • TRNs: ${getUserTrnCount(user)}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </View>

        {/* RIGHT: Teams */}
        <View style={[styles.col, styles.teamsCol]}>
          <View style={styles.headerRow}>
            <Text style={styles.header}>Operational Teams</Text>

            <Pressable
              style={styles.headerIconBtn}
              onPress={openCreateTeamModal}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            </Pressable>
          </View>

          {selectedUserForTeam ? (
            <View style={styles.selectionBanner}>
              <Text style={styles.selectionBannerText}>
                {`Selected: ${getUserDisplayName(
                  selectedUserForTeam,
                )} • Tap a team to assign`}
              </Text>

              <Pressable onPress={() => setSelectedUserForTeam(null)}>
                <Text style={styles.selectionBannerClear}>Clear</Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <Text style={styles.empty}>Loading teams...</Text>
            ) : visibleTeams.length === 0 ? (
              <Text style={styles.empty}>No teams found.</Text>
            ) : (
              visibleTeams.map((team) => {
                const members = getTeamMembers(team);
                const selectedUserAlreadyInTeam = selectedUserForTeam
                  ? members.some((m) => m.uid === selectedUserForTeam.uid)
                  : false;

                return (
                  <Pressable
                    key={team.id}
                    style={[
                      styles.teamCard,
                      selectedUserForTeam &&
                        (selectedUserAlreadyInTeam
                          ? styles.teamCardAlreadyAssigned
                          : styles.teamCardSelectable),
                    ]}
                    onPress={() => {
                      if (selectedUserAlreadyInTeam) return;
                      handleAssignUserToTeam(team.id);
                    }}
                  >
                    <View style={styles.teamCardHeader}>
                      <Text style={styles.teamName}>
                        {team?.team?.name || "NAv"}
                      </Text>

                      <View style={styles.teamActions}>
                        <Pressable
                          onPress={() => openEditTeamModal(team)}
                          style={styles.actionBtn}
                        >
                          <MaterialCommunityIcons
                            name="pencil"
                            size={16}
                            color="#2563eb"
                          />
                        </Pressable>

                        <Pressable
                          onPress={() => handleDeleteTeam(team)}
                          style={styles.actionBtn}
                        >
                          <MaterialCommunityIcons
                            name="trash-can"
                            size={16}
                            color="#ef4444"
                          />
                        </Pressable>
                      </View>
                    </View>

                    {selectedUserForTeam ? (
                      <Text
                        style={
                          selectedUserAlreadyInTeam
                            ? styles.assignedHintUnder
                            : styles.assignHintUnder
                        }
                      >
                        {selectedUserAlreadyInTeam
                          ? "Already Assigned"
                          : "Assign"}
                      </Text>
                    ) : null}

                    {members.length === 0 ? (
                      <Text style={styles.empty}>No members yet</Text>
                    ) : (
                      members.map((member) => (
                        <View
                          key={member.uid}
                          style={[
                            styles.memberRow,
                            selectedUserForTeam?.uid === member.uid &&
                              styles.memberRowHighlight,
                          ]}
                        >
                          <Text style={styles.member}>
                            {`${getUserDisplayName(member)} [${getUserRole(member)}]`}
                          </Text>

                          <Pressable
                            onPress={() =>
                              handleRemoveUserFromTeam(team.id, member.uid)
                            }
                            style={styles.removeBtn}
                          >
                            <MaterialCommunityIcons
                              name="close"
                              size={14}
                              color="#ef4444"
                            />
                          </Pressable>
                        </View>
                      ))
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>

      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCreateTeamModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Team</Text>

            <TextInput
              value={newTeamName}
              onChangeText={setNewTeamName}
              placeholder="Enter team name"
              placeholderTextColor={FORM_PLACEHOLDER}
              style={styles.input}
              editable={!isCreatingTeam}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={closeCreateTeamModal}
                disabled={isCreatingTeam}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleCreateOrUpdateTeam}
                disabled={isCreatingTeam}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {isCreatingTeam
                    ? isEditMode
                      ? "Saving..."
                      : "Creating..."
                    : isEditMode
                      ? "Save"
                      : "Create"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  mainWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
  },

  list: {
    flex: 1,
    padding: 12,
  },

  listContent: {
    paddingBottom: 24,
  },

  col: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: "#e2e8f0",
  },

  teamsCol: {
    backgroundColor: "#f8fafc",
  },

  header: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },

  spLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#2563eb",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
  },

  userItem: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  userItemSelected: {
    borderColor: "#2563eb",
    borderWidth: 2,
    backgroundColor: "#eff6ff",
  },

  userName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },

  userMeta: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },

  teamCard: {
    backgroundColor: "#fff",
    padding: 6,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },

  teamCardSelectable: {
    borderColor: "#2563eb",
  },

  // teamCardHeader: {
  //   flexDirection: "row",
  //   alignItems: "center",
  //   justifyContent: "space-between",
  //   marginBottom: 6,
  // },

  teamName: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1e293b",
  },

  // assignHint: {
  //   fontSize: 10,
  //   fontWeight: "900",
  //   color: "#2563eb",
  //   textTransform: "uppercase",
  // },

  member: {
    fontSize: 12,
    color: "#334155",
    marginBottom: 2,
  },

  empty: {
    fontSize: 11,
    color: "#94a3b8",
  },

  headerRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
  },

  headerIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },

  selectionBanner: {
    backgroundColor: "#dbeafe",
    borderBottomWidth: 1,
    borderBottomColor: "#bfdbfe",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectionBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#1e3a8a",
    marginRight: 12,
  },

  selectionBannerClear: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2563eb",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },

  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#1e293b",
    marginBottom: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: FORM_TEXT,
    backgroundColor: "#fff",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },

  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },

  modalBtnPrimary: {
    backgroundColor: "#2563eb",
  },

  modalBtnSecondary: {
    backgroundColor: "#e2e8f0",
  },

  modalBtnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },

  modalBtnSecondaryText: {
    color: "#1e293b",
    fontWeight: "800",
    fontSize: 13,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  removeBtn: {
    padding: 4,
  },

  teamCardAlreadyAssigned: {
    borderColor: "#16a34a",
    borderWidth: 2,
    backgroundColor: "#f0fdf4",
  },

  memberRowHighlight: {
    backgroundColor: "#dcfce7",
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  assignHintUnder: {
    fontSize: 9,
    fontWeight: "900",
    color: "#2563eb",
    textTransform: "uppercase",
    marginTop: -2,
    marginBottom: 6,
  },

  assignedHintUnder: {
    fontSize: 9,
    fontWeight: "900",
    color: "#16a34a",
    textTransform: "uppercase",
    marginTop: -2,
    marginBottom: 6,
  },

  teamActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },

  actionBtn: {
    padding: 4,
  },

  teamCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    backgroundColor: "#f1f5f9", // 👈 subtle header strip
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
