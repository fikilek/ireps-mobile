// TB-R052: the Firestore listeners My Work Orders shares. Each returns its unsubscribe function, answers with
// plain documents ({ id, ...fields }) and { fromCache }, and reports a failure to onError after logging it.
// Metadata changes are included so an answer from the phone's memory is later confirmed by the server.
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import { readFromCache } from "./liveSubscription";

const toDocs = (snapshot) =>
  snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

export function listenQuery(firestoreQuery, label, onDocs, onError) {
  return onSnapshot(
    firestoreQuery,
    { includeMetadataChanges: true },
    (snapshot) => onDocs(toDocs(snapshot), { fromCache: readFromCache(snapshot) }),
    (error) => {
      console.error(`❌ [${label}_STREAM_ERROR]:`, error);
      onError(error);
    },
  );
}

// The teams whose members include the worker.
export function listenActorTeams(uid, onTeams, onError) {
  return listenQuery(
    query(collection(db, "teams"), where("scope.memberUserIds", "array-contains", uid)),
    "ACTOR_TEAMS",
    onTeams,
    onError,
  );
}

// One "in" listener on a field for up to 30 values.
export function listenWhereIn({ collectionName, field, values, label }, onDocs, onError) {
  return listenQuery(
    query(collection(db, collectionName), where(field, "in", values)),
    label,
    onDocs,
    onError,
  );
}
