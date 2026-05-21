import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
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
import { functions } from "../../../../src/firebase";
import { useAuth } from "../../../../src/hooks/useAuth";
import { processSubmissionQueue } from "../../../../src/services/processSubmissionQueue";
import {
  clearSubmissionQueue,
  getCallableNameForSubmissionQueueItem,
  getSubmissionQueue,
  getSubmissionQueueItemById,
  markSubmissionQueueItemFailed,
  markSubmissionQueueItemSuccess,
  markSubmissionQueueItemSyncing,
  removeSubmissionQueueItem,
  updateSubmissionQueueItem,
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

const isAlreadyCompletedLifecycleResult = (result = {}) => {
  const code = String(result?.code || "")
    .trim()
    .toUpperCase();

  const message = String(result?.message || "")
    .trim()
    .toUpperCase();

  return (
    code.includes("ALREADY_COMPLETED") ||
    code.includes("TRN_ALREADY_COMPLETED") ||
    code.includes("WORKFLOW_ALREADY_COMPLETED") ||
    (message.includes("ALREADY") && message.includes("COMPLETED"))
  );
};

const processSingleSubmissionQueueItem = async (
  queueItemId,
  { agentUid = "SYSTEM", agentName = "SYSTEM" } = {},
) => {
  try {
    const netState = await NetInfo.fetch();
    const isOnline = Boolean(
      netState.isConnected && netState.isInternetReachable,
    );

    if (!isOnline) {
      return {
        success: false,
        message: "Device offline",
      };
    }

    const item = await getSubmissionQueueItemById(queueItemId);

    if (!item?.id) {
      return {
        success: false,
        message: "Queue item not found",
      };
    }

    const payload = item?.payload || {};
    const originalMedia = Array.isArray(payload?.media) ? payload.media : [];

    const storage = getStorage();

    const syncedMedia = await Promise.all(
      originalMedia.map(async (mediaItem) => {
        if (mediaItem?.uri && !mediaItem?.url) {
          const folder =
            payload?.accessData?.access?.hasAccess === "yes"
              ? `${payload?.meterType}_meters`
              : "no_access";

          const fileName = `${payload?.accessData?.erfId}_${mediaItem?.tag}_${Date.now()}.jpg`;

          const storageRef = ref(storage, `meters/${folder}/${fileName}`);

          const response = await fetch(mediaItem.uri);
          const blob = await response.blob();

          await uploadBytes(storageRef, blob);

          const downloadUrl = await getDownloadURL(storageRef);

          const { uri, ...cleanItem } = mediaItem;

          return {
            ...cleanItem,
            url: downloadUrl,
          };
        }

        return mediaItem;
      }),
    );

    const finalPayload = {
      ...payload,
      media: syncedMedia,
    };

    const callableName = getCallableNameForSubmissionQueueItem(item);

    if (!callableName) {
      await markSubmissionQueueItemFailed(
        queueItemId,
        {
          code: "UNKNOWN_QUEUE_FORM_TYPE",
          message:
            "This local queue item does not have a recognised form type and cannot be synced safely.",
          trnId: finalPayload?.id || "NAv",
        },
        agentUid,
        agentName,
      );

      return {
        success: false,
        message:
          "This local queue item does not have a recognised form type and cannot be synced safely.",
      };
    }

    console.log("processSingleSubmissionQueueItem -- callable routing", {
      queueItemId: item?.id,
      status: item?.status,
      formType: item?.formType,
      trnType:
        item?.context?.trnType ||
        item?.payload?.accessData?.trnType ||
        item?.payload?.trnType,
      callableName,
      erfNo: item?.context?.erfNo || item?.payload?.accessData?.erfNo,
      meterNo: item?.context?.meterNo || item?.payload?.ast?.astData?.astNo,
    });

    const callable = httpsCallable(functions, callableName);

    const callableResponse = await callable(finalPayload);
    const result = callableResponse?.data || {};

    if (!result?.success) {
      const code = result?.code || "SYNC_FAILED";

      console.log(
        "processSingleSubmissionQueueItem -- callable returned failure",
        {
          queueItemId,
          callableName,
          code,
          message: result?.message,
          trnId: result?.trnId || finalPayload?.id || "NAv",
          formType: item?.formType,
          trnType:
            item?.context?.trnType ||
            item?.payload?.accessData?.trnType ||
            item?.payload?.trnType,
          result,
        },
      );

      if (isAlreadyCompletedLifecycleResult(result)) {
        await markSubmissionQueueItemSuccess(
          queueItemId,
          {
            code: code || "ALREADY_COMPLETED",
            message:
              result?.message || "Server already completed this lifecycle TRN.",
            trnId: result?.trnId || finalPayload?.id || "NAv",
          },
          agentUid,
          agentName,
        );

        return {
          success: true,
          message:
            result?.message || "Server already completed this lifecycle TRN.",
        };
      }

      if (code === "INVALID_PREMISE_ID" || code === "PREMISE_NOT_FOUND") {
        await updateSubmissionQueueItem(
          queueItemId,
          {
            status: "PENDING",
            result: {
              success: false,
              code,
              message:
                result?.message ||
                "Parent premise is not ready yet. This draft will retry later.",
              trnId: "NAv",
            },
          },
          agentUid,
          agentName,
        );

        return {
          success: false,
          message:
            result?.message ||
            "Parent premise is not ready yet. This draft will retry later.",
        };
      }

      await markSubmissionQueueItemFailed(
        queueItemId,
        {
          code,
          message: result?.message || "Submission sync failed",
          trnId: result?.trnId || "NAv",
        },
        agentUid,
        agentName,
      );

      return {
        success: false,
        message: result?.message || "Submission sync failed",
      };
    }

    await markSubmissionQueueItemSuccess(
      queueItemId,
      {
        code: result?.code || "SUCCESS",
        message: result?.message || "Synced successfully",
        trnId: result?.trnId || finalPayload?.id || "NAv",
      },
      agentUid,
      agentName,
    );

    return {
      success: true,
      message: result?.message || "Queue item synced successfully",
    };
  } catch (error) {
    console.log(
      "SubmissionQueueScreen -- processSingleSubmissionQueueItem error",
      {
        queueItemId,
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
        raw: error,
      },
    );

    const message = error?.message || "";
    const code = error?.code || "";

    const isPremiseError =
      message.includes("PREMISE") ||
      message.includes("premise") ||
      code === "INVALID_PREMISE_ID" ||
      code === "PREMISE_NOT_FOUND";

    if (isPremiseError) {
      await updateSubmissionQueueItem(
        queueItemId,
        {
          status: "PENDING",
          result: {
            success: false,
            code: "PREMISE_NOT_READY",
            message:
              "Parent premise is not ready yet. This draft will retry later.",
            trnId: "NAv",
          },
        },
        agentUid,
        agentName,
      );

      return {
        success: false,
        message:
          "Parent premise is not ready yet. This draft will retry later.",
      };
    }

    await markSubmissionQueueItemFailed(
      queueItemId,
      {
        code: "SYNC_FAILED",
        message: message || "Sync failed",
        trnId: "NAv",
      },
      agentUid,
      agentName,
    );

    return {
      success: false,
      message: message || "Sync failed",
    };
  }
};

export default function SubmissionQueueScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const { updateGeo } = useGeo();

  const [isOnline, setIsOnline] = useState(true);
  const [queueItems, setQueueItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadQueue();
    setRefreshing(false);
  }, [loadQueue]);

  const handleClearQueue = async () => {
    Alert.alert(
      "Clear Queue",
      "Are you sure you want to remove all queue items?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            await clearSubmissionQueue();
            await loadQueue();
            setBusy(false);
          },
        },
      ],
    );
  };

  const handleRemoveItem = async (queueItemId) => {
    Alert.alert("Remove Item", "Remove this queue item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          await removeSubmissionQueueItem(queueItemId);
          await loadQueue();
          setBusy(false);
        },
      },
    ]);
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

      await markSubmissionQueueItemSyncing(item.id, agentUid, agentName);
      await loadQueue();

      const result = await processSingleSubmissionQueueItem(item.id, {
        agentUid,
        agentName,
      });

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
      item?.status === "IN_PROGRESS";

    if (!canEdit) {
      Alert.alert(
        "Edit Not Allowed",
        "Only pending or locally saved queue items can be edited.",
      );
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

          action: JSON.stringify({
            source: "MMKV_QUEUE",
            trnType,
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
