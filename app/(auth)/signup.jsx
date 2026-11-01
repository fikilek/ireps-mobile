import { Ionicons, MaterialIcons, Octicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { object, ref, string } from "yup";

import { auth } from "../../src/firebase";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../src/theme/formColors";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE_TEXT,
  serviceProviderListMessage,
  signupMessage,
} from "../../src/features/auth/authMessages";
import {
  useGetSignupServiceProvidersQuery,
  useSignupMutation,
} from "../../src/redux/authApi";

const initialValues = {
  surname: "",
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  serviceProvider: null,
};

const validationSchema = object().shape({
  surname: string().trim().required("Surname is required"),
  name: string().trim().required("Name is required"),
  email: string()
    .email("That does not look like an email address")
    .required("Email is required"),
  password: string()
    .min(PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT)
    .required("Password is required"),
  confirmPassword: string()
    .oneOf([ref("password")], "The two passwords are not the same")
    .required("Confirm your password"),
  serviceProvider: object().nullable().required("Service Provider is required"),
});

const Signup = () => {
  const router = useRouter();

  const [signupGst, { isLoading: isMutationLoading }] = useSignupMutation();

  // AU-R001 2: the list comes from the back end, because nobody signing up is signed in yet.
  const {
    data: sps,
    isFetching: isSpLoading,
    isError: isSpError,
    refetch: refetchServiceProviders,
  } = useGetSignupServiceProvidersQuery();

  const [showPassword, setShowPassword] = useState(false);
  const [showSpModal, setShowSpModal] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const serviceProviders = useMemo(() => sps || [], [sps]);

  const isLoading = isMutationLoading || isRedirecting;

  const submitSignup = async (values, resetForm) => {
    try {
      setIsRedirecting(true);

      await signupGst({
        email: values.email.toLowerCase().trim(),
        password: values.password,
        name: values.name.trim(),
        surname: values.surname.trim(),
        serviceProvider: values.serviceProvider,
      }).unwrap();

      // Sign up does not let anybody in: the manager must authorise them first (AU-R001 2).
      Alert.alert(
        "Sign up sent",
        "Your sign up went through. Your manager must authorise you before you can work. You will be able to sign in once they have.",
        [
          {
            text: "Back to sign in",
            onPress: () => {
              resetForm();
              setIsRedirecting(false);
              router.replace("/signin");
            },
          },
        ],
      );
    } catch (error) {
      setIsRedirecting(false);
      console.log("handleSignup ---error", error?.code, error?.message);

      const { title, message } = signupMessage(error);
      Alert.alert(title, message);
    }
  };

  // Confirmation window before, progress during, result window after (AU-R001 6).
  const handleSignup = (values, { resetForm }) => {
    Alert.alert(
      "Send this sign up?",
      `Name: ${values.name.trim()} ${values.surname.trim()}\nEmail: ${values.email
        .toLowerCase()
        .trim()}\nService provider: ${values.serviceProvider?.name || "NAv"}`,
      [
        { text: "Check again", style: "cancel" },
        { text: "Send", onPress: () => submitSignup(values, resetForm) },
      ],
    );
  };

  const handleServiceProviderPress = () => {
    if (isLoading) return;

    if (isSpError) {
      const { title, message } = serviceProviderListMessage();
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: "Try again", onPress: () => refetchServiceProviders() },
      ]);
      return;
    }

    setShowSpModal(true);
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
            source={require("../../assets/images/register.png")}
            style={styles.logo}
            contentFit="contain"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Signup</Text>
          <Text style={styles.subtitle}>
            Create your account and select your service provider
          </Text>

          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSignup}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              setFieldValue,
              resetForm,
            }) => (
              <>
                {/* Surname */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <Ionicons name="person-add" size={20} color="#6b7280" />
                    <TextInput
                      placeholder="Surname"
                      placeholderTextColor={FORM_PLACEHOLDER}
                      value={values.surname}
                      onChangeText={handleChange("surname")}
                      onBlur={handleBlur("surname")}
                      editable={!isLoading}
                      style={styles.input}
                    />
                  </View>
                  {renderError(touched.surname, errors.surname)}
                </View>

                {/* Name */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="person-add-outline"
                      size={20}
                      color="#6b7280"
                    />
                    <TextInput
                      placeholder="Name"
                      placeholderTextColor={FORM_PLACEHOLDER}
                      value={values.name}
                      onChangeText={handleChange("name")}
                      onBlur={handleBlur("name")}
                      editable={!isLoading}
                      style={styles.input}
                    />
                  </View>
                  {renderError(touched.name, errors.name)}
                </View>

                {/* Email */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <Octicons name="mail" size={20} color="#6b7280" />
                    <TextInput
                      placeholder="Email"
                      placeholderTextColor={FORM_PLACEHOLDER}
                      value={values.email}
                      onChangeText={handleChange("email")}
                      onBlur={handleBlur("email")}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!isLoading}
                      style={styles.input}
                    />
                  </View>
                  {renderError(touched.email, errors.email)}
                </View>

                {/* Password */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <Octicons name="lock" size={20} color="#6b7280" />
                    <TextInput
                      placeholder="Password"
                      placeholderTextColor={FORM_PLACEHOLDER}
                      value={values.password}
                      onChangeText={handleChange("password")}
                      onBlur={handleBlur("password")}
                      secureTextEntry={!showPassword}
                      editable={!isLoading}
                      style={styles.input}
                    />
                    <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                      <Octicons
                        name={showPassword ? "eye" : "eye-closed"}
                        size={20}
                        color="#9ca3af"
                      />
                    </Pressable>
                  </View>
                  {renderError(touched.password, errors.password)}
                </View>

                {/* Confirm Password */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputWrap}>
                    <MaterialIcons name="password" size={20} color="#6b7280" />
                    <TextInput
                      placeholder="Confirm Password"
                      placeholderTextColor={FORM_PLACEHOLDER}
                      value={values.confirmPassword}
                      onChangeText={handleChange("confirmPassword")}
                      onBlur={handleBlur("confirmPassword")}
                      secureTextEntry={!showPassword}
                      editable={!isLoading}
                      style={styles.input}
                    />
                    <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                      <Octicons
                        name={showPassword ? "eye" : "eye-closed"}
                        size={20}
                        color="#9ca3af"
                      />
                    </Pressable>
                  </View>
                  {renderError(touched.confirmPassword, errors.confirmPassword)}
                </View>

                {/* Service Provider */}
                <View style={styles.fieldBlock}>
                  <Pressable
                    style={styles.inputWrap}
                    onPress={handleServiceProviderPress}
                  >
                    <Ionicons
                      name="business-outline"
                      size={20}
                      color="#6b7280"
                    />
                    <Text
                      style={[
                        styles.selectText,
                        !values.serviceProvider?.name && styles.placeholderText,
                      ]}
                    >
                      {values.serviceProvider?.name ||
                        "Select service provider"}
                    </Text>
                    <Octicons name="chevron-down" size={18} color="#9ca3af" />
                  </Pressable>
                  {renderError(touched.serviceProvider, errors.serviceProvider)}
                </View>

                {/* The picker is never left empty and silent (AU-R001 2) */}
                {isSpLoading ? (
                  <View style={styles.loaderRow}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.loaderText}>
                      Loading service providers...
                    </Text>
                  </View>
                ) : null}

                {!isSpLoading && isSpError ? (
                  <View style={styles.loaderRow}>
                    <Text style={styles.listErrorText}>
                      {serviceProviderListMessage().message}
                    </Text>
                    <Pressable onPress={() => refetchServiceProviders()}>
                      <Text style={styles.tryAgainText}>Try again</Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Buttons */}
                <View style={styles.buttonRow}>
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
                      styles.submitButton,
                      isLoading && styles.buttonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Submit</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Routing */}
                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>
                    Already have an account?
                  </Text>
                  <Pressable onPress={() => router.push("/signin")}>
                    <Text style={styles.signinText}>Signin</Text>
                  </Pressable>
                </View>

                {/* Service Provider Modal */}
                <Modal
                  visible={showSpModal}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowSpModal(false)}
                >
                  <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                      <Text style={styles.modalTitle}>
                        Select Service Provider
                      </Text>

                      <ScrollView
                        style={styles.modalList}
                        showsVerticalScrollIndicator={false}
                      >
                        {serviceProviders.length === 0 ? (
                          <Text style={styles.modalEmptyText}>
                            No active service providers came back. Check your
                            signal and try again, or ask your manager.
                          </Text>
                        ) : null}

                        {serviceProviders.map((sp) => (
                          <Pressable
                            key={sp.id}
                            style={styles.modalItem}
                            onPress={() => {
                              setFieldValue("serviceProvider", sp);
                              setShowSpModal(false);
                            }}
                          >
                            <Text style={styles.modalItemText}>{sp.name}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>

                      <TouchableOpacity
                        style={[styles.button, styles.cancelButton]}
                        onPress={() => setShowSpModal(false)}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              </>
            )}
          </Formik>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default Signup;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  logo: {
    width: "100%",
    height: 130,
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
    textAlign: "center",
    color: FORM_TEXT,
    marginBottom: 18,
  },
  fieldBlock: {
    marginBottom: 14,
  },
  inputWrap: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: FORM_TEXT,
    paddingVertical: 12,
    marginLeft: 10,
  },
  selectText: {
    flex: 1,
    fontSize: 15,
    color: FORM_TEXT,
    marginLeft: 10,
  },
  placeholderText: {
    color: FORM_TEXT,
  },
  errorText: {
    marginTop: 5,
    marginLeft: 4,
    color: "#dc2626",
    fontSize: 12,
  },
  loaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  loaderText: {
    marginLeft: 8,
    fontSize: 13,
    color: FORM_TEXT,
  },
  listErrorText: {
    flex: 1,
    fontSize: 13,
    color: "#dc2626",
    marginRight: 8,
  },
  tryAgainText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  resetButton: {
    backgroundColor: "#6b7280",
    marginRight: 8,
  },
  submitButton: {
    backgroundColor: "#4f46e5",
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: "#6b7280",
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  footerRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#374151",
    marginRight: 4,
  },
  signinText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4f46e5",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: FORM_TEXT,
    marginBottom: 12,
  },
  modalList: {
    maxHeight: 320,
  },
  modalItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalItemText: {
    fontSize: 15,
    color: FORM_TEXT,
  },
  modalEmptyText: {
    fontSize: 14,
    color: FORM_PLACEHOLDER,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
});
