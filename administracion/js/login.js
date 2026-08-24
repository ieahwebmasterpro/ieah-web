import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAjZtbtNDCIQAh9OIQZ6bzMCX0QLQQQHe8",
    authDomain: "ieah-bienestar.firebaseapp.com",
    projectId: "ieah-bienestar",
    storageBucket: "ieah-bienestar.firebasestorage.app",
    messagingSenderId: "142124375725",
    appId: "1:142124375725:web:9522a9494107d50970b024",
    measurementId: "G-FXDJVHMHJH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnLogin');
    const correo = document.getElementById('loginCorreo').value.trim();
    const clave = document.getElementById('loginClave').value.trim();

    try {
        btn.innerText = "Verificando...";
        btn.disabled = true;

        await signInWithEmailAndPassword(auth, correo, clave);
        
        // Redirección directa al panel de control
        window.location.href = "panel.html";

    } catch (error) {
        btn.innerText = "Ingresar al Panel";
        btn.disabled = false;
        
        console.error("Error Login:", error.code, error.message);
        alert("⚠️ Error al ingresar: " + obtenerMensajeError(error.code));
    }
});

function obtenerMensajeError(codigo) {
    switch (codigo) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return "Usuario o contraseña incorrectos.";
        case 'auth/invalid-email':
            return "El formato del correo no es válido.";
        case 'auth/too-many-requests':
            return "Demasiados intentos fallidos. Intenta más tarde.";
        default:
            return "Ocurrió un error inesperado al conectar con Firebase.";
    }
}