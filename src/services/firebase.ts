import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "mock-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let auth: any;
let storage: ReturnType<typeof getStorage> | null = null;
try {
  if (import.meta.env.VITE_FIREBASE_API_KEY) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    storage = getStorage(app);
  } else {
    auth = {
      onAuthStateChanged: (cb: any) => {
        cb(null);
        return () => {};
      },
      signOut: async () => {},
      signInWithEmailAndPassword: async () => {},
      createUserWithEmailAndPassword: async () => {},
      currentUser: null,
    };
  }
} catch (e) {
  console.warn("Firebase initialization failed:", e);
  auth = { onAuthStateChanged: () => () => {}, signOut: async () => {}, currentUser: null };
}

const isFirebaseConfigured = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

export { auth, storage, isFirebaseConfigured };
