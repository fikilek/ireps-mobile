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

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Formik } from "formik";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Surface, Text } from "react-native-paper";

import { IrepsNoAccessForm } from "../../../../components/forms/IrepsNoAccessForm";
import { ForensicFooter } from "../../../../src/features/meters/ForensicFooter";
import { buildNoAccessTrnId } from "../../../../src/features/meters/meterDiscoveryTrnId";
import { isCompleteNoAccess } from "../../../../src/features/meters/noAccessReasons";
import {
  NO_ACCESS_PROGRESS,
  noAccessConfirmation,
  noAccessResult,
} from "../../../../src/features/meters/noAccessSubmitMessages";
import { useAuth } from "../../../../src/hooks/useAuth";
import {
  addSubmissionQueueItem,
  getSubmissionQueueItemById,
} from "../../../../src/utils/submissionQueue";
import { processSubmissionQueue } from "../../../../src/services/processSubmissionQueue";
import { scheduleMeterDiscoveryQueueSyncRetry } from "../../../../src/services/startMeterDiscoveryQueueSyncService";

// TR-R003 (0.6.0): THE POSITION NO LONGER COMES FROM THIS PHONE.
//
// The owner, 3 October: "the AST location GPS must always be the asset location. The fallback
// is the premise location, where the asset location doesn't exist."
//
// A worker who could not touch the meter is not standing at the meter - they are at a locked
// gate or in the street - so their own fix was never the asset's position, however good it
// was. The server resolves it instead: the asset's own position where the meter is known, the
// premise's where it is not, labelled either way (buildNoAccessLocation).
//
// This also takes a wait off the worker. The screen used to hold the submit for up to twenty
// seconds chasing a fix - the owner's own phone, 27 September: "the gps picker was stuck" -
// and indoors behind a wall is exactly where a no access is filled in. Nothing waits now.

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
    profile?.personal?.displayName ||
    profile?.displayName ||
    user?.displayName ||
    "Fieldworker";

  // The id carries the ward and the ERF number and can never be rewritten, so it is built from
  // what the work arrived with - not from anything this screen decides.
  // NA-R003: a no access is a transaction OF THE TYPE the worker was sent to do. A no access
  // on a disconnection is a disconnection that could not be done, not a discovery, and it
  // carries that type's own id prefix like every other transaction of that type.
  const trnType = String(context.trnType || "METER_DISCOVERY").toUpperCase();

  const trnId = useRef(
    buildNoAccessTrnId({
      trnType,
      wardPcode: context.wardPcode,
      erfNo: context.erfNo,
    }),
  ).current;

  const capturedAt = useRef(new Date().toISOString()).current;

  // A submitted form ALWAYS leaves the screen. The owner, 3 October: "after the NA form is
  // submitted the form does not clear, it remains on the screen - after the 'NA recorded'
  // alert the form must be removed from screen."
  //
  // It used to try router.dismissTo first and RETURN. dismissTo only works when the screen
  // named is still behind this one in the stack; where it is not it does nothing at all - no
  // error, no navigation - and the early return meant the replace below was never reached. So
  // the worker tapped OK on "No Access recorded" and stayed on the form they had just sent,
  // where the only obvious move is to send it again.
  //
  // router.replace cannot silently do nothing: this screen is replaced by the target. That is
  // what "removed from screen" has to mean - not an attempt that may or may not happen.
  const goBack = () => {
    const target = {
      pathname: context.returnTo || "/(tabs)/admin/operations/my-workorders",
      params: { targetedBatchRefresh: String(Date.now()) },
    };

    try {
      router.replace(target);
    } catch (error) {
      // Even a bad returnTo must not strand a worker on a sent form.
      console.log(
        "No Access -- replace failed, going to My Work Orders",
        error?.message,
      );
      router.replace("/(tabs)/admin/operations/my-workorders");
    }
  };

  // NA-R030: the record. The municipality and the ward are NOT built here - the server reads
  // them from the ERF, which is the authority for where a property is, so the two screens that
  // open this one cannot assemble them two different ways.
  function buildPayload({ value, media }) {
    return {
      id: trnId,
      meterType: "NA",
      // TR-R003: the server places the position at ast.location.gps and says where it came
      // from. It needs the meter only to ask whether this no access HAS one - a Reading or a
      // Disconnection does, a first-visit Discovery does not - so it sends the id, not a
      // position. No root `location`: that home is retired, and the 15 records that used it
      // were all written by this screen.
      astId: context.astId || null,
      media,
      capturedAt,
      accessData: {
        trnType,
        // GMR-R027 indexes the monthly report on parents.lmPcode, and the TRN Registry is
        // scoped by it, so a record without it exists and cannot be found. The premise knows
        // both; the server confirms them from the ERF. Either alone was a single point of
        // failure, and the server's half was missing from DEV while the records were written.
        parents: {
          lmPcode: context.lmPcode || "",
          wardPcode: context.wardPcode || "",
        },
        erfId: context.erfId,
        erfNo: context.erfNo || "NAv",
        // Every transaction writes premise as { id, address, propertyType }. A no access
        // writes the same, so a worker reading their queue sees WHERE the work was, and so a
        // no access record does not read differently from every other record.
        premise: context.premiseId
          ? {
              id: context.premiseId,
              address: context.premiseAddress || "NAv",
              propertyType: context.premisePropertyType || "NAv",
            }
          : null,
        access: {
          hasAccess: "no",
          reasonCode: value.reasonCode,
          reasonOther: value.reasonOther,
          // NA-R031.2: access.reason carries the display words, and every reader prints them.
          // The server settles the shape again on arrival, but it also VALIDATES before it
          // normalises - so a payload with no reason here is refused before the door is
          // reached.
          reason:
            String(value.reasonCode).toUpperCase() === "OTHER"
              ? String(value.reasonOther || "").trim()
              : String(value.reasonCode || "").trim(),
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
        reason: value.reasonCode
          ? ""
          : "Say why you could not touch the meter.",
        reasonOther:
          String(value.reasonCode).toUpperCase() === "OTHER" &&
          !value.reasonOther.trim()
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
      const payload = buildPayload({ value, media });

      // OF-R001: it is on the phone before any network work is attempted.
      const queued = await addSubmissionQueueItem({
        formType: trnType,
        payload,
        context: {
          trnType,
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
        throw Object.assign(
          new Error("The No Access could not be saved on the phone."),
          {
            code: "UNKNOWN",
          },
        );
      }

      setBusy(NO_ACCESS_PROGRESS.recording);

      const processed = await processSubmissionQueue({
        agentUid,
        agentName,
        queueItemIds: [queued?.queueItem?.id],
        filterMode: "METER_DISCOVERY_NO_ACCESS",
        includeSyncing: true,
      });

      // The signal listener only fires when connectivity CHANGES. A phone that was already
      // offline when the worker saved would otherwise never be woken, and the work would sit
      // there. So a saved capture books its own next try.
      scheduleMeterDiscoveryQueueSyncRetry({
        agentUid,
        agentName,
        delayMs: 20000,
      });

      // processSubmissionQueue returns only { success, message } about the RUN, not about this
      // item. Reading it as though it reported the item is how a REFUSAL was shown to the
      // worker as "saved, it will send by itself" - the office had rejected the work and the
      // worker was told it was safe. The queue item itself is the only honest answer.
      const saved = await getSubmissionQueueItemById(queued?.queueItem?.id);

      const result =
        saved?.status === "SUCCESS" && saved?.result?.success === true
          ? noAccessResult("OK")
          : saved?.status === "REFUSED"
            ? noAccessResult(
                saved?.result?.code || saved?.refusal?.code || "UNKNOWN",
              )
            : noAccessResult("OK_QUEUED");

      // The work is off the form and on the phone, so the form is cleared: a filled-in form
      // left on screen after a save invites the worker to submit it a second time.
      helpers.resetForm();

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
          {/* Owner, 3 Oct 2026: the card must show the premise ADDRESS, not a status word.
              A status word stands where information belongs - it tells a worker nothing they
              can act on, and a worker standing at the wrong gate could not tell. The premise
              id is deliberately NOT shown; the owner: "the user is never really going to use
              the ID".
              NAv rule: where the address is missing it shows NAv, which is a flag that the
              screen was opened without one, not a tidy blank. */}
          <Text>{context.premiseAddress || "NAv"}</Text>
        </Surface>

        <Formik
          initialValues={{
            reasonCode: "",
            reasonOther: "",
            appointment: null,
            media: [],
          }}
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
                mediaErrorText={
                  typeof errors.media === "string" ? errors.media : ""
                }
              />

              {busy ? (
                <Surface style={styles.busy} elevation={1}>
                  <ActivityIndicator />
                  <Text style={styles.busyText}>{busy}</Text>
                </Surface>
              ) : null}

              <ForensicFooter
                isTrnLoading={Boolean(busy)}
                onSubmit={handleSubmit}
              />
            </View>
          )}
        </Formik>
      </ScrollView>
    </>
  );
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
