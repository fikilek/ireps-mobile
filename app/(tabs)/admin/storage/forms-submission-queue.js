import { NO_ACCESS_ROUTE } from "../../../../src/features/meters/accessGate";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import QueueItemCard from "../../../../components/QueueItemCard";
import { useGeo } from "../../../../src/context/GeoContext";
import { useAuth } from "../../../../src/hooks/useAuth";
import { processSubmissionQueue } from "../../../../src/services/processSubmissionQueue";
import RemoveSavedWorkDialog from "../../../../components/RemoveSavedWorkDialog";
import { recordWorkRemoval } from "../../../../src/storage/workRemovalLog";
import {
  clearConfirmedSubmissions,
  getSubmissionQueue,
  getSubmissionQueueItemById,
  subscribeToSubmissionQueue,
  removeSubmissionQueueItem,
} from "../../../../src/utils/submissionQueue";

const getLifecycleEditRoute = (trnType) => {
  const cleanTrnType = String(trnType || "")
    .trim()
    .toUpperCase();

  if (cleanTrnType === "METER_INSPECTION") {
    return "/(tabs)/asts/inspection";
  }

  if (cleanTrnType === "METER_DISCONNECTION") {
    return "/(tabs)/asts/disconnection";
  }

  if (cleanTrnType === "METER_RECONNECTION") {
    return "/(tabs)/asts/reconnection";
  }

  if (cleanTrnType === "METER_REMOVAL") {
    return "/(tabs)/asts/removal";
  }

  if (cleanTrnType === "METER_READING") {
    return "/(tabs)/asts/meter-reading";
  }

  return "";
};

const getQueueTrnType = (item = {}) => {
  return String(
    item?.context?.trnType ||
      item?.payload?.accessData?.trnType ||
      item?.payload?.trnType ||
      item?.formType ||
      "",
  )
    .trim()
    .toUpperCase();
};

const getQueueInstructionTrnId = (item = {}) => {
  return String(
    item?.context?.instructionTrnId ||
      item?.context?.trnId ||
      item?.payload?.instructionTrnId ||
      item?.payload?.id ||
      item?.payload?.trnId ||
      "",
  ).trim();
};

const getQueueSourceAstId = (item = {}) => {
  return String(
    item?.context?.sourceAstId ||
      item?.context?.astId ||
      item?.payload?.sourceAstId ||
      item?.payload?.ast?.astData?.astId ||
      "",
  ).trim();
};

