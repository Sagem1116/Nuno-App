import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

// Public Firebase web config — safe to ship in the client bundle.
export const firebaseConfig = {
  apiKey: "AIzaSyCU16Yxze-AtmyJUdqA4xxA3RUQI2_7TuY",
  authDomain: "nunoapp.firebaseapp.com",
  projectId: "nunoapp",
  storageBucket: "nunoapp.firebasestorage.app",
  messagingSenderId: "480016323560",
  appId: "1:480016323560:web:01ed75e51d9ced26b70a5d",
};

export const VAPID_KEY =
  "BOJGi16WTVMud7Vtq_XEMo_eeZbUnSH1mW0Gmeb2Inko0g7s8GB7hcTA2rd76s_tYs6WEJkJuudSpIJcQf9_aPI";

let app: FirebaseApp | null = null;
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  try {
    if (!(await isSupported())) return null;
    return getMessaging(getFirebaseApp());
  } catch {
    return null;
  }
}
