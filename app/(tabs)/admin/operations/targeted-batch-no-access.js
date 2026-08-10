import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Formik } from "formik";
import { array, object, string } from "yup";
import { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Surface, Text } from "react-native-paper";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

import { IrepsNoAccessSection } from "../../../../components/forms/IrepsNoAccessSection";
import { functions } from "../../../../src/firebase";
import { useAuth } from "../../../../src/hooks/useAuth";
import { addSubmissionQueueItem } from "../../../../src/utils/submissionQueue";
import { ForensicFooter } from "../../../../src/features/meters/ForensicFooter";
import {
  SALES_TB_NA_FORM_TYPE,
  SALES_TB_RETURN_ROUTE,
  buildTargetedBatchNoAccessPayload,
  buildTargetedBatchNoAccessTrnId,
  validateTargetedBatchNoAccessPayload,
} from "../../../../src/features/targetedBatches/targetedBatchNoAccess";

const TargetedBatchNoAccessSchema = object({
  reason: string()
    .trim()
    .required("No Access reason is required."),
  media: array()
    .test(
      "no-access-photo",
      "No Access photograph is required.",
      (value) =>
        Array.isArray(value) &&
        value.some(
          (item) =>
            item?.tag === "noAccessPhoto" &&
            Boolean(item?.uri || item?.url),
        ),
    )
    .required("No Access photograph is required."),
});

const parseContext = (raw) => {
  try { return JSON.parse(String(raw || "{}")); } catch { return {}; }
};

