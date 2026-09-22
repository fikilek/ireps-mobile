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
import { FORM_TEXT } from "../../src/theme/formColors";

export default function ConformAdminProfile() {
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

  // 🌍 ADM holds the entire registry in their profile now
  const allTerritories = profile?.access?.workbases || [];

  const handleFinalize = async () => {
    // 🛡️ 1. VALIDATION
    if (!form.password || form.password !== form.confirmPassword) {
      return Alert.alert("Security Check", "Passwords must match.");
    }
    if (form.password.length < 6) {
      return Alert.alert(
        "Security Check",
        "Security protocol requires 6+ characters.",
      );
    }
    if (!selectedWorkbase) {
      return Alert.alert(
        "Context Required",
        "Select your initial operational context.",
      );
    }

    try {
      const currentUser = auth.currentUser;

      // 🛡️ 2. SILENT RE-AUTH
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        "password",
      );
      await reauthenticateWithCredential(currentUser, credential);

      // 🔑 3. ROTATE TO PERMANENT PASSWORD
      await updatePassword({ newPassword: form.password }).unwrap();

      // 🏛️ 4. GLOBAL ACTIVATION
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

      Alert.alert(
        "Sovereign Access Active",
        "Administrator credentials locked and loaded.",
      );
      router.replace("/(tabs)/erfs");
    } catch (err) {
      console.error("ADM Onboarding Error:", err);
      Alert.alert(
        "Operational Failure",
        err.message || "Could not finalize ADM profile.",
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Avatar.Icon
          size={80}
          icon="shield-crown"
          style={{ backgroundColor: "#2563eb" }} // Smars Blue
          color="#fff"
        />
        <Text style={styles.title}>ADM Conformation</Text>
        <Text style={styles.subtitle}>
          System-wide access recognized. Appointing {profile?.profile?.name} to
          the Smars Global Command.
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.sectionLabel}>
          1. Security Protocol (Password Rotation)
        </Text>
        <TextInput
          label="New Admin Password"
          secureTextEntry={!showPassword}
          mode="outlined"
          value={form.password}
          onChangeText={(t) => setForm({ ...form, password: t })}
          textColor="#1e293b"
          activeOutlineColor="#2563eb"
          style={styles.input}
          left={<TextInput.Icon icon="lock-check" color="#2563eb" />}
          right={
            <TextInput.Icon
              icon={showPassword ? "eye-off" : "eye"}
              onPress={() => setShowPassword(!showPassword)}
            />
          }
        />
        <TextInput
          label="Confirm Password"
          secureTextEntry={!showPassword}
          mode="outlined"
          value={form.confirmPassword}
          onChangeText={(t) => setForm({ ...form, confirmPassword: t })}
          textColor="#1e293b"
          activeOutlineColor="#2563eb"
          style={styles.input}
          left={<TextInput.Icon icon="lock-check" color="#2563eb" />}
          right={
            <TextInput.Icon
              icon={showPassword ? "eye-off" : "eye"}
              onPress={() => setShowPassword(!showPassword)}
            />
          }
        />

        <Divider style={styles.divider} />

        <Text style={styles.sectionLabel}>2. Operational Contact</Text>
        <TextInput
          label="Admin Cell Number"
          keyboardType="phone-pad"
          mode="outlined"
          value={form.cell}
          onChangeText={(t) => setForm({ ...form, cell: t })}
          style={styles.input}
          left={<TextInput.Icon icon="cellphone-check" />}
        />

        <Divider style={styles.divider} />

        <Text style={styles.sectionLabel}>
          3. Select Initial Operational Context
        </Text>
        <Text style={styles.contextHint}>
          Choose which municipality to view upon entry.
        </Text>

        <View style={styles.wbContainer}>
          {allTerritories.slice(0, 12).map(
            (
              wb, // Showing top 12 for speed, searchable in future
            ) => (
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
                      ? "city-variant"
                      : "city-variant-outline"
                  }
                  size={18}
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
            ),
          )}
        </View>

        <Button
          mode="contained"
          onPress={handleFinalize}
          loading={isPwLoading || isPrLoading}
          style={styles.submitBtn}
          labelStyle={styles.submitLabel}
        >
          ACTIVATE GLOBAL COMMAND
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flexGrow: 1, backgroundColor: "#fff" },
  header: { alignItems: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "900", color: FORM_TEXT, marginTop: 12 },
  subtitle: {
    fontSize: 13,
    color: FORM_TEXT,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 20,
  },
  form: { gap: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2563eb",
    textTransform: "uppercase",
  },
  contextHint: { fontSize: 10, color: FORM_TEXT, marginBottom: 4 },
  input: { backgroundColor: "#ffffff" },
  divider: { marginVertical: 4, backgroundColor: "#f1f5f9" },
  wbContainer: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  wbCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    gap: 6,
  },
  wbCardActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  wbText: { fontSize: 12, fontWeight: "700", color: FORM_TEXT },
  wbTextActive: { color: "#fff" },
  submitBtn: {
    marginTop: 15,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    height: 54,
    justifyContent: "center",
  },
  submitLabel: { fontWeight: "900", fontSize: 14 },
});
