import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "tpa-schedule.firebaseapp.com",
  projectId: "tpa-schedule",
  storageBucket: "tpa-schedule.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// FORZAR USO DEL BUCKET NO ESTÁNDAR
export const storage = getStorage(app, "gs://tpa-schedule.firebasestorage.app");

// Firestore
export const db = getFirestore(app);

