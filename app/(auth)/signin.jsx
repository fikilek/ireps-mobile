import { Octicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { useEffect, useState } from "react";
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
import {
  PROFILE_WAIT_MS,
  signinMessage,
} from "../../src/features/auth/authMessages";
import {
  useSigninMutation,
  useSignoutMutation,
} from "../../src/redux/authApi";

const initialValues = {
  email: "",
  password: "",
};

const validationSchema = object().shape({
  email: string()
    .email("That does not look like an email address")
    .required("Email is required"),
  password: string().required("Password is required"),
});

const Signin = () => {
  const router = useRouter();
  const [signin, { isLoading: isMutationLoading }] = useSigninMutation();
  const [signout] = useSignoutMutation();
  const [showPassword, setShowPassword] = useState(false);
  const [isWaitingForProfile, setIsWaitingForProfile] = useState(false);

  const isLoading = isMutationLoading || isWaitingForProfile;

  // AU-R001 3: sign in never hangs. The wait starts when the password has been accepted, and it is
  // the person's record we are waiting for. If it has not arrived, the screen stops waiting, says
  // so, and gives them their screen back — with what they typed still in it.
  useEffect(() => {
    if (!isWaitingForProfile) return undefined;

    const timer = setTimeout(() => {
      setIsWaitingForProfile(false);

      const { title, message } = signinMessage({ code: "auth/profile-wait" });

      // Signed in with nowhere to go is a dead end, so sign out is offered here.
      Alert.alert(title, message, [
        { text: "Sign out", style: "cancel", onPress: () => signout() },
        { text: "Try again" },
      ]);
    }, PROFILE_WAIT_MS);

    return () => clearTimeout(timer);
  }, [isWaitingForProfile, signout]);

  const handleSignin = async (values) => {
    try {
      await signin({
        email: values.email.toLowerCase().trim(),
        password: values.password.trim(),
      }).unwrap();

      setIsWaitingForProfile(true);

      // Signed in. The token refresh is a convenience, not the sign-in: a failure here must not be
      // reported as a failed sign-in, because the person is already through the door.
      try {
        await auth.currentUser?.getIdToken(true);
      } catch (tokenError) {
        console.log("handleSignin ---token refresh", tokenError?.code);
      }

      // The screen stays in progress until the app moves the person on (AU-R001 3 and 6): success
      // is the app opening, so there is no result window here. What they typed stays in the form in
      // case the wait runs out.
    } catch (error) {
      setIsWaitingForProfile(false);
      console.log("handleSignin ---error", error?.code, error?.message);

      const { title, message } = signinMessage(error);
      Alert.alert(title, message);
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
