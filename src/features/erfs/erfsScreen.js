import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSelector } from "react-redux";

import { useGeo } from "../../context/GeoContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { erfWithCarriedBatchContext } from "../targetedBatches/targetedBatchContextCarry";
import ErfFilterHeader from "./erfFilterHeader";
import { ErfItem } from "./erfItem";
import { ErfSearch } from "./ErfSearch";
import {
  getWardErfLocalMetaByWard,
  getWardErfQueriesRevision,
  getWardErfSyncInfo,
  getWardPcode,
  WARD_ERF_SYNC_STATUS,
} from "./wardErfSyncStatus";

/* ================= STATES ================= */

function EmptyScopeState({ title = "SCOPE NOT READY", message }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

function AwaitWardState({ lmName, wardsCount }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>SELECT A WARD</Text>

      <Text style={styles.message}>
        You are currently viewing the LM overview for:
      </Text>

      <Text style={styles.strong}>{lmName}</Text>

      <Text style={styles.hint}>
        {wardsCount > 0
          ? "Choose a ward from the selector above to load ERFs."
          : "No wards available for this LM."}
      </Text>
    </View>
  );
}

function NoErfsState({ lmName, wardName }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>NO ERFs FOUND</Text>

      <Text style={styles.message}>There are currently no ERFs for:</Text>

      <Text style={styles.strong}>
        {lmName} • {wardName}
      </Text>
    </View>
  );
}

/* ================= SCREEN ================= */

