import NetInfo from "@react-native-community/netinfo";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { useGeo } from "@/src/context/GeoContext";
import { erfsApi } from "@/src/redux/erfsApi";
import { useGetAuthStateQuery } from "@/src/redux/authApi";
import {
  clearLastActiveScopeIfMatches,
  removeScopeDataset,
} from "@/src/storage/wardScopeStorage";
import { useGetWardsByLocalMunicipalityQuery } from "@/src/redux/geoApi";
import WardErfSyncLock from "../../../components/WardErfSyncLock";
import WardErfsSyncDoneModal from "../../../components/WardErfsSyncDoneModal";

/* =====================================================
   PER-WARD LIVE SUBSCRIPTION REGISTRY
   Keeps the RTK initiate() handles so we can unsubscribe
   only the specific ward on DROP.
===================================================== */
const wardErfSubscriptions = new Map();

function getWardQueryCacheKey(lmPcode, wardPcode) {
  return `getErfsByLmPcodeWardPcode(${lmPcode}__${wardPcode})`;
}

function startWardErfSubscription(dispatch, lmPcode, wardPcode, scopeIdentity = {}) {
  const wardKey = `${lmPcode}__${wardPcode}`;

  // already live -> do nothing
  if (wardErfSubscriptions.has(wardKey)) return;

  const handle = dispatch(
    erfsApi.endpoints.getErfsByLmPcodeWardPcode.initiate(
      {
        lmPcode,
        wardPcode,
        uid: scopeIdentity?.uid || null,
        activeWorkbaseId: scopeIdentity?.activeWorkbaseId || null,
      },
      { subscribe: true },
    ),
  );

  wardErfSubscriptions.set(wardKey, handle);
}

function stopWardErfSubscription(dispatch, lmPcode, wardPcode) {
  const wardKey = `${lmPcode}__${wardPcode}`;
  const handle = wardErfSubscriptions.get(wardKey);

  // 1. stop only this ward's live listener
  if (handle?.unsubscribe) {
    handle.unsubscribe();
  }

  wardErfSubscriptions.delete(wardKey);

  // 2. remove only this ward's cached query result
  const queryCacheKey = getWardQueryCacheKey(lmPcode, wardPcode);

  dispatch(
    erfsApi.internalActions.removeQueryResult({
      queryCacheKey,
    }),
  );
}

