import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    getDocs,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    doc
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
const auth = getAuth(app);
const db = getFirestore(app);

const VALOR_CUOTA_FIJA = 35000;
const MESES_ANIO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

let docentesCache = [];
let pagosCache = [];
let usuariosCache = [];
let usuarioRolActual = "";

// --- AUTENTICACIÓN Y PERMISOS ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Redirección corregida a login.html
        window.location.href = "login.html";
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            usuarioRolActual = (data.rol || "docente").toLowerCase().trim();

            document.getElementById('lblUsuarioNombre').innerText = data.nombre || user.email;
            document.getElementById('lblUsuarioRol').innerText = usuarioRolActual;

            aplicarPermisosRol(usuarioRolActual);
        } else {
            aplicarPermisosRol("docente");
        }
    } catch (error) {
        console.error("Error al obtener rol:", error);
        aplicarPermisosRol("docente");
    }
});

function aplicarPermisosRol(rol) {
    const rolLimpio = String(rol).toLowerCase().trim();
    const formDocenteBox = document.getElementById('contenedorFormDocente');
    const menuAdmin = document.getElementById('menuAdministrativo');
    const gridStats = document.getElementById('tarjetasEstadisticas');
    const secBienvenida = document.getElementById('sec-docente-bienvenida');

    if (rolLimpio === "docente") {
        if (menuAdmin) menuAdmin.style.display = "none";
        if (gridStats) gridStats.style.display = "none";
        if (secBienvenida) secBienvenida.style.display = "block";

        document.getElementById('tituloVista').innerText = "Panel del Docente";
        mostrarSeccion('docente-bienvenida', null);
    } else {
        if (menuAdmin) menuAdmin.style.display = "block";
        if (gridStats) gridStats.style.display = "grid";
        if (secBienvenida) secBienvenida.style.display = "none";

        if (rolLimpio === "superadmin") {
            if (formDocenteBox) formDocenteBox.style.cssText = "display: block !important;";
            document.querySelectorAll('.solo-superadmin').forEach(el => el.style.setProperty('display', 'block', 'important'));
            document.querySelectorAll('.col-accion').forEach(el => el.style.setProperty('display', 'table-cell', 'important'));
        } else {
            if (formDocenteBox) formDocenteBox.style.setProperty('display', 'none', 'important');
            document.querySelectorAll('.solo-superadmin').forEach(el => el.style.setProperty('display', 'none', 'important'));
            document.querySelectorAll('.col-accion').forEach(el => el.style.setProperty('display', 'none', 'important'));
        }

        mostrarSeccion('docentes', document.getElementById('btnDocentes'));
        cargarMensajes();
        renderizarDocentes();
        renderizarPagos();
        renderizarUsuarios();
        renderizarNoticias();
    }
}

// Botón de cerrar sesión actualizado a login.html
document.getElementById('btnCerrarSesion')?.addEventListener('click', () => {
    signOut(auth).then(() => { window.location.href = "login.html"; });
});

// --- NAVEGACIÓN ---
window.mostrarSeccion = function (seccion, elemento) {
    document.querySelectorAll('.seccion-modulo').forEach(s => s.classList.remove('activa'));
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('activo'));

    if (seccion === 'docente-bienvenida') {
        const sec = document.getElementById('sec-docente-bienvenida');
        if (sec) sec.classList.add('activa');
    } else if (seccion === 'buzon') {
        document.getElementById('sec-buzon').classList.add('activa');
        document.getElementById('tituloVista').innerText = "Buzón de Mensajes";
    } else if (seccion === 'noticias') {
        document.getElementById('sec-noticias').classList.add('activa');
        document.getElementById('tituloVista').innerText = "Noticias y Eventos Oficiales";
        renderizarNoticias();
    } else if (seccion === 'usuarios') {
        document.getElementById('sec-usuarios').classList.add('activa');
        document.getElementById('tituloVista').innerText = "Gestión de Usuarios del Sistema";
        renderizarUsuarios();
    } else if (seccion === 'docentes') {
        document.getElementById('sec-docentes').classList.add('activa');
        document.getElementById('tituloVista').innerText = "Directorio Docentes";
    } else if (seccion === 'contabilidad') {
        document.getElementById('sec-contabilidad').classList.add('activa');
        document.getElementById('tituloVista').innerText = "Gestión Contable & Recibos";
    } else if (seccion === 'matriz') {
        document.getElementById('sec-matriz').classList.add('activa');
        document.getElementById('tituloVista').innerText = "Matriz General de Pagos";
        renderizarMatrizPagos();
    }
    if (elemento) elemento.classList.add('activo');
};

