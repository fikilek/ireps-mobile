import { useRouter } from "expo-router";
import { Formik } from "formik";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Divider, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

// 🎯 Using the specific ADM mutation
import { useInviteAdminMutation } from "../../../../src/redux/authApi";
import { FORM_TEXT } from "../../../../src/theme/formColors";

export default function CreateAdminScreen() {
  const router = useRouter();
  const [inviteAdmin, { isLoading: isInviting }] = useInviteAdminMutation();

  const handleSubmit = async (values) => {
    // 🛡️ FORM VALIDATION
    if (!values.email || !values.name || !values.surname) {
      return Alert.alert("Hold!", "All identity fields are required.");
    }

    try {
      // 🚀 THE SOVEREIGN STRIKE
      // Cloud function handles 'smars' and 'ALL' assignment behind the scenes
      await inviteAdmin({
        email: values.email.toLowerCase().trim(),
        name: values.name,
        surname: values.surname,
      }).unwrap();

      Alert.alert(
        "Mission Confirmed",
        `Administrator ${values.name} appointed to smars.`,
      );
      router.back();
    } catch (err) {
      Alert.alert(
        "Command Error",
        err?.message || "Could not appoint administrator",
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sovereignLabel}>Appoint Administrator (ADM)</Text>

        <Formik
          initialValues={{ email: "", name: "", surname: "" }}
          onSubmit={handleSubmit}
        >
          {({ handleChange, handleSubmit, values }) => (
            <View style={styles.form}>
              {/* IDENTITY INPUTS */}
              <TextInput
                label="Email Address"
                value={values.email}
                onChangeText={handleChange("email")}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />

              <View style={styles.row}>
                <TextInput
                  label="First Name"
                  value={values.name}
                  onChangeText={handleChange("name")}
                  mode="outlined"
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  label="Surname"
                  value={values.surname}
                  onChangeText={handleChange("surname")}
                  mode="outlined"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>

              <Divider style={styles.divider} />

              {/* 🏛️ FIXED PRIVILEGE CARD */}
              <View style={styles.privilegeBox}>
                <Text style={styles.boxLabel}>Operational Jurisdiction</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoText}>GLOBAL ACCESS (ALL LMs)</Text>
                </View>

                <Text style={[styles.boxLabel, { marginTop: 12 }]}>
                  Assigned Entity
                </Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoText}>SMARS (OWNER)</Text>
                </View>
              </View>

              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={isInviting}
                style={styles.submitBtn}
                labelStyle={{ fontWeight: "900" }}
              >
                APPOINT TO SMARS
              </Button>
            </View>
          )}
        </Formik>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 24 },
  sovereignLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2563eb",
    textTransform: "uppercase",
    marginBottom: 24,
    letterSpacing: 1,
  },
  form: { gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  input: { backgroundColor: "#f8fafc" },
  divider: { marginVertical: 8, backgroundColor: "transparent" },
  privilegeBox: {
    padding: 20,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  boxLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: FORM_TEXT,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoRow: {
    marginTop: 4,
  },
  infoText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1e40af",
  },
  submitBtn: {
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: "#2563eb", // 🎯 Admin Blue
    height: 50,
    justifyContent: "center",
  },
});
