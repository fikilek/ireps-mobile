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

import { auth } from "../../src/firebase";
import { useSigninMutation } from "../../src/redux/authApi";

const initialValues = {
  email: "zm@gmail.com",
  password: "fkpass123",
};

const validationSchema = object().shape({
  email: string().email("Invalid email address").required("Email is required"),
  password: string().required("Password is required"),
});

const Signin = () => {
  const router = useRouter();
  const [signin, { isLoading: isMutationLoading }] = useSigninMutation();
  const [showPassword, setShowPassword] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const isLoading = isMutationLoading || isRedirecting;

  const handleSignin = async (values, { resetForm }) => {
    try {
      setIsRedirecting(true);

      const result = await signin({
        email: values.email.toLowerCase().trim(),
        password: values.password.trim(),
      }).unwrap();

      if (result) {
        await auth.currentUser.getIdToken(true);
        resetForm();
        return;
      }

      setIsRedirecting(false);
      console.log(`"Access Denied", "Invalid credentials."`);
      Alert.alert("Access Denied", "Invalid credentials.");
    } catch (error) {
      setIsRedirecting(false);
      console.log(`handleSignin ---error`, error);
      console.log("handleSignin ---error", {
        code: error?.code,
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        raw: error,
      });
      Alert.alert("Signin failed", "Network error.");
    }
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
          <Text style={styles.title}>Signin</Text>
          <Text style={styles.subtitle}>Secure access to iREPS Command</Text>

          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSignin}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              resetForm,
            }) => (
              <>
                {/* Email */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <Octicons name="mail" size={18} color="#2563eb" />
                    <TextInput
                      placeholder="Email address"
                      placeholderTextColor="#9ca3af"
                      value={values.email}
                      onChangeText={handleChange("email")}
                      onBlur={handleBlur("email")}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!isLoading}
                      style={styles.textInput}
                    />
                  </View>
                  {renderError(touched.email, errors.email)}
                </View>

                {/* Password */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <Octicons name="lock" size={18} color="#2563eb" />
                    <TextInput
                      placeholder="Password"
                      placeholderTextColor="#9ca3af"
                      value={values.password}
                      onChangeText={handleChange("password")}
                      onBlur={handleBlur("password")}
                      secureTextEntry={!showPassword}
                      editable={!isLoading}
                      style={styles.textInput}
                    />
                    <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                      <Octicons
                        name={showPassword ? "eye" : "eye-closed"}
                        size={20}
                        color="#94a3b8"
                      />
                    </Pressable>
                  </View>
                  {renderError(touched.password, errors.password)}

                  <View style={styles.resetContainer}>
                    <Pressable
                      onPress={() => router.push("/pwdReset")}
                      disabled={isLoading}
                    >
                      <Text style={styles.lostAccessText}>Lost access?</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.resetButton]}
                    onPress={resetForm}
                    disabled={isLoading}
                  >
                    <Text style={styles.buttonText}>Reset</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.signinButton,
                      isLoading && styles.buttonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Signin</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                  <Text style={styles.footerText}>New User?</Text>
                  <Pressable
                    onPress={() => router.push("/signup")}
                    disabled={isLoading}
                  >
                    <Text style={styles.signupText}>Signup</Text>
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

export default Signin;

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
    color: "#111827",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
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
    color: "#1e293b",
    marginLeft: 10,
    fontWeight: "600",
  },
  errorText: {
    marginTop: 5,
    marginLeft: 4,
    color: "#dc2626",
    fontSize: 12,
  },
  resetContainer: {
    alignItems: "flex-end",
    marginTop: 6,
  },
  lostAccessText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 18,
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  resetButton: {
    backgroundColor: "#64748b",
    marginRight: 8,
  },
  signinButton: {
    backgroundColor: "#2563eb",
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
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
    color: "#64748b",
  },
  signupText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
});
