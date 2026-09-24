import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Surface, Text } from "react-native-paper";

import { doc, onSnapshot } from "firebase/firestore";
import { useDiscovery } from "../../../../src/context/DiscoveryContext";
import { db } from "../../../../src/firebase";
import { useAuth } from "../../../../src/hooks/useAuth";
import { processPremiseSubmissionQueue } from "../../../../src/services/processPremiseSubmissionQueue";
import {
  clearPremiseQueue,
  getPremiseQueue,
  markPremiseQueueItemSuccess,
  markPremiseQueueItemSyncing,
  removePremiseQueueItem,
} from "../../../../src/utils/premiseSubmissionQueue";
import { processSinglePremiseQueueItem } from "../../../../src/utils/processSinglePremiseQueueItem";

function PremiseQueueItemCard({
  item,
  busy,
  onRemove,
  onOpen,
  handleSyncItem,
  isOnline,
  onOpenFormMeterDiscovery,
}) {
  // console.log(`item`, item);
  // console.log(`item?.status`, item?.status);

  const payload = item?.payload || {};
  const address = payload?.address || {};
  const propertyType = payload?.propertyType || {};
  const result = item?.result || {};
  const metadata = item?.metadata || {};

  const status = String(item?.status || "PENDING").toUpperCase();

  const statusColor =
    status === "SUCCESS"
      ? "#16A34A"
      : status === "FAILED"
        ? "#DC2626"
        : status === "SYNCING"
          ? "#2563EB"
          : "#0F172A";

  const addressLine = [
    String(address?.strNo || "").trim(),
    String(address?.strName || "").trim(),
    String(address?.strType || "").trim(),
  ]
    .filter(Boolean)
    .join(" ");

  const propertyLine = [
    String(propertyType?.type || "NAv").trim(),
    String(propertyType?.name || "").trim(),
    String(propertyType?.unitNo || "").trim(),
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.rowBetween}>
        <Text style={styles.itemTitle}>{payload?.erfNo || "NAv"}</Text>

        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>

      <Text style={styles.label}>Address</Text>
      <Text style={styles.value}>{addressLine || "NAv"}</Text>

      <Text style={styles.label}>Property Type</Text>
      <Text style={styles.value}>{propertyLine || "NAv"}</Text>

      <Text style={styles.label}>Premise ID</Text>
      <Text style={styles.value}>{payload?.id || "NAv"}</Text>

      <Text style={styles.label}>Saved</Text>
      <Text style={styles.value}>
        {metadata?.createdAt
          ? new Date(metadata.createdAt).toLocaleString()
          : "NAv"}
      </Text>

      {status === "FAILED" ? (
        <>
          <Text style={styles.label}>Last Error</Text>
          <Text style={styles.value}>{result?.message || "NAv"}</Text>
        </>
      ) : null}

      <View style={styles.itemActionsRow}>
        {/* row Open premise form */}
        <View style={{ flex: 1, gap: 8 }}>
          <TouchableOpacity
            style={[
              styles.smallBtn,
              {
                backgroundColor: "#0ee239",
                opacity: busy ? 0.7 : 1,
              },
            ]}
            onPress={() => onOpen(item)}
            disabled={busy}
          >
            <MaterialCommunityIcons
              name="folder-open-outline"
              size={16}
              color="#fff"
            />
            <Text style={styles.smallBtnText}>Open</Text>
          </TouchableOpacity>

          {/* row Remove premise form */}
          <TouchableOpacity
            style={[
              styles.smallBtn,
              { backgroundColor: "#DC2626", opacity: busy ? 0.7 : 1 },
            ]}
            onPress={() => onRemove(item?.id)}
            disabled={busy}
          >
            <MaterialCommunityIcons name="delete" size={16} color="#fff" />
            <Text style={styles.smallBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, gap: 8 }}>
          {/* row Sync premise form */}
          <TouchableOpacity
            style={[
              styles.smallBtn,
              {
                backgroundColor: !isOnline
                  ? "#94a3b8"
                  : item.status === "SYNCING"
                    ? "#0f172a"
                    : item.status === "SUCCESS"
                      ? "#94a3b8"
                      : "#2563eb",
                opacity: busy || !isOnline ? 0.7 : 1,
              },
            ]}
            onPress={() => handleSyncItem(item)}
            disabled={
              !isOnline ||
              item.status === "SUCCESS" ||
              item.status === "SYNCING"
            }
          >
            {item.status === "SYNCING" ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <MaterialCommunityIcons name="sync" size={18} color="#ffffff" />
            )}

            <Text style={styles.smallBtnText}>
              {!isOnline
                ? "Offline"
                : item.status === "SYNCING"
                  ? "Syncing..."
                  : item.status === "SUCCESS"
                    ? "Synced"
                    : "Sync"}
            </Text>
          </TouchableOpacity>

          {/* row New FormMeterDiscovery launch poinnt */}
          <TouchableOpacity
            style={[
              styles.smallBtn,
              {
                backgroundColor: "#7c3aed",
                opacity: busy ? 0.7 : 1,
              },
            ]}
            onPress={() => onOpenFormMeterDiscovery(item)}
            disabled={busy}
          >
            <MaterialCommunityIcons
              name="meter-electric"
              size={16}
              color="#fff"
            />
            <Text style={styles.smallBtnText}>Discover</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Surface>
  );
}

