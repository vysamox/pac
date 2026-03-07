import {
  doc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomLetters() {
  const a = alphabet[Math.floor(Math.random() * alphabet.length)];
  const b = alphabet[Math.floor(Math.random() * alphabet.length)];
  return a + b;
}

export async function generateStudentId(db) {

  const year = new Date().getFullYear();

  const counterRef = doc(db, "SystemCounters", `StudentCounter_${year}`);

  const newSerial = await runTransaction(db, async (transaction) => {

    const counterDoc = await transaction.get(counterRef);

    let current = 0;

    if (counterDoc.exists()) {
      current = counterDoc.data().current || 0;
    }

    const next = current + 1;

    transaction.set(counterRef, { current: next }, { merge: true });

    return next;
  });

  const serial = String(newSerial).padStart(4, "0");

  const letters = randomLetters();

  return `SAM${year}${letters}${serial}`;
}