import FilterSearchOverlay from "../filters/FilterSearchOverlay";

export function TrnSearch({ visible, onClose, value, onChange }) {
  return (
    <FilterSearchOverlay
      visible={visible}
      onClose={onClose}
      value={value}
      onChange={onChange}
      placeholder="Search TRN, meter, ERF, address..."
    />
  );
}

export default TrnSearch;
