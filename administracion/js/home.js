import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAjZtbtNDCIQAh9OIQZ6bzMCX0QLQQQHe8",
    authDomain: "ieah-bienestar.firebaseapp.com",
    projectId: "ieah-bienestar",
    storageBucket: "ieah-bienestar.firebasestorage.app",
    messagingSenderId: "142124375725",
    appId: "1:142124375725:web:9522a9494107d50970b024"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1. Manejo del Formulario de Contacto (Guardado en Firestore)
const formContacto = document.getElementById('formContacto');

if (formContacto) {
    formContacto.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnEnviar = formContacto.querySelector('button[type="submit"]');
        const textoOriginal = btnEnviar.textContent;

        btnEnviar.disabled = true;
        btnEnviar.textContent = "Enviando mensaje...";

        const nombre = document.getElementById('nombre').value.trim();
        const correo = document.getElementById('correo').value.trim();
        const contenido = document.getElementById('mensaje').value.trim();

        try {
            // Guardar el mensaje en la colección "mensajes" de Firestore
            await addDoc(collection(db, "mensajes"), {
                nombre: nombre,
                correo: correo,
                contenido: contenido,
                fecha: serverTimestamp(),
                leido: false
            });

            alert("✅ ¡Éxito! Tu mensaje ha sido enviado a la institución.");
            formContacto.reset();

        } catch (error) {
            console.error("Error al guardar el mensaje en Firestore:", error);
            alert("❌ Hubo un error al enviar el mensaje. Revisa las reglas de seguridad de Firestore.");
        } finally {
            btnEnviar.disabled = false;
            btnEnviar.textContent = textoOriginal;
        }
    });
}

// 2. Carga Dinámica de Noticias desde Firebase
async function cargarNoticiasPublicas() {
    const contenedor = document.getElementById('contenedorNoticiasDinamicas');
    if (!contenedor) return;

    try {
        const querySnapshot = await getDocs(collection(db, "noticias"));
        if (querySnapshot.empty) {
            contenedor.innerHTML = `
                <div class="tarjeta">
                    <img src="img/pta.jpg" alt="Programa PTA" class="img-noticia" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3252/3252936.png'">
                    <h3>Programa de Tutorías para el Aprendizaje y la Formación Integral</h3>
                    <p>Conoce todo lo relacionado con el programa PTA de nuestra institución.</p>
                    <a class="enlace-noticia" href="noticias/noticia1.html">Saber más...</a>
                </div>
                <div class="tarjeta">
                    <img src="img/bingo.jpg" alt="Gran Bingo Institucional" class="img-noticia" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3252/3252936.png'">
                    <h3>🎉🎱 ¡Gran Bingo – Día de la Familia I.E. Alto Horizonte! 🎱🎉</h3>
                    <p>La Institución Educativa Alto Horizonte invita a toda nuestra comunidad educativa a disfrutar de una jornada especial.</p>
                    <a class="enlace-noticia" href="noticias/noticia2.html">Saber más...</a>
                </div>
            `;
            return;
        }

        contenedor.innerHTML = "";
        querySnapshot.forEach((docSnap) => {
            const n = docSnap.data();
            const urlImagen = n.imagen || 'https://cdn-icons-png.flaticon.com/512/3252/3252936.png';
            const enlace = n.enlace ? `<a class="enlace-noticia" href="${n.enlace}" target="_blank">Saber más...</a>` : '';
            
            contenedor.innerHTML += `
                <div class="tarjeta">
                    <img src="${urlImagen}" alt="${n.titulo}" class="img-noticia" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3252/3252936.png'">
                    <h3>${n.titulo}</h3>
                    <p>${n.descripcion}</p>
                    ${enlace}
                </div>
            `;
        });
    } catch (error) {
        console.error("Error al cargar noticias:", error);
        contenedor.innerHTML = "<p style='text-align:center;'>No se pudieron cargar los eventos oficiales en este momento.</p>";
    }
}

window.addEventListener('DOMContentLoaded', cargarNoticiasPublicas);