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

// Cargar Noticias Públicas al iniciar
document.addEventListener("DOMContentLoaded", () => {
    cargarNoticiasPublicas();
});

async function cargarNoticiasPublicas() {
    const contenedor = document.getElementById("contenedorNoticiasPublicas");
    if (!contenedor) return;

    try {
        const querySnapshot = await getDocs(collection(db, "noticias"));
        contenedor.innerHTML = "";

        if (querySnapshot.empty) {
            contenedor.innerHTML = "<p style='text-align:center;'>No hay noticias u oficiales publicados por el momento.</p>";
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const n = docSnap.data();
            
            // Prioriza la imagen subida en Base64 o la ruta local de la carpeta img/
            const imagenSrc = n.imagen || n.rutaLocal || "img/noticia-defecto.jpg";

            contenedor.innerHTML += `
                <article class="tarjeta-noticia" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px; background: #fff;">
                    ${imagenSrc ? `<img src="${imagenSrc}" alt="${n.titulo}" style="width: 100%; max-height: 250px; object-fit: cover;">` : ''}
                    <div style="padding: 15px;">
                        <h3 style="color: #1a5c2e; margin-top: 0;">${n.titulo}</h3>
                        <p style="color: #4a5568; line-height: 1.5;">${n.descripcion}</p>
                        ${n.enlace ? `<a href="${n.enlace}" target="_blank" class="btn-enlace" style="display: inline-block; margin-top: 10px; color: #1a5c2e; font-weight: bold; text-decoration: none;">Más información →</a>` : ''}
                    </div>
                </article>
            `;
        });
    } catch (error) {
        console.error("Error al cargar noticias en el index:", error);
        contenedor.innerHTML = "<p>Error al cargar las publicaciones.</p>";
    }
}

// Envío del Formulario de Contacto / Buzón desde el Index
document.getElementById('formContactoPublico')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nuevoMensaje = {
        nombre: document.getElementById('contactoNombre').value.trim(),
        correo: document.getElementById('contactoCorreo').value.trim(),
        contenido: document.getElementById('contactoMensaje').value.trim(),
        fecha: Date.now()
    };

    try {
        await addDoc(collection(db, "mensajes"), nuevoMensaje);
        alert("✅ Mensaje enviado con éxito al buzón institucional.");
        e.target.reset();
    } catch (error) {
        alert("⚠️ Error al enviar el mensaje: " + error.message);
    }
});