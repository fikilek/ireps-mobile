import { Stack } from "expo-router";
import { useMemo } from "react";

import { TrnFilterProvider } from "../../../src/context/TrnFilterContext";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import FilterHeaderBase from "../../../src/features/filters/FilterHeaderBase";
import { filterTrns } from "../../../src/features/trns/filterTrns";
import TrnFilterModal from "../../../src/features/trns/TrnFilterModal";
import TrnSearch from "../../../src/features/trns/TrnSearch";
import TrnStatsModal from "../../../src/features/trns/TrnStatsModal";
import { useTrnFilter } from "../../../src/hooks/useTrnFilter";

function TrnsLayoutContent() {
  const { filtered: warehouseFiltered } = useWarehouse();

  const baseTrns = useMemo(
    () => warehouseFiltered?.trns || [],
    [warehouseFiltered?.trns],
  );

  const {
    showSearch,
    setShowSearch,

    showFilters,
    setShowFilters,

    showStats,
    setShowStats,

    filterState,
    setFilterState,

    resetFilters,
    activeFilterCount,
    isFiltering,
  } = useTrnFilter();

  const displayTrns = useMemo(() => {
    return filterTrns(baseTrns, filterState);
  }, [baseTrns, filterState]);

  return (
    <>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            header: () => (
              <FilterHeaderBase
                title="TRNS"
                totalCount={baseTrns.length}
                filteredCount={displayTrns.length}
                searchLabel="TRN/METER"
                showSearch={showSearch}
                isFiltering={isFiltering}
                filterCount={activeFilterCount}
                onSearchPress={() => setShowSearch(true)}
                onFilterPress={() => setShowFilters(true)}
                onStatsPress={() => setShowStats(true)}
                onQuickReset={resetFilters}
              />
            ),
          }}
        />

        <Stack.Screen
          name="[id]"
          options={{
            presentation: "transparentModal",
            headerShown: false,
            animation: "fade",
          }}
        />
      </Stack>

      <TrnFilterModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        filterState={filterState}
        setFilterState={setFilterState}
        allTrns={baseTrns}
        filteredCount={displayTrns.length}
      />

      <TrnStatsModal
        visible={showStats}
        onClose={() => setShowStats(false)}
        allTrns={baseTrns}
        displayTrns={displayTrns}
        isFiltering={isFiltering}
      />

      <TrnSearch
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        value={filterState.searchQuery}
        onChange={(text) =>
          setFilterState((prev) => ({ ...prev, searchQuery: text }))
        }
      />
    </>
  );
}

export default function TrnsLayout() {
  return (
    <TrnFilterProvider>
      <TrnsLayoutContent />
    </TrnFilterProvider>
  );
}
