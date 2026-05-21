import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useGeo } from "../../../../../src/context/GeoContext";
import { useWarehouse } from "../../../../../src/context/WarehouseContext";

const WMS_LCT_TYPES = [
  "METER_INSPECTION",
  "METER_DISCONNECTION",
  "METER_RECONNECTION",
  "METER_REMOVAL",
  "METER_READING",
];

const DATE_FILTERS = [
  { key: "TODAY", label: "Today" },
  { key: "YESTERDAY", label: "Yesterday" },
  { key: "THIS_WEEK", label: "This Week" },
  { key: "ALL", label: "All" },
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

function isOpenState(state) {
  return ["ISSUED", "ACCEPTED"].includes(normalizeUpper(state));
}

function getExecutionOutcome(trn = {}) {
  return normalizeUpper(
    trn?.executionOutcome?.code ||
      trn?.executionOutcome?.outcome ||
      trn?.outcome?.code ||
      trn?.outcome ||
      "NAv",
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

function isSuccessOutcome(outcome) {
  return ["SUCCESS", "SUCCESSFUL"].includes(normalizeUpper(outcome));
}

function getAssignmentTargets(trn = {}) {
  const targets = Array.isArray(trn?.assignment?.targets)
    ? trn.assignment.targets
    : [];

  return targets
    .map((target) => ({
      type: normalizeUpper(target?.type),
      id: cleanText(target?.id, ""),
      name: cleanText(target?.name || target?.title || target?.id),
      role: cleanText(target?.role || target?.employment?.role, "Field User"),
    }))
    .filter((target) => target.id || target.name !== "NAv");
}

function getTeamText(trn = {}) {
  const teamTargets = getAssignmentTargets(trn).filter(
    (target) => target.type === "TEAM",
  );

  if (teamTargets.length) {
    return teamTargets.map((target) => target.name).join(" • ");
  }

  return cleanText(
    trn?.assignment?.team?.name ||
      trn?.team?.name ||
      trn?.assignment?.assignedTeam?.name,
  );
}

function getServiceProviderName(trn = {}) {
  return cleanText(
    trn?.serviceProvider?.name ||
      trn?.assignment?.serviceProvider?.name ||
      trn?.metadata?.serviceProvider?.name,
  );
}

function getIssuer(trn = {}) {
  return {
    uid: cleanText(
      trn?.metadata?.createdByUid ||
        trn?.assignment?.issuedByUid ||
        trn?.origin?.createdByUid,
      "",
    ),
    name: cleanText(
      trn?.metadata?.createdByUser ||
        trn?.assignment?.issuedByUser ||
        trn?.origin?.createdByUser,
    ),
    role: cleanText(
      trn?.metadata?.createdByRole ||
        trn?.assignment?.issuedByRole ||
        trn?.origin?.createdByRole,
      "Originator",
    ),
  };
}

function getAcceptedRejectedActor(trn = {}) {
  return {
    uid: cleanText(trn?.assignment?.acceptedRejectedUid, ""),
    name: cleanText(trn?.assignment?.acceptedRejectedUser),
    role: cleanText(
      trn?.assignment?.acceptedRejectedRole ||
        trn?.assignment?.acceptedRejectedByRole,
      "Field User",
    ),
  };
}

function getCompletedActor(trn = {}) {
  return {
    uid: cleanText(
      trn?.workflow?.completedByUid || trn?.execution?.completedByUid,
      "",
    ),
    name: cleanText(
      trn?.workflow?.completedByUser || trn?.execution?.completedByUser,
    ),
    role: cleanText(
      trn?.workflow?.completedByRole || trn?.execution?.completedByRole,
      "Field User",
    ),
  };
}

function getFieldOriginator(trn = {}) {
  return {
    uid: cleanText(
      trn?.metadata?.createdByUid ||
        trn?.origin?.createdByUid ||
        trn?.assignment?.issuedByUid,
      "",
    ),
    name: cleanText(
      trn?.metadata?.createdByUser ||
        trn?.origin?.createdByUser ||
        trn?.assignment?.issuedByUser,
    ),
    role: cleanText(
      trn?.metadata?.createdByRole ||
        trn?.origin?.createdByRole ||
        trn?.assignment?.issuedByRole,
      "Field User",
    ),
  };
}

function getUserKey(actor = {}) {
  const uid = String(actor?.uid || "").trim();
  if (uid) return `UID:${uid}`;

  const name = String(actor?.name || "").trim();
  if (name && name !== "NAv") return `NAME:${name.toUpperCase()}`;

  return "";
}

function createEmptyUserRow(actor = {}) {
  return {
    key: getUserKey(actor),
    uid: cleanText(actor?.uid, ""),
    name: cleanText(actor?.name),
    role: cleanText(actor?.role, "NAv"),
    team: cleanText(actor?.team, "NAv"),
    serviceProvider: cleanText(actor?.serviceProvider, "NAv"),

    issued: 0,
    assigned: 0,
    waiting: 0,
    accepted: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0,
    success: 0,
    noAccess: 0,
    noReading: 0,

    oldestOpenAt: null,
    oldestOpenTrnId: "",
    lastActivityAt: null,

    trnIds: new Set(),
    officeOriginTrnIds: new Set(),
    fieldOriginTrnIds: new Set(),
    issuedTrnIds: new Set(),
    assignedTrnIds: new Set(),
    waitingTrnIds: new Set(),
    acceptedTrnIds: new Set(),
    rejectedTrnIds: new Set(),
    completedTrnIds: new Set(),
    cancelledTrnIds: new Set(),
    successTrnIds: new Set(),
    noAccessTrnIds: new Set(),
    noReadingTrnIds: new Set(),
  };
}

function mergeUserIdentity(row, actor = {}) {
  if (row.name === "NAv" && actor.name) row.name = cleanText(actor.name);
  if (row.role === "NAv" && actor.role) row.role = cleanText(actor.role);
  if (row.team === "NAv" && actor.team) row.team = cleanText(actor.team);
  if (row.serviceProvider === "NAv" && actor.serviceProvider) {
    row.serviceProvider = cleanText(actor.serviceProvider);
  }
}

function touchUserRow(rowsByUser, actor = {}) {
  const key = getUserKey(actor);
  if (!key) return null;

  if (!rowsByUser[key]) {
    rowsByUser[key] = createEmptyUserRow(actor);
  }

  mergeUserIdentity(rowsByUser[key], actor);

  return rowsByUser[key];
}

function updateLastActivity(row, value) {
  const millis = toMillis(value);
  if (!millis) return;

  const current = toMillis(row.lastActivityAt);
  if (!current || millis > current) {
    row.lastActivityAt = value;
  }
}

function updateOldestOpen(row, trn = {}) {
  const state = getWorkflowState(trn);
  if (!isOpenState(state)) return;

  const startAt =
    state === "ACCEPTED"
      ? trn?.assignment?.acceptedRejectedAt || getUpdatedAt(trn)
      : getCreatedAt(trn);

  const startMillis = toMillis(startAt);
  if (!startMillis) return;

  const currentOldestMillis = toMillis(row.oldestOpenAt);

  if (!currentOldestMillis || startMillis < currentOldestMillis) {
    row.oldestOpenAt = startAt;
    row.oldestOpenTrnId = trn?.id || "NAv";
  }
}

function addTrnToRow(row, trn = {}) {
  if (!row) return;

  const trnId = trn?.id || "NAv";
  const alreadyAddedToRow = row.trnIds.has(trnId);

  row.trnIds.add(trnId);

  if (!alreadyAddedToRow) {
    const originChannel = getOriginChannel(trn);

    if (originChannel === "FIELD") {
      row.fieldOriginTrnIds.add(trnId);
    } else {
      row.officeOriginTrnIds.add(trnId);
    }
  }

  updateLastActivity(row, getUpdatedAt(trn));
  updateOldestOpen(row, trn);
}

function incrementSetCounter(row, setName, counterName, trn = {}) {
  const trnId = trn?.id || "NAv";
  if (row[setName].has(trnId)) return;

  row[setName].add(trnId);
  row[counterName] += 1;
}

function incrementWorkflowAndOutcomeCounters(row, trn = {}) {
  const state = getWorkflowState(trn);
  const outcome = getExecutionOutcome(trn);

  if (state === "ISSUED") {
    incrementSetCounter(row, "waitingTrnIds", "waiting", trn);
  }

  if (state === "ACCEPTED") {
    incrementSetCounter(row, "acceptedTrnIds", "accepted", trn);
  }

  if (state === "REJECTED") {
    incrementSetCounter(row, "rejectedTrnIds", "rejected", trn);
  }

  if (state === "COMPLETED") {
    incrementSetCounter(row, "completedTrnIds", "completed", trn);
  }

  if (state === "CANCELLED") {
    incrementSetCounter(row, "cancelledTrnIds", "cancelled", trn);
  }

  if (isSuccessOutcome(outcome)) {
    incrementSetCounter(row, "successTrnIds", "success", trn);
  }

  if (outcome === "NO_ACCESS") {
    incrementSetCounter(row, "noAccessTrnIds", "noAccess", trn);
  }

  if (outcome === "NO_READING") {
    incrementSetCounter(row, "noReadingTrnIds", "noReading", trn);
  }
}

function buildUserActivityRows(items = []) {
  const rowsByUser = {};

  items.forEach((trn) => {
    const state = getWorkflowState(trn);
    const outcome = getExecutionOutcome(trn);
    const team = getTeamText(trn);
    const serviceProvider = getServiceProviderName(trn);

    // 2. Assigned USER target rows.
    const userTargets = getAssignmentTargets(trn).filter(
      (target) => target.type === "USER",
    );

    userTargets.forEach((target) => {
      const targetRow = touchUserRow(rowsByUser, {
        uid: target.id,
        name: target.name,
        role: target.role,
        team,
        serviceProvider,
      });

      if (!targetRow) return;

      incrementSetCounter(targetRow, "assignedTrnIds", "assigned", trn);
      incrementWorkflowAndOutcomeCounters(targetRow, trn);

      addTrnToRow(targetRow, trn);
    });

    // 3. Accepted/rejected actor row.
    // This catches acceptance/rejection when the USER target was not stamped.
    const decisionActor = getAcceptedRejectedActor(trn);
    const hasDecisionActor = getUserKey(decisionActor);

    if (hasDecisionActor && ["ACCEPTED", "REJECTED"].includes(state)) {
      const decisionRow = touchUserRow(rowsByUser, {
        ...decisionActor,
        team,
        serviceProvider,
      });

      if (decisionRow) {
        incrementSetCounter(decisionRow, "assignedTrnIds", "assigned", trn);
        incrementWorkflowAndOutcomeCounters(decisionRow, trn);
        addTrnToRow(decisionRow, trn);
      }
    }

    // 4. Completed actor row.
    const completedActor = getCompletedActor(trn);
    const hasCompletedActor = getUserKey(completedActor);

    if (hasCompletedActor && state === "COMPLETED") {
      const completedRow = touchUserRow(rowsByUser, {
        ...completedActor,
        team,
        serviceProvider,
      });

      if (completedRow) {
        incrementSetCounter(completedRow, "assignedTrnIds", "assigned", trn);
        incrementWorkflowAndOutcomeCounters(completedRow, trn);
        addTrnToRow(completedRow, trn);
      }
    }

    // Field-originated work must still show under the field user,
    // even when the TRN did not carry a USER target.
    if (getOriginChannel(trn) === "FIELD") {
      const fieldActor = getFieldOriginator(trn);
      const hasFieldActor = getUserKey(fieldActor);

      if (hasFieldActor) {
        const fieldRow = touchUserRow(rowsByUser, {
          ...fieldActor,
          team,
          serviceProvider,
        });

        if (fieldRow) {
          incrementSetCounter(fieldRow, "assignedTrnIds", "assigned", trn);
          incrementWorkflowAndOutcomeCounters(fieldRow, trn);
          addTrnToRow(fieldRow, trn);
        }
      }
    }
  });

  return Object.values(rowsByUser)
    .map((row) => ({
      ...row,
      total: row.trnIds.size,
      officeOriginated: row.officeOriginTrnIds.size,
      fieldOriginated: row.fieldOriginTrnIds.size,

      trnIds: undefined,
      officeOriginTrnIds: undefined,
      fieldOriginTrnIds: undefined,
      issuedTrnIds: undefined,
      assignedTrnIds: undefined,
      waitingTrnIds: undefined,
      acceptedTrnIds: undefined,
      rejectedTrnIds: undefined,
      completedTrnIds: undefined,
      cancelledTrnIds: undefined,
      successTrnIds: undefined,
      noAccessTrnIds: undefined,
      noReadingTrnIds: undefined,
    }))
    .sort((a, b) => {
      const bActive = b.waiting + b.accepted + b.rejected;
      const aActive = a.waiting + a.accepted + a.rejected;

      if (bActive !== aActive) return bActive - aActive;
      return toMillis(b.lastActivityAt) - toMillis(a.lastActivityAt);
    });
}

export default function UserActivityScreen() {
  const { geoState } = useGeo();
  const { all, sync, loading } = useWarehouse();

  const [dateFilter, setDateFilter] = useState("TODAY");

  const selectedLm = geoState?.selectedLm || null;
  const selectedWard = geoState?.selectedWard || null;

  const lmPcode = sync?.scope?.lmPcode || selectedLm?.pcode || selectedLm?.id;
  const wardPcode =
    sync?.scope?.wardPcode || selectedWard?.pcode || selectedWard?.id;

  const scopeReady = Boolean(lmPcode && wardPcode);

  const wmsItems = useMemo(() => {
    const trns = Array.isArray(all?.trns) ? all.trns : [];

    return trns
      .filter((trn) => WMS_LCT_TYPES.includes(getTrnType(trn)))
      .filter((trn) => isInDateFilter(trn, dateFilter));
  }, [all?.trns, dateFilter]);

  const userRows = useMemo(() => buildUserActivityRows(wmsItems), [wmsItems]);

  const wardLabel =
    selectedWard?.name ||
    selectedWard?.label ||
    selectedWard?.code ||
    wardPcode ||
    "No Ward";

  const lmLabel = selectedLm?.name || selectedLm?.label || lmPcode || "No LM";

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="account-outline"
              size={28}
              color="#ffffff"
            />
          </View>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>User Activity</Text>
            <Text style={styles.headerSubtitle}>
              {wardLabel} • {lmLabel}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <View style={styles.headerCountBadge}>
              <Text style={styles.headerCountText}>{userRows.length}</Text>
            </View>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {DATE_FILTERS.map((filter) => {
            const active = dateFilter === filter.key;

            return (
              <Pressable
                key={filter.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setDateFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!scopeReady ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="map-marker-radius-outline"
              size={42}
              color="#94a3b8"
            />
            <Text style={styles.emptyTitle}>Select a ward</Text>
            <Text style={styles.emptyText}>
              User Activity is ward-scoped. Select an active ward before viewing
              WMS user activity.
            </Text>
          </View>
        ) : userRows.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="account-search-outline"
              size={42}
              color="#94a3b8"
            />
            <Text style={styles.emptyTitle}>No user activity</Text>
            <Text style={styles.emptyText}>
              No WMS user activity was found for this ward and date filter.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Ward User Activity</Text>

            {userRows.map((row) => (
              <UserActivityCard key={row.key} row={row} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UserOriginSplitBadge({ row }) {
  return (
    <View style={styles.originSplitBadge}>
      <View style={styles.originSplitCol}>
        <Text style={styles.originSplitLabel}>Office</Text>
        <Text style={styles.originSplitValue}>
          {row?.officeOriginated || 0}
        </Text>
      </View>

      <View style={styles.originSplitDivider} />

      <View style={styles.originSplitCol}>
        <Text style={styles.originSplitLabel}>Field</Text>
        <Text style={styles.originSplitValue}>{row?.fieldOriginated || 0}</Text>
      </View>
    </View>
  );
}

function UserActivityCard({ row }) {
  const [termsVisible, setTermsVisible] = useState(false);

  return (
    <View style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.avatarCircle}>
          <MaterialCommunityIcons
            name="account-hard-hat-outline"
            size={22}
            color="#1d4ed8"
          />
        </View>

        <View style={styles.userMain}>
          <Text style={styles.userName}>{row.name}</Text>
          <Text style={styles.userMeta} numberOfLines={1}>
            {row.role}
          </Text>
        </View>

        <UserOriginSplitBadge row={row} />
      </View>

      <View style={styles.groupedStats}>
        <UserStatSection title="Assigned Workload">
          <UserStatTile label="Assigned Total" value={row.total} wide />
        </UserStatSection>

        <UserStatSection title="Workflow State">
          <UserStatTile label="Awaiting" value={row.waiting} />
          <UserStatTile label="Accepted" value={row.accepted} />
          <UserStatTile label="Rejected" value={row.rejected} />
          <UserStatTile label="Completed" value={row.completed} />
          <UserStatTile label="Cancelled" value={row.cancelled} />
        </UserStatSection>

        <UserStatSection title="Execution Outcome">
          <UserStatTile label="Success" value={row.success} />
          <UserStatTile label="No Access" value={row.noAccess} />
          <UserStatTile label="No Reading" value={row.noReading} />
        </UserStatSection>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.footerItem}>
          <MaterialCommunityIcons
            name="clock-alert-outline"
            size={15}
            color="#64748b"
          />
          <Text style={styles.footerText}>
            Oldest open:{" "}
            {row.oldestOpenAt
              ? `${getAgeLabel(row.oldestOpenAt)} • ${row.oldestOpenTrnId}`
              : "NAv"}
          </Text>
        </View>

        <View style={styles.footerItem}>
          <MaterialCommunityIcons name="history" size={15} color="#64748b" />
          <Text style={styles.footerText}>
            Last activity: {formatDateTime(row.lastActivityAt)}
          </Text>
        </View>
      </View>

      <View style={styles.helpRow}>
        <Pressable
          style={styles.helpButton}
          onPress={() => setTermsVisible(true)}
        >
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={16}
            color="#1d4ed8"
          />
          <Text style={styles.helpButtonText}>Terms</Text>
        </Pressable>
      </View>

      <UserActivityTermsModal
        visible={termsVisible}
        onClose={() => setTermsVisible(false)}
      />
    </View>
  );
}

function UserStatSection({ title, children }) {
  return (
    <View style={styles.userStatSection}>
      <Text style={styles.userStatSectionTitle}>{title}</Text>
      <View style={styles.userStatSectionGrid}>{children}</View>
    </View>
  );
}

function UserStatTile({ label, value, wide = false }) {
  return (
    <View style={[styles.userStatTile, wide && styles.userStatTileWide]}>
      <Text style={styles.userStatValue}>{value || 0}</Text>
      <Text style={styles.userStatLabel}>{label}</Text>
    </View>
  );
}

function TermSection({ title, children }) {
  return (
    <View style={styles.termSection}>
      <Text style={styles.termSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TermItem({ title, children }) {
  return (
    <View style={styles.termItem}>
      <Text style={styles.termTitle}>{title}</Text>
      <Text style={styles.termText}>{children}</Text>
    </View>
  );
}

function UserActivityTermsModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.termsModalCard}>
          <View style={styles.termsHeader}>
            <View>
              <Text style={styles.termsTitle}>User Activity Terms</Text>
              <Text style={styles.termsSubtitle}>
                Selected ward and date filter
              </Text>
            </View>

            <Pressable style={styles.termsCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color="#0f172a" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.termsScroll}
            contentContainerStyle={styles.termsContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.termsIntro}>
              The numbers on this card are based on the selected ward and date
              filter. The date filter is based on when the TRN was created /
              issued.
            </Text>

            <TermSection title="Date Filters">
              <TermItem title="Today">
                All TRNs created today from 00H00 up to the current time.
              </TermItem>
              <TermItem title="Yesterday">
                All TRNs created yesterday from 00H00 to 23H59.
              </TermItem>
              <TermItem title="This Week">
                All TRNs created from Monday 00H00 up to the current time.
              </TermItem>
              <TermItem title="All">
                All matching WMS TRNs in the selected ward, regardless of
                created date.
              </TermItem>
            </TermSection>

            <TermSection title="Work Source">
              <TermItem title="Office">
                Work that was created from the office WMS flow by a manager or
                Main Contractor (MNC) supervisor and assigned to a field user.
              </TermItem>
              <TermItem title="Field">
                Work that was created directly in the field by the field user,
                for example a field-originated meter reading.
              </TermItem>
              <TermItem title="Assigned Total">
                The total number of TRNs counted for this user in the selected
                ward/date filter. Assigned Total = Awaiting + Accepted +
                Rejected + Completed + Cancelled.
              </TermItem>
            </TermSection>

            <TermSection title="Workflow State">
              <TermItem title="Awaiting">
                Work assigned to the user, but the user has not accepted or
                rejected it yet. The TRN is still in ISSUED state.
              </TermItem>
              <TermItem title="Accepted">
                Work accepted by the user, but not yet completed.
              </TermItem>
              <TermItem title="Rejected">
                Work rejected by the user. It requires manager action such as
                reassignment or cancellation.
              </TermItem>
              <TermItem title="Completed">
                Work submitted and completed by the user.
              </TermItem>
              <TermItem title="Cancelled">
                Work cancelled by a manager before completion.
              </TermItem>
            </TermSection>

            <TermSection title="Execution Outcome">
              <TermItem title="Success">
                Work completed successfully according to the rules of that TRN
                type.
              </TermItem>
              <TermItem title="No Access">
                The user could not physically access or touch the meter with
                their hands. The meter may still be visible or readable, but if
                the user cannot physically access it for proper inspection or
                work, it is No Access.
              </TermItem>
              <TermItem title="No Reading">
                The user had access to the meter area but could not capture a
                valid meter reading.
              </TermItem>
            </TermSection>

            <View style={styles.importantBox}>
              <Text style={styles.importantTitle}>Important</Text>
              <Text style={styles.importantText}>
                Workflow State explains where the work currently is. Execution
                Outcome explains what happened during field execution.
              </Text>
            </View>
          </ScrollView>
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

  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },

  headerCard: {
    backgroundColor: "#0f172a",
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#1d4ed8",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  headerSubtitle: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
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
    fontSize: 15,
    fontWeight: "900",
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
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  filterChipActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },

  filterChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },

  filterChipTextActive: {
    color: "#ffffff",
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
    marginTop: 20,
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

  userCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 12,
  },

  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },

  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  userMain: {
    flex: 1,
    minWidth: 0,
  },

  userName: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
  },

  userMeta: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  totalBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  totalBadgeText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  footerRow: {
    marginTop: 12,
    gap: 6,
  },

  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  footerText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },

  groupedStats: {
    gap: 10,
  },

  userStatSection: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
  },

  userStatSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },

  userStatSectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  userStatTile: {
    width: "30.9%",
    backgroundColor: "#ffffff",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },

  userStatTileWide: {
    width: "100%",
    alignItems: "flex-start",
    paddingHorizontal: 12,
  },

  userStatValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },

  userStatLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    marginTop: 2,
    textAlign: "center",
  },

  helpRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  helpButtonText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },

  termsModalCard: {
    width: "100%",
    maxHeight: "84%",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },

  termsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  termsTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },

  termsSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },

  termsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  termsScroll: {
    maxHeight: 560,
  },

  termsContent: {
    padding: 16,
    paddingBottom: 22,
  },

  termsIntro: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    lineHeight: 18,
    marginBottom: 14,
  },

  termSection: {
    marginBottom: 16,
  },

  termSectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  termItem: {
    marginBottom: 10,
  },

  termTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  termText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    lineHeight: 16,
  },

  importantBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 12,
  },

  importantTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  importantText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    lineHeight: 16,
  },

  originSplitBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    overflow: "hidden",
  },

  originSplitCol: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
  },

  originSplitLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },

  originSplitValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  originSplitDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#bfdbfe",
  },
});
