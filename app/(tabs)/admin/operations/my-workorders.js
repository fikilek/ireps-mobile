import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Formik } from "formik";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActivityIndicator } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { object, string } from "yup";

import { useAuth } from "../../../../src/hooks/useAuth";
import {
  useAcceptRejectLifecycleInstructionMutation,
  useGetWmsLifecycleWorkItemsQuery,
} from "../../../../src/redux/lifecycleInstructionApi";

const WMS_GROUPS = [
  {
    key: "METER_INSPECTION",
    title: "Inspections",
    short: "INSP",
    icon: "clipboard-search-outline",
  },
  {
    key: "METER_DISCONNECTION",
    title: "Disconnections",
    short: "DCN",
    icon: "power-plug-off-outline",
  },
  {
    key: "METER_RECONNECTION",
    title: "Reconnections",
    short: "RCN",
    icon: "power-plug-outline",
  },
  {
    key: "METER_REMOVAL",
    title: "Removals",
    short: "REM",
    icon: "countertop-outline",
  },
];

const STATE_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ISSUED", label: "Issued" },
  { key: "REASSIGNED", label: "Reassigned" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "REJECTED", label: "Rejected" },
];

const EXECUTION_ROUTES = {
  METER_REMOVAL: "/asts/removal",
  METER_DISCONNECTION: "/asts/disconnection",
  METER_RECONNECTION: "/asts/reconnection",
};

