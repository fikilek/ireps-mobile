// TB-R052: the Firestore listeners My Work Orders shares. Each returns its unsubscribe function, answers with
// plain documents ({ id, ...fields }) and { fromCache }, and reports a failure to onError after logging it.
// Metadata changes are included so an answer from the phone's memory is later confirmed by the server.
import {
  collection,
  doc,
  documentId,
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

export function listenDocumentsByIds(collectionName, ids, onDocs, onError) {
  return listenQuery(query(collection(db, collectionName), where(documentId(), "in", ids)), "MD_BGO_LINKED_DOCUMENTS", onDocs, onError);
}

// TC Ward parents are scoped both to current municipal grants and the MD target.
export function listenTrnBgoAllocated(uid, values, onDocs, onError) {
 let stops=[];let epoch=0;
 const stopProfile=onSnapshot(doc(db,"users",uid),snapshot=>{
  const current=++epoch;stops.forEach(stop=>stop());stops=[];onDocs([],{fromCache:true});
  const profile=snapshot.data();if(profile?.accountStatus!=="ACTIVE")return;
  const pc=value=>typeof value==="string"?value:value?.lmPcode||value?.pcode||value?.id;
  const grants=[...new Set([profile.access?.activeWorkbase,...(profile.access?.workbases||[])].map(pc).filter(Boolean))];
  const latest=new Map();
  const targets=values.filter(id=>id!==uid).map(id=>({id,type:id===profile.employment?.serviceProvider?.id?"SP":"TEAM"}));
  const subscriptions=grants.flatMap(lm=>targets.map(target=>({lm,target})));
  if(!subscriptions.length){onDocs([],{fromCache:false});return;}
  subscriptions.forEach(({lm,target})=>stops.push(listenQuery(query(collection(db,"tc_uploads"),where("lmPcode","==",lm),where("bgo.targetId","==",target.id),where("bgo.targetType","==",target.type)),"TRN_BGO_BUCKET",(docs,meta)=>{
   if(current!==epoch)return;latest.set(`${lm}:${target.type}:${target.id}`,{docs,meta});if(latest.size!==subscriptions.length)return;
   onDocs([...new Map([...latest.values()].flatMap(v=>v.docs).map(d=>[d.id,d])).values()],{fromCache:[...latest.values()].some(v=>v.meta.fromCache)});
  },onError)));
 },onError);
 return()=>{epoch++;stopProfile();stops.forEach(stop=>stop());};
}