// --- GESTIÓN DE NOTICIAS ---
document.getElementById('formNoticia')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (usuarioRolActual !== 'superadmin') return;

    const archivoImagen = document.getElementById('noticiaImagenFile').files[0];
    if (!archivoImagen) {
        alert("⚠️ Selecciona una imagen desde tu equipo.");
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(archivoImagen);
    reader.onload = async function () {
        const nuevaNoticia = {
            titulo: document.getElementById('noticiaTitulo').value.trim(),
            descripcion: document.getElementById('noticiaDescripcion').value.trim(),
            imagen: reader.result,
            rutaLocal: "img/" + archivoImagen.name,
            enlace: document.getElementById('noticiaEnlace').value.trim(),
            fechaCreacion: Date.now()
        };

        try {
            await addDoc(collection(db, "noticias"), nuevaNoticia);
            document.getElementById('formNoticia').reset();
            renderizarNoticias();
            alert("✅ Noticia/Evento publicado con éxito.");
        } catch (error) {
            alert("⚠️ Error al publicar la noticia: " + error.message);
        }
    };
});

window.renderizarNoticias = async function () {
    if (usuarioRolActual !== 'superadmin') return;
    const tabla = document.getElementById('cuerpoTablaNoticias');

    try {
        const querySnapshot = await getDocs(collection(db, "noticias"));
        tabla.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const n = docSnap.data();
            tabla.innerHTML += `
                <tr>
                    <td><strong>${n.titulo}</strong></td>
                    <td>${n.descripcion}</td>
                    <td>${n.enlace ? `<a href="${n.enlace}" target="_blank">Ver enlace</a>` : 'Sin enlace'}</td>
                    <td class="col-accion" style="text-align:center;">
                        <button class="btn-del" onclick="eliminarNoticia('${docSnap.id}')">🗑️</button>
                    </td>
                </tr>
            `;
        });

        if (querySnapshot.empty) {
            tabla.innerHTML = "<tr><td colspan='4' style='text-align:center;'>No hay noticias publicadas.</td></tr>";
        }
    } catch (error) {
        console.error("Error al cargar noticias:", error);
    }
};

window.eliminarNoticia = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Estás seguro de eliminar esta noticia?")) {
        try {
            await deleteDoc(doc(db, "noticias", idDoc));
            renderizarNoticias();
            alert("🗑️ Noticia eliminada.");
        } catch (error) {
            alert("⚠️ Error al eliminar: " + error.message);
        }
    }
};

// --- GESTIÓN DE USUARIOS ---
document.getElementById('formUsuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (usuarioRolActual !== "superadmin") return;

    const editId = document.getElementById('usrDocId').value;
    const nombre = document.getElementById('usrNombre').value.trim();
    const correo = document.getElementById('usrCorreo').value.trim();
    const clave = document.getElementById('usrClave').value.trim();
    const rol = document.getElementById('usrRol').value;

    try {
        if (editId) {
            await updateDoc(doc(db, "usuarios", editId), { nombre, correo, clave, rol });
            alert("✅ Credenciales actualizadas exitosamente.");
        } else {
            const userCred = await createUserWithEmailAndPassword(auth, correo, clave);
            await setDoc(doc(db, "usuarios", userCred.user.uid), {
                nombre, correo, clave, rol, primerIngreso: true
            });
            alert("✅ Usuario registrado exitosamente.");
        }

        cancelarEdicionUsuario();
        renderizarUsuarios();
    } catch (error) {
        alert("⚠️ Error con el usuario: " + error.message);
    }
});

