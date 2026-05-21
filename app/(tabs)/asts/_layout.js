import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import SovereignHeader from "../../../components/SovereignHeader";
import { AstFilterProvider } from "../../../src/context/AstFilterContext";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import { AstFilterModal } from "../../../src/features/asts/AstFilterModal";
import { AstSearch } from "../../../src/features/asts/AstSearch";
import { AstStatsModal } from "../../../src/features/asts/AstStatsModal";
import { filterAsts } from "../../../src/features/asts/filterAsts";
import { useAstFilter } from "../../../src/hooks/useAstFilter";

function safeParseJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value !== "string") return value;
    return JSON.parse(decodeURIComponent(value));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isWmsLifecycleRoute(params = {}) {
  const action = safeParseJson(params?.action, {});

  return (
    normalizeUpper(params?.source) === "WMS" ||
    normalizeUpper(action?.source) === "WMS"
  );
}

function clearAstsStackAndRouteToMyWork(router) {
  const astsIndexRoute = "/(tabs)/asts";
  const myWorkordersRoute = "/(tabs)/admin/operations/my-workorders";

  console.log("AstLifecycleHeaderBackButton -- clear ast stack then route", {
    astsIndexRoute,
    myWorkordersRoute,
  });

  if (typeof router?.replace === "function") {
    router.replace(astsIndexRoute);

    setTimeout(() => {
      router.replace(myWorkordersRoute);
    }, 0);

    return;
  }

  if (typeof router?.push === "function") {
    router.push(myWorkordersRoute);
  }
}

function AstLifecycleHeaderBackButton() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isWmsRoute = isWmsLifecycleRoute(params);

  function handleBackPress() {
    if (isWmsRoute) {
      clearAstsStackAndRouteToMyWork(router);
      return;
    }

    if (typeof router?.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }

    if (typeof router?.replace === "function") {
      router.replace("/(tabs)/asts");
    }
  }

  return (
    <TouchableOpacity
      style={styles.lifecycleBackButton}
      activeOpacity={0.8}
      onPress={handleBackPress}
    >
      <MaterialCommunityIcons name="chevron-left" size={24} color="#0f172a" />
      <Text style={styles.lifecycleBackButtonText}>
        {isWmsRoute ? "My Work" : "Back"}
      </Text>
    </TouchableOpacity>
  );
}

function lifecycleScreenOptions(title) {
  return {
    title,
    headerShown: true,
    headerShadowVisible: true,
    headerStyle: { backgroundColor: "#F8FAFC" },
    headerTitleStyle: {
      fontSize: 14,
      fontWeight: "900",
      color: "#0F172A",
    },
    headerBackVisible: false,
    headerLeft: () => <AstLifecycleHeaderBackButton />,
  };
}

function AstsLayoutContent() {
  const { filtered } = useWarehouse();

  const {
    showFilters,
    setShowFilters,
    showStats,
    setShowStats,
    showSearch,
    setShowSearch,
    filterState,
    setFilterState,
    resetFilters,
    activeFilterCount,
    isFiltering,
  } = useAstFilter();

  const baseMeters = useMemo(() => {
    return filtered?.meters || [];
  }, [filtered?.meters]);

  const filteredMeters = useMemo(() => {
    return filterAsts(baseMeters, filterState);
  }, [baseMeters, filterState]);

  return (
    <>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            header: () => (
              <SovereignHeader
                title="METERS"
                totalCount={baseMeters.length}
                filteredCount={filteredMeters.length}
                isFiltering={isFiltering}
                filterCount={activeFilterCount}
                showSearch={showSearch}
                onSearchPress={() => setShowSearch(true)}
                onFilterPress={() => setShowFilters(true)}
                onStatsPress={() => setShowStats(true)}
                onQuickReset={() => resetFilters()}
              />
            ),
          }}
        />

        <Stack.Screen
          name="[id]"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="inspection"
          options={lifecycleScreenOptions("Meter Inspection")}
        />

        <Stack.Screen
          name="disconnection"
          options={lifecycleScreenOptions("Meter Disconnection")}
        />

        <Stack.Screen
          name="reconnection"
          options={lifecycleScreenOptions("Meter Reconnection")}
        />

        <Stack.Screen
          name="removal"
          options={lifecycleScreenOptions("Meter Removal")}
        />

        <Stack.Screen
          name="meter-reading"
          options={lifecycleScreenOptions("Meter Reading")}
        />

        <Stack.Screen
          name="media"
          options={{
            title: "ASSET EVIDENCE",
            headerStyle: { backgroundColor: "#F8FAFC" },
            headerTitleStyle: {
              fontWeight: "900",
              color: "#0F172A",
              letterSpacing: 1,
            },
            headerShadowVisible: true,
            presentation: "modal",
          }}
        />

        <Stack.Screen
          name="details"
          options={{
            title: "Meter details",
            headerShown: true,
          }}
        />
      </Stack>

      <AstFilterModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        filterState={filterState}
        setFilterState={setFilterState}
        resetFilters={resetFilters}
        asts={baseMeters}
      />

      <AstStatsModal
        visible={showStats}
        onClose={() => setShowStats(false)}
        baseAsts={baseMeters}
        filteredAsts={filteredMeters}
        isFiltering={isFiltering}
      />

      <AstSearch
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        value={filterState.searchQuery}
        onChange={(text) =>
          setFilterState((prev) => ({
            ...prev,
            searchQuery: text,
          }))
        }
      />
    </>
  );
}

export default function AstsLayout() {
  return (
    <AstFilterProvider>
      <AstsLayoutContent />
    </AstFilterProvider>
  );
}

const styles = StyleSheet.create({
  lifecycleBackButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    marginLeft: -4,
  },
  lifecycleBackButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },
});
