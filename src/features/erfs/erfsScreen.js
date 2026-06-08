import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSelector } from "react-redux";

import { useGeo } from "../../context/GeoContext";
import { useWarehouse } from "../../context/WarehouseContext";
import ErfFilterHeader from "./erfFilterHeader";
import { ErfItem } from "./erfItem";
import ErfsBottomSearch from "./ErfsBottomSearch";

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

  const scopeSync = sync?.scope ?? { status: "idle" };

  const lmName = geoState?.selectedLm?.name ?? "LOCAL MUNICIPALITY";
  const wardName = geoState?.selectedWard?.name ?? "WARD";

  const hasLm = !!geoState?.selectedLm?.id;
  const hasWard = !!geoState?.selectedWard?.id;

  const wardsCount = all?.wards?.length ?? 0;
  const erfsCount = all?.erfs?.length ?? 0;

  /* ================= RTK CACHE ================= */

  const erfsQueries = useSelector((state) => state.erfsApi?.queries || {});

  const wardCacheKey =
    hasLm && hasWard
      ? `${geoState.selectedLm.id}__${geoState.selectedWard.id}`
      : null;

  const wardQuery = wardCacheKey
    ? erfsQueries[`getErfsByLmPcodeWardPcode(${wardCacheKey})`]
    : null;

  const rawWardStatus = wardQuery?.data?.sync?.status || null;
  const wardSize = wardQuery?.data?.sync?.size ?? null;

  const wardStatus =
    rawWardStatus === "syncing"
      ? "SYNCING"
      : rawWardStatus === "ready"
        ? "READY"
        : rawWardStatus === "error"
          ? "ERROR"
          : "MISSING";

  /* ================= HEADER WARD SELECT ================= */

  const handleWardSelectionFromHeader = (ward) => {
    if (!ward?.id) {
      updateGeo({ selectedWard: null, lastSelectionType: "WARD" });
      return;
    }

    const nextWardCacheKey =
      geoState?.selectedLm?.id && ward?.id
        ? `${geoState.selectedLm.id}__${ward.id}`
        : null;

    const nextWardQuery = nextWardCacheKey
      ? erfsQueries[`getErfsByLmPcodeWardPcode(${nextWardCacheKey})`]
      : null;

    const rawNextWardStatus = nextWardQuery?.data?.sync?.status || null;

    const nextWardStatus =
      rawNextWardStatus === "syncing"
        ? "SYNCING"
        : rawNextWardStatus === "ready"
          ? "READY"
          : rawNextWardStatus === "error"
            ? "ERROR"
            : "MISSING";

    if (nextWardStatus === "READY") {
      updateGeo({ selectedWard: ward, lastSelectionType: "WARD" });
      return;
    }

    router.push("/(tabs)/erfs/ward-erfs-sync");
  };

  /* ================= REDIRECT ================= */

  useEffect(() => {
    if (!hasLm || !hasWard) return;

    if (wardStatus === "MISSING") {
      router.push("/(tabs)/erfs/ward-erfs-sync");
    }
  }, [hasLm, hasWard, wardStatus, router]);

  /* ================= FILTER ================= */

  const visibleErfs = useMemo(() => {
    let list = [...(filtered?.erfs || [])];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e?.erfNo?.toLowerCase().includes(q) ||
          e?.id?.toLowerCase().includes(q),
      );
    }

    return list;
  }, [searchQuery, filtered?.erfs]);

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
          filteredCount={0}
        />

        <AwaitWardState lmName={lmName} wardsCount={wardsCount} />

        <ErfsBottomSearch
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          count={0}
        />
      </View>
    );
  }

  /* 🚨 NOT LOADED → SAFE FALLBACK */

  if (wardStatus === "MISSING") {
    return (
      <EmptyScopeState
        title="WARD NOT LOADED"
        message={`Please sync ERFs for ${lmName} • ${wardName}`}
      />
    );
  }

  /* 🚨 NO ERFs */

  if (wardStatus === "READY" && wardSize === 0) {
    return <NoErfsState lmName={lmName} wardName={wardName} />;
  }

  /* ================= MAIN ================= */

  return (
    <View style={styles.container}>
      {wardStatus === "SYNCING" && (
        <View style={styles.syncingBanner}>
          <ActivityIndicator size="small" />
          <Text style={styles.syncingText}>SYNCING WARD ERFs...</Text>
        </View>
      )}

      <ErfFilterHeader
        selectedWard={geoState.selectedWard}
        setSelectedWard={handleWardSelectionFromHeader}
        filteredCount={visibleErfs.length}
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
                selectedErf: isSame ? null : item,
                lastSelectionType: isSame ? null : "ERF",
              });
            }}
            onMapPress={() => {
              updateGeo({ selectedErf: item, lastSelectionType: "ERF" });
              router.push("/(tabs)/maps");
            }}
            onErfDetailPress={(item) => {
              updateGeo({
                selectedErf: item,
                lastSelectionType: "ERF",
              });
              router.push("/(tabs)/premises");
            }}
          />
        )}
      />

      <ErfsBottomSearch
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        count={visibleErfs.length}
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
