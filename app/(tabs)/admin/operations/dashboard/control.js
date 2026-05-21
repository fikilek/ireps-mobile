import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useGeo } from "../../../../../src/context/GeoContext";
import { useWarehouse } from "../../../../../src/context/WarehouseContext";
import { useAuth } from "../../../../../src/hooks/useAuth";
import { useManageLifecycleInstructionMutation } from "../../../../../src/redux/lifecycleInstructionApi";
import { useGetServiceProvidersQuery } from "../../../../../src/redux/spApi";
import { useGetTeamsQuery } from "../../../../../src/redux/teamsApi";
import { useGetUsersQuery } from "../../../../../src/redux/usersApi";

const WMS_LCT_TYPES = [
  "METER_INSPECTION",
  "METER_DISCONNECTION",
  "METER_RECONNECTION",
  "METER_REMOVAL",
  "METER_READING",
];

const TYPE_SHORT = {
  METER_INSPECTION: "INSP",
  METER_DISCONNECTION: "DCN",
  METER_RECONNECTION: "RCN",
  METER_REMOVAL: "REM",
  METER_READING: "MREAD",
};

const STATE_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ISSUED", label: "Awaiting" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "REJECTED", label: "Rejected" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

const TARGET_TYPE_FILTERS = [
  { key: "USER", label: "Users", icon: "account-hard-hat-outline" },
  { key: "TEAM", label: "Teams", icon: "account-group-outline" },
  { key: "SP", label: "SPs", icon: "domain" },
];

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function cleanText(value, fallback = "NAv") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value) {
  const millis = toMillis(value);
  if (!millis) return "NAv";

  return new Date(millis).toLocaleString();
}

function getAgeLabel(value) {
  const millis = toMillis(value);
  if (!millis) return "NAv";

  const seconds = Math.max(Math.floor((Date.now() - millis) / 1000), 0);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getTrnType(trn = {}) {
  return normalizeUpper(
    trn?.accessData?.trnType ||
      trn?.trnType ||
      trn?.assignment?.instruction?.code,
  );
}

function getWorkflowState(trn = {}) {
  return normalizeUpper(trn?.workflow?.state || trn?.workflowState);
}

function getWorkflowStateLabel(state) {
  const cleanState = normalizeUpper(state);
  if (cleanState === "ISSUED") return "AWAITING";
  return cleanState || "NAv";
}

function getCreatedAt(trn = {}) {
  return trn?.metadata?.createdAt || trn?.createdAt || null;
}

function getUpdatedAt(trn = {}) {
  return trn?.metadata?.updatedAt || trn?.updatedAt || getCreatedAt(trn);
}

function getStartOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isInDateFilter(trn = {}, dateFilter) {
  if (dateFilter === "ALL") return true;

  const createdMillis = toMillis(getCreatedAt(trn) || getUpdatedAt(trn));
  if (!createdMillis) return false;

  const createdDate = new Date(createdMillis);
  const today = getStartOfToday();

  if (dateFilter === "TODAY") {
    return createdDate >= today;
  }

  if (dateFilter === "YESTERDAY") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    return createdDate >= yesterday && createdDate < today;
  }

  if (dateFilter === "THIS_WEEK") {
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    weekStart.setDate(today.getDate() - daysFromMonday);

    return createdDate >= weekStart;
  }

  return true;
}

function getIssuedByUid(trn = {}) {
  return cleanText(
    trn?.metadata?.createdByUid || trn?.assignment?.issuedByUid,
    null,
  );
}

function getTargets(trn = {}) {
  const targets = Array.isArray(trn?.assignment?.targets)
    ? trn.assignment.targets
    : [];

  return targets
    .map((target) => ({
      type: normalizeUpper(target?.type),
      id: cleanText(target?.id, ""),
      name: cleanText(target?.name || target?.title || target?.id),
    }))
    .filter((target) => target.id);
}

function getTargetText(trn = {}) {
  const targets = getTargets(trn);

  if (!targets.length) return "NAv";

  return targets.map((target) => `${target.type}: ${target.name}`).join(" • ");
}

function getTeamText(trn = {}) {
  const teamTargets = getTargets(trn).filter(
    (target) => target.type === "TEAM",
  );

  if (!teamTargets.length) return "NAv";

  return teamTargets.map((target) => target.name).join(" • ");
}

function getServiceProviderName(trn = {}) {
  return cleanText(
    trn?.serviceProvider?.name ||
      trn?.assignment?.serviceProvider?.name ||
      trn?.metadata?.serviceProvider?.name,
  );
}

function getMeterNo(trn = {}) {
  return cleanText(
    trn?.ast?.astData?.astNo ||
      trn?.astData?.astNo ||
      trn?.accessData?.meterNo ||
      trn?.accessData?.astNo ||
      trn?.meterNo,
  );
}

function getErfNo(trn = {}) {
  return cleanText(trn?.accessData?.erfNo || trn?.erfNo || trn?.premise?.erfNo);
}

function getAddress(trn = {}) {
  return cleanText(
    trn?.accessData?.premise?.address ||
      trn?.accessData?.address ||
      trn?.premise?.address,
  );
}

