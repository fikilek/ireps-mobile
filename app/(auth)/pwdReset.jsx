// AU-R001 4: password reset. One field, one button. The answer is the same whether or not the email
// belongs to an iREPS account.
import { Octicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { object, string } from "yup";

import {
  passwordResetMessage,
  passwordResetSentMessage,
} from "../../src/features/auth/authMessages";
import { useSendPasswordResetMutation } from "../../src/redux/authApi";
import { FORM_PLACEHOLDER, FORM_TEXT } from "../../src/theme/formColors";

const initialValues = {
  email: "",
};

const validationSchema = object().shape({
  email: string()
    .email("That does not look like an email address")
    .required("Email is required"),
});

const PwdReset = () => {
  const router = useRouter();
  const [sendPasswordReset, { isLoading }] = useSendPasswordResetMutation();
  const [isSending, setIsSending] = useState(false);

  const busy = isLoading || isSending;

  const send = async (email, resetForm) => {
    try {
      setIsSending(true);

      await sendPasswordReset({ email }).unwrap();

      resetForm();

      const { title, message } = passwordResetSentMessage(email);
      Alert.alert(title, message, [
        { text: "Back to sign in", onPress: () => router.replace("/signin") },
      ]);
    } catch (error) {
      console.log("pwdReset ---error", error?.code);
      const { title, message } = passwordResetMessage(error);
      Alert.alert(title, message);
    } finally {
      setIsSending(false);
    }
  };

  // Confirmation window before, progress during, result window after (AU-R001 6).
  const handleSend = (values, { resetForm }) => {
    const email = values.email.toLowerCase().trim();

    Alert.alert(
      "Send a reset link?",
      `We will send a password reset link to:\n\n${email}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", onPress: () => send(email, resetForm) },
      ],
    );
  };

  const renderError = (touched, error) => {
    if (!touched || !error) return null;
    return <Text style={styles.errorText}>{error}</Text>;
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <Image
            source={require("../../assets/images/login.png")}
            style={styles.heroImage}
            contentFit="contain"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            Type the email address you sign in with. We will send a link to set a
            new password.
          </Text>

          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSend}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
            }) => (
              <>
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <Octicons name="mail" size={18} color="#2563eb" />
                    <TextInput
                      placeholder="Email address"
                      placeholderTextColor={FORM_PLACEHOLDER}
                      value={values.email}
                      onChangeText={handleChange("email")}
                      onBlur={handleBlur("email")}
                      autoCapitalize="none"
                      autoCorrect={false}
                      // The cursor waits in the email field, so a worker can type straight away.
                      autoFocus
                      keyboardType="email-address"
                      editable={!busy}
                      style={styles.textInput}
                    />
                  </View>
                  {renderError(touched.email, errors.email)}
                </View>

                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.sendButton,
                    busy && styles.buttonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={busy}
                >
                  {busy ? (
                    <View style={styles.progressRow}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.buttonText}>Sending...</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>Send reset link</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>Remembered it?</Text>
                  <Pressable
                    onPress={() => router.replace("/signin")}
                    disabled={busy}
                  >
                    <Text style={styles.signinText}>Signin</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Formik>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default PwdReset;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: "center",
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  heroImage: {
    width: "100%",
    height: 170,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: FORM_TEXT,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: FORM_TEXT,
    textAlign: "center",
    marginBottom: 22,
    fontWeight: "500",
  },
  fieldBlock: {
    marginBottom: 14,
  },
  inputWrap: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 15,
    color: FORM_TEXT,
    marginLeft: 10,
    fontWeight: "600",
  },
  errorText: {
    marginTop: 5,
    marginLeft: 4,
    color: "#dc2626",
    fontSize: 12,
  },
  button: {
    height: 50,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  sendButton: {
    backgroundColor: "#2563eb",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: FORM_TEXT,
  },
  signinText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
});
