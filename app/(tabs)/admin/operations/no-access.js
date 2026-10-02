// No Access rules NA-R001 (1.2.0) — THE No Access screen.
//
// One screen, for every transaction that can end in a no access, reached the same way every
// time: a gate asks whether the worker has access, and No brings them here. They never open
// the transaction form at all.
//
// It records one thing: the worker went to the property and could not touch the meter with
// their own hand. It decides nothing about the ERF, the premise or the address - those are
// settled before the work is issued, and arrive with it.
//
// It saves to the phone BEFORE it sends (OF-R001), and the queue that already exists does the
// upload, picks the right server function and records a refusal. Nothing about sending is
// written here.

import * as Location from "expo-location";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Formik } from "formik";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from "react-native";
import { Surface, Text } from "react-native-paper";

import { IrepsNoAccessForm } from "../../../../components/forms/IrepsNoAccessForm";
import { ForensicFooter } from "../../../../src/features/meters/ForensicFooter";
import { buildMeterDiscoveryTrnId } from "../../../../src/features/meters/meterDiscoveryTrnId";
import { isCompleteNoAccess } from "../../../../src/features/meters/noAccessReasons";
import {
  NO_ACCESS_PROGRESS,
  noAccessConfirmation,
  noAccessResult,
} from "../../../../src/features/meters/noAccessSubmitMessages";
import { useAuth } from "../../../../src/hooks/useAuth";
import { addSubmissionQueueItem } from "../../../../src/utils/submissionQueue";
import { processSubmissionQueue } from "../../../../src/services/processSubmissionQueue";

const parseContext = (raw) => {
  try {
    return JSON.parse(String(Array.isArray(raw) ? raw[0] : raw || "{}"));
  } catch {
    return {};
  }
};