const RejectSchema = object().shape({
  rejectReason: string()
    .trim()
    .min(5, "Give a short but useful reason")
    .max(500, "Keep the reason below 500 characters")
    .required("Reject reason is required"),
});

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function formatAge(seconds = 0) {
  const total = Number(seconds || 0);

  if (!total) return "NAv";

  const minutes = Math.floor(total / 60);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatDateTime(value) {
  if (!value) return "NAv";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NAv";

  return date.toLocaleString();
}

function emptyCounts() {
  return {
    issued: 0,
    reassigned: 0,
    accepted: 0,
    rejected: 0,
    inProgress: 0,
    total: 0,
  };
}

function countItems(items = []) {
  return items.reduce((acc, item) => {
    acc.total += 1;

    if (item.workflowState === "ISSUED") acc.issued += 1;
    if (item.workflowState === "REASSIGNED") acc.reassigned += 1;
    if (item.workflowState === "ACCEPTED") acc.accepted += 1;
    if (item.workflowState === "REJECTED") acc.rejected += 1;
    if (item.workflowState === "IN_PROGRESS") acc.inProgress += 1;

    return acc;
  }, emptyCounts());
}

function stateCount(items = [], state) {
  if (state === "ALL") return items.length;
  return items.filter((item) => item.workflowState === state).length;
}

function getStateBadgeStyle(state) {
  switch (normalizeUpper(state)) {
    case "ISSUED":
    case "REASSIGNED":
      return styles.badgeBlue;
    case "ACCEPTED":
      return styles.badgeGreen;
    case "IN_PROGRESS":
      return styles.badgeOrange;
    case "REJECTED":
      return styles.badgeRed;
    default:
      return styles.badgeMuted;
  }
}

function getStateBadgeTextStyle(state) {
  switch (normalizeUpper(state)) {
    case "ISSUED":
    case "REASSIGNED":
      return styles.badgeBlueText;
    case "ACCEPTED":
      return styles.badgeGreenText;
    case "IN_PROGRESS":
      return styles.badgeOrangeText;
    case "REJECTED":
      return styles.badgeRedText;
    default:
      return styles.badgeMutedText;
  }
}

export default function WorkorderManagementSystem() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const actorUid = user?.uid || profile?.uid || null;
  const actorRole = profile?.employment?.role || profile?.role || "NAv";
  const actorSpId = profile?.employment?.serviceProvider?.id || null;
  const actorName =
    profile?.profile?.displayName || user?.email || actorUid || "NAv";

  const {
    data: wmsData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetWmsLifecycleWorkItemsQuery({
    actorUid,
    actorRole,
    actorSpId,
    actorName,
    limit: 500,
  });

  const [acceptRejectLifecycleInstruction, { isLoading: deciding }] =
    useAcceptRejectLifecycleInstructionMutation();

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [stateFilter, setStateFilter] = useState("ALL");
  const [rejectItem, setRejectItem] = useState(null);

  const directItems = useMemo(() => {
    const items = Array.isArray(wmsData?.items) ? wmsData.items : [];

    return items.filter((item) => item.scopeBucket === "MY_WORK");
  }, [wmsData?.items]);

  const groups = useMemo(() => {
    return WMS_GROUPS.map((group) => {
      const groupItems = directItems.filter(
        (item) => item.trnType === group.key,
      );
      const counts = countItems(groupItems);

      return {
        ...group,
        total: groupItems.length,
        counts,
      };
    });
  }, [directItems]);

  const visibleItems = useMemo(() => {
    if (!selectedGroup?.key) return [];

    return directItems.filter((item) => {
      if (item.trnType !== selectedGroup.key) return false;
      if (stateFilter !== "ALL" && item.workflowState !== stateFilter) {
        return false;
      }

      return true;
    });
  }, [directItems, selectedGroup?.key, stateFilter]);

  function openGroup(group) {
    setSelectedGroup(group);
    setStateFilter("ALL");
  }

  function backToGroups() {
    setSelectedGroup(null);
    setStateFilter("ALL");
  }

  async function submitDecision({ item, action, rejectReason = "" }) {
    if (!item?.id || deciding) return false;

    try {
      const result = await acceptRejectLifecycleInstruction({
        trnIds: [item.id],
        action,
        rejectReason: String(rejectReason || "").trim(),
      }).unwrap();

      Alert.alert(
        action === "ACCEPT" ? "Work Accepted" : "Work Rejected",
        result?.message ||
          (action === "ACCEPT"
            ? "Lifecycle work item accepted."
            : "Lifecycle work item rejected."),
      );

      return true;
    } catch (err) {
      console.log("WMS decision ERROR", err);

      Alert.alert(
        "Action Failed",
        err?.data?.message || err?.message || "Could not update work item.",
      );

      return false;
    }
  }

  function handleAccept(item) {
    Alert.alert("Accept Work", `Accept ${item?.id || "this work item"}?`, [
      { text: "CANCEL", style: "cancel" },
      {
        text: "ACCEPT",
        onPress: () => submitDecision({ item, action: "ACCEPT" }),
      },
    ]);
  }

  async function handleReject(values, helpers) {
    const success = await submitDecision({
      item: rejectItem,
      action: "REJECT",
      rejectReason: values.rejectReason,
    });

    helpers.setSubmitting(false);

    if (success) {
      helpers.resetForm();
      setRejectItem(null);
    }
  }

  function handleExecute(item) {
    const pathname = EXECUTION_ROUTES[item?.trnType];

    if (!pathname) {
      Alert.alert(
        "Execution Route",
        "This work type can be issued and accepted, but execution is not enabled on this screen yet.",
      );
      return;
    }

    const instructionTrnId = item?.id || null;

    const sourceAstId =
      item?.raw?.ast?.astData?.astId || item?.raw?.astData?.astId || null;

    const premiseId =
      item?.premiseId || item?.raw?.accessData?.premise?.id || null;

    if (!instructionTrnId) {
      Alert.alert(
        "Work Item Not Ready",
        "This WMS item does not have a lifecycle instruction TRN id.",
      );
      return;
    }

    const action = {
      source: "WMS",

      // ✅ This is the accepted WMS work item / lifecycle instruction TRN.
      id: instructionTrnId,
      trnId: instructionTrnId,
      instructionTrnId,

      // ✅ This is only the referenced AST/installing TRN id used by backend AST updates.
      sourceAstId,
      astId: sourceAstId,

      trnType: item.trnType,
      premiseId,
      meterNo: item.meterNo,
      meterType: item.meterType,
      meterKind: item.meterKind,
      meterPreStatus: item.meterPreStatus,
      erfNo: item.erfNo,
      address: item.address,
      accessData: item?.raw?.accessData || null,
      ast: item?.raw?.ast || null,
      status: item?.raw?.status || null,
      assignment: item?.raw?.assignment || null,
      media: Array.isArray(item?.raw?.media) ? item.raw.media : [],
      officeInstruction: item?.raw?.assignment?.instruction || {
        code: item.trnType,
        text: item.assignment?.instructionText || "",
        notes: item.assignment?.instructionNotes || "",
        mediaRequired: false,
      },
      officeInstructionMedia: Array.isArray(item?.raw?.media)
        ? item.raw.media.filter((media) => media?.tag === "instructionMedia")
        : [],
      instructionText: item.assignment?.instructionText || "",
      instructionNotes: item.assignment?.instructionNotes || "",
      assignedTargetText: item.assignment?.targetText || "",
      issuedBy: item.issuedBy || null,
      serviceProvider: item.serviceProvider || null,
    };

    console.log("🧭 [WMS EXECUTE TAP]", {
      route: pathname,
      instructionTrnId,
      sourceAstId,
      premiseId,
      trnType: item?.trnType,
      meterNo: item?.meterNo,
    });

    router.push({
      pathname,
      params: {
        // ✅ Primary WMS execution id.
        trnId: instructionTrnId,
        instructionTrnId,

        // ✅ Asset reference, not the WMS work id.
        sourceAstId: sourceAstId || "",

        premiseId: premiseId || "",
        action: JSON.stringify(action),
        source: "WMS",
      },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: "Workorder Management System",
          headerTitleStyle: { fontSize: 15, fontWeight: "900" },
        }}
      />

      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons
            name="clipboard-list-outline"
            size={26}
            color="#ffffff"
          />
        </View>

        <View style={styles.headerMain}>
          <Text style={styles.headerTitle}>WMS</Text>
          <Text style={styles.headerSub}>My allocated lifecycle work</Text>
        </View>

        <View style={styles.headerCountBadge}>
          <Text style={styles.headerCountText}>{directItems.length}</Text>
        </View>

        <Pressable
          style={styles.refreshBtn}
          onPress={refetch}
          disabled={isFetching}
        >
          {isFetching ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <MaterialCommunityIcons name="refresh" size={21} color="#0f172a" />
          )}
        </Pressable>
      </View>

      {selectedGroup ? (
        <GroupDetail
          title={selectedGroup.title}
          stateFilter={stateFilter}
          setStateFilter={setStateFilter}
          allGroupItems={directItems.filter(
            (item) => item.trnType === selectedGroup.key,
          )}
          items={visibleItems}
          deciding={deciding}
          onBack={backToGroups}
          onAccept={handleAccept}
          onReject={setRejectItem}
          onExecute={handleExecute}
        />
      ) : (
        <GroupLanding
          isLoading={isLoading}
          error={error}
          groups={groups}
          onOpenGroup={openGroup}
        />
      )}

      <RejectModal
        visible={Boolean(rejectItem)}
        item={rejectItem}
        busy={deciding}
        onClose={() => setRejectItem(null)}
        onSubmit={handleReject}
      />
    </SafeAreaView>
  );
}