function getExecutionOutcome(trn = {}) {
  return cleanText(
    trn?.executionOutcome?.code ||
      trn?.executionOutcome?.outcome ||
      trn?.outcome?.code ||
      trn?.outcome,
  );
}

function getOriginChannel(trn = {}) {
  const channel = normalizeUpper(
    trn?.origin?.channel ||
      trn?.channel ||
      trn?.metadata?.originChannel ||
      "OFFICE",
  );

  if (channel === "FIELD") return "FIELD";

  return "OFFICE";
}

function isOfficeIssuedTrn(trn = {}) {
  return getOriginChannel(trn) !== "FIELD";
}

function getRejectedByName(trn = {}) {
  return cleanText(trn?.assignment?.acceptedRejectedUser);
}

function getRejectedAt(trn = {}) {
  return trn?.assignment?.acceptedRejectedAt || null;
}

function getRejectReason(trn = {}) {
  return cleanText(
    trn?.assignment?.rejectReason || trn?.workflow?.rejectReason,
  );
}

function getCompletedByName(trn = {}) {
  return cleanText(
    trn?.workflow?.completedByUser ||
      trn?.execution?.completedByUser ||
      trn?.metadata?.updatedByUser,
  );
}

function getCompletedAt(trn = {}) {
  return trn?.workflow?.completedAt || trn?.execution?.completedAt || null;
}

function getBucketName(trn = {}) {
  return cleanText(
    trn?.bucket?.name ||
      trn?.bucket?.id ||
      trn?.assignment?.bucket?.name ||
      trn?.assignment?.bucket?.id ||
      "INDIVIDUAL",
  );
}

function canManagerControl(trn = {}) {
  const state = getWorkflowState(trn);
  return state === "ISSUED" || state === "REJECTED";
}

function getUserRole(user = {}) {
  return normalizeUpper(user?.employment?.role || user?.role || "GST");
}

function getUserSpId(user = {}) {
  return cleanText(
    user?.employment?.serviceProvider?.id || user?.serviceProvider?.id,
    null,
  );
}

function getDisplayName(user = {}) {
  const fullName =
    `${user?.profile?.name || ""} ${user?.profile?.surname || ""}`
      .trim()
      .replace(/\s+/g, " ");

  return cleanText(
    user?.profile?.displayName ||
      fullName ||
      user?.profile?.email ||
      user?.email ||
      user?.id ||
      user?.uid,
  );
}

function getTeamName(team = {}) {
  return cleanText(
    team?.name || team?.title || team?.profile?.name || team?.id || team?.uid,
  );
}

function getTeamStatus(team = {}) {
  return normalizeUpper(team?.status || team?.profile?.status || "ACTIVE");
}

function getSpName(sp = {}) {
  return cleanText(
    sp?.profile?.tradingName ||
      sp?.profile?.registeredName ||
      sp?.profile?.name ||
      sp?.name ||
      sp?.id,
  );
}

function serviceProviderLooksMnc(sp = {}) {
  const classification = normalizeUpper(
    sp?.profile?.classification || sp?.classification || sp?.type,
  );

  if (classification === "MNC") return true;

  const clients = Array.isArray(sp?.clients) ? sp.clients : [];

  return clients.some(
    (client) =>
      normalizeUpper(client?.clientType) === "LM" &&
      normalizeUpper(client?.relationshipType) === "MNC",
  );
}

function getParentMncId(sp = {}) {
  const clients = Array.isArray(sp?.clients) ? sp.clients : [];

  const parent = clients.find(
    (client) =>
      normalizeUpper(client?.clientType) === "SP" &&
      normalizeUpper(client?.relationshipType) === "SUBC",
  );

  return parent?.id || null;
}

function serviceProviderLooksSubc(sp = {}) {
  return Boolean(getParentMncId(sp)) && !serviceProviderLooksMnc(sp);
}

function buildMncSubcMap(serviceProviders = []) {
  const map = {};

  serviceProviders.forEach((sp) => {
    if (!sp?.id) return;

    if (serviceProviderLooksMnc(sp)) {
      map[sp.id] = {
        mncId: sp.id,
        subcIds: [],
      };
    }
  });

  serviceProviders.forEach((sp) => {
    if (!sp?.id) return;

    const parentMncId = getParentMncId(sp);

    if (parentMncId && map[parentMncId]) {
      map[parentMncId].subcIds.push(sp.id);
    }
  });

  return map;
}

function getAllowedServiceProviderIds({ profile = {}, serviceProviders = [] }) {
  const actorRole = normalizeUpper(profile?.employment?.role || profile?.role);
  const actorSpId = cleanText(profile?.employment?.serviceProvider?.id, null);

  if (actorRole === "SPU" || actorRole === "ADM") {
    return serviceProviders.map((sp) => sp?.id).filter(Boolean);
  }

  if (!actorSpId) return [];

  const actorSp = serviceProviders.find((sp) => sp?.id === actorSpId) || null;
  if (!actorSp) return [actorSpId];

  const mncSubcMap = buildMncSubcMap(serviceProviders);

  if (serviceProviderLooksMnc(actorSp)) {
    return [actorSpId, ...(mncSubcMap[actorSpId]?.subcIds || [])].filter(
      Boolean,
    );
  }

  const parentMncId = getParentMncId(actorSp);

  if ((actorRole === "MNG" || actorRole === "SPV") && parentMncId) {
    return [parentMncId, ...(mncSubcMap[parentMncId]?.subcIds || [])].filter(
      Boolean,
    );
  }

  return [actorSpId];
}

