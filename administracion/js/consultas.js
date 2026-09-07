import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// CREDENCIALES DE FIREBASE
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

// EVALUAR ROL DEL USUARIO PARA CONFIGURAR BOTÓN
onAuthStateChanged(auth, async (user) => {
    const contenedorBtn = document.getElementById('contenedorBtnVolver');

    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                const rol = (userDoc.data().rol || "docente").toLowerCase().trim();

                if (rol === "docente") {
                    // Si es docente, lo envía directamente al index.html
                    contenedorBtn.innerHTML = `
                        <a href="panel.html" class="btn-volver">⬅️ Volver al panel</a>
                    `;
                } else {
                    // Si es superadmin o bienestar, mantiene la opción de volver al panel.html
                    contenedorBtn.innerHTML = `
                        <a href="panel.html" class="btn-volver">⬅️ Volver al Panel</a>
                    `;
                }
            }
        } catch (error) {
            console.error("Error al verificar rol del usuario:", error);
        }
    } else {
        // Si no hay sesión iniciada, redirecciona a inicio por defecto
        contenedorBtn.innerHTML = `
            <a href="../index.html" class="btn-volver">🏠 Volver al Inicio</a>
        `;
    }
});

const VALOR_CUOTA_FIJA = 35000;
let resultadosCache = [];

// BUSQUEDA DIRECTA EN FIRESTORE (ÚNICAMENTE POR NÚMERO DE IDENTIFICACIÓN EXACTO)
async function buscarPagos(e) {
    e.preventDefault();

    const criterio = document.getElementById('inputBuscar').value.trim();
    const tabla = document.getElementById('cuerpoTablaConsulta');

    if (!criterio) return;

    tabla.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Buscando registros en Firebase...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "pagos"));
        const pagos = [];

        querySnapshot.forEach((doc) => {
            pagos.push({ id: doc.id, ...doc.data() });
        });

        // Filtrar ÚNICAMENTE por coincidencia exacta del número de documento/identificación
        resultadosCache = pagos.filter(p => 
            p.documento && String(p.documento).trim() === criterio
        );

        tabla.innerHTML = "";

        if (resultadosCache.length === 0) {
            tabla.innerHTML = "<tr><td colspan='6' style='text-align:center;'>No se encontraron pagos asociados al número de identificación ingresado.</td></tr>";
            return;
        }

        resultadosCache.forEach(p => {
            const textoMeses = p.meses ? (Array.isArray(p.meses) ? p.meses.join(', ') : p.meses) : (p.mes || 'N/A');
            const numTicketMostrar = p.numTicket || p.ticket || 'N/A';
            
            tabla.innerHTML += `
                <tr>
                    <td><strong>#${numTicketMostrar}</strong></td>
                    <td>${p.fecha || 'N/A'}</td>
                    <td>${p.docente || 'N/A'}</td>
                    <td>${textoMeses}</td>
                    <td>$${p.totalPagar ? Number(p.totalPagar).toLocaleString('es-CO') : '0'}</td>
                    <td>
                        <button class="btn-pdf" data-id="${p.id}">🎟️ Descargar Ticket</button>
                    </td>
                </tr>
            `;
        });

        // Asignar eventos a los botones generados
        document.querySelectorAll('.btn-pdf').forEach(boton => {
            boton.addEventListener('click', (evt) => {
                const idDoc = evt.target.getAttribute('data-id');
                descargarTicketPDF(idDoc);
            });
        });

    } catch (error) {
        console.error("Error al consultar pagos en Firebase:", error);
        tabla.innerHTML = "<tr><td colspan='6' style='text-align:center; color:red;'>Error al conectar con la base de datos de Firebase.</td></tr>";
    }
}

