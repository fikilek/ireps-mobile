import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const TRN_DATE_PRESETS = {
  ALL: "ALL",
  TODAY: "TODAY",
  YESTERDAY: "YESTERDAY",
  THIS_WEEK: "THIS_WEEK",
  LAST_7_DAYS: "LAST_7_DAYS",
  THIS_MONTH: "THIS_MONTH",
  LAST_MONTH: "LAST_MONTH",
  CUSTOM_DURATION: "CUSTOM_DURATION",
};

export const TRN_FILTER_DATA_ISSUE = "DATA_ISSUE";

export const initialTrnFilterState = {
  searchQuery: "",

  trnTypes: [],
  workflowStates: [],
  originChannels: [],
  executionOutcomes: [],
  accessStates: [],

  meterServices: [],
  meterCategories: [],
  meterTypes: [],

  datePreset: TRN_DATE_PRESETS.ALL,
  customDateStart: "",
  customDateEnd: "",
};

export const TrnFilterContext = createContext(null);

export function getActiveTrnFilterCount(filterState = {}) {
  return (
    (String(filterState?.searchQuery || "").trim() ? 1 : 0) +
    (filterState?.trnTypes?.length > 0 ? 1 : 0) +
    (filterState?.workflowStates?.length > 0 ? 1 : 0) +
    (filterState?.originChannels?.length > 0 ? 1 : 0) +
    (filterState?.executionOutcomes?.length > 0 ? 1 : 0) +
    (filterState?.accessStates?.length > 0 ? 1 : 0) +
    (filterState?.meterServices?.length > 0 ? 1 : 0) +
    (filterState?.meterCategories?.length > 0 ? 1 : 0) +
    (filterState?.meterTypes?.length > 0 ? 1 : 0) +
    (filterState?.datePreset && filterState.datePreset !== TRN_DATE_PRESETS.ALL
      ? 1
      : 0)
  );
}

export function toggleFilterArrayValue(currentValues = [], nextValue) {
  if (!nextValue) return currentValues;

  const safeValues = Array.isArray(currentValues) ? currentValues : [];

  if (safeValues.includes(nextValue)) {
    return safeValues.filter((value) => value !== nextValue);
  }

  return [...safeValues, nextValue];
}

export function TrnFilterProvider({ children }) {
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const [filterState, setFilterState] = useState(initialTrnFilterState);

  const resetFilters = useCallback(() => {
    setFilterState(initialTrnFilterState);
    setShowSearch(false);
  }, []);

  const activeFilterCount = useMemo(
    () => getActiveTrnFilterCount(filterState),
    [filterState],
  );

  const isFiltering = activeFilterCount > 0;

  const value = useMemo(
    () => ({
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
    }),
    [
      showSearch,
      showFilters,
      showStats,
      filterState,
      resetFilters,
      activeFilterCount,
      isFiltering,
    ],
  );

  return (
    <TrnFilterContext.Provider value={value}>
      {children}
    </TrnFilterContext.Provider>
  );
}

export function useTrnFilter() {
  const context = useContext(TrnFilterContext);

  if (!context) {
    throw new Error("useTrnFilter must be used inside TrnFilterProvider");
  }

  return context;
}
