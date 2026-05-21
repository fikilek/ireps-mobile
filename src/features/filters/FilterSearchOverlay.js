import { useEffect, useState } from "react";
import {
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
} from "react-native";
import { IconButton, Surface } from "react-native-paper";

export function FilterSearchOverlay({
  visible,
  onClose,
  value,
  onChange,
  placeholder = "Search...",
  autoFocus = true,
}) {
  const [keyboardHeight] = useState(new Animated.Value(0));

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        Animated.spring(keyboardHeight, {
          toValue: event.endCoordinates.height,
          useNativeDriver: false,
          friction: 8,
        }).start();
      },
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        Animated.spring(keyboardHeight, {
          toValue: 0,
          useNativeDriver: false,
          friction: 8,
        }).start();
      },
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardHeight]);

  if (!visible) return null;

  const handleClose = () => {
    onChange?.("");
    onClose?.();
    Keyboard.dismiss();
  };

  return (
    <Animated.View
      style={[
        styles.searchWrapper,
        { bottom: Animated.add(keyboardHeight, 0) },
      ]}
    >
      <Surface style={styles.searchBar} elevation={5}>
        <IconButton icon="magnify" size={24} iconColor="#64748b" />

        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChange}
          autoFocus={autoFocus}
          returnKeyType="search"
        />

        <IconButton
          icon="close-circle"
          size={24}
          iconColor="#ef4444"
          onPress={handleClose}
        />
      </Surface>
    </Animated.View>
  );
}

export default FilterSearchOverlay;

const styles = StyleSheet.create({
  searchWrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 30,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 56,
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    color: "#1e293b",
    fontWeight: "700",
  },
});
