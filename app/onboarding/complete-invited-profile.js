import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar, Button, Divider, TextInput } from "react-native-paper";

import { auth } from "../../src/firebase";
import { useAuth } from "../../src/hooks/useAuth";
import {
  useUpdatePasswordMutation,
  useUpdateProfileMutation,
} from "../../src/redux/authApi";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../src/theme/formColors";

export default function CompleteInvitedProfile() {
  const { profile, user } = useAuth();
  const router = useRouter();

  const [updatePassword, { isLoading: isPwLoading }] =
    useUpdatePasswordMutation();
  const [updateProfile, { isLoading: isPrLoading }] =
    useUpdateProfileMutation();

  // 📝 LOCAL STATE
  const [showPassword, setShowPassword] = useState(false);
  const [selectedWorkbase, setSelectedWorkbase] = useState(null);
  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
    cell: profile?.contact?.cell || "",
  });

  const assignedTerritories = profile?.access?.workbases || [];

  const handleFinalize = async () => {
    // 🛡️ 1. VALIDATION
    if (!form.password || form.password !== form.confirmPassword) {
      return Alert.alert("Security Check", "Passwords must match.");
    }
    if (form.password.length < 6) {
      return Alert.alert(
        "Security Check",
        "Password must be at least 6 characters.",
      );
    }
    if (!selectedWorkbase) {
      return Alert.alert("Jurisdiction", "Please select your active workbase.");
    }

    try {
      const currentUser = auth.currentUser;

      // 🛡️ 2. SILENT RE-AUTH (Bypasses 'requires-recent-login')
      // We use the 'password' default you set in the Cloud Function
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        "password",
      );
      await reauthenticateWithCredential(currentUser, credential);

      // 🔑 3. ROTATE TO PERMANENT PASSWORD
      await updatePassword({ newPassword: form.password }).unwrap();

      // 🏛️ 4. MODERNIZE PROFILE & UNLOCK
      await updateProfile({
        uid: user.uid,
        updates: {
          "contact.cell": form.cell,
          "access.activeWorkbase": selectedWorkbase,
          "onboarding.status": "COMPLETED",
          "onboarding.steps.profileCompleted": true,
          "metadata.updatedAt": new Date().toISOString(),
          "metadata.updatedByUid": user.uid,
          "metadata.updatedByUser": `${profile?.profile?.name} ${profile?.profile?.surname}`,
        },
      }).unwrap();

      Alert.alert("Mission Ready", "Security rotated and jurisdiction locked.");
      router.replace("/(tabs)/erfs");
    } catch (err) {
      console.error("Onboarding Error:", err);
      if (err.code === "auth/requires-recent-login") {
        Alert.alert(
          "Timeout",
          "Session expired. Please sign out and in again.",
        );
      } else {
        Alert.alert(
          "Operational Failure",
          err.message || "Could not finalize.",
        );
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Avatar.Icon
          size={80}
          icon="shield-crown"
          style={{ backgroundColor: "#eff6ff" }}
          color="#2563eb"
        />
        <Text style={styles.title}>Onboarding</Text>
        <Text style={styles.subtitle}>
          Welcome, {profile?.profile?.name}. Secure your account and activate
          your territory.
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.sectionLabel}>1. Security Rotation</Text>
        <TextInput
          label="New Permanent Password"
          secureTextEntry={!showPassword}
          mode="outlined"
          value={form.password}
          onChangeText={(t) => setForm({ ...form, password: t })}
          // 🎯 THE VISIBILITY FIX
          textColor="#1e293b" // Deep Navy/Black
          placeholderTextColor={FORM_PLACEHOLDER}
          outlineColor="#cbd5e1" // Border color when not focused
          activeOutlineColor="#2563eb" // Border color when typing
          style={[styles.input, { fontWeight: "700" }]} // Force thick text
          left={<TextInput.Icon icon="lock" color="#475569" />}
          right={
            <TextInput.Icon
              icon={showPassword ? "eye-off" : "eye"}
              onPress={() => setShowPassword(!showPassword)}
              color="#475569"
            />
          }
        />
        <TextInput
          label="Confirm New Password"
          secureTextEntry={!showPassword}
          mode="outlined"
          value={form.confirmPassword}
          onChangeText={(t) => setForm({ ...form, confirmPassword: t })}
          textColor="#1e293b" // Deep Navy/Black
          placeholderTextColor={FORM_PLACEHOLDER}
          outlineColor="#cbd5e1" // Border color when not focused
          activeOutlineColor="#2563eb" // Border color when typing
          style={[styles.input, { fontWeight: "700" }]} // Force thick text
          left={<TextInput.Icon icon="lock" color="#475569" />}
          right={
            <TextInput.Icon
              icon={showPassword ? "eye-off" : "eye"}
              onPress={() => setShowPassword(!showPassword)}
              color="#475569"
            />
          }
        />

        <Divider style={styles.divider} />

        <Text style={styles.sectionLabel}>2. Contact Details</Text>
        <TextInput
          label="Cell Phone Number"
          keyboardType="phone-pad"
          mode="outlined"
          value={form.cell}
          onChangeText={(t) => setForm({ ...form, cell: t })}
          style={styles.input}
          left={<TextInput.Icon icon="phone" />}
        />

        <Divider style={styles.divider} />

        <Text style={styles.sectionLabel}>3. Select Active Workbase</Text>
        <View style={styles.wbContainer}>
          {assignedTerritories.map((wb) => (
            <TouchableOpacity
              key={wb.id}
              onPress={() => setSelectedWorkbase(wb)}
              style={[
                styles.wbCard,
                selectedWorkbase?.id === wb.id && styles.wbCardActive,
              ]}
            >
              <MaterialCommunityIcons
                name={
                  selectedWorkbase?.id === wb.id
                    ? "map-marker-check"
                    : "map-marker-outline"
                }
                size={20}
                color={selectedWorkbase?.id === wb.id ? "#fff" : "#64748b"}
              />
              <Text
                style={[
                  styles.wbText,
                  selectedWorkbase?.id === wb.id && styles.wbTextActive,
                ]}
              >
                {wb.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button
          mode="contained"
          onPress={handleFinalize}
          loading={isPwLoading || isPrLoading}
          style={styles.submitBtn}
          labelStyle={styles.submitLabel}
        >
          FINALIZE & COMMENCE MISSION
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    flexGrow: 1,
    backgroundColor: "#fff",
    // marginBottom: 40,
  },
  header: { alignItems: "center" },
  title: { fontSize: 22, fontWeight: "900", color: FORM_TEXT, marginTop: 12 },
  subtitle: {
    fontSize: 13,
    color: FORM_TEXT,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  form: { gap: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2563eb",
    textTransform: "uppercase",
    // marginBottom: 4,
  },
  input: { backgroundColor: "#ffffff", color: "black" },
  divider: { marginVertical: 2, backgroundColor: "#f1f5f9" },
  wbContainer: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  wbCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  wbCardActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  wbText: { fontSize: 13, fontWeight: "700", color: FORM_TEXT },
  wbTextActive: { color: "#fff" },
  submitBtn: {
    marginTop: 5,
    borderRadius: 12,
    backgroundColor: "#7290c2",
    height: 54,
    justifyContent: "center",
  },
  submitLabel: { fontWeight: "900" },
});
