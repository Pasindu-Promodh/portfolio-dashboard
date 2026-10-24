// Kept separate from firebase.ts so Firestore only loads with the dashboard.
import { getFirestore } from "firebase/firestore";
import { app } from "./firebase";

export const db = getFirestore(app);