window.renderizarUsuarios = async function () {
    if (usuarioRolActual !== 'superadmin') return;
    const tabla = document.getElementById('cuerpoTablaUsuarios');
    
    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        usuariosCache = [];
        tabla.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const u = { id: docSnap.id, ...docSnap.data() };
            usuariosCache.push(u);

            tabla.innerHTML += `
                <tr>
                    <td><strong>${u.nombre || 'Sin nombre'}</strong></td>
                    <td>${u.correo || u.email || ''}</td>
                    <td><span style="text-transform:uppercase; font-weight:bold; color:var(--verde-principal);">${u.rol || 'docente'}</span></td>
                    <td class="col-accion">
                        <button class="btn-edit" onclick="cargarEdicionUsuario('${u.id}')">✏️ Editar</button>
                        <button class="btn-del" onclick="eliminarUsuario('${u.id}')">🗑️</button>
                    </td>
                </tr>
            `;
        });

        if (usuariosCache.length === 0) {
            tabla.innerHTML = "<tr><td colspan='4' style='text-align:center;'>No hay usuarios registrados.</td></tr>";
        }
    } catch (error) {
        console.error("Error al obtener usuarios:", error);
    }
};

window.cargarEdicionUsuario = function (id) {
    const u = usuariosCache.find(user => user.id === id);
    if (!u) return;

    document.getElementById('usrDocId').value = u.id;
    document.getElementById('usrNombre').value = u.nombre || '';
    document.getElementById('usrCorreo').value = u.correo || u.email || '';
    document.getElementById('usrClave').value = u.clave || '';
    document.getElementById('usrRol').value = u.rol || 'docente';

    document.getElementById('tituloFormUsuario').innerText = "✏️ Actualizar Credenciales de Usuario";
    document.getElementById('btnSubmitUsr').innerText = "💾 Guardar Cambios";
    document.getElementById('btnCancelarEditUsr').style.display = "inline-block";
};

document.getElementById('btnCancelarEditUsr')?.addEventListener('click', () => {
    cancelarEdicionUsuario();
});

function cancelarEdicionUsuario() {
    document.getElementById('formUsuario').reset();
    document.getElementById('usrDocId').value = "";
    document.getElementById('tituloFormUsuario').innerText = "Registrar Nuevo Usuario del Sistema";
    document.getElementById('btnSubmitUsr').innerText = "＋ Crear Usuario";
    document.getElementById('btnCancelarEditUsr').style.display = "none";
}

window.eliminarUsuario = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Estás seguro de eliminar este usuario?")) {
        try {
            await deleteDoc(doc(db, "usuarios", idDoc));
            renderizarUsuarios();
            alert("🗑️ Usuario eliminado.");
        } catch (error) {
            alert("⚠️ Error al eliminar usuario: " + error.message);
        }
    }
};

// --- BUZÓN ---
window.cargarMensajes = async function () {
    if (usuarioRolActual !== 'superadmin') return;
    try {
        const querySnapshot = await getDocs(collection(db, "mensajes"));
        const tabla = document.getElementById('cuerpoTablaBuzon');
        tabla.innerHTML = "";

        let contador = 0;
        querySnapshot.forEach((docSnap) => {
            contador++;
            const m = docSnap.data();
            tabla.innerHTML += `
                <tr>
                    <td>${m.nombre || ''}</td>
                    <td>${m.correo || ''}</td>
                    <td>${m.contenido || ''}</td>
                    <td class="col-accion" style="text-align:center;">
                        <button class="btn-del" onclick="eliminarMensaje('${docSnap.id}')">🗑️</button>
                    </td>
                </tr>
            `;
        });

        document.getElementById('contadorMensajes').innerText = contador;
        if (contador === 0) {
            tabla.innerHTML = "<tr><td colspan='4' style='text-align:center;'>No hay mensajes registrados.</td></tr>";
        }
    } catch (error) {
        console.error("Error al cargar mensajes:", error);
    }
};

window.eliminarMensaje = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Eliminar este mensaje permanentemente?")) {
        try {
            await deleteDoc(doc(db, "mensajes", idDoc));
            cargarMensajes();
        } catch (error) {
            alert("⚠️ Error al eliminar: " + error.message);
        }
    }
};

// --- DIRECTORIO DE DOCENTES ---
document.getElementById('formDocente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (usuarioRolActual !== 'superadmin') return;

    const nuevoDocente = {
        nombre: document.getElementById('docNombre').value.trim(),
        documento: document.getElementById('docDocumento').value.trim(),
        telefono: document.getElementById('docTelefono').value.trim(),
        direccion: document.getElementById('docDireccion').value + ", Suaza, Huila"
    };

    try {
        await addDoc(collection(db, "docentes"), nuevoDocente);
        document.getElementById('formDocente').reset();
        renderizarDocentes();
        alert("✅ Docente guardado correctamente.");
    } catch (error) {
        alert("⚠️ Error al guardar: " + error.message);
    }
});

