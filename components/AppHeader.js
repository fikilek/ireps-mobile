import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useDispatch } from "react-redux";
import { useGeo } from "../src/context/GeoContext";
import { useAuth } from "../src/hooks/useAuth";
import {
  authApi,
  useSignoutMutation,
  useUpdateProfileMutation,
} from "../src/redux/authApi";
import ConnectionStatusLine from "./ConnectionStatusLine";

function formatCompactWardLabel(ward) {
  if (!ward) return "W-";

  const directCode =
    ward?.code ?? ward?.wardCode ?? ward?.wardNo ?? ward?.number ?? null;

  if (directCode !== null && directCode !== undefined && directCode !== "") {
    const numericCode = Number(directCode);
    return Number.isFinite(numericCode) ? `W${numericCode}` : `W${directCode}`;
  }

  const pcode = ward?.pcode || ward?.id || ward?.wardPcode || null;
  const pcodeMatch = String(pcode || "").match(/(\d{1,3})$/);
  if (pcodeMatch) return `W${Number(pcodeMatch[1])}`;

  const nameMatch = String(ward?.name || ward?.label || "").match(
    /ward\s*0*(\d+)/i,
  );
  if (nameMatch) return `W${Number(nameMatch[1])}`;

  return "W-";
}

export default function AppHeader({ title }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [wbModalVisible, setWbModalVisible] = useState(false);

  const [draftLm, setDraftLm] = useState(null);
  const [switchingScope, setSwitchingScope] = useState(false);

  const [isConnected, setIsConnected] = useState(true);

  const { activeWorkbase, profile, user, isSPU } = useAuth();
  const { geoState } = useGeo();

  const [signout] = useSignoutMutation();
  const [updateProfile] = useUpdateProfileMutation();
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && !!state.isInternetReachable;
      setIsConnected(online);
    });

    return unsubscribe;
  }, []);

  const name = profile?.profile?.name || "";
  const surname = profile?.profile?.surname || "";
  const role = profile?.employment?.role || "USER";
  const initials =
    `${name.charAt(0)}${surname.charAt(0)}`.toUpperCase() || "??";

  const availableJurisdictions = useMemo(() => {
    return profile?.access?.workbases || [];
  }, [profile?.access?.workbases]);

  const closeMenu = () => setMenuVisible(false);

  const closeWbModal = () => {
    setWbModalVisible(false);
  };

  function normalizeLm(wb) {
    if (!wb) return null;

    return {
      id: wb?.id || wb?.pcode || null,
      pcode: wb?.pcode || wb?.id || null,
      name: wb?.name || wb?.label || wb?.description || wb?.id || "Unknown LM",
      raw: wb,
    };
  }

  const normalizedJurisdictions = useMemo(() => {
    return (availableJurisdictions || [])
      .map(normalizeLm)
      .filter((x) => !!x?.id);
  }, [availableJurisdictions]);

  const currentLm = useMemo(() => {
    return normalizeLm(activeWorkbase || null);
  }, [activeWorkbase]);

  const resolvedCurrentLm = useMemo(() => {
    if (!currentLm?.id) return null;
    return (
      normalizedJurisdictions.find((lm) => lm.id === currentLm.id) || null
    );
  }, [currentLm?.id, normalizedJurisdictions]);

  const resolvedDraftLm = useMemo(() => {
    if (!draftLm?.id) return null;
    return normalizedJurisdictions.find((lm) => lm.id === draftLm.id) || null;
  }, [draftLm?.id, normalizedJurisdictions]);

  useEffect(() => {
    if (!wbModalVisible) return;

    setDraftLm(resolvedCurrentLm || null);
  }, [wbModalVisible, resolvedCurrentLm]);

  const scopeLabel = useMemo(() => {
    return currentLm?.name || "No workbase";
  }, [currentLm?.name]);

  const wardLabel = useMemo(
    () => formatCompactWardLabel(geoState?.selectedWard),
    [geoState?.selectedWard],
  );

  const canConfirmScope =
    isConnected &&
    !!resolvedDraftLm?.id &&
    resolvedDraftLm.id !== currentLm?.id &&
    !switchingScope;

  const handleSelectLm = (lm) => {
    if (!lm?.id) return;
    if (draftLm?.id === lm.id) return;

    setDraftLm(lm);
  };

  const handleWorkbaseChange = async () => {
    if (switchingScope) return;

    const nextLm = resolvedDraftLm;
    if (!nextLm?.id) {
      Alert.alert(
        "Workbase unavailable",
        "This workbase is not available on your user profile.",
      );
      return;
    }

    if (nextLm.id === currentLm?.id) {
      closeWbModal();
      return;
    }

    if (!user?.uid) {
      Alert.alert(
        "Cannot switch workbase",
        "No signed-in user was found for this session.",
      );
      return;
    }

    const wbPointer = {
      id: nextLm.id,
      name: nextLm.name,
    };

    setSwitchingScope(true);

    const patchResult = dispatch(
      authApi.util.updateQueryData("getAuthState", undefined, (draft) => {
        if (!draft?.profile) return;

        draft.profile.access = draft.profile.access || {};
        draft.profile.access.activeWorkbase = wbPointer;
      }),
    );

    closeWbModal();
    router.replace("/(tabs)/erfs");

    try {
      await updateProfile({
        uid: user.uid,
        updates: { "access.activeWorkbase": wbPointer },
      }).unwrap();
    } catch (err) {
      patchResult.undo();
      console.error("Workbase profile update failed:", err);
      Alert.alert(
        "Workbase switch failed",
        err?.message || "Could not update your active workbase.",
      );
    } finally {
      setSwitchingScope(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftCol}>
        <Text style={styles.tabTitle}>{title}</Text>
      </View>

      <View style={styles.centerCol}>
        <View style={styles.scopeInlineRow}>
          <TouchableOpacity
            onPress={() => setWbModalVisible(true)}
            activeOpacity={0.6}
            style={styles.wbTouchTarget}
          >
            <View style={styles.wbBadge}>
              <MaterialCommunityIcons
                name="map-marker-radius"
                size={14}
                color="#2563eb"
              />
              <Text style={styles.wbText} numberOfLines={1}>
                {scopeLabel}
              </Text>
              <MaterialCommunityIcons
                name="chevron-down"
                size={12}
                color="#2563eb"
              />
            </View>
          </TouchableOpacity>

          <View style={styles.wardBadge} pointerEvents="none">
            <Text style={styles.wardBadgeText}>{wardLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.rightCol}>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{role}</Text>
        </View>

        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => setMenuVisible(true)}
        >
          <Text style={styles.initialsText}>{initials}</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.modalBackdrop}>
            <View style={styles.menuBox}>
              <MenuOption
                icon="cog"
                label="Settings"
                onPress={() => {
                  closeMenu();
                  router.push("/admin/user/user-settings");
                }}
              />

              <View style={styles.divider} />

              <MenuOption
                icon="logout"
                label="Sign Out"
                color="#ef4444"
                onPress={async () => {
                  closeMenu();
                  await signout?.();
                }}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={wbModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeWbModal}
      >
        <TouchableWithoutFeedback onPress={closeWbModal}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.scopeModalBox}>
                <Text style={styles.modalHeader}>
                  {isSPU ? "iREPS Workbase Select" : "Assigned Workbase"}
                </Text>

                <View style={styles.scopeColumns}>
                  <View style={styles.scopeColLeft}>
                    <Text style={styles.scopeColHeader}>WORKBASES</Text>

                    {normalizedJurisdictions.length === 0 ? (
                      <View style={styles.scopeEmptyBox}>
                        <Text style={styles.scopeEmptyText}>
                          No workbases available
                        </Text>
                      </View>
                    ) : (
                      <ScrollView bounces={false}>
                        {normalizedJurisdictions.map((wb) => {
                          const active = draftLm?.id === wb.id;

                          return (
                            <TouchableOpacity
                              key={wb.id}
                              style={[
                                styles.scopeOption,
                                active && styles.scopeOptionActive,
                              ]}
                              onPress={() => handleSelectLm(wb)}
                            >
                              <MaterialCommunityIcons
                                name={
                                  active ? "radiobox-marked" : "radiobox-blank"
                                }
                                size={20}
                                color={active ? "#2563eb" : "#94a3b8"}
                              />
                              <Text
                                style={[
                                  styles.scopeOptionText,
                                  active && styles.scopeOptionTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {wb.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                </View>

                <View style={styles.scopeFooter}>
                  <Text style={styles.scopeSelectedText} numberOfLines={1}>
                    {draftLm?.name || "No workbase"}
                  </Text>

                  {!isConnected && (
                    <Text style={styles.scopeOfflineText}>
                      You are offline. Workbase switching requires connection.
                    </Text>
                  )}

                  <View style={styles.scopeBtnRow}>
                    <TouchableOpacity
                      style={styles.scopeCancelBtn}
                      onPress={closeWbModal}
                    >
                      <Text style={styles.scopeCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.scopeConfirmBtn,
                        !canConfirmScope && styles.scopeConfirmBtnDisabled,
                      ]}
                      onPress={handleWorkbaseChange}
                      disabled={!canConfirmScope}
                    >
                      {switchingScope ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.scopeConfirmBtnText}>Switch</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <ConnectionStatusLine isOnline={isConnected} />
    </View>
  );
}

const MenuOption = ({ icon, label, onPress, color = "#475569" }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress}>
    <MaterialCommunityIcons name={icon} size={20} color={color} />
    <Text style={[styles.menuItemText, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    paddingTop: 45,
    paddingBottom: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    zIndex: 10,
    position: "relative",
  },

  leftCol: { flex: 1.2 },

  tabTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1e293b",
  },

  centerCol: {
    flex: 2,
    alignItems: "center",
  },

  scopeInlineRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  wbTouchTarget: {
    flexShrink: 1,
  },

  wbBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
    maxWidth: "100%",
  },

  wbText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563eb",
    maxWidth: 170,
  },

  wardBadge: {
    flexShrink: 0,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 14,
  },

  wardBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#475569",
  },

  rightCol: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },

  roleBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  roleText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 0.5,
  },

  profileBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
  },

  initialsText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  menuBox: {
    position: "absolute",
    top: 90,
    right: 16,
    width: 200,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },

  menuItemText: {
    fontSize: 14,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginVertical: 4,
  },

  scopeModalBox: {
    backgroundColor: "#fff",
    width: "92%",
    maxHeight: "68%",
    borderRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
    elevation: 20,
  },

  modalHeader: {
    fontSize: 10,
    fontWeight: "900",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    textAlign: "center",
  },

  scopeColumns: {
    flexDirection: "row",
    gap: 12,
    minHeight: 280,
    maxHeight: 360,
  },

  scopeColLeft: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },

  scopeColHeader: {
    fontSize: 10,
    fontWeight: "900",
    color: "#94a3b8",
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  scopeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginHorizontal: 6,
    marginTop: 6,
    gap: 12,
  },

  scopeOptionActive: {
    backgroundColor: "#eff6ff",
  },

  scopeOptionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
    flex: 1,
  },

  scopeOptionTextActive: {
    color: "#2563eb",
  },

  scopeEmptyBox: {
    padding: 16,
    margin: 10,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },

  scopeEmptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },

  scopeFooter: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
  },

  scopeSelectedText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
    textAlign: "center",
    marginBottom: 12,
  },

  scopeOfflineText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b91c1c",
    textAlign: "center",
    marginBottom: 12,
  },

  scopeBtnRow: {
    flexDirection: "row",
    gap: 10,
  },

  scopeCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },

  scopeCancelBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
  },

  scopeConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },

  scopeConfirmBtnDisabled: {
    backgroundColor: "#cbd5e1",
  },

  scopeConfirmBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },
});
