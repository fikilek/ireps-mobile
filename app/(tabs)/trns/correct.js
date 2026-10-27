import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../src/firebase";
import { returnAfterLifecycleWork } from "../../../src/utils/lifecycleReturn";
import { useAuth } from "../../../src/hooks/useAuth";
import { QaAmendmentContext } from "../../../src/features/qa/QaAmendmentContext";
import NoAccessScreen from "../admin/operations/no-access";
import { amendmentFields, correctionParams, correctionSeed, savedMeter } from "../../../src/features/qa/amendmentModel";
import { getQaDraft, putQaDraft, newAmendmentId, persistQaMedia, sendQaDraft } from "../../../src/features/qa/amendmentQueue";
import FormMeterDiscovery from "../../../src/features/meters/FormMeterDiscovery";
import FormMeterInstallation from "../../../src/features/meters/FormMeterIstallation";
import Commissioning from "../asts/commissioning";
import Disconnection from "../asts/disconnection";
import Reconnection from "../asts/reconnection";
import Removal from "../asts/removal";
import Reading from "../asts/meter-reading";
import Inspection from "../asts/inspection";

const forms = { METER_DISCOVERY: FormMeterDiscovery, METER_INSTALLATION: FormMeterInstallation, METER_COMMISSIONING: Commissioning,
  METER_DISCONNECTION: Disconnection, METER_RECONNECTION: Reconnection, METER_REMOVAL: Removal, METER_READING: Reading, METER_INSPECTION: Inspection };
const retryable = error => ["functions/unavailable", "functions/deadline-exceeded", "functions/internal"].includes(error.code);

export default function CorrectTransaction() {
  const { trnId } = useLocalSearchParams();
  const { user } = useAuth(); const uid = user?.uid;
  // Account/TRN changes must discard the previous editor and its async responses.
  return <CorrectionLoader key={`${uid}/${trnId}`} uid={uid} trnId={trnId} />;
}

function CorrectionLoader({ uid, trnId }) {
  const router = useRouter(); const navigation = useNavigation();
  const [loaded, setLoaded] = useState(null), [error, setError] = useState("");
  const [newer, setNewer] = useState(null);
  useEffect(() => {
    if (!uid || !trnId) return;
    let active = true;
    const cached = getQaDraft(uid, trnId);
    // Resolve an uncertain send with exactly the original request before editing.
    if (cached?.pending) { setLoaded({ ...cached, retryOnly: true }); return; }
    httpsCallable(functions, "getTrnQaAmendment", { timeout: 120000 })({ trnId }).then(result => {
      if (!active) return;
      if (cached?.context && (cached.context.sourceVersion !== result.data.sourceVersion || cached.context.previousReviewId !== result.data.previousReviewId)) {
        setError("The office record changed after this phone draft was saved. The draft is retained. Return to My Work Orders and reopen after reviewing the latest record.");
        setNewer({ context: result.data, cached });
        return;
      }
      setLoaded({ ...cached, context: result.data, requestId: cached?.requestId || newAmendmentId() });
    }).catch(failure => {
      if (!active) return;
      if (cached?.context && retryable(failure)) setLoaded(cached);
      else setError(failure.message);
    });
    return () => { active = false; };
  }, [uid, trnId]);
  if (error) return <View style={{ padding: 20, gap: 16 }}><Text style={{ color: "#8b1b1b" }}>{error}</Text>
    {newer && <TouchableOpacity onPress={() => {
      const next = { context: newer.context, requestId: newAmendmentId(), previousDrafts: [...(newer.cached.previousDrafts || []), { ...newer.cached, previousDrafts: undefined }] };
      putQaDraft(uid, trnId, next); setLoaded(next); setError(""); setNewer(null);
    }}><Text style={{ color: "#075dc5" }}>Start from the latest record; retain the previous phone draft</Text></TouchableOpacity>}
  </View>;
  if (!loaded) return <ActivityIndicator accessibilityLabel="Opening saved submission" />;
  return <CorrectionEditor key={`${uid}/${trnId}`} uid={uid} loaded={loaded} router={router} navigation={navigation} />;
}

