
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

VITE_FIREBASE_API_KEY=AIzaSyDw3sc9HkyHzme0RrZPqfPDOPnOxdQ_Es8
VITE_FIREBASE_AUTH_DOMAIN=tpa-schedule.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tpa-schedule
VITE_FIREBASE_STORAGE_BUCKET=tpa-schedule.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=50257694129
VITE_FIREBASE_APP_ID=1:50257694129:web:c5e8081584b7c30a29c190

}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
