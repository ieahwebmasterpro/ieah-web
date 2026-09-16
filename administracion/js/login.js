import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app); // Inicialización de Firestore

// Redirección si ya inició sesión
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (user.email) {
            localStorage.setItem('correoDocenteLogueado', user.email.toLowerCase().trim());
        }
        
        // Cargar también el documento si la sesión ya estaba activa
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists() && userDoc.data().documento) {
                localStorage.setItem('documentoDocenteLogueado', userDoc.data().documento.toString().trim());
            }
        } catch (e) {
            console.error("Error al obtener documento en recarga:", e);
        }

        window.location.href = "panel.html";
    }
});

const formLogin = document.getElementById('formLogin');
const lblError = document.getElementById('lblError');
const btnIngresar = document.getElementById('btnIngresar');

if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        lblError.style.display = 'none';

        const correo = document.getElementById('txtCorreo').value.trim();
        const clave = document.getElementById('txtClave').value.trim();

        try {
            btnIngresar.disabled = true;
            btnIngresar.innerText = "Cargando...";

            // 1. Validar autenticación con Firebase
            const userCredential = await signInWithEmailAndPassword(auth, correo, clave);
            const user = userCredential.user;

            // 2. Verificar estado en Firestore antes de redirigir
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            const data = userDoc.exists() ? userDoc.data() : null;

            const estaEliminado = !userDoc.exists() ||
                data.isDeleted === true ||
                data.eliminado === true ||
                data.activo === false ||
                data.estado === "inactivo";

            if (estaEliminado) {
                // Cerrar la sesión creada por Firebase para no dejar rastros
                await signOut(auth);

                // Restaurar botón y mostrar el mensaje solicitado en lblError
                btnIngresar.disabled = false;
                btnIngresar.innerText = "Ingresar al Sistema";
                lblError.innerText = "⚠️ Estas credenciales no se encuentran en el sistema, por favor póngase en contacto con el administrador";
                lblError.style.display = 'block';
                return;
            }

            // 3. Guardar el correo y el documento/cédula en localStorage justo antes de redirigir
            localStorage.setItem('correoDocenteLogueado', correo.toLowerCase().trim());
            
            if (data && data.documento) {
                localStorage.setItem('documentoDocenteLogueado', data.documento.toString().trim());
            }

            // Si está activo, redirige al panel
            window.location.href = "panel.html";

        } catch (error) {
            btnIngresar.disabled = false;
            btnIngresar.innerText = "Ingresar al Sistema";
            lblError.style.display = 'block';

            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    lblError.innerText = "⚠️ Credenciales incorrectas. Verifica el correo y la contraseña.";
                    break;
                case 'auth/email-already-in-use':
                    lblError.innerText = "⚠️ Este correo electrónico ya está registrado en el sistema.";
                    break;
                case 'auth/invalid-email':
                    lblError.innerText = "⚠️ Formato de correo electrónico no válido.";
                    break;
                case 'auth/too-many-requests':
                    lblError.innerText = "⚠️ Demasiados intentos fallidos. Intenta más tarde.";
                    break;
                default:
                    lblError.innerText = "⚠️ Error al iniciar sesión: " + error.message;
            }
        }
    });
}