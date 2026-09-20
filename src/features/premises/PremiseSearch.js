import { FilterSearchOverlay } from "../filters/FilterSearchOverlay";

export const PremiseSearch = ({ visible, onClose, value, onChange }) => {
  return (
    <FilterSearchOverlay
      visible={visible}
      onClose={onClose}
      value={value}
      onChange={onChange}
      placeholder="Search Address or Erf..."
    />
  );
};

export default PremiseSearch;