function buildCounts(items = []) {
  return items.reduce(
    (acc, item) => {
      const state = getWorkflowState(item);

      acc.total += 1;

      if (state === "ISSUED") acc.issued += 1;
      if (state === "ACCEPTED") acc.accepted += 1;
      if (state === "REJECTED") acc.rejected += 1;
      if (state === "COMPLETED") acc.completed += 1;
      if (state === "CANCELLED") acc.cancelled += 1;

      return acc;
    },
    {
      total: 0,
      issued: 0,
      accepted: 0,
      rejected: 0,
      completed: 0,
      cancelled: 0,
    },
  );
}

function getStateBadgeStyle(state) {
  switch (normalizeUpper(state)) {
    case "ISSUED":
      return styles.badgeIssued;
    case "ACCEPTED":
      return styles.badgeAccepted;
    case "REJECTED":
      return styles.badgeRejected;
    case "COMPLETED":
      return styles.badgeCompleted;
    case "CANCELLED":
      return styles.badgeCancelled;
    default:
      return styles.badgeMuted;
  }
}

function getStateBadgeTextStyle(state) {
  switch (normalizeUpper(state)) {
    case "ISSUED":
      return styles.badgeIssuedText;
    case "ACCEPTED":
      return styles.badgeAcceptedText;
    case "REJECTED":
      return styles.badgeRejectedText;
    case "COMPLETED":
      return styles.badgeCompletedText;
    case "CANCELLED":
      return styles.badgeCancelledText;
    default:
      return styles.badgeMutedText;
  }
}