export default function PremiseOfflineStorageScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [isOnline, setIsOnline] = useState(true);

  const [queueItems, setQueueItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const agentUid = user?.uid || "SYSTEM";
  const agentName = profile?.profile?.displayName || "SYSTEM";

  const { openMissionDiscovery } = useDiscovery();

  const queueCounts = useMemo(() => {
    const items = Array.isArray(queueItems) ? queueItems : [];

    return items.reduce(
      (acc, item) => {
        const status = String(item?.status || "PENDING").toUpperCase();

        acc.all += 1;

        if (status === "SUCCESS") {
          acc.success += 1;
        } else if (status === "FAILED") {
          acc.failed += 1;
        } else if (status === "SYNCING") {
          acc.syncing += 1;
        } else {
          acc.pending += 1;
        }

        return acc;
      },
      {
        all: 0,
        pending: 0,
        syncing: 0,
        failed: 0,
        success: 0,
      },
    );
  }, [queueItems]);

  const loadQueue = useCallback(async () => {
    try {
      const queue = await getPremiseQueue();
      setQueueItems(Array.isArray(queue) ? queue : []);
    } catch (error) {
      console.log("PremiseOfflineStorageScreen -- loadQueue error", error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable);
      setIsOnline(online);
    });

    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadQueue();
    }, [loadQueue]),
  );

  useEffect(() => {
    const pendingPremiseQueueItems = (
      Array.isArray(queueItems) ? queueItems : []
    ).filter((item) => {
      const status = String(item?.status || "PENDING").toUpperCase();
      const premiseId = item?.premiseId || item?.payload?.id || null;

      // TB-R067 (1.3.73): a premise document that exists is proof the work arrived only when this item was
      // going to create it. An item that joins a premise already standing there finds its document there
      // from the start, so this watch would mark it Sent while the row was never joined and the worker was
      // told it had worked (reviewer, 2026-09-24). Those wait for the callable, like any other send.
      if (item?.joinsExistingPremise) return false;

      return premiseId && premiseId !== "NAv" && status !== "SUCCESS";
    });

    if (pendingPremiseQueueItems.length === 0) {
      return;
    }

    let isMounted = true;

    const unsubscribers = pendingPremiseQueueItems.map((item) => {
      const premiseId = item?.premiseId || item?.payload?.id;

      const premiseRef = doc(db, "premises", premiseId);

      return onSnapshot(
        premiseRef,
        async (premiseSnap) => {
          if (!isMounted) return;
          if (!premiseSnap.exists()) return;

          const latestQueue = await getPremiseQueue();

          const latestQueueItem = (
            Array.isArray(latestQueue) ? latestQueue : []
          ).find((queueItem) => queueItem?.id === item?.id);

          if (!latestQueueItem) return;

          const latestStatus = String(
            latestQueueItem?.status || "PENDING",
          ).toUpperCase();

          if (latestStatus === "SUCCESS") return;

          await markPremiseQueueItemSuccess(
            latestQueueItem.id,
            {
              code: "CREATED_AFTER_TIMEOUT",
              message: "Premise exists in Firestore",
              premiseId,
            },
            agentUid,
            agentName,
          );

          await loadQueue();

          ToastAndroid.show(
            "Premise confirmed in database.",
            ToastAndroid.SHORT,
          );
        },
        (error) => {
          console.log(
            "PremiseOfflineStorageScreen -- premise listener error",
            premiseId,
            error,
          );
        },
      );
    });

    return () => {
      isMounted = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [queueItems, agentUid, agentName, loadQueue]);

  const handleOpenFormMeterDiscovery = (item) => {
    const draftPremise = item?.payload || null;

    openMissionDiscovery({
      premiseId: item?.premiseId || draftPremise?.id || "NAv",
      premise: draftPremise,
    });
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadQueue();
    setRefreshing(false);
  }, [loadQueue]);

  const handleClearQueue = async () => {
    Alert.alert(
      "Clear Offline Premises",
      "Are you sure you want to remove all offline premise items?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            await clearPremiseQueue();
            await loadQueue();
            setBusy(false);
          },
        },
      ],
    );
  };

  const handleRemoveItem = async (queueItemId) => {
    Alert.alert("Remove Item", "Remove this offline premise item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          await removePremiseQueueItem(queueItemId);
          await loadQueue();
          setBusy(false);
        },
      },
    ]);
  };

  const handleProcessQueue = async () => {
    setBusy(true);
    await processPremiseSubmissionQueue({
      agentUid,
      agentName,
    });
    await loadQueue();
    setBusy(false);
  };

  const handleOpenItem = (item) => {
    const payload = item?.payload || {};
    const erfId = payload?.erfId || "";
    const queueItemId = item?.id || "";

    router.push({
      pathname: "/(tabs)/premises/formPremise",
      params: {
        id: erfId,
        queueItemId,
      },
    });
  };

  const handleSyncItem = async (item) => {
    setBusy(true);

    // 🔴 STEP 1: mark syncing manually first
    await markPremiseQueueItemSyncing(item.id);

    // 🔴 STEP 2: refresh UI immediately
    await loadQueue();

    // 🔴 STEP 3: now run actual sync
    const result = await processSinglePremiseQueueItem(item.id, {
      agentUid,
      agentName,
    });

    // 🔴 STEP 4: refresh again after result
    await loadQueue();

    setBusy(false);

    if (result?.success) {
      ToastAndroid.show("Premise synced", ToastAndroid.SHORT);
    } else {
      ToastAndroid.show(result?.message || "Sync failed", ToastAndroid.LONG);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Premise Offline Storage",
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
        <Surface style={styles.headerCard} elevation={1}>
          <Text style={styles.headerTitle}>Offline Premise Storage</Text>
          <Text style={styles.headerSub}>
            Fast field submissions with background confirmation
          </Text>
          <View style={styles.countStrip}>
            <View style={styles.countStat}>
              <View style={styles.countTopRow}>
                <MaterialCommunityIcons
                  name="format-list-bulleted"
                  size={15}
                  color="#334155"
                />
                <Text style={styles.countText}>All</Text>
              </View>
              <Text style={styles.countNumber}>{queueCounts.all}</Text>
            </View>

            <View style={styles.countDivider} />

            <View style={styles.countStat}>
              <View style={styles.countTopRow}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={15}
                  color="#b45309"
                />
                <Text style={styles.countText}>Pending</Text>
              </View>
              <Text style={styles.countNumber}>{queueCounts.pending}</Text>
            </View>

            <View style={styles.countDivider} />

            <View style={styles.countStat}>
              <View style={styles.countTopRow}>
                <MaterialCommunityIcons name="sync" size={15} color="#2563eb" />
                <Text style={styles.countText}>Syncing</Text>
              </View>
              <Text style={styles.countNumber}>{queueCounts.syncing}</Text>
            </View>

            <View style={styles.countDivider} />

            <View style={styles.countStat}>
              <View style={styles.countTopRow}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={15}
                  color="#dc2626"
                />
                <Text style={styles.countText}>Failed</Text>
              </View>
              <Text style={styles.countNumber}>{queueCounts.failed}</Text>
            </View>

            <View style={styles.countDivider} />

            <View style={styles.countStat}>
              <View style={styles.countTopRow}>
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={15}
                  color="#16a34a"
                />
                <Text style={styles.countText}>Success</Text>
              </View>
              <Text style={styles.countNumber}>{queueCounts.success}</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            {/* Refresh  */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#0f172a" }]}
              onPress={handleRefresh}
              disabled={busy}
            >
              <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Refresh</Text>
            </TouchableOpacity>

            {/* Sync */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: !isOnline ? "#94a3b8" : "#2563eb",
                  opacity: busy || !isOnline ? 0.7 : 1,
                },
              ]}
              onPress={handleProcessQueue}
              disabled={busy || !isOnline}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="sync" size={18} color="#fff" />
              )}
              <Text style={styles.actionBtnText}>
                {busy ? "Syncing..." : "Sync Now"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#dc2626" }]}
              onPress={handleClearQueue}
              disabled={busy}
            >
              <MaterialCommunityIcons name="delete" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </Surface>

        {queueItems.length === 0 ? (
          <Surface style={styles.emptyCard} elevation={1}>
            <Text style={styles.emptyText}>
              No offline premise items found.
            </Text>
          </Surface>
        ) : (
          queueItems.map((item) => (
            <PremiseQueueItemCard
              key={item.id}
              item={item}
              busy={busy}
              onRemove={handleRemoveItem}
              onOpen={handleOpenItem}
              handleSyncItem={handleSyncItem}
              isOnline={isOnline}
              onOpenFormMeterDiscovery={handleOpenFormMeterDiscovery}
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
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },
  headerSub: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
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
  statusBadge: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  label: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
    marginTop: 8,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 13,
    color: "#0f172a",
    marginTop: 2,
  },

  smallBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  itemActionsRow: {
    flexDirection: "row",
    // flexWrap: "wrap",
    marginTop: 14,
    gap: 8,
    justifyContent: "space-between",
  },

  smallBtn: {
    // width: "48%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },

  countStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 12,
    marginBottom: 14,
  },

  countStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  countTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 18,
  },

  countDivider: {
    width: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 2,
  },

  countNumber: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    lineHeight: 20,
  },

  countText: {
    fontSize: 7.5,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
});
