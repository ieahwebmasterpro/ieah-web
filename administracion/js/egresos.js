import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Variables globales para el PDF y permisos
let globalIngresos = 0;
let globalEgresos = 0;
let globalSaldo = 0;
let listaEgresos = [];
let usuarioRolActual = "";

// Verificación de Autenticación y Rol
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const userDoc = await getDoc(doc(doc(db, "usuarios", user.uid)));
        if (userDoc.exists()) {
            usuarioRolActual = (userDoc.data().rol || "docente").toLowerCase().trim();
        } else {
            usuarioRolActual = "docente";
        }
    } catch (error) {
        console.error("Error obteniendo rol:", error);
        usuarioRolActual = "docente";
    }

    aplicarPermisos();
    cargarBalanceYEgresos();
});

function aplicarPermisos() {
    const formBox = document.getElementById('contenedorFormEgreso');
    if (usuarioRolActual !== 'superadmin') {
        if (formBox) formBox.style.setProperty('display', 'none', 'important');
        document.querySelectorAll('.col-accion').forEach(el => el.style.setProperty('display', 'none', 'important'));
    } else {
        if (formBox) formBox.style.display = 'block';
        document.querySelectorAll('.col-accion').forEach(el => el.style.display = 'table-cell');
    }
}

// Establecer fecha actual por defecto en el formulario
document.getElementById('fechaEgreso').value = new Date().toISOString().split('T')[0];

// Función Principal: Cargar Ingresos, Egresos y Calcular Saldo
async function cargarBalanceYEgresos() {
    const tabla = document.getElementById('cuerpoTablaEgresos');
    globalIngresos = 0;
    globalEgresos = 0;
    listaEgresos = [];

    try {
        // 1. Obtener TOTAL de Ingresos desde "pagos"
        const snapshotPagos = await getDocs(collection(db, "pagos"));
        snapshotPagos.forEach(docSnap => {
            const data = docSnap.data();
            globalIngresos += Number(data.totalPagar || 0);
        });

        // 2. Obtener la lista de EGRESOS desde "egresos"
        const q = query(collection(db, "egresos"), orderBy("fecha", "desc"));
        const snapshotEgresos = await getDocs(q);
        
        tabla.innerHTML = "";

        if (snapshotEgresos.empty) {
            tabla.innerHTML = "<tr><td colspan='4' style='text-align:center;'>No hay egresos registrados.</td></tr>";
        } else {
            snapshotEgresos.forEach(docSnap => {
                const egreso = docSnap.data();
                const valor = Number(egreso.valor || 0);
                globalEgresos += valor;

                listaEgresos.push({
                    id: docSnap.id,
                    fecha: egreso.fecha,
                    concepto: egreso.concepto,
                    valor: valor
                });

                const btnEliminar = usuarioRolActual === 'superadmin' 
                    ? `<button class="btn-eliminar" data-id="${docSnap.id}">🗑️ Eliminar</button>` 
                    : '';

                tabla.innerHTML += `
                    <tr>
                        <td>${egreso.fecha}</td>
                        <td>${egreso.concepto}</td>
                        <td style="color: var(--rojo-egreso); font-weight: bold;">-$ ${valor.toLocaleString('es-CO')}</td>
                        <td class="col-accion">${btnEliminar}</td>
                    </tr>
                `;
            });
        }

        // 3. Actualizar Valores y Saldo
        globalSaldo = globalIngresos - globalEgresos;

        document.getElementById('lblIngresos').innerText = `$ ${globalIngresos.toLocaleString('es-CO')}`;
        document.getElementById('lblEgresos').innerText = `$ ${globalEgresos.toLocaleString('es-CO')}`;
        document.getElementById('lblSaldo').innerText = `$ ${globalSaldo.toLocaleString('es-CO')}`;

        // Re-aplicar ocultamiento según rol
        aplicarPermisos();

        // Eventos de eliminación solo para superadmin
        if (usuarioRolActual === 'superadmin') {
            document.querySelectorAll('.btn-eliminar').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    if (confirm("¿Está seguro de eliminar este registro de egreso?")) {
                        await deleteDoc(doc(db, "egresos", id));
                        cargarBalanceYEgresos();
                    }
                });
            });
        }

    } catch (error) {
        console.error("Error al calcular el balance:", error);
        tabla.innerHTML = "<tr><td colspan='4' style='text-align:center; color:red;'>Error al cargar los datos contables.</td></tr>";
    }
}

