import { FilterSearchOverlay } from "../filters/FilterSearchOverlay";

export function ErfSearch({ visible, onClose, value, onChange }) {
  return (
    <FilterSearchOverlay
      visible={visible}
      onClose={onClose}
      value={value}
      onChange={onChange}
      placeholder="Search Erf No..."
    />
  );
}

export default ErfSearch;
