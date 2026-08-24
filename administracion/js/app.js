import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app);

const loginForm = document.getElementById('loginForm');
const mensajeError = document.getElementById('mensajeError');
const btnIngresar = document.getElementById('btnIngresar');

const modalCambioClave = document.getElementById('modalCambioClave');
const formCambioClave = document.getElementById('formCambioClave');
const mensajeErrorModal = document.getElementById('mensajeErrorModal');
const btnActualizarClave = document.getElementById('btnActualizarClave');

let usuarioActual = null;

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    mensajeError.style.display = 'none';
    btnIngresar.disabled = true;
    btnIngresar.textContent = 'Verificando...';

    const correo = document.getElementById('correo').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
        // 1. Iniciar Sesión
        const userCredential = await signInWithEmailAndPassword(auth, correo, password);
        usuarioActual = userCredential.user;

        // 2. Consultar perfil en Firestore
        const docRef = doc(db, "usuarios", usuarioActual.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const datosUsuario = docSnap.data();

            localStorage.setItem('sesionIniciada', 'true');
            localStorage.setItem('rolUsuario', datosUsuario.rol);

            // 3. Evaluar primer ingreso
            if (datosUsuario.primerIngreso === true) {
                modalCambioClave.style.display = 'flex';
            } else {
                window.location.href = "panel.html";
            }

        } else {
            mostrarError("⚠️ El usuario no tiene un rol asignado en la base de datos.");
        }

    } catch (error) {
        console.error("Error en login:", error);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            mostrarError("⚠️ Correo o contraseña incorrectos.");
        } else {
            mostrarError("❌ No se pudo conectar con Firebase. Revisa tu conexión.");
        }
    } finally {
        btnIngresar.disabled = false;
        btnIngresar.textContent = 'Ingresar';
    }
});

// Evento para actualizar la contraseña obligatoria
formCambioClave.addEventListener('submit', async (e) => {
    e.preventDefault();
    mensajeErrorModal.style.display = 'none';

    const nuevaPassword = document.getElementById('nuevaPassword').value.trim();
    const confirmarPassword = document.getElementById('confirmarPassword').value.trim();

    if (nuevaPassword !== confirmarPassword) {
        mostrarErrorModal("⚠️ Las contraseñas no coinciden.");
        return;
    }

    btnActualizarClave.disabled = true;
    btnActualizarClave.textContent = 'Guardando...';

    try {
        // Cambiar clave en Auth
        await updatePassword(usuarioActual, nuevaPassword);

        // Actualizar bandera en Firestore
        const docRef = doc(db, "usuarios", usuarioActual.uid);
        await updateDoc(docRef, {
            primerIngreso: false
        });

        alert("✅ Contraseña actualizada correctamente. Bienvenido.");
        window.location.href = "panel.html";

    } catch (error) {
        console.error("Error al cambiar contraseña:", error);
        if (error.code === 'auth/requires-recent-login') {
            mostrarErrorModal("⚠️ Sesión expirada. Vuelve a iniciar sesión e inténtalo de nuevo.");
        } else {
            mostrarErrorModal("❌ Error al actualizar la contraseña. Comprueba que tenga al menos 6 caracteres.");
        }
    } finally {
        btnActualizarClave.disabled = false;
        btnActualizarClave.textContent = 'Guardar Nueva Contraseña';
    }
});

function mostrarError(texto) {
    mensajeError.textContent = texto;
    mensajeError.style.display = 'block';
}

function mostrarErrorModal(texto) {
    mensajeErrorModal.textContent = texto;
    mensajeErrorModal.style.display = 'block';
}