export default function WardErfsSync() {
  const router = useRouter();
  const dispatch = useDispatch();

  const { geoState, updateGeo } = useGeo();
  const { data: authState } = useGetAuthStateQuery();

  const activeLm = geoState?.selectedLm;
  const activeWard = geoState?.selectedWard;

  const lmPcode = activeLm?.pcode || activeLm?.id || null;
  const uid = authState?.auth?.uid || null;
  const activeWorkbaseId =
    authState?.profile?.access?.activeWorkbase?.id || lmPcode || null;

  const [isOnline, setIsOnline] = useState(false);

  const [syncStory, setSyncStory] = useState(null);
  const [doneModalVisible, setDoneModalVisible] = useState(false);
  const [rowAction, setRowAction] = useState(null);

  const isRowActionBusy = Boolean(rowAction?.wardId);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable));
    });
    return unsub;
  }, []);

  const { data: wards = [], isLoading } = useGetWardsByLocalMunicipalityQuery(
    lmPcode,
    {
      skip: !lmPcode,
    },
  );

  const erfsQueries = useSelector((state) => state.erfsApi?.queries || {});

  /* ================= GLOBAL SYNC LOCK ================= */

  const isAnySyncing = useMemo(() => {
    return Object.values(erfsQueries || {}).some(
      (q) => q?.data?.sync?.status === "syncing",
    );
  }, [erfsQueries]);

  /* ================= BUILD ROWS ================= */

  const wardRows = useMemo(() => {
    if (!lmPcode) return [];

    return (wards || []).map((w) => {
      const wardKey = `${lmPcode}__${w.id}`;
      const isActive = activeWard?.id === w.id;

      const queryKey = getWardQueryCacheKey(lmPcode, w.id);
      const queryState = erfsQueries?.[queryKey];

      let status = "NOT SYNCED";
      let count = 0;

      if (queryState) {
        const sync = queryState?.data?.sync;

        if (sync?.status === "syncing") status = "SYNCING";
        else if (sync?.status === "ready") status = "READY";
        else if (sync?.status === "error") status = "ERROR";

        count = sync?.size || 0;
      }

      const canOpen = status === "READY";
      const canDrop = status !== "NOT SYNCED";
      const canSync = !canOpen && isOnline && status !== "SYNCING";

      return {
        id: w.id,
        name: w.name,
        code: w.code,
        wardKey,
        isActive,
        status,
        count,
        canOpen,
        canDrop,
        canSync,
      };
    });
  }, [wards, lmPcode, erfsQueries, activeWard?.id, isOnline]);

  /* ================= TRACK CURRENT SYNC STORY ================= */

  const trackedWardQuery = useMemo(() => {
    if (!lmPcode || !syncStory?.wardId) return null;

    const queryKey = getWardQueryCacheKey(lmPcode, syncStory.wardId);
    return erfsQueries?.[queryKey] || null;
  }, [lmPcode, syncStory?.wardId, erfsQueries]);

  useEffect(() => {
    if (!lmPcode || !syncStory?.wardId || !trackedWardQuery) return;

    const sync = trackedWardQuery?.data?.sync;

    if (sync?.status === "ready" && !syncStory?.finished) {
      const durationMs = syncStory?.startedAt
        ? Date.now() - syncStory.startedAt
        : 0;

      const totalDownloaded = Number(sync?.size || 0);
      const ratePerSecond =
        durationMs > 0 ? totalDownloaded / (durationMs / 1000) : 0;

      setDoneModalVisible(true);
      setSyncStory((prev) => ({
        ...prev,
        finished: true,
        durationMs,
        totalDownloaded,
        ratePerSecond,
      }));
    }
  }, [
    lmPcode,
    syncStory?.wardId,
    syncStory?.startedAt,
    syncStory?.finished,
    trackedWardQuery,
  ]);

  /* ================= STATES ================= */

  if (!lmPcode) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>NO WORKBASE SELECTED</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>LOADING WARDS...</Text>
      </View>
    );
  }

  /* ================= UI ================= */

  const currentLoadedCount = wardRows.reduce(
    (acc, w) => acc + (w.status === "READY" ? 1 : 0),
    0,
  );
  const currentTotalCount = wardRows.length;

  const handleOpenWard = (item) => {
    if (!item?.id || isRowActionBusy) return;

    setRowAction({ wardId: item.id, type: "open" });

    requestAnimationFrame(() => {
      updateGeo({
        selectedWard: {
          id: item.id,
          name: item.name,
        },
        lastSelectionType: "WARD",
      });

      router.replace("/(tabs)/erfs");
    });
  };

  const handleDropWard = (item) => {
    if (!item?.id || isRowActionBusy) return;

    setRowAction({ wardId: item.id, type: "drop" });

    requestAnimationFrame(() => {
      try {
        stopWardErfSubscription(dispatch, lmPcode, item.id);

        if (uid && activeWorkbaseId && lmPcode && item.id) {
          removeScopeDataset({
            uid,
            activeWorkbaseId,
            lmPcode,
            wardPcode: item.id,
            dataset: "erfs",
          });

          clearLastActiveScopeIfMatches({
            uid,
            activeWorkbaseId,
            lmPcode,
            wardPcode: item.id,
          });
        }

        if (activeWard?.id === item.id) {
          updateGeo({
            selectedWard: null,
            selectedErf: null,
            lastSelectionType: null,
          });
        }
      } finally {
        setRowAction(null);
      }
    });
  };

  return (
    <View style={styles.container}>
      <WardErfSyncLock
        visible={isAnySyncing}
        lmName={activeLm?.name}
        wardName={activeWard?.name || "Selected Ward"}
        phase="Preparing ward ERF pack for operational use..."
        loadedCount={currentLoadedCount}
        totalCount={currentTotalCount}
        lmStats={{
          wards: wards?.length || 0,
          erfs: null,
          meters: null,
          trns: null,
        }}
      />

      <WardErfsSyncDoneModal
        visible={doneModalVisible}
        lmName={activeLm?.name || "LOCAL MUNICIPALITY"}
        wardName={syncStory?.wardName || "WARD"}
        durationMs={syncStory?.durationMs || 0}
        totalDownloaded={syncStory?.totalDownloaded || 0}
        ratePerSecond={syncStory?.ratePerSecond || 0}
        onClose={() => {
          setDoneModalVisible(false);
        }}
        onOpenWard={() => {
          if (!syncStory?.wardId) {
            setDoneModalVisible(false);
            return;
          }

          updateGeo({
            selectedWard: {
              id: syncStory.wardId,
              name: syncStory.wardName,
            },
            lastSelectionType: "WARD",
          });

          setDoneModalVisible(false);
          router.replace("/(tabs)/erfs");
        }}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          WARD ERF CONTROL • {activeLm?.name}
        </Text>

        <Text style={styles.headerStatus}>
          NETWORK:{" "}
          <Text
            style={[
              styles.headerStatusValue,
              { color: isOnline ? "#166534" : "#B91C1C" },
            ]}
          >
            {isOnline ? "ONLINE" : "OFFLINE"}
          </Text>
        </Text>
      </View>

      <FlashList
        data={wardRows}
        keyExtractor={(item) => item.id}
        estimatedItemSize={80}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.title}>NO WARDS FOUND</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCurrentRowBusy = rowAction?.wardId === item.id;
          const isOpening = isCurrentRowBusy && rowAction?.type === "open";
          const isDropping = isCurrentRowBusy && rowAction?.type === "drop";

          return (
            <View style={[styles.row, item.isActive && styles.rowActive]}>
              <View style={styles.rowLeft}>
                <Text style={styles.wardName}>
                  {item.name}
                  {item.isActive ? " • ACTIVE" : ""}
                </Text>

                <Text style={styles.status}>
                  {item.status} •{" "}
                  <Text style={styles.countHighlight}>{item.count}</Text> ERFs
                </Text>
              </View>

              <View style={styles.rowRight}>
                {!item.canOpen && (
                  <TouchableOpacity
                    style={[
                      styles.syncBtn,
                      (!item.canSync || isRowActionBusy) && styles.syncBtnDisabled,
                    ]}
                    disabled={!item.canSync || isRowActionBusy}
                    onPress={() => {
                      setDoneModalVisible(false);
                      setSyncStory({
                        wardId: item.id,
                        wardName: item.name,
                        wardCode: item.code,
                        startedAt: Date.now(),
                        finished: false,
                        durationMs: 0,
                        totalDownloaded: 0,
                        ratePerSecond: 0,
                      });

                      startWardErfSubscription(dispatch, lmPcode, item.id, { uid, activeWorkbaseId });
                    }}
                  >
                    <Text style={styles.btnText}>
                      {item.status === "SYNCING" ? "SYNCING..." : "SYNC"}
                    </Text>
                  </TouchableOpacity>
                )}

                {item.canOpen && (
                  <TouchableOpacity
                    style={[
                      styles.openBtn,
                      isRowActionBusy && styles.actionBtnDisabled,
                    ]}
                    disabled={isRowActionBusy}
                    onPress={() => handleOpenWard(item)}
                  >
                    {isOpening ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.btnText}>OPEN</Text>
                    )}
                  </TouchableOpacity>
                )}

                {item.canDrop && (
                  <TouchableOpacity
                    style={[
                      styles.dropBtn,
                      isRowActionBusy && styles.actionBtnDisabled,
                    ]}
                    disabled={isRowActionBusy}
                    onPress={() => handleDropWard(item)}
                  >
                    {isDropping ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.btnText}>DROP</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  headerTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 1,
  },

  headerStatus: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },

  headerStatusValue: {
    fontWeight: "900",
  },

  row: {
    flexDirection: "row",
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  rowLeft: {
    flex: 1,
  },

  wardName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
  },

  status: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },

  rowRight: {
    flexDirection: "row",
    gap: 6,
  },

  syncBtn: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },

  syncBtnDisabled: {
    opacity: 0.45,
  },

  actionBtnDisabled: {
    opacity: 0.65,
  },

  openBtn: {
    backgroundColor: "#10B981",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },

  dropBtn: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },

  btnText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "900",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 14,
    fontWeight: "900",
  },

  rowActive: {
    backgroundColor: "#F0F9FF",
    borderLeftWidth: 4,
    borderLeftColor: "#38BDF8",
  },

  countHighlight: {
    color: "#2563EB",
    fontWeight: "900",
    fontSize: 12,
  },
});