export default function TargetedBatchNoAccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const context = useMemo(() => parseContext(params.context), [params.context]);
  const { user, profile } = useAuth();
  const trnIdRef = useRef(buildTargetedBatchNoAccessTrnId());
  const capturedAtRef = useRef(new Date().toISOString());
  const submittingRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const agentUid = user?.uid || profile?.id || "SYSTEM";
  const agentName = profile?.personal?.displayName || profile?.displayName || user?.displayName || "Fieldworker";

  const returnToWorkorders = () => router.dismissTo({ pathname: context.returnTo || SALES_TB_RETURN_ROUTE, params: { targetedBatchRefresh: String(Date.now()) } });
  const finish = (message) => Alert.alert("No Access", message, [{ text: "OK", onPress: returnToWorkorders }]);

  async function captureLocation() {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) throw new Error("Location permission was not granted.");
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { gps: { lat: position.coords.latitude, lng: position.coords.longitude }, accuracyM: position.coords.accuracy ?? null, capturedAt: new Date(position.timestamp || Date.now()).toISOString() };
  }

  async function queue(payload) {
    const result = await addSubmissionQueueItem({
      formType: SALES_TB_NA_FORM_TYPE, payload,
      context: { trnType: SALES_TB_NA_FORM_TYPE, trnId: payload.trnId, erfId: payload.erfId, premiseId: payload.premiseId, meterNo: context.targetedMeterNo, lmPcode: context.lmPcode, wardPcode: context.wardPcode },
      createdByUid: agentUid, createdByUser: agentName,
    });
    if (!result.success) throw new Error(result.message);
  }

  async function submit(values, helpers) {
    if (submittingRef.current) return;
    submittingRef.current = true; setBusy(true); helpers.setErrors({});
    let payload;
    try {
      const preliminary = validateTargetedBatchNoAccessPayload(buildTargetedBatchNoAccessPayload({ context, trnId: trnIdRef.current, capturedAt: capturedAtRef.current, reason: values.reason, media: values.media, location: { gps: {} } }));
      const evidenceErrors = { reason: preliminary.errors.reason, media: preliminary.errors.media };
      Object.keys(evidenceErrors).forEach((key) => evidenceErrors[key] === undefined && delete evidenceErrors[key]);
      if (Object.keys(evidenceErrors).length) { helpers.setErrors(evidenceErrors); throw new Error("Select a reason and capture the required photograph."); }
      const location = await captureLocation();
      payload = buildTargetedBatchNoAccessPayload({ context, trnId: trnIdRef.current, capturedAt: capturedAtRef.current, reason: values.reason, media: values.media, location });
      const validation = validateTargetedBatchNoAccessPayload(payload);
      if (!validation.valid) { helpers.setErrors(validation.errors); throw new Error("Complete all required No Access evidence."); }
      const net = await NetInfo.fetch();
      if (!(net.isConnected && net.isInternetReachable)) { await queue(payload); finish("Saved offline. This attempt will sync automatically using the same TRN ID."); return; }
      let uploadedPayload = payload;
      try {
        const storage = getStorage();
        const media = await Promise.all(payload.media.map(async (item) => {
          if (!item?.uri || item?.url) return item;
          const storageRef = ref(storage, `meters/no_access/${payload.trnId}_${item.tag}.jpg`);
          const response = await fetch(item.uri); await uploadBytes(storageRef, await response.blob());
          const { uri, ...rest } = item; return { ...rest, url: await getDownloadURL(storageRef) };
        }));
        uploadedPayload = { ...payload, media };
        const response = await httpsCallable(functions, "recordTargetedBatchNoAccessCallable")(uploadedPayload);
        const result = response?.data || {};
        if (!result.success) {
          if (["TARGETED_BATCH_METER_ALREADY_LINKED", "TARGETED_BATCH_ROW_NOT_EXECUTABLE", "TARGETED_BATCH_ROW_EXECUTION_STATE_INVALID"].includes(result.code)) {
            Alert.alert("Work already completed", result.message || "This row is no longer executable.", [{ text: "OK", onPress: returnToWorkorders }]); return;
          }
          throw Object.assign(new Error(result.message || "No Access submission failed."), { permanent: true });
        }
        finish(result.alreadyRecorded ? "This attempt was already recorded and is complete." : "No Access recorded successfully.");
      } catch (error) {
        if (error?.permanent) throw error;
        await queue(uploadedPayload);
        finish("The connection was interrupted. This attempt was queued safely for retry.");
      }
    } catch (error) {
      Alert.alert("Unable to submit", error?.message || "No Access could not be submitted.");
    } finally { submittingRef.current = false; setBusy(false); }
  }

  return <>
    <Stack.Screen options={{ title: "Targeted Batch No Access" }} />
    <ScrollView contentContainerStyle={styles.content}>
      <Surface style={styles.context} elevation={1}>
        <Text variant="titleMedium">Meter {context.targetedMeterNo || "NAv"}</Text>
        <Text>ERF {context.erfNo || context.erfId || "NAv"}</Text>
        <Text>Batch {context.tbId || "NAv"} · NA {context.noAccessCount ?? 0}</Text>
        <Text>{context.premiseId ? "Premise linked" : "Premise not yet linked"}</Text>
      </Surface>
      <Formik
        initialValues={{ reason: "", media: [] }}
        validationSchema={TargetedBatchNoAccessSchema}
        onSubmit={submit}
      >
        {({ values, setFieldValue, errors, touched }) => (
          <View>
            <IrepsNoAccessSection
              visible
              value={values.reason}
              onChange={(value) => {
                setFieldValue("reason", value);
              }}
              agentName={agentName}
              agentUid={agentUid}
              reasonErrorText={
                touched.reason || errors.reason ? errors.reason : ""
              }
              mediaErrorText={
                touched.media || errors.media ? errors.media : ""
              }
            />

            {!!errors.location && (
              <Text style={styles.error}>{errors.location}</Text>
            )}

            <ForensicFooter isTrnLoading={busy} />
          </View>
        )}
      </Formik>
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
    backgroundColor: "#F1F5F9",
  },

  context: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    gap: 5,
    marginBottom: 12,
  },

  error: {
    color: "#b91c1c",
    marginBottom: 8,
  },
});
