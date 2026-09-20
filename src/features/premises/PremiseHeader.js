import { useMemo } from "react";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import { usePremiseFilter } from "../../context/PremiseFilterContext";
import { FilterHeaderBase } from "../filters/FilterHeaderBase";
import { filterPremises } from "./filterPremises";

export const PremiseHeader = ({
  onStatsPress,
  onFilterPress,
  onSearchPress,
  isFiltering: isFilteringProp,
  filterCount: filterCountProp,
  onQuickReset,
}) => {
  const { all } = useWarehouse();
  const { filterState, showSearch } = usePremiseFilter();

  const totalCount = all?.prems?.length || 0;

  const filteredCount = useMemo(() => {
    return filterPremises(all?.prems || [], filterState).length;
  }, [all?.prems, filterState]);

  return (
    <FilterHeaderBase
      searchLabel="ERF/STRNAME"
      totalCount={totalCount}
      filteredCount={filteredCount}
      showSearch={showSearch}
      isFiltering={Boolean(isFilteringProp)}
      filterCount={Number(filterCountProp || 0)}
      onSearchPress={onSearchPress}
      onStatsPress={onStatsPress}
      onFilterPress={onFilterPress}
      onQuickReset={onQuickReset}
    />
  );
};

export default PremiseHeader;
