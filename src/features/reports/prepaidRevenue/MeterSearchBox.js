// src/features/reports/prepaidRevenue/MeterSearchBox.js
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { FORM_PLACEHOLDER } from "../../../theme/formColors";

export default function MeterSearchBox({
  value,
  onChangeText,
  width = 150,
  placeholder = "Meter…",
  isDebouncing = false, // 👈 optional indicator from parent
}) {
  const [focused, setFocused] = useState(false);
  const hasText = !!value;

  return (
    <View
      style={{
        width,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: "#F9FAFB",
        borderWidth: 1,
        borderColor: focused ? "#2563EB" : "#E5E7EB",
      }}
    >
      {/* INPUT */}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={FORM_PLACEHOLDER}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType="number-pad"
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: "700",
          color: "#111827",
          padding: 0,
        }}
      />

      {/* DEBOUNCE INDICATOR */}
      {isDebouncing && (
        <Text style={{ fontSize: 10, color: "#6B7280", marginRight: 6 }}>
          …
        </Text>
      )}

      {/* CLEAR BUTTON */}
      {hasText && (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={10}
          style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 8,
            backgroundColor: "#E5E7EB",
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "900",
              color: "#111827",
            }}
          >
            ✕
          </Text>
        </Pressable>
      )}
    </View>
  );
}
