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

import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { Formik } from "formik";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Surface, Text } from "react-native-paper";

import { IrepsNoAccessForm } from "../../../../components/forms/IrepsNoAccessForm";
import { ForensicFooter } from "../../../../src/features/meters/ForensicFooter";
import { NO_ACCESS_ROUTE } from "../../../../src/features/meters/accessGate";
import { buildNoAccessTrnId } from "../../../../src/features/meters/meterDiscoveryTrnId";
import { isCompleteNoAccess } from "../../../../src/features/meters/noAccessReasons";
import {
  NO_ACCESS_PROGRESS,
  noAccessConfirmation,
  noAccessDiscard,
  noAccessQueuedResult,
  noAccessResult,
} from "../../../../src/features/meters/noAccessSubmitMessages";
import { isRefusedByOffice } from "../../../../src/features/savedWork/savedWorkRemovalRules";
import { useAuth } from "../../../../src/hooks/useAuth";
import { processSubmissionQueue } from "../../../../src/services/processSubmissionQueue";
import { scheduleMeterDiscoveryQueueSyncRetry } from "../../../../src/services/startMeterDiscoveryQueueSyncService";
import {
  addSubmissionQueueItem,
  getSubmissionQueueItemById,
} from "../../../../src/utils/submissionQueue";

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
  const navigation = useNavigation();
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

  // ONE ID PER CAPTURE, built when the worker submits - NOT once per screen.
  //
  // Found by the owner, 3 October: he recorded two No Access visits at ERF 5213 and only one
  // reached the office. The server logs show only ONE request ever arrived; the other capture
  // was destroyed on the phone, and he was shown "No Access recorded" for it.
  //
  // How. The id was built with useRef, so it was fixed for as long as the screen stayed
  // mounted. addSubmissionQueueItem refuses a payload whose trnId is already in the queue and
  // returns the OLD item with { success: true } - a guard meant for a double tap on one
  // capture. A successful item is never removed from the queue, so the SECOND capture matched
  // the first, was thrown away, and the screen read the first item's SUCCESS back and reported
  // it as the second one's.
  //
  // A capture is a visit somebody made. It gets its own id, so two can never collide, and the
  // queue's guard goes back to meaning what it was written to mean: the same capture sent
  // twice.
  const buildTrnId = () =>
    buildNoAccessTrnId({
      trnType,
      // NA-R005: ELC, WTR, or NA where no meter was reached - which is every first-visit
      // Discovery, because the worker never got to one.
      meterType: context.meterType,
      wardPcode: context.wardPcode,
      erfNo: context.erfNo,
    });

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
  // NA-R006: a closed No Access goes back where it came from - after a recorded visit, after a
  // refusal, or when the worker simply backs out. The form never stays up.
  //
  // THIS SCREEN LIVES IN THE ADMIN TAB (app/(tabs)/admin/operations/no-access.js) and is opened
  // from PREMISES, ASTS and ADMIN. That one fact caused every version of this that failed:
  //
  //   router.replace to another tab SWITCHES tab and leaves this screen on the Admin stack -
  //   the owner, 4 Oct: "the form is now sitting on admin stack, it does not close". He found
  //   it still there the next time he opened Admin.
  //
  //   router.back() pops it, but only reaches the screen underneath IN ADMIN - so using it for
  //   every caller sent a premise-card visit to My Work Orders.
  //
  // So do both, in order: POP this screen off its own stack, then open the caller's tab if the
  // caller lives in another one.
  //
  //   same tab  -> pop, and stop. The screen underneath is the one they left, still holding its
  //                state: My Work Orders keeps the open bucket, its rows and its filter.
  //   other tab -> pop to clear this screen out of Admin, then replace into their tab.
  //
  // canGoBack is asked because after an app reload there may be nothing underneath. When there
  // is not, replace alone still gets the worker off a form they have already sent.
  // NA-R006. Settled with the owner on 4 October by tracing it together.
  //
  // THE FACT EVERYTHING FOLLOWS FROM: this file lives in app/(tabs)/admin/operations/, so it
  // is ALWAYS pushed onto the Operations stack in the ADMIN tab - whoever opens it. The pusher
  // has no say; the file's location decides.
  //
  //   From My Work Orders (also Admin): the stack is [my-workorders, no-access]. There IS a
  //   screen below, so a pop removes the form and uncovers My Work Orders with its state - the
  //   open bucket, its rows, its filter.
  //
  //   From a premise card or a meter (Premises, ASTs): the call CHANGES TAB and pushes, so the
  //   Operations stack is [no-access] alone. React Navigation will not pop the last screen of a
  //   stack, so back() cannot remove it - it undoes the TAB CHANGE instead, which is why the
  //   owner landed on ERFs (the first tab, because backBehavior is not set) with the form still
  //   sitting on Operations.
  //
  // So: pop where a pop is possible, and where it is not, REPLACE the form away and then go to
  // the worker's own tab. dismiss cannot help - it means "back to the first screen of this
  // stack", and the form IS that screen.
  // NA-R006: the header arrow sits OUTSIDE Formik, so it cannot ask useFormikContext what has
  // been filled in. This is the handle onto the same form the submit uses.
  const formRef = useRef(null);

  /**
   * NA-R006 — leaving by the arrow, with a stop when there is something to lose.
   *
   * Only the arrow comes through here. The submit path calls goBack() straight, because by
   * then the capture is recorded and the form has already been reset - asking a worker whether
   * to discard work that has just been sent would be a lie.
   */
  const leaveForm = () => {
    const window = noAccessDiscard(formRef.current?.values);

    if (!window.needed) {
      goBack();
      return;
    }

    Alert.alert(window.title, window.body, [
      { text: window.cancel, style: "cancel" },
      { text: window.confirm, style: "destructive", onPress: goBack },
    ]);
  };

  const goBack = () => {
    if (!context.returnTo) {
      console.log("No Access -- NA-R006: opened with no returnTo", { trnType });
    }

    const returnTo =
      context.returnTo || "/(tabs)/admin/operations/my-workorders";

    // Is there a screen BELOW this one on THIS stack? router.canGoBack() does not answer that -
    // it counts the tab change too, which is how it reported true while the pop was impossible.
    // The Operations layout already reads the stack this way (adminScreenIsBelowOperations).
    const stackState = navigation?.getState?.();
    const hasScreenBelow = Number(stackState?.index) > 0;

    const tabOf = (path) =>
      String(path || "")
        .split("/")
        .filter(Boolean)[1] || "";

    const sameStack = tabOf(returnTo) === tabOf(NO_ACCESS_ROUTE);

    if (sameStack && hasScreenBelow) {
      // Sales path. Pop uncovers My Work Orders exactly as the worker left it.
      router.back();
      return;
    }

    // The form is alone on the Operations stack. Replace it so Admin is left showing its own
    // menu - the owner: "if the user goes there after submitting the NA form, he must see the
    // admin menu" - and then switch to the tab the worker came from.
    router.replace("/(tabs)/admin");
    router.replace(returnTo);
  };

  // NA-R030: the record. The municipality and the ward are NOT built here - the server reads
  // them from the ERF, which is the authority for where a property is, so the two screens that
  // open this one cannot assemble them two different ways.
  function buildPayload({ trnId, capturedAt, value, media }) {
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
      // TR-R002: the device time goes in METADATA, where the rule puts it - not at the root.
      //
      // The owner, 3 October, reading his own record: "capturedAt - in the rules, do we have
      // this in the root?" We do not. And it was not a harmless extra: this screen sent the
      // real capture time at the root as `capturedAt` and sent NO metadata at all, so the
      // server found no device time and filled createdOnDevice with its own clock. On his 5185
      // record capturedAt was 10:33:25 - the true moment - while createdOnDevice read 10:33:31,
      // the server's. The one true fact sat in the undeclared field and the declared field
      // held a substitute.
      metadata: { createdOnDevice: capturedAt, updatedOnDevice: capturedAt },
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

      // Both belong to THIS capture, not to the screen.
      const trnId = buildTrnId();
      const capturedAt = new Date().toISOString();

      const payload = buildPayload({ trnId, capturedAt, value, media });

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
        // The queue's own words where it has them: it knows WHY, and "could not be saved" on
        // its own leaves a worker with nothing to do about it.
        throw Object.assign(
          new Error(
            queued?.message || "The No Access could not be saved on the phone.",
          ),
          { code: queued?.code || "UNKNOWN" },
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

      // isRefusedByOffice, NOT a string compare. The queue marks a refusal "CONFLICT" and has
      // never written "REFUSED" - so this branch tested for a status that does not exist, and
      // every real refusal fell through to "Saved on this phone. It will be sent by itself as
      // soon as there is signal."
      //
      // Found by the owner, 3 October, on ERF 5212: the server refused the work twice under
      // TB-R062 - the ERF belongs to another team's batch - and the phone told him both times
      // that it was safe and would send itself. It never would. He went looking for a fault
      // in the capture when the office had answered him and the phone had not passed it on.
      //
      // One well: savedWorkRemovalRules already knows what a refusal is (REFUSED, FAILED or
      // CONFLICT), and the Submission Queue screen reads it from there. Two places deciding
      // the same thing is how they came to disagree.
      const result =
        saved?.status === "SUCCESS" && saved?.result?.success === true
          ? noAccessResult("OK")
          : isRefusedByOffice(saved)
            ? noAccessResult(
                saved?.result?.code || saved?.refusal?.code || "UNKNOWN",
              )
            : // Still waiting. WHY it is waiting decides the words: a worker in a dead spot
              // is told to carry on, a worker who has been signed out is told to sign in.
              // "It will send when there is signal" is a lie to the second one.
              noAccessQueuedResult(saved?.result?.code);

      // The work is off the form and on the phone, so the form is cleared: a filled-in form
      // left on screen after a save invites the worker to submit it a second time.
      // THE WORK IS OFF THE FORM. Clear it, say what happened, and leave - in that order, here
      // at the end of the submit, not hidden in a button's callback (owner, 4 Oct 2026).
      //
      // Leaving used to be goBack on the alert's OK. So the function finished with the form
      // still on screen waiting for a tap, and if that tap did not come - or the alert was
      // dismissed another way - the worker was left on a capture they had already sent, where
      // the only obvious move is to send it again.
      //
      // The alert is a native window. It stays up over the screen we return to, so the worker
      // still reads it.
      helpers.resetForm();
      sending.current = false;
      setBusy("");

      Alert.alert(result.title, result.body);
      goBack();
    } catch (error) {
      // NOT SAVED. This is the one path where the worker STAYS: the capture never reached the
      // phone's queue, so there is nothing recorded and nothing to go back to. They are left on
      // their own filled-in form, able to read the reason and send again.
      sending.current = false;
      setBusy("");

      const result = noAccessResult(error?.code || "UNKNOWN");
      Alert.alert(result.title, result.body);
    }
  }

  return (
    <>
      {/* NA-R006: THE WAY OUT, AND IT HAS TO BE DRAWN BY HAND.
          The owner, 4 October: "there's no arrow there for me to dismiss this form ... if
          someone gets into this form and then decides, no, actually, that's not what I want to
          do, then you're stuck."
          A navigator draws a back arrow only when another screen sits below it on the SAME
          stack. Opened from a premise card the form is pushed onto the Operations stack from
          the Premises tab, so it is alone there and no arrow is drawn - the same fact that
          stopped router.back() from closing it after a submit. The Operations menu above
          already carries its own arrow for exactly this reason (TB-R051).
          It leaves through goBack(), so abandoning the form and finishing it end up in the
          same place: back where the worker opened it from. */}
      <Stack.Screen
        options={{
          title: "No Access",
          headerBackVisible: false,
          headerLeft: ({ tintColor }) => (
            <TouchableOpacity
              style={styles.backButton}
              activeOpacity={0.8}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={leaveForm}
            >
              <MaterialCommunityIcons
                name="chevron-left"
                size={26}
                color={tintColor || "#0f172a"}
              />
            </TouchableOpacity>
          ),
        }}
      />
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
          innerRef={formRef}
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
          {({ values, setValues, errors /* handleSubmit */ }) => (
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
                // onSubmit={handleSubmit}
              />
            </View>
          )}
        </Formik>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  // The same arrow the Operations menu draws, so the two look like one app.
  backButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    marginLeft: -6,
  },
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
