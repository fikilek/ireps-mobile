import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../../src/firebase";
import { useAuth } from "../../../src/hooks/useAuth";
import { listQaDrafts, subscribeQaDrafts } from "../../../src/features/qa/amendmentQueue";

export default function QaWork() {
  const { user, isSPV } = useAuth(), uid = user?.uid;
  const router = useRouter();
  const [items, setItems] = useState([]), [notices, setNotices] = useState([]), [drafts, setDrafts] = useState([]);
  const [takeover, setTakeover] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!uid) return;
    setBusy(true); setError("");
    try {
      let cursor = null; const rows = [];
      do { const result = (await httpsCallable(functions, "listTrnQaAmendments")({ takeover, cursor })).data;
        rows.push(...result.items); cursor = result.nextCursor;
      } while (cursor);
      setItems(rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }, [uid, takeover]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    if (!uid) return;
    const update = () => setDrafts(listQaDrafts(uid)); update();
    return subscribeQaDrafts(update);
  }, [uid]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, "qaNotifications"), where("recipientUid", "==", uid)), result => {
      setNotices(result.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      refresh();
    }, failure => setError(failure.message));
  }, [uid, refresh]);
  const open = trnId => router.push({ pathname: "/(tabs)/trns/correct", params: { trnId } });
  return <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
    <Text style={{ color: "#102c54", fontSize: 23, fontWeight: "700" }}>QA · returned work</Text>
    <Text style={{ color: "#172b4d" }}>Correct a QA Fail or amend your own QA Draft. QA Pass is final.</Text>
    {isSPV && <TouchableOpacity onPress={() => setTakeover(!takeover)}><Text style={{ color: "#075dc5" }}>{takeover ? "Show my work" : "Show authorised supervisor takeovers"}</Text></TouchableOpacity>}
    <TouchableOpacity onPress={refresh}><Text style={{ color: "#075dc5" }}>Refresh</Text></TouchableOpacity>
    {busy && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={{ color: "#8b1b1b" }}>{error}</Text>}
    {drafts.map(draft => <TouchableOpacity key={`local-${draft.trnId}`} onPress={() => open(draft.trnId)} style={{ padding: 14, backgroundColor: "#fff2ce" }}>
      <Text style={{ color: "#503500", fontWeight: "700" }}>Saved on this phone · {draft.pending ? "receipt not confirmed" : "not sent"}</Text><Text style={{ color: "#503500" }}>{draft.trnId}</Text>
    </TouchableOpacity>)}
    {items.map(item => <TouchableOpacity key={item.trnId} onPress={() => open(item.trnId)} style={{ padding: 14, gap: 6, backgroundColor: "#eaf2ff" }}>
      <Text style={{ color: "#102c54", fontWeight: "700" }}>QA {item.state} · {item.meterNo || item.trnType}</Text>
      <Text style={{ color: "#172b4d" }}>{item.trnId}</Text>
      {!!item.comment && <Text style={{ color: "#8b1b1b" }}>{item.reason}: {item.comment}</Text>}
      <Text style={{ color: "#075dc5" }}>{takeover ? "Open for authorised takeover" : "Open saved form"}</Text>
    </TouchableOpacity>)}
    {!busy && !items.length && <Text style={{ color: "#172b4d" }}>No eligible work in this list.</Text>}
    <Text style={{ color: "#102c54", fontSize: 19, fontWeight: "700" }}>Notifications</Text>
    {notices.map(notice => <View key={notice.id} style={{ padding: 12, gap: 6, backgroundColor: "#f1f4f8" }}>
      <Text style={{ color: "#172b4d", fontWeight: notice.readAt ? "400" : "700" }}>{notice.title}</Text>
      <Text style={{ color: "#172b4d" }}>{notice.trnId}</Text>
      {["FAILED", "UNCERTAIN", "SKIPPED_EMAIL", "RETRY"].includes(notice.emailStatus) && <Text style={{ color: "#8b1b1b" }}>{notice.emailStatus === "UNCERTAIN" ? "Email delivery unconfirmed; no automatic resend." : notice.emailStatus === "RETRY" ? "Email retry pending." : "Email was not delivered. This in-app notice remains available."}</Text>}
      {notice.kind === "UPDATED" && <Text style={{ color: "#172b4d" }}>Ready for office QA in the TRN Registry.</Text>}
      {!notice.readAt && <TouchableOpacity onPress={async () => { try { await httpsCallable(functions, "markTrnQaNoticeRead")({ id: notice.id }); } catch (failure) { setError(failure.message); } }}><Text style={{ color: "#075dc5" }}>Mark read</Text></TouchableOpacity>}
    </View>)}
  </ScrollView>;
}
