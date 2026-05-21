import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export const AST_FILTER_DATA_ISSUE = "DATA_ISSUE";

export const initialAstFilterState = {
  searchQuery: "",

  meterServices: [],
  meterCategories: [],
  meterPhases: [],
  meterTypes: [],

  astStatuses: [],
  visibilityStates: [],

  geofenceFilters: [],
  offGridSupplyStates: [],
  placements: [],
  sealStates: [],
  cbSizes: [],

  manufacturers: [],
  propertyTypes: [],
  captureSources: [],
};

export const AstFilterContext = createContext(null);

export function getActiveAstFilterCount(filterState = {}) {
  return (
    (String(filterState?.searchQuery || "").trim() ? 1 : 0) +
    (filterState?.meterServices?.length > 0 ? 1 : 0) +
    (filterState?.meterCategories?.length > 0 ? 1 : 0) +
    (filterState?.meterPhases?.length > 0 ? 1 : 0) +
    (filterState?.meterTypes?.length > 0 ? 1 : 0) +
    (filterState?.astStatuses?.length > 0 ? 1 : 0) +
    (filterState?.visibilityStates?.length > 0 ? 1 : 0) +
    (filterState?.geofenceFilters?.length > 0 ? 1 : 0) +
    (filterState?.offGridSupplyStates?.length > 0 ? 1 : 0) +
    (filterState?.placements?.length > 0 ? 1 : 0) +
    (filterState?.sealStates?.length > 0 ? 1 : 0) +
    (filterState?.cbSizes?.length > 0 ? 1 : 0) +
    (filterState?.manufacturers?.length > 0 ? 1 : 0) +
    (filterState?.propertyTypes?.length > 0 ? 1 : 0) +
    (filterState?.captureSources?.length > 0 ? 1 : 0)
  );
}

export function toggleAstFilterArrayValue(currentValues = [], nextValue) {
  if (!nextValue) return currentValues;

  const safeValues = Array.isArray(currentValues) ? currentValues : [];

  if (safeValues.includes(nextValue)) {
    return safeValues.filter((value) => value !== nextValue);
  }

  return [...safeValues, nextValue];
}

export function AstFilterProvider({ children }) {
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const [filterState, setFilterState] = useState(initialAstFilterState);

  const resetFilters = useCallback(() => {
    setFilterState(initialAstFilterState);
    setShowSearch(false);
  }, []);

  const activeFilterCount = useMemo(
    () => getActiveAstFilterCount(filterState),
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
    <AstFilterContext.Provider value={value}>
      {children}
    </AstFilterContext.Provider>
  );
}

export function useAstFilter() {
  const context = useContext(AstFilterContext);

  if (!context) {
    throw new Error("useAstFilter must be used inside AstFilterProvider");
  }

  return context;
}