function CorrectionEditor({ uid, loaded, router, navigation }) {
  const context = loaded.context, trnId = context.trnId;
  const [explanation, setExplanation] = useState(loaded.explanation || "");
  const [takeoverReason, setTakeoverReason] = useState(loaded.takeoverReason || "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(loaded.error || "");
  const [retryOnly, setRetryOnly] = useState(loaded.retryOnly === true);
  const [initialValues, setInitialValues] = useState(loaded.values);
  const live = useRef(loaded.values), saved = useRef(JSON.stringify(loaded.values)), leaving = useRef(false);
  const requestId = loaded.requestId;
  const observe = useCallback(values => { live.current = values; saved.current ??= JSON.stringify(values); }, []);
  useEffect(() => navigation.addListener("beforeRemove", event => {
    if (leaving.current || retryOnly || saved.current === JSON.stringify(live.current)) return;
    event.preventDefault();
    Alert.alert("Unsaved correction", "Save on phone before leaving to keep these edits.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Leave without saving", style: "destructive", onPress: () => { leaving.current = true; navigation.dispatch(event.data.action); } },
    ]);
  }), [navigation, retryOnly]);
  const persist = async (values, extra = {}) => {
    const media = await persistQaMedia(uid, requestId, values.media || []);
    const durable = { ...values, media };
    const draft = { context, requestId, values: durable, explanation, takeoverReason, previousDrafts: loaded.previousDrafts || [], ...extra };
    putQaDraft(uid, trnId, draft); saved.current = JSON.stringify(values);
    setInitialValues(durable);
    return draft;
  };
  const save = async values => {
    if (busy) return;
    setBusy(true);
    try { await persist(values); setMessage("Saved on this phone. This correction has not been sent to the office."); }
    catch (failure) { setMessage(failure.message); }
    finally { setBusy(false); }
  };
  const send = async () => {
    try {
      const result = await sendQaDraft(uid, trnId);
      leaving.current = true;
      Alert.alert("Correction received", `QA ${result.amendment.state}. The office has received the correction and its history.`);
      returnAfterLifecycleWork(router, "/(tabs)/admin/operations/my-workorders", "/(tabs)/trns");
    } catch (failure) {
      setMessage(failure.message);
      const current = getQaDraft(uid, trnId);
      setRetryOnly(!!current?.pending);
    }
  };
  const submit = async (canonical, raw = canonical) => {
    if (busy) return;
    if (context.takeover && !takeoverReason.trim()) { setMessage("Explain the supervisor takeover and confirm the original submitter has left."); return; }
    setBusy(true); setMessage("");
    try {
      const confirmed = await new Promise(resolve => Alert.alert("Send this correction?",
        `The original submission and all earlier versions will be retained. QA will ${context.state === "FAIL" ? "move to Updated for another review" : "remain COMPLETED awaiting QA"}.`,
        [{ text: "Keep editing", style: "cancel", onPress: () => resolve(false) },
          { text: "Send correction", onPress: () => resolve(true) }], { cancelable: false }));
      if (!confirmed) return;
      const durable = await persist(raw);
      // Canonicalization may filter evidence; match durable files by their original URI.
      const durableByUri = new Map((raw.media || []).map((item, index) => [item.uri, durable.values.media[index]]));
      const media = (canonical.media || []).map(item => item.url ? item : durableByUri.get(item.uri) || item);
      const persistedCanonical = { ...canonical, media: await persistQaMedia(uid, requestId, media) };
      const fields = amendmentFields(context.snapshot, persistedCanonical);
      const pending = { trnId, requestId, sourceVersion: context.sourceVersion, previousReviewId: context.previousReviewId,
        meterVersion: context.meterVersion, explanation, takeoverReason, retainNewerMeterFacts: true, fields };
      putQaDraft(uid, trnId, { ...durable, pending });
      setRetryOnly(true); await send();
    } catch (failure) { setMessage(failure.message); }
    finally { setBusy(false); }
  };
  const seed = useMemo(() => correctionSeed(context.snapshot), [context.snapshot]);
  const meter = useMemo(() => savedMeter(context), [context]);
  const editQueueItem = useMemo(() => ({ payload: seed }), [seed]);
  const params = useMemo(() => correctionParams(context), [context]);
  const premise = useMemo(() => ({ ...context.snapshot.accessData.premise, parents: context.snapshot.accessData.parents,
    geometry: { centroid: context.snapshot.ast?.location?.gps } }), [context]);
  const value = { context, params, meter, premise, editQueueItem, initialValues, explanation, setExplanation,
    takeoverReason, setTakeoverReason, busy, message, observe, save, submit };
  if (retryOnly) return <View style={{ padding: 20, gap: 16 }}>
    <Text style={{ color: "#172b4d" }}>Correction saved on this phone. Receipt by the office has not yet been confirmed.</Text>
    {!!message && <Text style={{ color: "#8b1b1b" }}>{message}</Text>}
    <TouchableOpacity disabled={busy} onPress={async () => { setBusy(true); try { await send(); } finally { setBusy(false); } }}><Text style={{ color: "#075dc5" }}>{busy ? "Sending…" : "Retry this correction"}</Text></TouchableOpacity>
  </View>;
  const Component = forms[context.snapshot.accessData.trnType];
  return <QaAmendmentContext.Provider value={value}>
    {context.snapshot.accessData.access.hasAccess === "no" ? <NoAccessScreen /> : Component ? <Component /> : <Text>Unsupported transaction form.</Text>}
  </QaAmendmentContext.Provider>;
}
