import { getIn, useFormikContext } from "formik";
import { StyleSheet, View } from "react-native";
import { Chip, HelperText, Text } from "react-native-paper";
import { FORM_TEXT } from "../../src/theme/formColors";

export const FormMultiSelect = ({ name, label, options, disabled }) => {
  const { values, setFieldValue, errors, touched } = useFormikContext();

  // 🛰️ Deeply resolve the value (e.g., "ast.normalisation.actions")
  const currentValue = getIn(values, name) || [];
  const error = getIn(errors, name);
  const isTouched = getIn(touched, name);

  const toggleOption = (optionValue) => {
    if (disabled) return;

    const newValue = currentValue.includes(optionValue)
      ? currentValue.filter((v) => v !== optionValue) // ✂️ Remove if exists
      : [...currentValue, optionValue]; // ➕ Add if new

    setFieldValue(name, newValue);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipGroup}>
        {options.map((option) => {
          const isSelected = currentValue.includes(option.value);
          return (
            <Chip
              key={option.value}
              selected={isSelected}
              onPress={() => toggleOption(option.value)}
              disabled={disabled}
              mode={isSelected ? "flat" : "outlined"}
              style={[styles.chip, isSelected && styles.selectedChip]}
              showSelectedOverlay
              icon={isSelected ? "check" : "plus"}
            >
              {option.label}
            </Chip>
          );
        })}
      </View>
      {isTouched && error && (
        <HelperText type="error" visible={true}>
          {error}
        </HelperText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: 10 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: FORM_TEXT,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { marginBottom: 4 },
  selectedChip: { backgroundColor: "#dcfce7", borderColor: "#059669" },
});
