import { createMMKV } from "react-native-mmkv";
import uuid from "react-native-uuid";
import * as FileSystem from "expo-file-system/legacy";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, functions, storage } from "../../firebase";

const store = createMMKV({ id: "ireps-qa-amendments" });
const key = (uid, trnId) => `${uid}/${trnId}`;
const listeners = new Set();
const running = new Map();
export const newAmendmentId = () => `QA_${uuid.v4()}`;
export const subscribeQaDrafts = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function getQaDraft(uid, trnId) {
  const value = store.getString(key(uid, trnId));
  return value ? JSON.parse(value) : null;
}
export function listQaDrafts(uid) {
  return store.getAllKeys().filter(value => value.startsWith(`${uid}/`)).map(value => JSON.parse(store.getString(value)));
}
export function putQaDraft(uid, trnId, value) {
  store.set(key(uid, trnId), JSON.stringify({ ...value, trnId, localUpdatedAt: new Date().toISOString() }));
  listeners.forEach(listener => listener());
}
export function deleteQaDraft(uid, trnId) {
  store.remove(key(uid, trnId)); listeners.forEach(listener => listener());
}
function assertOwner(uid) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error("Sign in with the account that saved this correction.");
}

export async function persistQaMedia(uid, requestId, media = []) {
  assertOwner(uid);
  const directory = `${FileSystem.documentDirectory}ireps/qa/${uid}/${requestId}/`;
  if (!FileSystem.documentDirectory) throw new Error("Phone storage is unavailable. The correction has not been saved.");
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const result = [];
  for (const item of media) {
    if (item.url || !item.uri || item.uri.startsWith(directory)) { result.push(item); continue; }
    const extension = String(item.uri).split(".").pop().split("?")[0].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg";
    const uri = `${directory}${uuid.v4()}.${extension}`;
    await FileSystem.copyAsync({ from: item.uri, to: uri });
    if (!(await FileSystem.getInfoAsync(uri)).exists) throw new Error("The evidence could not be saved on this phone.");
    result.push({ ...item, uri });
  }
  return result;
}

// The request is immutable once sent. Retrying resolves the same operation even
// if the first response was lost, rather than creating another correction.
export function sendQaDraft(uid, trnId) {
  const id = key(uid, trnId);
  if (running.has(id)) return running.get(id);
  const task = send(uid, trnId).finally(() => running.delete(id));
  running.set(id, task); return task;
}
async function send(uid, trnId) {
  assertOwner(uid);
  let draft = getQaDraft(uid, trnId);
  if (!draft?.pending) throw new Error("Save a correction for sending first.");
  try {
    const request = draft.pending;
    for (let i = 0; i < request.fields.media.length; i += 1) {
      const item = request.fields.media[i];
      if (item.url) continue;
      assertOwner(uid);
      if (!item.uploadPath) {
        item.uploadPath = `qa-amendments/${uid}/${request.requestId}/${uuid.v4()}`;
        putQaDraft(uid, trnId, draft);
      }
      const object = ref(storage, item.uploadPath);
      // An interrupted upload may already exist. Recover its URL before trying
      // another write (the server may already have protected that evidence).
      let url;
      try { url = await getDownloadURL(object); }
      catch (error) {
        if (error.code !== "storage/object-not-found") throw error;
        const response = await fetch(item.uri);
        const blob = await response.blob();
        try { await uploadBytes(object, blob, { contentType: item.mimeType || item.type || "image/jpeg" }); }
        finally { blob.close?.(); }
        url = await getDownloadURL(object);
      }
      const { uri: _uri, uploadPath: _path, ...remote } = item;
      request.fields.media[i] = { ...remote, url };
      putQaDraft(uid, trnId, draft);
    }
    assertOwner(uid);
    draft = { ...draft, sent: true, error: null }; putQaDraft(uid, trnId, draft);
    const result = (await httpsCallable(functions, "saveTrnQaAmendment", { timeout: 120000 })(draft.pending)).data;
    deleteQaDraft(uid, trnId);
    return result;
  } catch (error) {
    // Explicit server rejection did not save. Ambiguous transport failures keep
    // the request frozen until its exact retry establishes what happened.
    const rejected = ["invalid-argument", "failed-precondition", "permission-denied", "aborted", "already-exists", "not-found"].some(code => error.code === `functions/${code}`);
    draft = { ...draft, sent: !rejected && draft.sent, error: error.message, conflict: error.details || null,
      ...(rejected ? { rejectedRequest: draft.pending, pending: null } : {}) };
    putQaDraft(uid, trnId, draft); throw error;
  }
}