window.eliminarDocente = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Deseas eliminar este docente?")) {
        try {
            await deleteDoc(doc(db, "docentes", idDoc));
            renderizarDocentes();
        } catch (error) {
            alert("⚠️ Error al eliminar: " + error.message);
        }
    }
};

window.renderizarDocentes = async function () {
    const tabla = document.getElementById('cuerpoTablaDocentes');
    const selectPago = document.getElementById('pagoSelectDocente');

    try {
        const querySnapshot = await getDocs(collection(db, "docentes"));
        docentesCache = [];
        tabla.innerHTML = "";
        if (selectPago) selectPago.innerHTML = '<option value="">-- Seleccionar Docente --</option>';

        querySnapshot.forEach((docSnap) => {
            const d = { id: docSnap.id, ...docSnap.data() };
            docentesCache.push(d);

            const btnEliminar = usuarioRolActual === 'superadmin' ? `<button class="btn-del" onclick="eliminarDocente('${d.id}')">🗑️</button>` : '';

            tabla.innerHTML += `
                <tr>
                    <td>${d.documento}</td>
                    <td><strong>${d.nombre}</strong></td>
                    <td>${d.telefono}</td>
                    <td>${d.direccion}</td>
                    <td class="col-accion">${btnEliminar}</td>
                </tr>
            `;
            if (selectPago) selectPago.innerHTML += `<option value="${d.documento}">${d.nombre} (${d.documento})</option>`;
        });

        document.getElementById('contadorDocentes').innerText = docentesCache.length;
        if (docentesCache.length === 0) {
            tabla.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No hay docentes registrados.</td></tr>";
        }
    } catch (error) {
        console.error("Error docentes:", error);
    }
};

// --- CONTABILIDAD ---
document.getElementById('pagoSelectDocente')?.addEventListener('change', (e) => {
    document.getElementById('pagoDocumento').value = e.target.value;
    actualizarPrevisualizacion();
});

document.querySelectorAll('.chk-mes').forEach(chk => {
    chk.addEventListener('change', actualizarPrevisualizacion);
});

document.getElementById('pagoValorRecibido')?.addEventListener('input', calcularCambio);

function actualizarPrevisualizacion() {
    const docId = document.getElementById('pagoDocumento').value;
    const docenteInfo = docentesCache.find(d => d.documento === docId);

    document.getElementById('prevDocente').innerHTML = docenteInfo
        ? `Docente: <strong>${docenteInfo.nombre}</strong> | ID: ${docenteInfo.documento}`
        : "Docente: No seleccionado";

    const checkboxes = document.querySelectorAll('.chk-mes:checked');
    const tbody = document.getElementById('cuerpoPrevisTabla');
    tbody.innerHTML = "";

    let totalCalculado = 0;

    if (checkboxes.length === 0) {
        tbody.innerHTML = "<tr><td colspan='2' style='text-align:center;'>Ningún mes seleccionado</td></tr>";
    } else {
        checkboxes.forEach(chk => {
            totalCalculado += VALOR_CUOTA_FIJA;
            tbody.innerHTML += `
                <tr>
                    <td>Cuota ${chk.value}</td>
                    <td>$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>
                </tr>
            `;
        });
    }

    document.getElementById('lblTotalCalculado').innerText = totalCalculado.toLocaleString('es-CO');
    calcularCambio();
}

function calcularCambio() {
    const checkboxes = document.querySelectorAll('.chk-mes:checked');
    const totalSumaMeses = checkboxes.length * VALOR_CUOTA_FIJA;
    const recibido = parseFloat(document.getElementById('pagoValorRecibido').value) || 0;
    const cambio = recibido - totalSumaMeses;

    if (recibido === 0) {
        document.getElementById('pagoCambio').value = "$0";
    } else if (cambio < 0) {
        document.getElementById('pagoCambio').value = "Faltante: $" + Math.abs(cambio).toLocaleString('es-CO');
    } else {
        document.getElementById('pagoCambio').value = "$" + cambio.toLocaleString('es-CO') + " cop.";
    }
}

