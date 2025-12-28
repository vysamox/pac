/* ============================================================
   FIREBASE CONFIG + FULL IMPORT PACK (v10 MODULAR SDK)
============================================================ */

/* Firebase Core */
import { 
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

/* Firestore Full Import Pack */
import {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  onSnapshot,
  enableIndexedDbPersistence,

  // Queries
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAt,
  startAfter,
  endAt,
  endBefore,

  // Batch & Transactions
  writeBatch,
  runTransaction,

  // Data Types
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  FieldValue
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ============================================================
   YOUR FIREBASE API CONFIG
============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyCE2_x5xvW3wCsOx6jo9-ZhNOhgWm86cPY",
  authDomain: "mrsamrat08.firebaseapp.com",
  projectId: "mrsamrat08",
  storageBucket: "mrsamrat08.appspot.com",
  messagingSenderId: "525481767881",
  appId: "1:525481767881:web:6fd53162b242709890ae18"
};


/* ============================================================
   SAFE INITIALIZATION
============================================================ */
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

/* ============================================================
   EXPORT EVERYTHING FOR ALL PAGES
============================================================ */
export {
  app,
  db,

  collection,
  collectionGroup,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  onSnapshot,

  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAt,
  startAfter,
  endAt,
  endBefore,

  writeBatch,
  runTransaction,

  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  FieldValue
};
