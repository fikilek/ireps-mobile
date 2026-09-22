// app/onboarding/verify-phone.js
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSelector } from "react-redux";

import { authApi } from "../../src/redux/authApi";
import { FORM_TEXT } from "../../src/theme/formColors";

export default function VerifyPhone() {
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(false);

  const authState = useSelector(authApi.endpoints.getAuthState.select())?.data;

  const phoneNumber = authState?.profile?.contact?.phoneNumber;

  const uid = authState?.auth?.uid;

  const [verifyPhone, { isLoading: verifying }] =
    authApi.useVerifyPhoneMutation?.() ?? [];

  const [resendCode, { isLoading: resending }] =
    authApi.useResendPhoneCodeMutation?.() ?? [];

  const handleVerify = async () => {
    if (code.length !== 6) return;

    try {
      await verifyPhone({ uid, code }).unwrap();
      // guard auto-advances
    } catch {
      Alert.alert("Invalid code", "Please try again.");
    }
  };

  const handleResend = async () => {
    if (cooldown) return;

    try {
      await resendCode({ uid }).unwrap();
      setCooldown(true);
      setTimeout(() => setCooldown(false), 30000);
    } catch {
      Alert.alert("Error", "Unable to resend code.");
    }
  };

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>
        Verify your phone number
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: FORM_TEXT,
          marginVertical: 16,
          lineHeight: 20,
        }}
      >
        We’ve sent a 6-digit verification code to:
      </Text>

      <Text style={{ fontSize: 16, fontWeight: "500" }}>{phoneNumber}</Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="Enter 6-digit code"
        style={{
          marginTop: 32,
          padding: 16,
          borderWidth: 1,
          borderRadius: 8,
          fontSize: 18,
          letterSpacing: 8,
          textAlign: "center",
        }}
      />

      <View style={{ marginTop: 24 }}>
        <Pressable
          disabled={code.length !== 6 || verifying}
          onPress={handleVerify}
          style={{
            backgroundColor: code.length !== 6 ? "#ccc" : "#000",
            padding: 16,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          {verifying ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontWeight: "600" }}>Verify</Text>
          )}
        </Pressable>
      </View>

      <Pressable
        onPress={handleResend}
        disabled={cooldown || resending}
        style={{ marginTop: 24, alignItems: "center" }}
      >
        {resending ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ fontSize: 14, color: "#000" }}>
            Resend verification code
          </Text>
        )}
      </Pressable>
    </View>
  );
}