export default function ErfsScreen() {
  const router = useRouter();

  const { geoState, updateGeo } = useGeo();
  const { all, filtered, sync } = useWarehouse();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const scopeSync = sync?.scope ?? { status: "idle" };

  const lmName = geoState?.selectedLm?.name ?? "LOCAL MUNICIPALITY";
  const wardName = geoState?.selectedWard?.name ?? "WARD";

  const hasLm = !!geoState?.selectedLm?.id;
  const hasWard = !!geoState?.selectedWard?.id;
  const lmPcode = geoState?.selectedLm?.pcode || geoState?.selectedLm?.id || null;
  const wardPcode = getWardPcode(geoState?.selectedWard);

  const wardsCount = all?.wards?.length ?? 0;

  // TB-R051: an ERF opened from this list keeps the batch only for the same ERF.
  // ErfItem is memoised and keeps old handlers, so they read the batch from this
  // ref when pressed, never from the render they were created in.
  const batchContextRef = useRef(null);
  batchContextRef.current = geoState?.selectedErf?.targetedBatchContext;

  /* ================= RTK CACHE ================= */

  const erfsQueries = useSelector((state) => state.erfsApi?.queries || {});
  const erfsQueriesRevision = useMemo(
    () => getWardErfQueriesRevision(erfsQueries),
    [erfsQueries],
  );

  const localWardErfMetaByPcode = useMemo(
    () => {
      void erfsQueriesRevision;
      return getWardErfLocalMetaByWard(lmPcode);
    },
    [lmPcode, erfsQueriesRevision],
  );

  const activeWardErfInfo = useMemo(
    () =>
      getWardErfSyncInfo({
        erfsQueries,
        localMetaByPcode: localWardErfMetaByPcode,
        lmPcode,
        wardPcode,
      }),
    [erfsQueries, localWardErfMetaByPcode, lmPcode, wardPcode],
  );

  const wardStatus = activeWardErfInfo.status;
  const wardSize = activeWardErfInfo.size;

  /* ================= HEADER WARD SELECT ================= */

  const handleWardErfSync = () => {
    router.push("/(tabs)/erfs/ward-erfs-sync");
  };

  const handleWardSelectionFromHeader = (ward) => {
    if (!ward?.id) {
      updateGeo({
        selectedWard: null,
        selectedErf: null,
        selectedPremise: null,
        selectedMeter: null,
        lastSelectionType: "WARD",
      });
      return;
    }

    const nextWardStatus = getWardErfSyncInfo({
      erfsQueries,
      localMetaByPcode: localWardErfMetaByPcode,
      lmPcode,
      wardPcode: getWardPcode(ward),
    }).status;

    if (nextWardStatus === WARD_ERF_SYNC_STATUS.READY) {
      updateGeo({
        selectedWard: ward,
        selectedErf: null,
        selectedPremise: null,
        selectedMeter: null,
        lastSelectionType: "WARD",
      });
      return;
    }

    router.push("/(tabs)/erfs/ward-erfs-sync");
  };

  /* ================= REDIRECT ================= */

  useEffect(() => {
    if (!hasLm || !hasWard) return;

    if (wardStatus !== WARD_ERF_SYNC_STATUS.READY) {
      router.replace("/(tabs)/erfs/ward-erfs-sync");
    }
  }, [hasLm, hasWard, wardStatus, router]);

  /* ================= FILTER ================= */

  const scopeErfs = useMemo(() => filtered?.erfs || [], [filtered?.erfs]);

  const visibleErfs = useMemo(() => {
    let list = [...scopeErfs];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      // Erf number only. The erf id is the surveyor-general parcel key and
      // carries the erf number inside it, so matching it dragged in erfs the
      // worker never asked for.
      list = list.filter((e) => e?.erfNo?.toLowerCase().includes(q));
    }

    return list;
  }, [searchQuery, scopeErfs]);

  const closeSearch = () => {
    setSearchQuery("");
    setShowSearch(false);
  };

  /* ================= GUARDS ================= */

  if (!hasLm) {
    return <EmptyScopeState message="No active workbase selected." />;
  }

  if (scopeSync?.status === "invalid-ward") {
    return (
      <EmptyScopeState message="Selected ward is not valid for this workbase." />
    );
  }

  if (!hasWard) {
    return (
      <View style={styles.container}>
        <ErfFilterHeader
          selectedWard={geoState.selectedWard}
          setSelectedWard={handleWardSelectionFromHeader}
          totalCount={0}
          filteredCount={0}
          onWardErfSync={handleWardErfSync}
          showSearch={false}
        />

        <AwaitWardState lmName={lmName} wardsCount={wardsCount} />
      </View>
    );
  }

  /* 🚨 NOT LOADED → SAFE FALLBACK */

  if (hasWard && wardStatus !== WARD_ERF_SYNC_STATUS.READY) {
    return (
      <EmptyScopeState
        title="WARD NOT READY"
        message={`Please sync ERFs for ${lmName} • ${wardName}`}
      />
    );
  }

  /* 🚨 NO ERFs */

  if (wardStatus === WARD_ERF_SYNC_STATUS.READY && wardSize === 0) {
    return <NoErfsState lmName={lmName} wardName={wardName} />;
  }

  /* ================= MAIN ================= */

  return (
    <View style={styles.container}>
      {wardStatus === WARD_ERF_SYNC_STATUS.SYNCING && (
        <View style={styles.syncingBanner}>
          <ActivityIndicator size="small" />
          <Text style={styles.syncingText}>SYNCING WARD ERFs...</Text>
        </View>
      )}

      <ErfFilterHeader
        selectedWard={geoState.selectedWard}
        setSelectedWard={handleWardSelectionFromHeader}
        totalCount={all?.erfs?.length || 0}
        filteredCount={visibleErfs.length}
        onWardErfSync={handleWardErfSync}
        showSearch={showSearch}
        onSearchPress={() => setShowSearch(true)}
        isFiltering={Boolean(searchQuery)}
      />

      <FlashList
        data={visibleErfs}
        keyExtractor={(item) => item?.id}
        estimatedItemSize={106}
        renderItem={({ item }) => (
          <ErfItem
            item={item}
            isActive={item?.id === geoState?.selectedErf?.id}
            onSelect={() => {
              const isSame = geoState?.selectedErf?.id === item.id;
              updateGeo({
                selectedErf: isSame
                  ? null
                  : erfWithCarriedBatchContext({
                      erf: item,
                      selectedErfContext: batchContextRef.current,
                    }),
                lastSelectionType: isSame ? null : "ERF",
              });
            }}
            onMapPress={() => {
              updateGeo({
                selectedErf: erfWithCarriedBatchContext({
                  erf: item,
                  selectedErfContext: batchContextRef.current,
                }),
                lastSelectionType: "ERF",
              });
              router.push("/(tabs)/maps");
            }}
            onErfDetailPress={(item) => {
              updateGeo({
                selectedErf: erfWithCarriedBatchContext({
                  erf: item,
                  selectedErfContext: batchContextRef.current,
                }),
                lastSelectionType: "ERF",
              });
              router.push("/(tabs)/premises");
            }}
          />
        )}
      />

      <ErfSearch
        visible={showSearch}
        onClose={closeSearch}
        value={searchQuery}
        onChange={setSearchQuery}
      />
    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },

  title: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },

  message: {
    marginTop: 10,
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
  },

  strong: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },

  hint: {
    marginTop: 12,
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
  },

  syncingBanner: {
    backgroundColor: "#e3f2fd",
    paddingVertical: 4,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  syncingText: {
    fontSize: 10,
    color: "#1976d2",
    fontWeight: "bold",
  },
});
