import { createContext, useContext, useMemo, useState } from "react";

export const PremiseFilterContext = createContext();

const initialPremiseFilterState = {
  searchQuery: "",

  propertyTypes: [],
  occupancyStatuses: [],
  geofenceIds: [],

  electricityMeterCounts: [],
  waterMeterCounts: [],
  noAccessCounts: [],
};

export const PremiseFilterProvider = ({ children }) => {
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const [filterState, setFilterState] = useState(initialPremiseFilterState);

  const resetFilters = () => setFilterState(initialPremiseFilterState);

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
    }),
    [showSearch, showFilters, showStats, filterState],
  );

  return (
    <PremiseFilterContext.Provider value={value}>
      {children}
    </PremiseFilterContext.Provider>
  );
};

export const usePremiseFilter = () => useContext(PremiseFilterContext);