const getQueueUpdatedAtMs = (item) => {
  const raw = item?.metadata?.updatedAt || item?.metadata?.createdAt || "";
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const processSingleSubmissionQueueItem = async (queueItemId, { agentUid, agentName } = {}) => {
  const run = await processSubmissionQueue({ agentUid, agentName, queueItemIds: [queueItemId], includeSyncing: true });
  const item = await getSubmissionQueueItemById(queueItemId);
  return item?.result || run;
};

export default function SubmissionQueueScreen() {
  const { user, profile, role } = useAuth();
  const router = useRouter();
  const { updateGeo } = useGeo();

  const [isOnline, setIsOnline] = useState(true);
  const [queueItems, setQueueItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [itemToRemove, setItemToRemove] = useState(null);

  const agentUid = user?.uid || "SYSTEM";
  const agentName = profile?.profile?.displayName || "SYSTEM";

  const loadQueue = useCallback(async () => {
    try {
      const queue = await getSubmissionQueue();

      const sortedQueue = (Array.isArray(queue) ? queue : []).sort(
        (a, b) => getQueueUpdatedAtMs(b) - getQueueUpdatedAtMs(a),
      );

      setQueueItems(sortedQueue);
    } catch (error) {
      console.log("SubmissionQueueScreen -- loadQueue error", error);
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

  // OF-R001: the background sender empties the queue without the worker touching anything, and
  // focus only fires on the way IN. A screen already open went on showing work that had been
  // sent until the worker left and came back - the owner, 4 October: "it did auto send ... but
  // it didn't clear the UI." The queue now says when it changes, and this listens.
  useEffect(() => subscribeToSubmissionQueue(loadQueue), [loadQueue]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadQueue();
    setRefreshing(false);
  }, [loadQueue]);

  // OF-R002 section 7: Clear takes away what the office already has, and nothing else. It used to
  // empty the whole queue after one tap, unsent captures included (the owner lost two queued
  // disconnections to it, 27 September).
  const handleClearSentWork = async () => {
    setBusy(true);

    const result = await clearConfirmedSubmissions();

    await loadQueue();
    setBusy(false);

    const cleared = result?.cleared || 0;

    ToastAndroid.show(
      cleared
        ? `${cleared} sent ${cleared === 1 ? "form" : "forms"} cleared.`
        : "Nothing to clear. Work still to go stays on this phone.",
      ToastAndroid.SHORT,
    );
  };

  const handleRemoveItem = (queueItemId) => {
    const item = queueItems.find((queueItem) => queueItem?.id === queueItemId);

    if (!item) return;

    setItemToRemove(item);
  };

  const handleConfirmRemoval = async ({ reason }) => {
    const item = itemToRemove;

    if (!item) return;

    setBusy(true);

    recordWorkRemoval({
      item,
      store: "forms",
      reason,
      removedByUid: agentUid,
      removedByUser: agentName,
      removedByRole: role,
    });

    await removeSubmissionQueueItem(item.id);

    setItemToRemove(null);
    await loadQueue();
    setBusy(false);
  };

  const handleProcessQueue = async () => {
    if (!isOnline) {
      ToastAndroid.show(
        "You are offline. Sync is unavailable.",
        ToastAndroid.SHORT,
      );
      return;
    }

    try {
      setBusy(true);

      const result = await processSubmissionQueue({
        agentUid,
        agentName,
      });

      // OF-R001: what the office now has is not work still to go.
      await clearConfirmedSubmissions();

      await loadQueue();

      if (result?.success) {
        ToastAndroid.show(
          result?.message || "Queue processed",
          ToastAndroid.SHORT,
        );
      } else {
        ToastAndroid.show(result?.message || "Sync failed", ToastAndroid.LONG);
      }
    } catch (error) {
      console.log("SubmissionQueueScreen -- handleProcessQueue error", error);
      ToastAndroid.show("Sync failed", ToastAndroid.LONG);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncItem = async (item) => {
    if (!isOnline) {
      ToastAndroid.show(
        "You are offline. Sync is unavailable.",
        ToastAndroid.SHORT,
      );
      return;
    }

    if (!item?.id) return;

    const canSync = item?.status === "PENDING" || item?.status === "FAILED";

    if (!canSync) {
      ToastAndroid.show(
        "Only pending drafts can be synced.",
        ToastAndroid.SHORT,
      );
      return;
    }

    try {
      setBusy(true);

      await loadQueue();

      const result = await processSingleSubmissionQueueItem(item.id, {
        agentUid,
        agentName,
      });

      // OF-R001: what the office now has is not work still to go.
      await clearConfirmedSubmissions();

      await loadQueue();

      if (result?.success) {
        ToastAndroid.show(
          result?.message || "Queue item synced",
          ToastAndroid.SHORT,
        );
      } else {
        ToastAndroid.show(result?.message || "Sync failed", ToastAndroid.LONG);
      }
    } catch (error) {
      console.log("SubmissionQueueScreen -- handleSyncItem error", error);
      await loadQueue();
      ToastAndroid.show("Sync failed", ToastAndroid.LONG);
    } finally {
      setBusy(false);
    }
  };

  const handleEditItem = (item) => {
    const canEdit =
      item?.status === "PENDING" ||
      item?.status === "FAILED" ||
      item?.status === "CONFLICT" ||
      item?.status === "IN_PROGRESS";

    if (!canEdit) {
      Alert.alert(
        "Edit Not Allowed",
        "Only pending or locally saved queue items can be edited.",
      );
      return;
    }

    if (item?.payload?.accessData?.access?.hasAccess === "no") {
      router.push({ pathname: NO_ACCESS_ROUTE, params: { queueItemId: item.id } });
      return;
    }
    const trnType = getQueueTrnType(item);
    const lifecycleRoute = getLifecycleEditRoute(trnType);

    if (lifecycleRoute) {
      const instructionTrnId = getQueueInstructionTrnId(item);
      const sourceAstId = getQueueSourceAstId(item);

      const premiseId =
        item?.context?.premiseId ||
        item?.payload?.accessData?.premise?.id ||
        "NAv";

      router.push({
        pathname: lifecycleRoute,
        params: {
          queueItemId: item?.id,

          instructionTrnId: instructionTrnId || "NAv",
          trnId: instructionTrnId || "NAv",

          sourceAstId: sourceAstId || "NAv",
          astId: sourceAstId || "NAv",

          premiseId,
          returnTo: "/(tabs)/admin/storage/forms-submission-queue",

          action: JSON.stringify({
            source: "MMKV_QUEUE",
            trnType,
            returnTo: "/(tabs)/admin/storage/forms-submission-queue",
            instructionTrnId: instructionTrnId || "NAv",
            trnId: instructionTrnId || "NAv",
            sourceAstId: sourceAstId || "NAv",
            astId: sourceAstId || "NAv",
            premiseId,

            accessData: item?.payload?.accessData || {},
            ast: item?.payload?.ast || {},
            status: item?.payload?.status || {},
            meterType: item?.payload?.meterType || item?.context?.meterType,
            assignment: item?.payload?.assignment || {},
            officeInstruction: item?.payload?.assignment?.instruction || {},
          }),
        },
      });

      return;
    }

    const hasAccess =
      item?.payload?.accessData?.access?.hasAccess === "no" ? "no" : "yes";

    const meterType =
      hasAccess === "no" ? "NA" : item?.payload?.meterType || "";

    const premiseId =
      item?.context?.premiseId ||
      item?.payload?.accessData?.premise?.id ||
      "NAv";

    router.push({
      pathname: "/(tabs)/premises/form",
      params: {
        premiseId,
        action: JSON.stringify({
          access: hasAccess,
          meterType,
        }),
        queueItemId: item?.id,
      },
    });
  };

  const handleOpenMapItem = (item) => {
    const gps = item?.payload?.ast?.location?.gps;

    if (typeof gps?.lat !== "number" || typeof gps?.lng !== "number") {
      Alert.alert(
        "Map Unavailable",
        "This draft does not have valid meter GPS coordinates.",
      );
      return;
    }

    const draftMeter = {
      id: item?.payload?.id || item?.id || "NAv",
      meterType: item?.payload?.meterType || item?.context?.meterType || "NAv",
      accessData: {
        ...(item?.payload?.accessData || {}),
        erfNo:
          item?.payload?.accessData?.erfNo || item?.context?.erfNo || "NAv",
        premise: {
          ...(item?.payload?.accessData?.premise || {}),
          address: item?.payload?.accessData?.premise?.address || "NAv",
        },
      },
      ast: {
        ...(item?.payload?.ast || {}),
        astData: {
          ...(item?.payload?.ast?.astData || {}),
          astNo:
            item?.payload?.ast?.astData?.astNo ||
            item?.context?.meterNo ||
            "NAv",
        },
        location: {
          ...(item?.payload?.ast?.location || {}),
          gps: {
            lat: gps.lat,
            lng: gps.lng,
          },
        },
      },
    };

    updateGeo({
      selectedErf: null,
      selectedPremise: null,
      selectedMeter: draftMeter,
      lastSelectionType: "METER",
    });

    router.push("/(tabs)/maps");
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Submission Queue",
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
          <Text style={styles.headerTitle}>Offline Submission Forms</Text>
          <Text style={styles.headerSub}>Total Items: {queueItems.length}</Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#0f172a" }]}
              onPress={handleRefresh}
              disabled={busy}
            >
              <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Refresh</Text>
            </TouchableOpacity>

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
                {!isOnline ? "Offline" : busy ? "Syncing..." : "Sync Now"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#475569" }]}
              onPress={handleClearSentWork}
              disabled={busy}
            >
              <MaterialCommunityIcons
                name="broom"
                size={18}
                color="#fff"
              />
              <Text style={styles.actionBtnText}>Clear sent</Text>
            </TouchableOpacity>
          </View>
        </Surface>

        {queueItems.length === 0 ? (
          <Surface style={styles.emptyCard} elevation={1}>
            <Text style={styles.emptyText}>No queue items found.</Text>
          </Surface>
        ) : (
          queueItems.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              busy={busy}
              isOnline={isOnline}
              onRemove={handleRemoveItem}
              onEdit={handleEditItem}
              onOpenMap={handleOpenMapItem}
              handleSyncItem={handleSyncItem}
            />
          ))
        )}
      </ScrollView>

      <RemoveSavedWorkDialog
        visible={!!itemToRemove}
        item={itemToRemove}
        role={role}
        busy={busy}
        whatIsIt="this form"
        onCancel={() => setItemToRemove(null)}
        onConfirm={handleConfirmRemoval}
      />
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
});
