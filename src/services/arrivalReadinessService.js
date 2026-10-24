import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export const ARRIVAL_READINESS_COLLECTION = "arrival_readiness";

export function subscribeArrivalReadiness(onRows, onError = console.error) {
  const q = query(collection(db, ARRIVAL_READINESS_COLLECTION), orderBy("eta", "asc"));
  return onSnapshot(q, (snapshot) => {
    const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    onRows(rows);
  }, onError);
}
