import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc 
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Ejecutar lectura al cargar la página
document.addEventListener("DOMContentLoaded", () => {
    cargarNoticiasPublicas();
});

async function cargarNoticiasPublicas() {
    const contenedor = document.getElementById("contenedorNoticiasDinamicas");
    if (!contenedor) return;

    try {
        const querySnapshot = await getDocs(collection(db, "noticias"));
        contenedor.innerHTML = "";

        if (querySnapshot.empty) {
            contenedor.innerHTML = "<p style='text-align:center; width:100%;'>No hay comunicados u oficiales publicados por el momento.</p>";
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const n = docSnap.data();
            const idNoticia = docSnap.id; // Capturamos el ID dinámico de la noticia
            
            // Prioriza la imagen subida en Base64 o la ruta local guardada
            const imagenSrc = n.imagen || n.rutaLocal || "";

            const tarjeta = document.createElement("article");
            tarjeta.className = "tarjeta-noticia";
            tarjeta.style.cssText = "background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; border: 1px solid #e2e8f0;";

            tarjeta.innerHTML = `
                ${imagenSrc ? `<img src="${imagenSrc}" alt="${n.titulo}" style="width: 100%; max-height: 250px; object-fit: cover;">` : ''}
                <div style="padding: 20px;">
                    <h3 style="color: var(--verde-principal, #1a5c2e); margin-top: 0; font-family: 'Montserrat', sans-serif;">${n.titulo}</h3>
                    <p style="color: #4a5568; line-height: 1.6; font-family: 'Open Sans', sans-serif;">${n.descripcion}</p>
                    <a href="../noticias/noticias.html?id=${idNoticia}" style="display: inline-block; margin-top: 10px; color: var(--verde-principal, #1a5c2e); font-weight: bold; text-decoration: underline;">
                        Leer noticia completa →
                    </a>
                </div>
            `;

            contenedor.appendChild(tarjeta);
        });
    } catch (error) {
        console.error("Error al obtener las noticias en el portal:", error);
        contenedor.innerHTML = "<p style='text-align:center; width:100%; color:red;'>Error al conectar con el servidor de noticias.</p>";
    }
}

// Envío del Formulario de Contacto desde el Index al Buzón de Firestore
document.getElementById('formContacto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nuevoMensaje = {
        nombre: document.getElementById('nombre').value.trim(),
        correo: document.getElementById('correo').value.trim(),
        contenido: document.getElementById('mensaje').value.trim(),
        fecha: Date.now()
    };

    try {
        await addDoc(collection(db, "mensajes"), nuevoMensaje);
        alert("✅ Mensaje enviado exitosamente al buzón institucional.");
        e.target.reset();
    } catch (error) {
        alert("⚠️ Ocurrió un error al enviar el mensaje: " + error.message);
    }
});