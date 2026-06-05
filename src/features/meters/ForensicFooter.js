import { useFormikContext } from "formik";
// 🎯 ADDED: Alert and MaterialCommunityIcons
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Button } from "react-native-paper";

export const ForensicFooter = ({ isTrnLoading }) => {
  // const navigation = useNavigation();
  // const { handleSubmit, isValid, dirty, resetForm } = useFormikContext();
  const { handleSubmit, isValid, dirty, resetForm, isSubmitting } =
    useFormikContext();

  // 🎯 The Magic Combination: Local State || API State
  const loading = isSubmitting || isTrnLoading;

  const isFormReady = isValid && dirty;

  // Style Logic based on your requirements
  const getButtonConfig = () => {
    if (loading) {
      return {
        text: "IS SUBMITTING...",
        color: "#22C55E",
        bg: "#FEF08A",
        icon: "loading",
      };
    }

    if (isFormReady) {
      return {
        text: "SUBMIT",
        color: "#22C55E", // Green
        bg: "transparent",
        icon: "check-bold",
      };
    }
    return {
      text: "SUBMIT",
      color: "#DC2626", // Red
      bg: "transparent",
      icon: "close-thick",
    };
  };

  const config = getButtonConfig();

  return (
    <View style={styles.footerContainer}>
      <Button
        mode="outlined"
        onPress={() => {
          // 🎯 THE GUARDRAIL: Protecting the Forensic Data
          Alert.alert(
            "Reset Form?",
            "This will permanently delete all captured data and evidence photos for this premise. Are you sure?",
            [
              {
                text: "CANCEL",
                style: "cancel",
                onPress: () => console.log("Reset Cancelled"),
              },
              {
                text: "YES, RESET",
                style: "destructive", // Red warning on iOS
                onPress: () => {
                  resetForm(); // 🎯 Formik built-in reset
                  console.log("Form and Media cleared by user");
                },
              },
            ],
            { cancelable: true }, // Allows tapping outside to close on Android
          );
        }}
        style={styles.resetBtn}
        disabled={loading}
        textColor="#64748B"
      >
        RESET
      </Button>

      <Button
        mode="contained"
        onPress={handleSubmit}
        disabled={loading}
        icon={({ size, color }) =>
          loading ? (
            <ActivityIndicator size={size} color={config.color} />
          ) : (
            <MaterialCommunityIcons
              name={config.icon}
              size={size}
              color={config.color}
            />
          )
        }
        buttonColor={config.bg}
        textColor={config.color}
        contentStyle={{ height: 48 }}
        style={[
          styles.submitBtn,
          {
            borderColor: config.color,
            borderWidth: config.bg === "transparent" ? 1.5 : 0,
          },
        ]}
        labelStyle={{ fontWeight: "bold" }}
      >
        {config.text}
      </Button>
    </View>
  );
};

export const styles = StyleSheet.create({
  footerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // Ensures footer stays above navigation bars
    paddingBottom: Platform.OS === "ios" ? 30 : 12,
  },
  submitBtn: {
    flex: 1, // Takes up majority of the space
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    marginLeft: 10, // Space from the Reset button
  },
  resetBtn: {
    flex: 0.35, // Smaller than submit
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    borderColor: "#e2e8f0",
  },
  btnLabel: {
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  // If you want a specific style for the "Is Submitting" yellow box
  submittingState: {
    backgroundColor: "#FEF08A",
    borderColor: "#EAB308",
    borderWidth: 1,
  },
});