document.getElementById('formPago')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (usuarioRolActual !== 'superadmin') return;

    const docId = document.getElementById('pagoDocumento').value;
    const docenteInfo = docentesCache.find(d => d.documento === docId);

    if (!docenteInfo) {
        alert("⚠️ Selecciona un docente válido.");
        return;
    }

    const checkboxes = document.querySelectorAll('.chk-mes:checked');
    if (checkboxes.length === 0) {
        alert("⚠️ Selecciona al menos un mes.");
        return;
    }

    const mesesSeleccionados = Array.from(checkboxes).map(c => c.value);
    const totalSumaMeses = mesesSeleccionados.length * VALOR_CUOTA_FIJA;
    const valorRecibido = parseFloat(document.getElementById('pagoValorRecibido').value) || 0;

    if (valorRecibido < totalSumaMeses) {
        alert("⚠️ El valor recibido es menor al total a pagar.");
        return;
    }

    const cambioCalculado = valorRecibido - totalSumaMeses;
    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + " " +
        ahora.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

    const numTicket = pagosCache.length > 0 ? (Math.max(...pagosCache.map(p => p.numTicket || 50)) + 1) : 57;

    const nuevoPago = {
        idFecha: Date.now(),
        numTicket: numTicket,
        fecha: fechaStr,
        docente: docenteInfo.nombre,
        documento: docenteInfo.documento,
        telefono: docenteInfo.telefono,
        direccion: docenteInfo.direccion,
        meses: mesesSeleccionados,
        totalPagar: totalSumaMeses,
        totalPagado: valorRecibido,
        cambio: cambioCalculado
    };

    try {
        const docRef = await addDoc(collection(db, "pagos"), nuevoPago);
        nuevoPago.id = docRef.id;

        document.getElementById('formPago').reset();
        document.querySelectorAll('.chk-mes').forEach(c => c.checked = false);
        actualizarPrevisualizacion();
        await renderizarPagos();
        descargarTicketPDF(nuevoPago.id);
    } catch (error) {
        alert("⚠️ Error al registrar pago: " + error.message);
    }
});

window.eliminarPago = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Deseas eliminar este pago?")) {
        try {
            await deleteDoc(doc(db, "pagos", idDoc));
            renderizarPagos();
        } catch (error) {
            alert("⚠️ Error al eliminar: " + error.message);
        }
    }
};

window.renderizarPagos = async function () {
    const tabla = document.getElementById('cuerpoTablaPagos');
    let totalGeneral = 0;

    try {
        const querySnapshot = await getDocs(collection(db, "pagos"));
        pagosCache = [];
        tabla.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const p = { id: docSnap.id, ...docSnap.data() };
            pagosCache.push(p);

            totalGeneral += p.totalPagar || 0;
            const textoMeses = p.meses ? p.meses.join(', ') : p.mes;
            const btnDel = usuarioRolActual === 'superadmin' ? `<button class="btn-del" onclick="eliminarPago('${p.id}')">🗑️</button>` : '';

            tabla.innerHTML += `
                <tr>
                    <td><strong>#${p.numTicket}</strong></td>
                    <td>${p.fecha}</td>
                    <td>${p.docente}</td>
                    <td>Cuota(s): ${textoMeses}</td>
                    <td>$${(p.totalPagar || 0).toLocaleString('es-CO')}</td>
                    <td>
                        <button class="btn-pdf" onclick="descargarTicketPDF('${p.id}')">🎟️ Imprimir Ticket</button>
                    </td>
                    <td class="col-accion" style="text-align:center;">${btnDel}</td>
                </tr>
            `;
        });

        document.getElementById('totalRecaudado').innerText = "$" + totalGeneral.toLocaleString('es-CO');
        if (pagosCache.length === 0) {
            tabla.innerHTML = "<tr><td colspan='7' style='text-align:center;'>No hay pagos registrados.</td></tr>";
        }
    } catch (error) {
        console.error("Error historial pagos:", error);
    }
};

