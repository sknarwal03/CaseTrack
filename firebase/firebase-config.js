import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAfuZzPRGwJG1ltsSAOAk5ZUm_Dz2r25Y4",
    authDomain: "casetrack-97a4e.firebaseapp.com",
    projectId: "casetrack-97a4e",
    storageBucket: "casetrack-97a4e.firebasestorage.app",
    messagingSenderId: "468015953153",
    appId: "1:468015953153:web:31fcff64092be2e68a1700",
    measurementId: "G-NXBNDHWL19"
  };

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

export { db };