// DESCARGA DE REPORTE INDIVIDUAL EN PDF
async function descargarTicketPDF(id) {
    const pago = resultadosCache.find(p => p.id === id);
    if (!pago) {
        alert("⚠️ No se encontró la información del pago.");
        return;
    }

    try {
        let jsPDFClass;
        if (window.jspdf && window.jspdf.jsPDF) {
            jsPDFClass = window.jspdf.jsPDF;
        } else if (window.jsPDF) {
            jsPDFClass = window.jsPDF;
        }

        if (!jsPDFClass) {
            alert("⚠️ No se encontraron las librerías de PDF.");
            return;
        }

        // 1. Obtener historial acumulado del docente
        let mesesPagadosLista = [];
        resultadosCache.forEach(p => {
            if (String(p.documento) === String(pago.documento)) {
                if (p.meses && Array.isArray(p.meses)) {
                    mesesPagadosLista.push(...p.meses);
                } else if (p.meses) {
                    mesesPagadosLista.push(p.meses);
                } else if (p.mes) {
                    mesesPagadosLista.push(p.mes);
                }
            }
        });

        const MESES_ANIO = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];

        const ahora = new Date();
        const fechaHoraFormateada = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

        const mesActualIndice = ahora.getMonth();
        const ultimoMesExigibleIndice = mesActualIndice - 1;

        let mesesTranscurridosAPagados = 0;
        if (ultimoMesExigibleIndice >= 0) {
            for (let i = 0; i <= ultimoMesExigibleIndice; i++) {
                const nombreMes = MESES_ANIO[i];
                const pagado = mesesPagadosLista.some(m => String(m).toLowerCase().includes(nombreMes.toLowerCase()));
                if (pagado) {
                    mesesTranscurridosAPagados++;
                }
            }
        }

        const mesesExigiblesTotales = Math.max(0, mesActualIndice); 
        const mesesPendientesALaFecha = Math.max(0, mesesExigiblesTotales - mesesTranscurridosAPagados);
        const estadoTexto = mesesPendientesALaFecha === 0 ? "AL DÍA" : "PENDIENTE";

        const cantMesesPagadosTotal = mesesPagadosLista.length;
        const totalPagadoDocente = cantMesesPagadosTotal * VALOR_CUOTA_FIJA;
        const saldoPendienteAnual = (12 * VALOR_CUOTA_FIJA) - totalPagadoDocente;

        const doc = new jsPDFClass({
            orientation: 'landscape',
            unit: 'pt',
            format: 'a4'
        });

        let celdasMeses = [];
        MESES_ANIO.forEach(mesNombre => {
            const estaPagado = mesesPagadosLista.some(m => String(m).toLowerCase().includes(mesNombre.toLowerCase()));
            if (estaPagado) {
                celdasMeses.push(`$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}`);
            } else {
                celdasMeses.push(`-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-`);
            }
        });

        const generarDocumento = () => {
            doc.setFontSize(13);
            doc.setFont(undefined, 'bold');
            doc.text("INSTITUCION EDUCATIVA ALTO HORIZONTE", 90, 35);
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.text("GRUPO BIENESTAR 2026 - Reporte Individual de Aportes", 90, 48);

            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text(`FECHA / HORA: ${fechaHoraFormateada}`, 40, 75);
            doc.text(`IDENTIFICACIÓN: ${pago.documento}`, 260, 75);
            doc.text(`DOCENTE: ${(pago.docente || '').toUpperCase()}`, 450, 75);

            doc.setFont(undefined, 'normal');
            doc.text(`Meses Pagados Totales: ${cantMesesPagadosTotal}`, 40, 92);
            doc.text(`Meses Pendientes a la Fecha: ${mesesPendientesALaFecha}`, 260, 92);
            doc.text(`Estado General: ${estadoTexto}`, 450, 92);

            doc.autoTable({
                head: [
                    ['Identificación', 'Nombre', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Total Pagado', 'Estado', 'Saldo Pendiente']
                ],
                body: [
                    [
                        pago.documento,
                        pago.docente,
                        ...celdasMeses,
                        `$${totalPagadoDocente.toLocaleString('es-CO')}`,
                        estadoTexto,
                        `$${saldoPendienteAnual.toLocaleString('es-CO')}`
                    ]
                ],
                startY: 110,
                theme: 'grid',
                styles: { fontSize: 7, halign: 'center', valign: 'middle' },
                headStyles: { fillColor: [26, 92, 46], textColor: [255, 255, 255], fontStyle: 'bold' },
                didParseCell: function (data) {
                    if (data.section === 'body' && data.column.index >= 2 && data.column.index <= 13) {
                        const mesColIndice = data.column.index - 2;
                        const mesNombre = MESES_ANIO[mesColIndice];
                        const estaPagado = mesesPagadosLista.some(m => String(m).toLowerCase().includes(mesNombre.toLowerCase()));

                        if (estaPagado) {
                            data.cell.styles.fillColor = [39, 174, 96];
                            data.cell.styles.textColor = [255, 255, 255];
                        } else if (mesColIndice <= ultimoMesExigibleIndice) {
                            data.cell.styles.fillColor = [231, 76, 60];
                            data.cell.styles.textColor = [255, 255, 255];
                        } else {
                            data.cell.styles.fillColor = [230, 126, 34];
                            data.cell.styles.textColor = [255, 255, 255];
                        }
                    }
                }
            });

            const centroX = 421;
            const finalY = doc.lastAutoTable.finalY + 30;

            doc.setFontSize(8);
            doc.setFont(undefined, 'italic');
            doc.text("*** Estimad@ profesor@ - Administrativ@ - rector@", centroX, finalY, { align: 'center' });
            doc.text("con su aporte contribuye al bienestar de todo el talento humano de nuestra institucion ***", centroX, finalY + 12, { align: 'center' });

            doc.setFont(undefined, 'bold');
            doc.text("¡GRACIAS POR SU APORTE!", centroX, finalY + 28, { align: 'center' });

            doc.setFont(undefined, 'normal');
            doc.text("© Cemled corp 2026", centroX, finalY + 54, { align: 'center' });

            doc.save(`Reporte_Individual_${pago.documento}_${(pago.docente || '').replace(/\s+/g, '_')}.pdf`);
        };

        const imgLogo = new Image();
        imgLogo.src = '../img/escudo.png';

        imgLogo.onload = function () {
            doc.addImage(imgLogo, 'PNG', 40, 20, 40, 40);
            generarDocumento();
        };

        imgLogo.onerror = function () {
            generarDocumento();
        };

    } catch (error) {
        console.error("Error al generar reporte PDF:", error);
        alert("⚠️ Ocurrió un error al generar el PDF: " + error.message);
    }
}

// EVENTOS DOM
document.getElementById('formBusqueda').addEventListener('submit', buscarPagos);