// --- MATRIZ ANUAL ---
window.renderizarMatrizPagos = async function () {
    const tbody = document.getElementById('cuerpoTablaMatriz');
    tbody.innerHTML = "<tr><td colspan='17' style='text-align:center;'>Cargando matriz...</td></tr>";

    try {
        await renderizarDocentes();
        await renderizarPagos();
        tbody.innerHTML = "";

        if (docentesCache.length === 0) {
            tbody.innerHTML = "<tr><td colspan='17' style='text-align:center;'>No hay docentes registrados.</td></tr>";
            return;
        }

        docentesCache.forEach(docente => {
            const pagosDocente = pagosCache.filter(p => p.documento === docente.documento);
            let mesesPagados = [];
            pagosDocente.forEach(p => {
                if (p.meses && Array.isArray(p.meses)) mesesPagados.push(...p.meses);
                else if (p.mes) mesesPagados.push(p.mes);
            });

            let totalPagadoDocente = 0;
            let celdasMesesHTML = "";

            MESES_ANIO.forEach(mesNombre => {
                const estaPagado = mesesPagados.some(m => m.toLowerCase().includes(mesNombre.toLowerCase()));
                if (estaPagado) {
                    totalPagadoDocente += VALOR_CUOTA_FIJA;
                    celdasMesesHTML += `<td class="celda-pagado">$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>`;
                } else {
                    celdasMesesHTML += `<td class="celda-pendiente">-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-</td>`;
                }
            });

            const totalAnualObligatorio = VALOR_CUOTA_FIJA * 12;
            const saldoPendiente = totalAnualObligatorio - totalPagadoDocente;
            const estadoTexto = saldoPendiente === 0 ? "AL DÍA" : "SALDO PENDIENTE";
            const claseEstado = saldoPendiente === 0 ? "estado-al-dia" : "estado-pendiente";

            tbody.innerHTML += `
                <tr>
                    <td>${docente.documento}</td>
                    <td><strong>${docente.nombre}</strong></td>
                    ${celdasMesesHTML}
                    <td style="font-weight:bold; text-align:center;">$${totalPagadoDocente.toLocaleString('es-CO')}</td>
                    <td class="${claseEstado}">${estadoTexto}</td>
                    <td style="font-weight:bold; text-align:center; color:#c0392b;">$${saldoPendiente.toLocaleString('es-CO')}</td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error matriz:", error);
    }
};

// --- PDF Y IMPRESIÓN ---
window.descargarMatrizPDF = function () {
    try {
        const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
        if (!jsPDFClass) return;

        const doc = new jsPDFClass({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        doc.autoTable({
            html: '#tablaMatrizPDF',
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 7, halign: 'center' },
            headStyles: { fillColor: [26, 92, 46], textColor: [255, 255, 255] }
        });
        doc.save('Matriz_Anual_Pagos_IEAH_2026.pdf');
    } catch (error) {
        alert("⚠️ Error generando PDF: " + error.message);
    }
};

window.descargarTicketPDF = function (id) {
    const pago = pagosCache.find(p => p.id === id);
    if (!pago) return;

    const contenedor = document.getElementById('contenedorPDF');
    let filasMesesHTML = "";
    if (pago.meses && Array.isArray(pago.meses)) {
        pago.meses.forEach(m => {
            filasMesesHTML += `
                <tr>
                    <td style="width: 35%; text-align: left;">${m}</td>
                    <td style="width: 15%; text-align: center;">1</td>
                    <td style="width: 25%; text-align: center;">$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>
                    <td style="width: 25%; text-align: center;">$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>
                </tr>
            `;
        });
    }

    contenedor.innerHTML = `
        <div class="ticket-exacto" id="elementoAImprimir">
            <div class="ticket-encabezado">
                <h3>INSTITUCION EDUCATIVA ALTO<br>HORIZONTE 2026</h3>
                <div>Vereda Alto Horizonte</div>
            </div>
            <div class="ticket-linea"></div>
            <div class="ticket-datos">
                <div>Fecha: ${pago.fecha}</div>
                <div style="font-weight: bold;">TICKET NRO: ${pago.numTicket}</div>
                <div>Cliente: ${pago.docente}</div>
            </div>
            <div class="ticket-linea"></div>
            <table class="ticket-tabla">
                <tbody>${filasMesesHTML}</tbody>
            </table>
            <div class="ticket-linea"></div>
            <table class="ticket-totales">
                <tr>
                    <td style="text-align: left;">TOTAL PAGADO</td>
                    <td style="text-align: right;">$${pago.totalPagar.toLocaleString('es-CO')} cop.</td>
                </tr>
            </table>
        </div>
    `;

    contenedor.style.visibility = "visible";
    const opt = {
        margin: [0, 0, 0, 0],
        filename: `TICKET_${pago.numTicket}.pdf`,
        html2canvas: { scale: 4 },
        jsPDF: { unit: 'mm', format: [58, 120], orientation: 'portrait' }
    };

    html2pdf().set(opt).from(document.getElementById('elementoAImprimir')).save().then(() => {
        contenedor.style.visibility = "hidden";
    });
};