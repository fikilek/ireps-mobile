import { getIn, useFormikContext } from "formik";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../src/theme/formColors";

const FormInput = ({
  label,
  name,
  placeholder,
  autoCapitalize = "words",
  numbersOnly = false,
  ...props
}) => {
  const { values, errors, setFieldValue, handleBlur, isSubmitting } =
    useFormikContext();

  const value = getIn(values, name);
  const error = getIn(errors, name);

  // 🎯 Visual logic: Show error if touched OR if form validated on mount
  const hasError = !!error;

  const handleTextChange = (text) => {
    const nextValue = numbersOnly ? text.replace(/[^0-9]/g, "") : text;
    setFieldValue(name, nextValue);
  };

  const handleFinalize = (e) => {
    const formatted = numbersOnly
      ? String(value || "")
      : capitalizeWords(value || "");
    setFieldValue(name, formatted, true);
    handleBlur(name)(e);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, hasError && { color: "#ef4444" }]}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          hasError && styles.inputError, // 🏛️ Sexy Red Left Border
          isSubmitting && styles.disabledInput,
        ]}
        placeholder={placeholder}
        value={value}
        onChangeText={handleTextChange}
        // onBlur={handleBlur(name)}
        editable={!isSubmitting} // 🛡️ Freeze on submit
        onBlur={handleFinalize} // 🎯 Format on exit
        autoCapitalize={autoCapitalize}
        placeholderTextColor={FORM_PLACEHOLDER}
        {...props}
      />
      {hasError && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 12, width: "100%" },
  label: {
    fontSize: 10,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: FORM_TEXT,
    fontWeight: "600",
  },
  inputError: {
    borderLeftWidth: 5, // 🎯 The Sexy Subtle Visual
    borderLeftColor: "#ef4444",
    backgroundColor: "#fff1f2",
  },
  errorText: {
    fontSize: 10,
    color: "#ef4444",
    marginTop: 2,
    fontWeight: "700",
  },
  disabledInput: { opacity: 0.5, backgroundColor: "#e2e8f0" },
});

export default FormInput;

function capitalizeWords(sentence) {
  // The regex /\b(\w)/g finds the start of each word (\b)
  // and captures the first character of the word (\w).
  // The 'g' flag ensures it matches all occurrences, not just the first.
  return sentence.replace(/\b(\w)/g, function (match, capture) {
    return capture.toUpperCase();
  });
}
