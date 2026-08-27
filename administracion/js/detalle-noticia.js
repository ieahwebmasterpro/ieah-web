import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
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
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const noticiaId = params.get("id");

    const tituloEl = document.getElementById("noticiaTituloSticky");
    const metaEl = document.getElementById("noticiaMeta");
    const imgEl = document.getElementById("noticiaImagenContenedor");
    const cuerpoEl = document.getElementById("noticiaCuerpo");
    const enlaceEl = document.getElementById("noticiaEnlaceExt");

    if (!noticiaId) {
        if (tituloEl) tituloEl.innerText = "Error de enlace";
        if (cuerpoEl) cuerpoEl.innerHTML = "<p style='color:red;'>No se encontró un código de noticia válido.</p>";
        return;
    }

    try {
        const docSnap = await getDoc(doc(db, "noticias", noticiaId));

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Asignar el título al encabezado fijo (sticky)
            if (tituloEl) tituloEl.innerText = data.titulo;

            // Fecha formateada
            if (metaEl && (data.fechaCreacion || data.fecha)) {
                const timestamp = data.fechaCreacion || data.fecha;
                const fecha = new Date(timestamp).toLocaleDateString('es-CO', { 
                    year: 'numeric', month: 'long', day: 'numeric' 
                });
                metaEl.innerHTML = `<p style="color: #718096; font-size: 0.9em; margin-bottom: 20px;">Publicado el ${fecha}</p>`;
            }

            // Imagen destacada
            const imagenSrc = data.imagen || data.rutaLocal || "";
            if (imgEl && imagenSrc) {
                imgEl.innerHTML = `<img src="${imagenSrc}" alt="${data.titulo}" style="width: 100%; max-height: 450px; object-fit: cover; border-radius: 8px; margin-bottom: 25px;">`;
            }

            // Cuerpo extenso (respeta saltos de línea con textContent / innerText)
            if (cuerpoEl) {
                cuerpoEl.innerText = data.contenidoCompleto || data.descripcion;
            }

            // Enlace adjunto o externo
            if (enlaceEl && data.enlace) {
                enlaceEl.innerHTML = `
                    <div style="margin-top: 30px; padding-top: 15px; border-top: 1px dashed #e2e8f0;">
                        <a href="${data.enlace}" target="_blank" rel="noopener noreferrer" style="color: #1a5c2e; font-weight: bold; text-decoration: underline;">
                            Enlace o documento complementario →
                        </a>
                    </div>`;
            }

        } else {
            if (tituloEl) tituloEl.innerText = "Comunicado no encontrado";
            if (cuerpoEl) cuerpoEl.innerHTML = "<p style='color: #718096;'>El comunicado solicitado ya no existe o ha sido retirado.</p>";
        }
    } catch (error) {
        console.error("Error al cargar la noticia:", error);
        if (tituloEl) tituloEl.innerText = "Error de conexión";
        if (cuerpoEl) cuerpoEl.innerHTML = "<p style='color:red;'>No se pudo conectar con el servidor para obtener el contenido.</p>";
    }
});