export default function NoAccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const context = useMemo(() => parseContext(params.context), [params.context]);
  const { user, profile } = useAuth();

  const [busy, setBusy] = useState("");
  const sending = useRef(false);

  const agentUid = user?.uid || profile?.id || "SYSTEM";
  const agentName =
    profile?.personal?.displayName || profile?.displayName || user?.displayName || "Fieldworker";

  // The id carries the ward and the ERF number and can never be rewritten, so it is built from
  // what the work arrived with - not from anything this screen decides.
  const trnId = useRef(
    buildMeterDiscoveryTrnId({
      wardPcode: context.wardPcode,
      erfNo: context.erfNo,
      meterType: "NA",
    }),
  ).current;

  const capturedAt = useRef(new Date().toISOString()).current;

  const goBack = () =>
    router.dismissTo({
      pathname: context.returnTo || "/(tabs)/admin/operations/my-workorders",
      params: { targetedBatchRefresh: String(Date.now()) },
    });

  async function readPosition() {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      throw Object.assign(new Error("Location permission was not granted."), {
        code: "LOCATION_INVALID",
      });
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      gps: { lat: position.coords.latitude, lng: position.coords.longitude },
      accuracyM: position.coords.accuracy ?? null,
      capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
    };
  }

  // NA-R030: the record. The municipality and the ward are NOT built here - the server reads
  // them from the ERF, which is the authority for where a property is, so the two screens that
  // open this one cannot assemble them two different ways.
  function buildPayload({ location, value, media }) {
    return {
      id: trnId,
      meterType: "NA",
      ast: null,
      media,
      location,
      capturedAt,
      accessData: {
        trnType: "METER_DISCOVERY",
        erfId: context.erfId,
        erfNo: context.erfNo || "NAv",
        premise: context.premiseId ? { id: context.premiseId } : null,
        access: {
          hasAccess: "no",
          reasonCode: value.reasonCode,
          reasonOther: value.reasonOther,
          appointment: value.appointment,
        },
      },
      ...(context.targetedBatchContext
        ? { targetedBatchContext: context.targetedBatchContext }
        : {}),
    };
  }

  async function submit(value, media, helpers) {
    if (sending.current) return;

    if (!isCompleteNoAccess(value, media)) {
      helpers.setErrors({
        reason: value.reasonCode ? "" : "Say why you could not touch the meter.",
        reasonOther:
          String(value.reasonCode).toUpperCase() === "OTHER" && !value.reasonOther.trim()
            ? "Type what stopped you reaching the meter."
            : "",
        media: media.some((item) => item?.tag === "noAccessPhoto")
          ? ""
          : "A No Access needs one photograph.",
      });
      return;
    }

    // NA-R061: the worker sees what is about to go, before it goes.
    const window = noAccessConfirmation(value);

    Alert.alert(window.title, window.body, [
      { text: window.cancel, style: "cancel" },
      { text: window.confirm, onPress: () => send(value, media, helpers) },
    ]);
  }

  async function send(value, media, helpers) {
    sending.current = true;
    helpers.setErrors({});

    try {
      setBusy(NO_ACCESS_PROGRESS.queueing);
      const location = await readPosition();
      const payload = buildPayload({ location, value, media });

      // OF-R001: it is on the phone before any network work is attempted.
      const queued = await addSubmissionQueueItem({
        formType: "METER_DISCOVERY",
        payload,
        context: {
          trnType: "METER_DISCOVERY",
          trnId,
          erfId: context.erfId,
          erfNo: context.erfNo || "NAv",
          premiseId: context.premiseId || "NAv",
          meterNo: context.meterNo || "NAv",
          wardPcode: context.wardPcode || "NAv",
        },
        createdByUid: agentUid,
        createdByUser: agentName,
      });

      if (!queued?.success) {
        throw Object.assign(new Error("The No Access could not be saved on the phone."), {
          code: "UNKNOWN",
        });
      }

      setBusy(NO_ACCESS_PROGRESS.recording);

      const processed = await processSubmissionQueue({
        agentUid,
        agentName,
        queueItemIds: [queued?.queueItem?.id],
        filterMode: "METER_DISCOVERY_NO_ACCESS",
        includeSyncing: true,
      });

      const refusal = processed?.refusals?.[0] || processed?.refused?.[0] || null;
      const result = noAccessResult(
        refusal?.code || (processed?.sent?.length ? "OK" : "OK_QUEUED"),
      );

      Alert.alert(result.title, result.body, [{ text: "OK", onPress: goBack }]);
    } catch (error) {
      const result = noAccessResult(error?.code || "UNKNOWN");
      Alert.alert(result.title, result.body);
    } finally {
      sending.current = false;
      setBusy("");
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "No Access" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Surface style={styles.context} elevation={1}>
          <Text variant="titleMedium">
            {context.meterNo ? `Meter ${context.meterNo}` : "No Access"}
          </Text>
          <Text>ERF {context.erfNo || "NAv"}</Text>
          {context.tbId ? <Text>Batch {context.tbId}</Text> : null}
          <Text>{context.premiseId ? "Premise linked" : "Premise not yet linked"}</Text>
        </Surface>

        <Formik
          initialValues={{ reasonCode: "", reasonOther: "", appointment: null, media: [] }}
          onSubmit={(values, helpers) =>
            submit(
              {
                reasonCode: values.reasonCode,
                reasonOther: values.reasonOther,
                appointment: values.appointment,
              },
              values.media,
              helpers,
            )
          }
        >
          {({ values, setValues, errors, handleSubmit }) => (
            <View>
              <IrepsNoAccessForm
                visible
                value={values}
                onChange={(next) => setValues({ ...values, ...next })}
                mediaName="media"
                mediaTag="noAccessPhoto"
                agentName={agentName}
                agentUid={agentUid}
                fallbackGps={context.gps || null}
                reasonErrorText={errors.reason || errors.reasonOther || ""}
                mediaErrorText={typeof errors.media === "string" ? errors.media : ""}
              />

              {busy ? (
                <Surface style={styles.busy} elevation={1}>
                  <ActivityIndicator />
                  <Text style={styles.busyText}>{busy}</Text>
                </Surface>
              ) : null}

              <ForensicFooter isTrnLoading={Boolean(busy)} onSubmit={handleSubmit} />
            </View>
          )}
        </Formik>

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 16, paddingBottom: 40, backgroundColor: "#F1F5F9" },
  context: { padding: 16, borderRadius: 14, backgroundColor: "#FFFFFF", gap: 5, marginBottom: 12 },
  busy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  busyText: { fontSize: 14, fontWeight: "700" },
});