export default function ManagerControlScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile } = useAuth();
  const { geoState } = useGeo();
  const { all, sync, loading } = useWarehouse();

  const [stateFilter, setStateFilter] = useState("ALL");
  const [termsVisible, setTermsVisible] = useState(false);
  const [reassignItem, setReassignItem] = useState(null);

  const reassignModalOpen = Boolean(reassignItem);

  const [manageLifecycleInstruction, { isLoading: managing }] =
    useManageLifecycleInstructionMutation();

  const { data: users = [], isLoading: usersLoading } = useGetUsersQuery(
    undefined,
    {
      skip: !reassignModalOpen,
    },
  );

  const { data: teams = [], isLoading: teamsLoading } = useGetTeamsQuery(
    undefined,
    {
      skip: !reassignModalOpen,
    },
  );

  const { data: serviceProviders = [], isLoading: spsLoading } =
    useGetServiceProvidersQuery(undefined, {
      skip: !reassignModalOpen,
    });

  const selectedLm = geoState?.selectedLm || null;
  const selectedWard = geoState?.selectedWard || null;

  const lmPcode = sync?.scope?.lmPcode || selectedLm?.pcode || selectedLm?.id;
  const wardPcode =
    sync?.scope?.wardPcode || selectedWard?.pcode || selectedWard?.id;

  const scopeReady = Boolean(lmPcode && wardPcode);
  const selectedDateFilter = normalizeUpper(params?.dateFilter || "TODAY");

  const allowedSpIds = useMemo(() => {
    return getAllowedServiceProviderIds({
      profile,
      serviceProviders,
    });
  }, [profile, serviceProviders]);

  const visibleUsers = useMemo(() => {
    const spMap = new Map(serviceProviders.map((sp) => [sp?.id, sp]));

    return users
      .filter((item) => {
        const role = getUserRole(item);
        const accountStatus = normalizeUpper(item?.accountStatus || "ACTIVE");
        const onboardingStatus = normalizeUpper(
          item?.onboarding?.status || "COMPLETED",
        );
        const spId = getUserSpId(item);
        const userSp = spMap.get(spId) || null;

        const isExecutorRole =
          role === "FWR" ||
          (role === "SPV" && serviceProviderLooksSubc(userSp));

        return (
          isExecutorRole &&
          accountStatus === "ACTIVE" &&
          onboardingStatus === "COMPLETED" &&
          allowedSpIds.includes(spId)
        );
      })
      .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
  }, [allowedSpIds, serviceProviders, users]);

  const visibleTeams = useMemo(() => {
    return teams
      .filter((team) => {
        if (getTeamStatus(team) !== "ACTIVE") return false;

        const teamSpIds = Array.isArray(team?.scope?.serviceProviderIds)
          ? team.scope.serviceProviderIds
          : [];

        const teamMncId = team?.ownership?.mncServiceProviderId || null;

        return (
          teamSpIds.some((spId) => allowedSpIds.includes(spId)) ||
          (!!teamMncId && allowedSpIds.includes(teamMncId))
        );
      })
      .sort((a, b) => getTeamName(a).localeCompare(getTeamName(b)));
  }, [allowedSpIds, teams]);

  const visibleServiceProviders = useMemo(() => {
    return serviceProviders
      .filter((sp) => allowedSpIds.includes(sp?.id))
      .sort((a, b) => getSpName(a).localeCompare(getSpName(b)));
  }, [allowedSpIds, serviceProviders]);

  const managerItems = useMemo(() => {
    const trns = Array.isArray(all?.trns) ? all.trns : [];

    return trns
      .filter((trn) => WMS_LCT_TYPES.includes(getTrnType(trn)))
      .filter(isOfficeIssuedTrn)
      .filter((trn) => isInDateFilter(trn, selectedDateFilter))
      .filter((trn) => {
        if (stateFilter === "ALL") return true;
        return getWorkflowState(trn) === stateFilter;
      })
      .sort(
        (a, b) =>
          toMillis(getUpdatedAt(b) || getCreatedAt(b)) -
          toMillis(getUpdatedAt(a) || getCreatedAt(a)),
      );
  }, [all?.trns, selectedDateFilter, stateFilter]);

  const allManagerItems = useMemo(() => {
    const trns = Array.isArray(all?.trns) ? all.trns : [];

    return trns
      .filter((trn) => WMS_LCT_TYPES.includes(getTrnType(trn)))
      .filter(isOfficeIssuedTrn)
      .filter((trn) => isInDateFilter(trn, selectedDateFilter));
  }, [all?.trns, selectedDateFilter]);

  const counts = useMemo(() => buildCounts(allManagerItems), [allManagerItems]);

  const wardLabel =
    selectedWard?.name ||
    selectedWard?.label ||
    selectedWard?.code ||
    wardPcode ||
    "No Ward";

  const lmLabel = selectedLm?.name || selectedLm?.label || lmPcode || "No LM";

  function handleReassign(item) {
    if (!canManagerControl(item)) {
      Alert.alert(
        "View Only",
        "Only ISSUED or REJECTED workorders can be reassigned.",
      );
      return;
    }

    setReassignItem(item);
  }

  function handleCancel(item) {
    const trnId = item?.id || "NAv";

    Alert.alert(
      "Cancel Workorder",
      `Cancel ${trnId}? This action should only be used before field acceptance or after rejection.`,
      [
        { text: "NO", style: "cancel" },
        {
          text: "YES, CANCEL",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await manageLifecycleInstruction({
                trnIds: [trnId],
                action: "CANCEL",
                cancelReason: "Cancelled from WDB Manager Control",
              }).unwrap();

              Alert.alert(
                "Work Cancelled",
                result?.message || "Lifecycle instruction cancelled.",
              );
            } catch (error) {
              console.log("WDB cancel ERROR", {
                trnId,
                code: error?.code,
                message: error?.message,
                data: error?.data,
                raw: error,
              });

              Alert.alert(
                "Cancel Failed",
                error?.data?.message ||
                  error?.message ||
                  "Could not cancel lifecycle instruction.",
              );
            }
          },
        },
      ],
    );
  }

  async function handleSubmitReassign({ item, target, reason }) {
    if (!item?.id || !target?.id || managing) return;

    try {
      const result = await manageLifecycleInstruction({
        trnIds: [item.id],
        action: "REASSIGN",
        targets: [target],
        reason,
      }).unwrap();

      Alert.alert(
        "Work Reassigned",
        result?.message || "Lifecycle instruction reassigned successfully.",
      );

      setReassignItem(null);
    } catch (error) {
      console.log("WDB reassign ERROR", {
        trnId: item?.id,
        target,
        code: error?.code,
        message: error?.message,
        data: error?.data,
        raw: error,
      });

      Alert.alert(
        "Reassign Failed",
        error?.data?.message ||
          error?.message ||
          "Could not reassign lifecycle instruction.",
      );
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={26}
              color="#0f172a"
            />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Manager Control</Text>
            <Text style={styles.headerSubtitle}>
              {wardLabel} • {lmLabel}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#1d4ed8" />
          ) : (
            <View style={styles.headerCountBadge}>
              <Text style={styles.headerCountText}>{counts.total}</Text>
            </View>
          )}
        </View>

        {!scopeReady ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="map-marker-radius-outline"
              size={42}
              color="#94a3b8"
            />
            <Text style={styles.emptyTitle}>Select a ward</Text>
            <Text style={styles.emptyText}>
              Manager Control is ward-scoped. Select an active ward before
              viewing WMS workorders.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Ward Control</Text>
              <Text style={styles.summarySubtitle}>
                Office-issued WMS workorders in this ward
              </Text>

              {/* <View style={styles.controlStatsGroup}>
                <Text style={styles.controlStatsGroupTitle}>
                  Office-issued Workload
                </Text>

                <View style={styles.controlTotalTile}>
                  <Text style={styles.controlTotalValue}>{counts.total}</Text>
                  <Text style={styles.controlTotalLabel}>Total</Text>
                </View>
              </View> */}

              <View style={styles.controlStatsGroup}>
                <Text style={styles.controlStatsGroupTitle}>
                  Workflow State
                </Text>

                <View style={styles.controlStatsGrid}>
                  <ControlStatTile label="Awaiting" value={counts.issued} />
                  <ControlStatTile label="Accepted" value={counts.accepted} />
                  <ControlStatTile label="Rejected" value={counts.rejected} />
                  <ControlStatTile label="Completed" value={counts.completed} />
                  <ControlStatTile label="Cancelled" value={counts.cancelled} />
                </View>
              </View>

              <View style={styles.summaryHelpRow}>
                <Pressable
                  style={styles.summaryHelpButton}
                  onPress={() => setTermsVisible(true)}
                >
                  <MaterialCommunityIcons
                    name="help-circle-outline"
                    size={16}
                    color="#1d4ed8"
                  />
                  <Text style={styles.summaryHelpButtonText}>Terms</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={styles.filterScroll}
            >
              {STATE_FILTERS.map((filter) => {
                const active = stateFilter === filter.key;
                const count =
                  filter.key === "ALL"
                    ? counts.total
                    : counts[filter.key.toLowerCase()] || 0;

                return (
                  <Pressable
                    key={filter.key}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
                    onPress={() => setStateFilter(filter.key)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                    <Text
                      style={[
                        styles.filterCountText,
                        active && styles.filterCountTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.sectionTitle}>Workorder List</Text>

            {managerItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={42}
                  color="#94a3b8"
                />
                <Text style={styles.emptyTitle}>No workorders found</Text>
                <Text style={styles.emptyText}>
                  There are no WMS workorders for this ward and filter.
                </Text>
              </View>
            ) : (
              <FlatList
                data={managerItems}
                keyExtractor={(item, index) =>
                  String(item?.id || item?.trnId || index)
                }
                renderItem={({ item }) => (
                  <ManagerWorkCard
                    item={item}
                    managing={managing}
                    onReassign={handleReassign}
                    onCancel={handleCancel}
                  />
                )}
                scrollEnabled={false}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews
              />
            )}
          </>
        )}
      </ScrollView>

      <WardControlTermsModal
        visible={termsVisible}
        onClose={() => setTermsVisible(false)}
      />

      <ReassignModal
        visible={Boolean(reassignItem)}
        item={reassignItem}
        users={visibleUsers}
        teams={visibleTeams}
        serviceProviders={visibleServiceProviders}
        loadingTargets={usersLoading || teamsLoading || spsLoading}
        busy={managing}
        onClose={() => setReassignItem(null)}
        onSubmit={handleSubmitReassign}
      />
    </SafeAreaView>
  );
}

function ControlStatTile({ label, value }) {
  return (
    <View style={styles.controlStatTile}>
      <Text style={styles.controlStatValue}>{value || 0}</Text>
      <Text style={styles.controlStatLabel}>{label}</Text>
    </View>
  );
}

function ControlTermSection({ title, children }) {
  return (
    <View style={styles.controlTermSection}>
      <Text style={styles.controlTermSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ControlTermItem({ title, children }) {
  return (
    <View style={styles.controlTermItem}>
      <Text style={styles.controlTermTitle}>{title}</Text>
      <Text style={styles.controlTermText}>{children}</Text>
    </View>
  );
}

function WardControlTermsModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.controlTermsOverlay}>
        <View style={styles.controlTermsCard}>
          <View style={styles.controlTermsHeader}>
            <View>
              <Text style={styles.controlTermsTitle}>Ward Control Terms</Text>
              <Text style={styles.controlTermsSubtitle}>
                Office-issued controllable workorders
              </Text>
            </View>

            <Pressable style={styles.controlTermsCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color="#0f172a" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.controlTermsScroll}
            contentContainerStyle={styles.controlTermsContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.controlTermsIntro}>
              The numbers in Ward Control are based on the selected ward and
              current filter. Only office-issued WMS workorders are counted
              here. Field-originated work, such as field-created meter readings,
              is shown in User Activity and reports, but not in Manager Control.
            </Text>

            <ControlTermSection title="Workload">
              <ControlTermItem title="Total">
                The total number of office-issued WMS workorders in the selected
                ward and current filter.
              </ControlTermItem>
              <ControlTermItem title="Balance Rule">
                Total = Awaiting + Accepted + Rejected + Completed + Cancelled.
              </ControlTermItem>
            </ControlTermSection>

            <ControlTermSection title="Workflow State">
              <ControlTermItem title="Awaiting">
                Work that has been issued from the office, but the assigned
                field user has not yet accepted or rejected it. This is the
                workflow state ISSUED.
              </ControlTermItem>
              <ControlTermItem title="Accepted">
                Work that has been accepted by the assigned field user, but has
                not yet been completed.
              </ControlTermItem>
              <ControlTermItem title="Rejected">
                Work that was rejected by the assigned field user and now
                requires manager action, such as reassignment or cancellation.
              </ControlTermItem>
              <ControlTermItem title="Completed">
                Work that has been executed and completed.
              </ControlTermItem>
              <ControlTermItem title="Cancelled">
                Work that was cancelled by the manager before completion.
              </ControlTermItem>
            </ControlTermSection>

            <View style={styles.controlImportantBox}>
              <Text style={styles.controlImportantTitle}>Important</Text>
              <Text style={styles.controlImportantText}>
                Ward Control is for office-issued controllable workorders only.
                User Activity shows broader field-user activity, including
                field-originated work.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const ManagerWorkCard = memo(function ManagerWorkCard({
  item,
  managing,
  onReassign,
  onCancel,
}) {
  const state = getWorkflowState(item);
  const trnType = getTrnType(item);
  const canAct = canManagerControl(item);
  const outcome = getExecutionOutcome(item);

  return (
    <View style={styles.workCard}>
      <View style={styles.workHeader}>
        <View style={styles.typeIconWrap}>
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={20}
            color="#1d4ed8"
          />
        </View>

        <View style={styles.workHeaderMain}>
          <View style={styles.titleLine}>
            <Text style={styles.typeShort}>{TYPE_SHORT[trnType] || "TRN"}</Text>
            <Text style={styles.bucketPill}>{getBucketName(item)}</Text>
          </View>

          <Text style={styles.workId} numberOfLines={1} ellipsizeMode="middle">
            {item.id || "NAv"}
          </Text>
        </View>

        <View style={[styles.stateBadge, getStateBadgeStyle(state)]}>
          <Text style={[styles.stateBadgeText, getStateBadgeTextStyle(state)]}>
            {getWorkflowStateLabel(state)}
          </Text>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <InfoLine
          icon="calendar-clock"
          label="Issued"
          value={formatDateTime(getCreatedAt(item))}
        />

        <InfoLine
          icon="clock-outline"
          label="Age"
          value={getAgeLabel(getCreatedAt(item))}
        />

        <InfoLine
          icon="account-arrow-right-outline"
          label="Assigned To"
          value={getTargetText(item)}
          fullWidth
        />

        <InfoLine
          icon="account-group-outline"
          label="Team"
          value={getTeamText(item)}
        />

        <InfoLine
          icon="domain"
          label="Service Provider"
          value={getServiceProviderName(item)}
        />

        <InfoLine icon="counter" label="Meter No" value={getMeterNo(item)} />

        <InfoLine
          icon="home-city-outline"
          label="ERF No"
          value={getErfNo(item)}
        />

        <InfoLine
          icon="map-marker-outline"
          label="Site"
          value={getAddress(item)}
          fullWidth
        />
      </View>

      {state === "REJECTED" ? (
        <View style={styles.rejectedBox}>
          <Text style={styles.rejectedTitle}>Rejected work</Text>
          <Text style={styles.rejectedText}>
            Rejected by {getRejectedByName(item)} •{" "}
            {formatDateTime(getRejectedAt(item))}
          </Text>
          <Text style={styles.rejectedReason}>
            Reason: {getRejectReason(item)}
          </Text>
        </View>
      ) : null}

      {state === "ACCEPTED" ? (
        <View style={styles.viewOnlyBox}>
          <MaterialCommunityIcons
            name="account-hard-hat-outline"
            size={16}
            color="#059669"
          />
          <Text style={styles.viewOnlyText}>
            Accepted in field. Manager control is view-only.
          </Text>
        </View>
      ) : null}

      {state === "COMPLETED" ? (
        <View style={styles.viewOnlyBox}>
          <MaterialCommunityIcons
            name="check-decagram-outline"
            size={16}
            color="#0f766e"
          />
          <Text style={styles.viewOnlyText}>
            Completed by {getCompletedByName(item)} •{" "}
            {formatDateTime(getCompletedAt(item))} • Outcome: {outcome}
          </Text>
        </View>
      ) : null}

      {state === "CANCELLED" ? (
        <View style={styles.viewOnlyBox}>
          <MaterialCommunityIcons name="cancel" size={16} color="#64748b" />
          <Text style={styles.viewOnlyText}>
            Cancelled. This workorder is view-only.
          </Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        {canAct ? (
          <>
            <Pressable
              style={[
                styles.actionBtn,
                styles.reassignBtn,
                managing && styles.actionDisabled,
              ]}
              onPress={() => onReassign(item)}
              disabled={managing}
            >
              <Text style={styles.reassignBtnText}>REASSIGN</Text>
            </Pressable>

            <Pressable
              style={[
                styles.actionBtn,
                styles.cancelBtn,
                managing && styles.actionDisabled,
              ]}
              onPress={() => onCancel(item)}
              disabled={managing}
            >
              <Text style={styles.cancelBtnText}>
                {managing ? "WAIT..." : "CANCEL"}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.lockedRow}>
            <MaterialCommunityIcons
              name="lock-check-outline"
              size={15}
              color="#64748b"
            />
            <Text style={styles.lockedText}>View only in this state</Text>
          </View>
        )}
      </View>
    </View>
  );
});

function ReassignModal({
  visible,
  item,
  users = [],
  teams = [],
  serviceProviders = [],
  loadingTargets,
  busy,
  onClose,
  onSubmit,
}) {
  const [targetType, setTargetType] = useState("USER");
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [reason, setReason] = useState("");

  const options = useMemo(() => {
    if (targetType === "USER") {
      return users.map((target) => ({
        type: "USER",
        id: target?.uid || target?.id,
        name: getDisplayName(target),
        subtitle: `${getUserRole(target)} • ${cleanText(
          target?.employment?.serviceProvider?.name || getUserSpId(target),
        )}`,
      }));
    }

    if (targetType === "TEAM") {
      return teams.map((target) => ({
        type: "TEAM",
        id: target?.id || target?.uid,
        name: getTeamName(target),
        subtitle: "Operational team",
      }));
    }

    return serviceProviders.map((target) => ({
      type: "SP",
      id: target?.id,
      name: getSpName(target),
      subtitle: serviceProviderLooksMnc(target) ? "MNC" : "SUBC / SP",
    }));
  }, [serviceProviders, targetType, teams, users]);

  function resetAndClose() {
    if (busy) return;

    setTargetType("USER");
    setSelectedTarget(null);
    setReason("");
    onClose?.();
  }

  function changeTargetType(nextType) {
    setTargetType(nextType);
    setSelectedTarget(null);
  }

  function submit() {
    if (!selectedTarget?.id) {
      Alert.alert("Target Required", "Select a USER, TEAM or SP target.");
      return;
    }

    const cleanReason = String(reason || "").trim();

    if (cleanReason.length < 5) {
      Alert.alert(
        "Reason Required",
        "Give a short reason for this reassignment.",
      );
      return;
    }

    onSubmit?.({
      item,
      target: {
        type: selectedTarget.type,
        id: selectedTarget.id,
        name: selectedTarget.name,
      },
      reason: cleanReason,
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={resetAndClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.reassignModalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIconWrap}>
              <MaterialCommunityIcons
                name="account-switch-outline"
                size={24}
                color="#1d4ed8"
              />
            </View>

            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>Reassign Work</Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {item?.id || "NAv"}
              </Text>
            </View>

            <Pressable
              style={styles.modalCloseBtn}
              onPress={resetAndClose}
              disabled={busy}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
            </Pressable>
          </View>

          <View style={styles.targetTypeRow}>
            {TARGET_TYPE_FILTERS.map((filter) => {
              const active = targetType === filter.key;

              return (
                <Pressable
                  key={filter.key}
                  style={[
                    styles.targetTypeChip,
                    active && styles.targetTypeChipActive,
                  ]}
                  onPress={() => changeTargetType(filter.key)}
                  disabled={busy}
                >
                  <MaterialCommunityIcons
                    name={filter.icon}
                    size={16}
                    color={active ? "#ffffff" : "#475569"}
                  />
                  <Text
                    style={[
                      styles.targetTypeChipText,
                      active && styles.targetTypeChipTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.targetListBox}>
            {loadingTargets ? (
              <View style={styles.targetLoadingWrap}>
                <ActivityIndicator size="small" color="#1d4ed8" />
                <Text style={styles.targetLoadingText}>Loading targets...</Text>
              </View>
            ) : options.length === 0 ? (
              <View style={styles.targetEmptyWrap}>
                <MaterialCommunityIcons
                  name="account-off-outline"
                  size={28}
                  color="#94a3b8"
                />
                <Text style={styles.targetEmptyText}>No available targets</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.targetListContent}>
                {options.map((option) => {
                  const active = selectedTarget?.id === option.id;

                  return (
                    <Pressable
                      key={`${option.type}-${option.id}`}
                      style={[
                        styles.targetOption,
                        active && styles.targetOptionActive,
                      ]}
                      onPress={() => setSelectedTarget(option)}
                      disabled={busy}
                    >
                      <View style={styles.targetOptionIcon}>
                        <MaterialCommunityIcons
                          name={
                            option.type === "USER"
                              ? "account-hard-hat-outline"
                              : option.type === "TEAM"
                                ? "account-group-outline"
                                : "domain"
                          }
                          size={19}
                          color={active ? "#1d4ed8" : "#64748b"}
                        />
                      </View>

                      <View style={styles.targetOptionTextWrap}>
                        <Text style={styles.targetOptionName}>
                          {option.name}
                        </Text>
                        <Text style={styles.targetOptionSub}>
                          {option.subtitle}
                        </Text>
                      </View>

                      {active ? (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={20}
                          color="#1d4ed8"
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Reason for reassignment"
            placeholderTextColor="#94a3b8"
            multiline
            editable={!busy}
          />

          <View style={styles.modalActionRow}>
            <Pressable
              style={[styles.modalActionBtn, styles.modalCancelBtn]}
              onPress={resetAndClose}
              disabled={busy}
            >
              <Text style={styles.modalCancelBtnText}>CLOSE</Text>
            </Pressable>

            <Pressable
              style={[
                styles.modalActionBtn,
                styles.modalSubmitBtn,
                busy && styles.actionDisabled,
              ]}
              onPress={submit}
              disabled={busy}
            >
              <Text style={styles.modalSubmitBtnText}>
                {busy ? "REASSIGNING..." : "REASSIGN"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InfoLine({ icon, label, value, fullWidth = false }) {
  return (
    <View style={[styles.infoLine, fullWidth && styles.infoLineFull]}>
      <MaterialCommunityIcons name={icon} size={15} color="#64748b" />

      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value || "NAv"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },

  headerSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  headerCountBadge: {
    minWidth: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#1d4ed8",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  headerCountText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  summaryCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    padding: 16,
    marginBottom: 14,
  },

  summaryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },

  summarySubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  controlStatsGroup: {
    backgroundColor: "rgba(255,255,255,0.62)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 10,
    marginTop: 12,
  },

  controlStatsGroupTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },

  controlTotalTile: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },

  controlTotalValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  controlTotalLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },

  controlStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  controlStatTile: {
    width: "30.9%",
    backgroundColor: "#ffffff",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#dbeafe",
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: "center",
  },

  controlStatValue: {
    fontSize: 17,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  controlStatLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: "#64748b",
    marginTop: 2,
    textAlign: "center",
  },

  summaryHelpRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  summaryHelpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#ffffff",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  summaryHelpButtonText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  controlTermsOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },

  controlTermsCard: {
    width: "100%",
    maxHeight: "82%",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },

  controlTermsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  controlTermsTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },

  controlTermsSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },

  controlTermsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  controlTermsScroll: {
    maxHeight: 540,
  },

  controlTermsContent: {
    padding: 16,
    paddingBottom: 22,
  },

  controlTermsIntro: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    lineHeight: 18,
    marginBottom: 14,
  },

  controlTermSection: {
    marginBottom: 16,
  },

  controlTermSectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  controlTermItem: {
    marginBottom: 10,
  },

  controlTermTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  controlTermText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    lineHeight: 16,
  },

  controlImportantBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 12,
  },

  controlImportantTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  controlImportantText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    lineHeight: 16,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },

  statPill: {
    width: "31.8%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },

  statLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748b",
  },

  statValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1d4ed8",
    marginTop: 2,
  },

  filterScroll: {
    marginBottom: 14,
  },

  filterRow: {
    gap: 8,
    paddingRight: 16,
  },

  filterChip: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  filterChipActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },

  filterChipText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
  },

  filterChipTextActive: {
    color: "#ffffff",
  },

  filterCountText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#94a3b8",
  },

  filterCountTextActive: {
    color: "#bfdbfe",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 22,
    alignItems: "center",
    marginTop: 14,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 12,
  },

  emptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 7,
  },

  workCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 12,
  },

  workHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  typeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  workHeaderMain: {
    flex: 1,
  },

  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  typeShort: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  bucketPill: {
    fontSize: 9,
    fontWeight: "900",
    color: "#1d4ed8",
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: "hidden",
  },

  workId: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  stateBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  stateBadgeText: {
    fontSize: 9,
    fontWeight: "900",
  },

  badgeIssued: {
    backgroundColor: "#dbeafe",
  },

  badgeIssuedText: {
    color: "#1d4ed8",
  },

  badgeAccepted: {
    backgroundColor: "#dcfce7",
  },

  badgeAcceptedText: {
    color: "#15803d",
  },

  badgeRejected: {
    backgroundColor: "#fee2e2",
  },

  badgeRejectedText: {
    color: "#b91c1c",
  },

  badgeCompleted: {
    backgroundColor: "#ccfbf1",
  },

  badgeCompletedText: {
    color: "#0f766e",
  },

  badgeCancelled: {
    backgroundColor: "#e2e8f0",
  },

  badgeCancelledText: {
    color: "#475569",
  },

  badgeMuted: {
    backgroundColor: "#f1f5f9",
  },

  badgeMutedText: {
    color: "#64748b",
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  infoLine: {
    width: "47.8%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },

  infoLineFull: {
    width: "100%",
  },

  infoTextWrap: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
  },

  infoValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    marginTop: 1,
  },

  rejectedBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 12,
    marginTop: 12,
  },

  rejectedTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#991b1b",
  },

  rejectedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7f1d1d",
    marginTop: 4,
  },

  rejectedReason: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7f1d1d",
    marginTop: 4,
  },

  viewOnlyBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 11,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  viewOnlyText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    lineHeight: 16,
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },

  actionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  reassignBtn: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },

  reassignBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  cancelBtn: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },

  cancelBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#b91c1c",
  },

  actionDisabled: {
    opacity: 0.6,
  },

  lockedRow: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  lockedText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },

  reassignModalCard: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  modalHeaderText: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
  },

  modalSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },

  targetTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },

  targetTypeChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },

  targetTypeChipActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },

  targetTypeChipText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#475569",
  },

  targetTypeChipTextActive: {
    color: "#ffffff",
  },

  targetListBox: {
    minHeight: 150,
    maxHeight: 270,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },

  targetListContent: {
    padding: 8,
  },

  targetLoadingWrap: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  targetLoadingText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
  },

  targetEmptyWrap: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
  },

  targetEmptyText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    marginTop: 8,
  },

  targetOption: {
    backgroundColor: "#ffffff",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  targetOptionActive: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },

  targetOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  targetOptionTextWrap: {
    flex: 1,
  },

  targetOptionName: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  targetOptionSub: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  reasonInput: {
    minHeight: 76,
    textAlignVertical: "top",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginTop: 12,
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },

  modalActionRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },

  modalActionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelBtn: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  modalCancelBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
  },

  modalSubmitBtn: {
    backgroundColor: "#1d4ed8",
  },

  modalSubmitBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },
});