// Registrar un nuevo egreso (solo superadmin)
document.getElementById('formEgreso').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (usuarioRolActual !== 'superadmin') return;

    const fecha = document.getElementById('fechaEgreso').value;
    const concepto = document.getElementById('conceptoEgreso').value.trim();
    const valor = parseFloat(document.getElementById('valorEgreso').value);

    if (!fecha || !concepto || isNaN(valor) || valor <= 0) {
        alert("Por favor ingrese todos los campos con valores válidos.");
        return;
    }

    try {
        await addDoc(collection(db, "egresos"), {
            fecha: fecha,
            concepto: concepto,
            valor: valor,
            creado: new Date()
        });

        document.getElementById('conceptoEgreso').value = "";
        document.getElementById('valorEgreso').value = "";
        
        cargarBalanceYEgresos();
    } catch (error) {
        console.error("Error al guardar el egreso:", error);
        alert("Ocurrió un error al registrar el egreso.");
    }
});

// GENERACIÓN DEL REPORTE PDF DE BALANCE Y EGRESOS
function generarReportePDF() {
    try {
        let jsPDFClass = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
        if (!jsPDFClass) {
            alert("⚠️ No se encontró la librería jsPDF.");
            return;
        }

        const doc = new jsPDFClass({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4'
        });

        const ahora = new Date();
        const fechaHoraFormateada = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

        const generarContenido = () => {
            // Encabezado principal
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(26, 92, 46);
            doc.text("INSTITUCIÓN EDUCATIVA ALTO HORIZONTE", 90, 40);

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(50, 50, 50);
            doc.text("GRUPO BIENESTAR 2026 - REPORTE GENERAL DE MOVIMIENTOS", 90, 55);

            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text(`FECHA Y HORA DE EMISIÓN: ${fechaHoraFormateada}`, 40, 80);

            // Línea separadora
            doc.setDrawColor(200, 200, 200);
            doc.line(40, 88, 555, 88);

            // Cajas de Resumen Financiero
            doc.setFillColor(39, 174, 96);
            doc.roundedRect(40, 100, 160, 45, 4, 4, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text("TOTAL INGRESOS", 120, 115, { align: 'center' });
            doc.setFontSize(11);
            doc.text(`$ ${globalIngresos.toLocaleString('es-CO')}`, 120, 133, { align: 'center' });

            doc.setFillColor(192, 57, 43);
            doc.roundedRect(217, 100, 160, 45, 4, 4, 'F');
            doc.setFontSize(8);
            doc.text("TOTAL EGRESOS", 297, 115, { align: 'center' });
            doc.setFontSize(11);
            doc.text(`-$ ${globalEgresos.toLocaleString('es-CO')}-`, 297, 133, { align: 'center' });

            doc.setFillColor(41, 128, 185);
            doc.roundedRect(395, 100, 160, 45, 4, 4, 'F');
            doc.setFontSize(8);
            doc.text("SALDO ACTUAL", 475, 115, { align: 'center' });
            doc.setFontSize(11);
            doc.text(`$ ${globalSaldo.toLocaleString('es-CO')}`, 475, 133, { align: 'center' });

            // Configurar datos de la tabla
            const filasTabla = listaEgresos.map(item => [
                item.fecha,
                item.concepto,
                `-$ ${item.valor.toLocaleString('es-CO')}-`
            ]);

            doc.autoTable({
                head: [['FECHA', 'CONCEPTO DE EGRESO', 'VALOR']],
                body: filasTabla,
                startY: 160,
                theme: 'striped',
                headStyles: { fillColor: [26, 92, 46], textColor: [255, 255, 255], fontStyle: 'bold' },
                styles: { fontSize: 8, valign: 'middle' },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 90 },
                    1: { halign: 'left' },
                    2: { halign: 'right', fontStyle: 'bold', textColor: [192, 57, 43], cellWidth: 110 }
                }
            });

            // Pie de página
            const finalY = doc.lastAutoTable.finalY + 30;
            const centroX = 297;

            doc.setFontSize(8);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text("*** Reporte oficial de movimientos contables y disponibilidad de fondos ***", centroX, finalY, { align: 'center' });

            doc.setFont(undefined, 'bold');
            doc.setTextColor(26, 92, 46);
            doc.text("GRUPO BIENESTAR IEAH 2026", centroX, finalY + 15, { align: 'center' });

            doc.setFont(undefined, 'normal');
            doc.setTextColor(120, 120, 120);
            doc.text("© Cemled corp 2026", centroX, finalY + 35, { align: 'center' });

            doc.save(`Reporte_Egresos_IEAH_${ahora.toISOString().split('T')[0]}.pdf`);
        };

        // Cargar escudo de la institución
        const imgLogo = new Image();
        imgLogo.src = '../img/escudo.png';

        imgLogo.onload = function () {
            doc.addImage(imgLogo, 'PNG', 40, 25, 40, 40);
            generarContenido();
        };

        imgLogo.onerror = function () {
            generarContenido();
        };

    } catch (error) {
        console.error("Error generando PDF de egresos:", error);
        alert("⚠️ Ocurrió un error al generar el PDF del reporte.");
    }
}

// Asignar evento al botón de PDF
document.getElementById('btnDescargarPDF').addEventListener('click', generarReportePDF);