function GroupLanding({ isLoading, error, groups, onOpenGroup }) {
  if (isLoading) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.stateText}>Loading your allocated work...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateWrap}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={36}
          color="#dc2626"
        />
        <Text style={styles.stateTitle}>Could not load WMS</Text>
        <Text style={styles.stateText}>
          {error?.message || "Work stream failed."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.sectionEyebrow}>Assigned Work Queue</Text>
      <Text style={styles.sectionTitle}>My Allocated Workgroups</Text>

      <View style={styles.groupGrid}>
        {groups.map((group) => (
          <Pressable
            key={group.key}
            style={styles.groupCard}
            onPress={() => onOpenGroup(group)}
          >
            <View style={styles.groupTopRow}>
              <View style={styles.groupIcon}>
                <MaterialCommunityIcons
                  name={group.icon}
                  size={23}
                  color="#2563eb"
                />
              </View>
              <View style={styles.groupTotalBadge}>
                <Text style={styles.groupTotalText}>{group.total || 0}</Text>
              </View>
            </View>

            <Text style={styles.groupTitle}>{group.title}</Text>
            <Text style={styles.groupSub}>Tap to open allocated TRNs</Text>

            <View style={styles.groupCounts}>
              <MiniCount label="Issued" value={group?.counts?.issued || 0} />
              <MiniCount
                label="Accepted"
                value={group?.counts?.accepted || 0}
              />
              <MiniCount
                label="Progress"
                value={group?.counts?.inProgress || 0}
              />
              <MiniCount
                label="Rejected"
                value={group?.counts?.rejected || 0}
              />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function GroupDetail({
  title,
  stateFilter,
  setStateFilter,
  allGroupItems,
  items,
  deciding,
  onBack,
  onAccept,
  onReject,
  onExecute,
}) {
  return (
    <View style={styles.detailWrap}>
      <View style={styles.detailHeader}>
        <Pressable style={styles.backPill} onPress={onBack}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={20}
            color="#0f172a"
          />
          <Text style={styles.backPillText}>Groups</Text>
        </Pressable>

        <View style={styles.detailTitleWrap}>
          <Text style={styles.sectionEyebrow}>My Allocated Work</Text>
          <Text style={styles.detailTitle}>{title}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {STATE_FILTERS.map((filter) => {
          const active = stateFilter === filter.key;
          const count = stateCount(allGroupItems, filter.key);

          return (
            <Pressable
              key={filter.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {items.length === 0 ? (
          <View style={styles.emptyListCard}>
            <MaterialCommunityIcons
              name="clipboard-check-outline"
              size={35}
              color="#94a3b8"
            />
            <Text style={styles.stateTitle}>No allocated TRNs</Text>
            <Text style={styles.stateText}>
              Change filters or issue work directly to this FWR.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <WorkItemCard
              key={item.id}
              item={item}
              deciding={deciding}
              onAccept={onAccept}
              onReject={onReject}
              onExecute={onExecute}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function WorkItemCard({ item, deciding, onAccept, onReject, onExecute }) {
  return (
    <View style={styles.workCard}>
      <View style={styles.workHeader}>
        <View style={styles.workTypeIcon}>
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={20}
            color="#2563eb"
          />
        </View>

        <View style={styles.workHeaderMain}>
          <Text style={styles.workTitle}>{item.trnTypeLabel}</Text>
          <Text style={styles.workId}>{item.id}</Text>
        </View>

        <View
          style={[styles.stateBadge, getStateBadgeStyle(item.workflowState)]}
        >
          <Text
            style={[
              styles.stateBadgeText,
              getStateBadgeTextStyle(item.workflowState),
            ]}
          >
            {String(item.workflowState || "NAv").replace("_", " ")}
          </Text>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <InfoLine icon="counter" label="Meter No" value={item.meterNo} />
        <InfoLine
          icon="map-marker-outline"
          label="Address"
          value={item.address}
          fullWidth={true}
        />
        <InfoLine icon="home-city-outline" label="ERF No" value={item.erfNo} />
        <InfoLine
          icon="gauge"
          label="Meter Pre-Status"
          value={item.meterPreStatus}
        />
        <InfoLine
          icon="account-hard-hat-outline"
          label="Assigned Target"
          value={item.assignment?.targetText || "NAv"}
        />
        <InfoLine
          icon="account-tie-outline"
          label="Issued By"
          value={item.issuedBy?.name || "NAv"}
        />
        <InfoLine
          icon="clock-outline"
          label="Age"
          value={formatAge(item.ageSeconds)}
        />
      </View>

      {item.acceptedBy ? (
        <View style={styles.acceptedBadgeRow}>
          <MaterialCommunityIcons
            name="check-decagram"
            size={16}
            color="#16a34a"
          />
          <Text style={styles.acceptedBadgeText}>
            Accepted by {item.acceptedBy.name || "NAv"} •{" "}
            {formatDateTime(item.acceptedBy.at)}
          </Text>
        </View>
      ) : null}

      {item.rejectedBy ? (
        <View style={styles.rejectedBox}>
          <Text style={styles.rejectedTitle}>
            Rejected by {item.rejectedBy.name || "NAv"}
          </Text>
          <Text style={styles.rejectedText}>
            {item.rejectedBy.reason || "No reason captured."}
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {item.permissions?.canAccept ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.acceptBtn,
              deciding && styles.actionDisabled,
            ]}
            onPress={() => onAccept(item)}
            disabled={deciding}
          >
            <Text style={styles.acceptBtnText}>ACCEPT</Text>
          </Pressable>
        ) : null}

        {item.permissions?.canReject ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.rejectBtn,
              deciding && styles.actionDisabled,
            ]}
            onPress={() => onReject(item)}
            disabled={deciding}
          >
            <Text style={styles.rejectBtnText}>REJECT</Text>
          </Pressable>
        ) : null}

        {item.permissions?.canExecute ? (
          <Pressable
            style={[styles.actionBtn, styles.executeBtn]}
            onPress={() => onExecute(item)}
          >
            <Text style={styles.executeBtnText}>EXECUTE</Text>
          </Pressable>
        ) : null}

        {!item.permissions?.canAccept &&
        !item.permissions?.canReject &&
        !item.permissions?.canExecute ? (
          <View style={styles.noActionBox}>
            <MaterialCommunityIcons
              name="lock-check-outline"
              size={15}
              color="#64748b"
            />
            <Text style={styles.noActionText}>
              No field action available in this state.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function InfoLine({ icon, label, value, fullWidth = false }) {
  return (
    <View style={[styles.infoLine, fullWidth && styles.infoLineFull]}>
      <MaterialCommunityIcons name={icon} size={15} color="#64748b" />

      <View style={styles.infoLineMain}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "NAv"}</Text>
      </View>
    </View>
  );
}

function MiniCount({ label, value }) {
  return (
    <View style={styles.miniCount}>
      <Text style={styles.miniCountValue}>{value}</Text>
      <Text style={styles.miniCountLabel}>{label}</Text>
    </View>
  );
}

function RejectModal({ visible, item, busy, onClose, onSubmit }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons
                name="close-octagon-outline"
                size={22}
                color="#dc2626"
              />
            </View>

            <View style={styles.modalHeaderMain}>
              <Text style={styles.modalTitle}>Reject Work Item</Text>
              <Text style={styles.modalSub}>{item?.id || "NAv"}</Text>
            </View>

            <Pressable
              style={styles.modalClose}
              onPress={onClose}
              disabled={busy}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
            </Pressable>
          </View>

          <Formik
            initialValues={{ rejectReason: "" }}
            validationSchema={RejectSchema}
            enableReinitialize
            onSubmit={onSubmit}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              isSubmitting,
            }) => (
              <View>
                <Text style={styles.modalLabel}>Reject Reason</Text>
                <TextInput
                  value={values.rejectReason}
                  onChangeText={handleChange("rejectReason")}
                  onBlur={handleBlur("rejectReason")}
                  placeholder="Explain why this work item cannot be accepted"
                  placeholderTextColor="#94a3b8"
                  style={[
                    styles.rejectInput,
                    touched.rejectReason &&
                      errors.rejectReason &&
                      styles.rejectInputError,
                  ]}
                  editable={!busy && !isSubmitting}
                  multiline
                  textAlignVertical="top"
                />

                {touched.rejectReason && errors.rejectReason ? (
                  <Text style={styles.errorText}>{errors.rejectReason}</Text>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={onClose}
                    disabled={busy || isSubmitting}
                  >
                    <Text style={styles.modalCancelText}>CANCEL</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.modalButton,
                      styles.modalRejectButton,
                      (busy || isSubmitting) && styles.actionDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={busy || isSubmitting}
                  >
                    {busy || isSubmitting ? (
                      <ActivityIndicator size="small" color="#7f1d1d" />
                    ) : (
                      <Text style={styles.modalRejectText}>
                        SUBMIT REJECTION
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </Formik>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  headerCard: {
    margin: 12,
    marginBottom: 8,
    backgroundColor: "#0f172a",
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMain: {
    flex: 1,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  headerSub: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  headerCountBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerCountText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900",
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 28,
  },
  sectionEyebrow: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
  },
  groupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  groupCard: {
    width: "48%",
    minHeight: 174,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
  },
  groupTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  groupIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  groupTotalBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  groupTotalText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900",
  },
  groupTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  groupSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 10,
  },
  groupCounts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  miniCount: {
    width: "47%",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 6,
  },
  miniCountValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  miniCountLabel: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 1,
  },
  detailWrap: {
    flex: 1,
  },
  detailHeader: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backPill: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 9,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  backPillText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
  },
  detailTitleWrap: {
    flex: 1,
  },
  detailTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },

  filterRow: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 6,
  },

  filterChip: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  filterChipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },

  filterChipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
  },

  filterChipTextActive: {
    color: "#ffffff",
  },

  filterCountText: {
    minWidth: 18,
    minHeight: 18,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 4,
    paddingTop: 2,
  },

  filterCountTextActive: {
    backgroundColor: "#334155",
    color: "#e2e8f0",
  },

  // filterRow: {
  //   paddingHorizontal: 12,
  //   paddingBottom: 9,
  //   gap: 8,
  // },
  // filterChip: {
  //   height: 34,
  //   borderRadius: 17,
  //   paddingHorizontal: 11,
  //   backgroundColor: "#ffffff",
  //   borderWidth: 1,
  //   borderColor: "#e2e8f0",
  //   flexDirection: "row",
  //   alignItems: "center",
  //   gap: 6,
  // },
  // filterChipActive: {
  //   backgroundColor: "#0f172a",
  //   borderColor: "#0f172a",
  // },
  // filterChipText: {
  //   color: "#475569",
  //   fontSize: 11,
  //   fontWeight: "900",
  // },
  // filterChipTextActive: {
  //   color: "#ffffff",
  // },
  // filterCountText: {
  //   color: "#94a3b8",
  //   fontSize: 10,
  //   fontWeight: "900",
  // },
  // filterCountTextActive: {
  //   color: "#cbd5e1",
  // },
  workCard: {
    backgroundColor: "#ffffff",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 10,
  },
  workHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 11,
  },
  workTypeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  workHeaderMain: {
    flex: 1,
  },
  workTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  workId: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  stateBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stateBadgeText: {
    fontSize: 8,
    fontWeight: "900",
  },
  badgeBlue: { backgroundColor: "#dbeafe" },
  badgeBlueText: { color: "#1d4ed8" },
  badgeGreen: { backgroundColor: "#dcfce7" },
  badgeGreenText: { color: "#166534" },
  badgeOrange: { backgroundColor: "#ffedd5" },
  badgeOrangeText: { color: "#c2410c" },
  badgeRed: { backgroundColor: "#fee2e2" },
  badgeRedText: { color: "#991b1b" },
  badgeMuted: { backgroundColor: "#f1f5f9" },
  badgeMutedText: { color: "#475569" },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  infoLine: {
    width: "48%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },

  infoLineFull: {
    width: "100%",
  },
  infoLineMain: {
    flex: 1,
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 1,
    lineHeight: 16,
  },
  acceptedBadgeRow: {
    marginTop: 10,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  acceptedBadgeText: {
    flex: 1,
    color: "#166534",
    fontSize: 11,
    fontWeight: "800",
  },
  rejectedBox: {
    marginTop: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 8,
  },
  rejectedTitle: {
    color: "#991b1b",
    fontSize: 11,
    fontWeight: "900",
  },
  rejectedText: {
    color: "#7f1d1d",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
    lineHeight: 15,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtn: {
    backgroundColor: "#86efac",
  },
  acceptBtnText: {
    color: "#14532d",
    fontSize: 11,
    fontWeight: "900",
  },
  rejectBtn: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  rejectBtnText: {
    color: "#991b1b",
    fontSize: 11,
    fontWeight: "900",
  },
  executeBtn: {
    backgroundColor: "#0f172a",
  },
  executeBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  actionDisabled: {
    opacity: 0.55,
  },
  noActionBox: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  noActionText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    gap: 8,
  },
  stateTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  stateText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
  },
  emptyListCard: {
    minHeight: 220,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 7,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.48)",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 56,
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  modalIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderMain: {
    flex: 1,
  },
  modalTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },
  modalSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalLabel: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
  },
  rejectInput: {
    minHeight: 104,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "700",
  },
  rejectInputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modalButton: {
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButton: {
    flex: 0.75,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  modalRejectButton: {
    flex: 1.4,
    backgroundColor: "#fecaca",
  },
  modalCancelText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
  },
  modalRejectText: {
    color: "#7f1d1d",
    fontSize: 12,
    fontWeight: "900",
  },
});
