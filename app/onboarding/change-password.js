import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../src/firebase";
import { authApi } from "../../src/redux/authApi";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../src/theme/formColors";

export default function ChangePassword() {
  const router = useRouter();
  const { data: authState, isLoading: authLoading } =
    authApi.endpoints.getAuthState.useQueryState();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const uid = authState?.auth?.uid;

  const email =
    authState?.profile?.profile?.email ||
    authState?.profile?.email ||
    auth.currentUser?.email ||
    "NAv";

  const updaterName = useMemo(() => {
    return (
      authState?.profile?.profile?.displayName ||
      authState?.profile?.displayName ||
      auth.currentUser?.displayName ||
      email ||
      "System"
    );
  }, [authState, email]);

  const validate = () => {
    const cleanPassword = newPassword.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanPassword) {
      Alert.alert("Missing Password", "Please enter a new password.");
      return false;
    }

    if (cleanPassword.length < 6) {
      Alert.alert(
        "Weak Password",
        "Password must be at least 6 characters long.",
      );
      return false;
    }

    if (!cleanConfirm) {
      Alert.alert("Confirm Password", "Please confirm your new password.");
      return false;
    }

    if (cleanPassword !== cleanConfirm) {
      Alert.alert(
        "Password Mismatch",
        "New password and confirm password do not match.",
      );
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    try {
      if (!validate()) return;

      const currentUser = auth.currentUser;

      if (!currentUser?.uid || !uid) {
        Alert.alert(
          "No Session",
          "Could not find the authenticated user. Please sign in again.",
        );
        return;
      }

      const cleanPassword = newPassword.trim();

      setIsSaving(true);

      await updatePassword(currentUser, cleanPassword);

      await updateDoc(doc(db, "users", currentUser.uid), {
        "onboarding.mustChangePassword": false,
        "onboarding.status": "PENDING",
        "metadata.updatedAt": new Date().toISOString(),
        "metadata.updatedByUid": currentUser.uid,
        "metadata.updatedByUser": updaterName,
      });

      Alert.alert(
        "Password Updated",
        "Password changed successfully. Next, select your active workbase.",
        [
          {
            text: "Continue",
            onPress: () => router.replace("/onboarding/select-workbase"),
          },
        ],
      );
    } catch (error) {
      console.log("change-password error", error);

      let message = "Could not change password.";

      if (error?.code === "auth/requires-recent-login") {
        message =
          "This action requires a recent login. Please sign out and sign in again.";
      } else if (error?.message) {
        message = error.message;
      }

      Alert.alert("Password Change Failed", message);
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading onboarding...</Text>
      </View>
    );
  }

  if (!uid) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>No authenticated user</Text>
        <Text style={styles.errorText}>
          Please sign in again to continue onboarding.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace("/signin")}
        >
          <Text style={styles.primaryButtonText}>Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>STEP 1 OF 2</Text>
          <Text style={styles.title}>Change Your Password</Text>
          <Text style={styles.subtitle}>
            For security, invited managers must change the temporary password
            before entering iREPS.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Signed in as</Text>
          <Text style={styles.infoValue}>{email}</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.passwordInputWrap}>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              placeholderTextColor={FORM_PLACEHOLDER}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.passwordInput}
              editable={!isSaving}
            />
            <TouchableOpacity
              onPress={() => setShowPasswords((prev) => !prev)}
              style={styles.iconButton}
              disabled={isSaving}
            >
              <Ionicons
                name={showPasswords ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#64748b"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.passwordInputWrap}>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={FORM_PLACEHOLDER}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.passwordInput}
              editable={!isSaving}
            />
            <TouchableOpacity
              onPress={() => setShowPasswords((prev) => !prev)}
              style={styles.iconButton}
              disabled={isSaving}
            >
              <Ionicons
                name={showPasswords ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#64748b"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Use at least 6 characters. Leading and trailing spaces will be
            removed.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, isSaving && styles.disabledButton]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Save New Password</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: FORM_TEXT,
    fontWeight: "600",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: FORM_TEXT,
    textAlign: "center",
    marginBottom: 20,
  },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 20,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: "#60a5fa",
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: "#cbd5e1",
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: FORM_TEXT,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
    marginTop: 4,
  },
  passwordInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#0f172a",
  },
  iconButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontSize: 13,
    lineHeight: 20,
    color: FORM_TEXT,
    marginBottom: 18,
  },
  primaryButton: {
    minHeight: 52,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.7,
  },
});
