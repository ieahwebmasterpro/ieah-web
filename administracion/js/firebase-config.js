// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAjZtbtNDCIQAh9OIQZ6bzMCX0QLQQQHe8",
  authDomain: "ieah-bienestar.firebaseapp.com",
  projectId: "ieah-bienestar",
  storageBucket: "ieah-bienestar.firebasestorage.app",
  messagingSenderId: "142124375725",
  appId: "1:142124375725:web:9522a9494107d50970b024",
  measurementId: "G-FXDJVHMHJH"
};

// Inicializar la app y la base de datos
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { collection, getDocs, addDoc, query, where };