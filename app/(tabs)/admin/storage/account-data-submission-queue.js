import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "react-native-paper";

import { useAuth } from "../../../../src/hooks/useAuth";
import {
  clearAccountDataSubmissionQueue,
  getAccountDataDrafts,
  getAccountDataSubmissionQueue,
  removeAccountDataDraftByPremiseId,
  removeAccountDataQueueItem,
} from "../../../../src/utils/accountDataSubmissionQueue";

function toMillis(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function formatDate(value) {
  if (!value || value === "NAv") return "NAv";

  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return "NAv";
  }
}

function readAccountCount(payload = {}) {
  return Array.isArray(payload?.accounts) ? payload.accounts.length : 0;
}

function readMediaCount(payload = {}) {
  return Array.isArray(payload?.media) ? payload.media.length : 0;
}

function readOwnerLabel(payload = {}) {
  const owner = payload?.owner || {};

  if (owner?.ownerType === "JURISTIC_PERSON") {
    return (
      owner?.juristicPerson?.registeredName ||
      owner?.juristicPerson?.tradingName ||
      "NAv"
    );
  }

  const fullName = [
    owner?.naturalPerson?.name,
    owner?.naturalPerson?.surname,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");

  return fullName || "NAv";
}

function StatusBadge({ label, color }) {
  return (
    <View style={[styles.statusBadge, { backgroundColor: color || "#0f172a" }]}>
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

function SmallActionButton({ icon, label, color, disabled, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.smallBtn,
        {
          backgroundColor: color || "#0f172a",
          opacity: disabled ? 0.55 : 1,
        },
      ]}
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon} size={16} color="#ffffff" />
      <Text style={styles.smallBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function AccountDataQueueCard({ item, busy, onOpen, onRemove }) {
  const payload = item?.payload || {};
  const context = item?.context || {};
  const metadata = item?.metadata || {};
  const result = item?.result || {};
  const status = String(item?.status || "PENDING").toUpperCase();

  const statusColor =
    status === "SUCCESS"
      ? "#16a34a"
      : status === "FAILED"
        ? "#dc2626"
        : status === "SYNCING"
          ? "#2563eb"
          : "#0f172a";

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {context?.erfNo && context.erfNo !== "NAv"
              ? `ERF ${context.erfNo}`
              : "Account Data Capture"}
          </Text>
          <Text style={styles.itemSubtitle} numberOfLines={1}>
            {context?.premiseId || payload?.premiseId || "NAv"}
          </Text>
        </View>

        <StatusBadge label={status} color={statusColor} />
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailPill}>
          <Text style={styles.detailLabel}>Accounts</Text>
          <Text style={styles.detailValue}>{readAccountCount(payload)}</Text>
        </View>
        <View style={styles.detailPill}>
          <Text style={styles.detailLabel}>Media</Text>
          <Text style={styles.detailValue}>{readMediaCount(payload)}</Text>
        </View>
        <View style={styles.detailPill}>
          <Text style={styles.detailLabel}>Ward</Text>
          <Text style={styles.detailValue}>{context?.wardPcode || "NAv"}</Text>
        </View>
      </View>

      <Text style={styles.label}>Owner</Text>
      <Text style={styles.value}>{readOwnerLabel(payload)}</Text>

      <Text style={styles.label}>Saved</Text>
      <Text style={styles.value}>{formatDate(metadata?.createdAt)}</Text>

      {result?.message && result.message !== "NAv" ? (
        <>
          <Text style={styles.label}>Last Result</Text>
          <Text style={styles.value}>{result.message}</Text>
        </>
      ) : null}

      <View style={styles.itemActionsRow}>
        <SmallActionButton
          icon="folder-open-outline"
          label="Open Form"
          color="#2563eb"
          disabled={busy}
          onPress={() => onOpen?.(context?.premiseId || payload?.premiseId)}
        />
        <SmallActionButton
          icon="cloud-sync-outline"
          label="Backend Later"
          color="#94a3b8"
          disabled={true}
        />
        <SmallActionButton
          icon="delete-outline"
          label="Remove"
          color="#dc2626"
          disabled={busy}
          onPress={() => onRemove?.(item)}
        />
      </View>
    </View>
  );
}

function AccountDataDraftCard({ draft, busy, onOpen, onRemove }) {
  const values = draft?.values || {};
  const context = draft?.context || {};
  const metadata = draft?.metadata || {};
  const premiseId = draft?.premiseId || context?.premiseId || "NAv";

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            Saved Draft
          </Text>
          <Text style={styles.itemSubtitle} numberOfLines={1}>
            {premiseId}
          </Text>
        </View>

        <StatusBadge label="DRAFT" color="#7c3aed" />
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailPill}>
          <Text style={styles.detailLabel}>Accounts</Text>
          <Text style={styles.detailValue}>{readAccountCount(values)}</Text>
        </View>
        <View style={styles.detailPill}>
          <Text style={styles.detailLabel}>Media</Text>
          <Text style={styles.detailValue}>{readMediaCount(values)}</Text>
        </View>
        <View style={styles.detailPill}>
          <Text style={styles.detailLabel}>Ward</Text>
          <Text style={styles.detailValue}>{context?.wardPcode || "NAv"}</Text>
        </View>
      </View>

      <Text style={styles.label}>Owner</Text>
      <Text style={styles.value}>{readOwnerLabel(values)}</Text>

      <Text style={styles.label}>Last Saved</Text>
      <Text style={styles.value}>{formatDate(metadata?.savedAt)}</Text>

      <View style={styles.itemActionsRow}>
        <SmallActionButton
          icon="folder-open-outline"
          label="Open Draft"
          color="#2563eb"
          disabled={busy}
          onPress={() => onOpen?.(premiseId)}
        />
        <SmallActionButton
          icon="delete-outline"
          label="Remove"
          color="#dc2626"
          disabled={busy}
          onPress={() => onRemove?.(draft)}
        />
      </View>
    </View>
  );
}

export default function AccountDataSubmissionQueueScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [queueItems, setQueueItems] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const agentUid = user?.uid || "SYSTEM";
  const agentName = profile?.profile?.displayName || "SYSTEM";

  const queueCounts = useMemo(
    () => ({
      queued: queueItems.length,
      drafts: draftItems.length,
      total: queueItems.length + draftItems.length,
    }),
    [queueItems.length, draftItems.length],
  );

  const loadStorage = useCallback(async () => {
    try {
      const queue = await getAccountDataSubmissionQueue();
      const draftsObject = await getAccountDataDrafts();

      const sortedQueue = (Array.isArray(queue) ? queue : []).sort(
        (a, b) =>
          toMillis(b?.metadata?.updatedAt || b?.metadata?.createdAt) -
          toMillis(a?.metadata?.updatedAt || a?.metadata?.createdAt),
      );

      const sortedDrafts = Object.values(draftsObject || {}).sort(
        (a, b) =>
          toMillis(b?.metadata?.updatedAt || b?.metadata?.savedAt) -
          toMillis(a?.metadata?.updatedAt || a?.metadata?.savedAt),
      );

      setQueueItems(sortedQueue);
      setDraftItems(sortedDrafts);
    } catch (error) {
      console.log("AccountDataSubmissionQueueScreen -- loadStorage error", error);
      ToastAndroid.show("Failed to load account data storage", ToastAndroid.LONG);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStorage();
    }, [loadStorage]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStorage();
    setRefreshing(false);
  }, [loadStorage]);

  const handleOpenForm = useCallback(
    (premiseId) => {
      if (!premiseId || premiseId === "NAv") {
        Alert.alert("Missing Premise", "This local item does not have a premise id.");
        return;
      }

      router.push({
        pathname: "/(tabs)/premises/formAccountData",
        params: { premiseId },
      });
    },
    [router],
  );

  const handleRemoveQueueItem = useCallback(
    (item) => {
      if (!item?.id) return;

      Alert.alert("Remove Queue Item", "Remove this account data queue item?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            await removeAccountDataQueueItem(item.id);
            await loadStorage();
            setBusy(false);
          },
        },
      ]);
    },
    [loadStorage],
  );

  const handleRemoveDraft = useCallback(
    (draft) => {
      const premiseId = draft?.premiseId || draft?.context?.premiseId || "";
      if (!premiseId) return;

      Alert.alert("Remove Draft", "Remove this account data draft?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            await removeAccountDataDraftByPremiseId(premiseId);
            await loadStorage();
            setBusy(false);
          },
        },
      ]);
    },
    [loadStorage],
  );

  const handleClearQueue = useCallback(() => {
    Alert.alert(
      "Clear Account Data Queue",
      "This removes all submitted account data queue items from this device. Drafts are not removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Queue",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            await clearAccountDataSubmissionQueue();
            await loadStorage();
            setBusy(false);
          },
        },
      ],
    );
  }, [loadStorage]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Account Data Queue",
          headerTitleStyle: { fontSize: 16, fontWeight: "900" },
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconWrap}>
              <MaterialCommunityIcons
                name="account-cash-outline"
                size={24}
                color="#0f172a"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Account Data Local Storage</Text>
              <Text style={styles.headerSub}>
                Data Cleansing drafts and submitted local queue items.
              </Text>
            </View>
          </View>

          <View style={styles.countStrip}>
            <View style={styles.countStat}>
              <Text style={styles.countLabel}>Queue</Text>
              <Text style={styles.countValue}>{queueCounts.queued}</Text>
            </View>
            <View style={styles.countDivider} />
            <View style={styles.countStat}>
              <Text style={styles.countLabel}>Drafts</Text>
              <Text style={styles.countValue}>{queueCounts.drafts}</Text>
            </View>
            <View style={styles.countDivider} />
            <View style={styles.countStat}>
              <Text style={styles.countLabel}>Total</Text>
              <Text style={styles.countValue}>{queueCounts.total}</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <SmallActionButton
              icon="refresh"
              label="Refresh"
              color="#0f172a"
              disabled={busy}
              onPress={handleRefresh}
            />
            <SmallActionButton
              icon="delete-sweep-outline"
              label="Clear Queue"
              color="#dc2626"
              disabled={busy || queueItems.length === 0}
              onPress={handleClearQueue}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Submitted Queue Items</Text>
        {queueItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="tray-remove"
              size={24}
              color="#cbd5e1"
            />
            <Text style={styles.emptyText}>No account data queue items.</Text>
          </View>
        ) : (
          queueItems.map((item) => (
            <AccountDataQueueCard
              key={item.id}
              item={item}
              busy={busy}
              onOpen={handleOpenForm}
              onRemove={handleRemoveQueueItem}
            />
          ))
        )}

        <Text style={styles.sectionTitle}>Saved Drafts</Text>
        {draftItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={24}
              color="#cbd5e1"
            />
            <Text style={styles.emptyText}>No account data drafts.</Text>
          </View>
        ) : (
          draftItems.map((draft) => (
            <AccountDataDraftCard
              key={draft.id || draft.premiseId}
              draft={draft}
              busy={busy}
              onOpen={handleOpenForm}
              onRemove={handleRemoveDraft}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  content: {
    padding: 12,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },
  headerSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 18,
  },
  countStrip: {
    flexDirection: "row",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 10,
    marginBottom: 12,
  },
  countStat: {
    flex: 1,
    alignItems: "center",
  },
  countDivider: {
    width: 1,
    backgroundColor: "#e2e8f0",
  },
  countLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
  },
  countValue: {
    marginTop: 4,
    fontSize: 19,
    fontWeight: "900",
    color: "#0f172a",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#475569",
    marginBottom: 8,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  itemSubtitle: {
    marginTop: 3,
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
  },
  statusBadge: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  detailGrid: {
    flexDirection: "row",
    marginBottom: 8,
  },
  detailPill: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    marginRight: 6,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
  },
  detailValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },
  label: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
  },
  value: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  itemActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  smallBtnText: {
    marginLeft: 6,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  emptyText: {
    marginTop: 8,
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "800",
  },
});
