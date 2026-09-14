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
    doc,
    runTransaction
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
let egresosCache = [];
let usuariosCache = [];
let usuarioRolActual = "";
let usuarioDocenteActual = null;

function obtenerPrimerNombre(nombreCompleto) {
    if (!nombreCompleto) return 'Profe';
    const primerNombre = nombreCompleto.trim().split(' ')[0];
    return primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1).toLowerCase();
}

// ----------------------------------------------------
// CÁLCULO GENERAL DE BALANCE (INGRESOS, EGRESOS Y SALDO ACTUAL)
// ----------------------------------------------------
async function actualizarResumenFinanciero() {
    try {
        // Consultar pagos si no están cacheados
        if (pagosCache.length === 0) {
            const queryPagos = await getDocs(collection(db, "pagos"));
            pagosCache = [];
            queryPagos.forEach(d => pagosCache.push({ id: d.id, ...d.data() }));
        }

        // Consultar egresos si no están cacheados
        if (egresosCache.length === 0) {
            const queryEgresos = await getDocs(collection(db, "egresos"));
            egresosCache = [];
            queryEgresos.forEach(d => egresosCache.push({ id: d.id, ...d.data() }));
        }

        // 1. Total Ingresos = Suma de lo recaudado en cuotas de docentes
        const totalIngresos = pagosCache.reduce((sum, p) => sum + (Number(p.totalPagar) || 0), 0);
        
        // 2. Total Egresos = Suma de los gastos registrados
        const totalEgresos = egresosCache.reduce((sum, e) => sum + (Number(e.valor) || 0), 0);
        
        // 3. Saldo Actual = Ingresos menos Egresos
        const saldoActual = totalIngresos - totalEgresos;

        // Búsqueda de elementos HTML con compatibilidad para distintos IDs
        const lblIngresos = document.getElementById('totalIngresos') || document.getElementById('totalRecaudado');
        const lblEgresos = document.getElementById('totalEgresos');
        const lblSaldo = document.getElementById('saldoActual') || document.getElementById('totalSaldo');

        // Renderizado en la interfaz con formato de moneda colombiana
        if (lblIngresos) lblIngresos.innerText = `$${totalIngresos.toLocaleString('es-CO')}`;
        if (lblEgresos) lblEgresos.innerText = `$${totalEgresos.toLocaleString('es-CO')}`;
        if (lblSaldo) lblSaldo.innerText = `$${saldoActual.toLocaleString('es-CO')}`;

        // Renderizado exclusivo en la sección de egresos
        const eIngresos = document.getElementById('egresosTotalIngresos');
        const eEgresos = document.getElementById('egresosTotalEgresos');
        const eSaldo = document.getElementById('egresosSaldoActual');
        if (eIngresos) eIngresos.innerText = `$${totalIngresos.toLocaleString('es-CO')}`;
        if (eEgresos) eEgresos.innerText = `$${totalEgresos.toLocaleString('es-CO')}`;
        if (eSaldo) eSaldo.innerText = `$${saldoActual.toLocaleString('es-CO')}`;
    } catch (error) {
        console.error("Error al actualizar el resumen financiero:", error);
    }
}

// HTML con las convenciones de colores para reportes y matrices
const CONVENCIONES_HTML = `
    <div style="display: flex; gap: 15px; margin-bottom: 12px; flex-wrap: wrap; font-size: 11px; font-weight: bold; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; color: #1a202c;">
        <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 14px; height: 14px; background-color: #2e7d32; display: inline-block; border-radius: 3px;"></span> Meses Pagados
        </span>
        <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 14px; height: 14px; background-color: #d32f2f; display: inline-block; border-radius: 3px;"></span> Meses que debe a la Fecha
        </span>
        <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 14px; height: 14px; background-color: #ef6c00; display: inline-block; border-radius: 3px;"></span> Meses que aún faltan por pagar / Saldo Año
        </span>
    </div>
`;

// ----------------------------------------------------
// NAVEGACIÓN Y SECCIONES
// ----------------------------------------------------
window.mostrarSeccion = async function (seccion, elemento) {
    // 1. Ocultar únicamente las secciones de contenido dinámico
    const secciones = document.querySelectorAll('.seccion-modulo');
    secciones.forEach(s => {
        s.style.display = 'none';
        s.classList.remove('activa');
    });

    // 2. Mapear la sección a mostrar
    const mapaSecciones = {
        'docentes': 'sec-docentes',
        'pagos': 'sec-contabilidad',
        'contabilidad': 'sec-contabilidad',
        'egresos': 'sec-egresos',
        'usuarios': 'sec-usuarios',
        'mensajes': 'sec-mensajes',
        'buzon': 'sec-mensajes',
        'matriz': 'sec-matriz',
        'inicio': usuarioRolActual === 'bienestar' ? 'sec-bienestar-bienvenida' : 'sec-superadmin-bienvenida'
    };

    const targetId = mapaSecciones[seccion] || `sec-${seccion}`;
    const targetEl = document.getElementById(targetId);

    // 3. Mostrar la sección seleccionada sin afectar la botonera superior
    if (targetEl) {
        targetEl.style.display = 'block';
        targetEl.classList.add('activa');
    }

    // 4. Renderizado asíncrono seguro
    setTimeout(async () => {
        try {
            if (seccion === 'docentes' && typeof renderizarDocentes === 'function') await renderizarDocentes();
            if ((seccion === 'pagos' || seccion === 'contabilidad') && typeof renderizarPagos === 'function') await renderizarPagos();
            if (seccion === 'egresos' && typeof renderizarEgresos === 'function') await renderizarEgresos();
            if (seccion === 'usuarios' && typeof renderizarUsuarios === 'function') await renderizarUsuarios();
            if ((seccion === 'mensajes' || seccion === 'buzon') && typeof cargarMensajes === 'function') await cargarMensajes();
        } catch (e) {
            console.error("Error al cargar la vista:", e);
        }
    }, 0);
};

window.consultarReporteIndividualDocente = async function () {
    await window.renderizarPagosDocente();
    window.mostrarSeccion('mis-comprobantes', null);

    const docID = String(usuarioDocenteActual?.documento || usuarioDocenteActual?.cedula || "").trim();
    const nomDoc = String(usuarioDocenteActual?.nombre || "").toLowerCase().trim();

    const pagosDoc = pagosCache.filter(p => {
        const pDoc = String(p.documento || "").trim();
        const pNom = String(p.docente || "").toLowerCase().trim();
        return (docID !== "" && pDoc === docID) || (nomDoc !== "" && (pNom.includes(nomDoc) || nomDoc.includes(pNom)));
    });

    let mesesPagados = [];
    pagosDoc.forEach(p => {
        if (p.meses && Array.isArray(p.meses)) mesesPagados.push(...p.meses);
        else if (p.mes) mesesPagados.push(p.mes);
    });

    const mesActualIndex = new Date().getMonth();
    let totalPagado = 0;
    let mesesPendientesFecha = 0;
    let mesesFaltantesAnio = 0;
    let celdasMesesHTML = "";

    MESES_ANIO.forEach((mesNombre, index) => {
        const pagado = mesesPagados.some(m => String(m).toLowerCase().includes(mesNombre.toLowerCase()));
        if (pagado) {
            totalPagado += VALOR_CUOTA_FIJA;
            celdasMesesHTML += `<td class="celda-pagado" style="background-color: #2e7d32 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>`;
        } else if (index <= mesActualIndex) {
            mesesPendientesFecha++;
            celdasMesesHTML += `<td class="celda-pendiente" style="background-color: #d32f2f !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-</td>`;
        } else {
            mesesFaltantesAnio++;
            celdasMesesHTML += `<td class="celda-futuro" style="background-color: #ef6c00 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-</td>`;
        }
    });

    const saldoPendienteFecha = mesesPendientesFecha * VALOR_CUOTA_FIJA;
    const saldoPendienteAnio = (mesesPendientesFecha + mesesFaltantesAnio) * VALOR_CUOTA_FIJA;
    const estadoGeneral = mesesPendientesFecha === 0 ? "AL DIA" : "PENDIENTE";

    const bgEstado = estadoGeneral === 'AL DIA' ? '#2e7d32' : '#d32f2f';
    const bgSaldoFecha = saldoPendienteFecha === 0 ? '#2e7d32' : '#d32f2f';

    const boxReporte = document.getElementById('contenedorReporteDocenteUI');
    const btnPDF = document.getElementById('btnDescargarReporteDocente');

    if (boxReporte) {
        boxReporte.style.display = 'block';
        boxReporte.innerHTML = `
            <div style="border-bottom: 2px solid #1b5e20; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                <h4 style="margin: 0; color: #1b5e20; font-size: 16px;">📊 Reporte General Individual de Aportes - 2026</h4>
            </div>
            ${CONVENCIONES_HTML}
            <div class="tabla-matriz-contenedor" style="overflow-x: auto;">
                <table class="tabla-matriz" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #1b5e20 !important; color: #ffffff !important;">
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Identificación</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Nombre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Enero</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Febrero</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Marzo</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Abril</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Mayo</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Junio</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Julio</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Agosto</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Septiembre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Octubre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Noviembre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Diciembre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Total Pagado</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Estado</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente a la Fecha</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente en el Año</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="color: #1a202c; font-weight: normal; text-align: center; border: 0.1px solid #e5e7eb;">${usuarioDocenteActual?.documento || 'Sin dato'}</td>
                            <td style="color: #1a202c; font-weight: normal; border: 0.1px solid #e5e7eb;">${usuarioDocenteActual?.nombre || 'Docente'}</td>
                            ${celdasMesesHTML}
                            <td style="font-weight: normal; text-align: center; color: #1a202c; border: 0.1px solid #e5e7eb;">$${totalPagado.toLocaleString('es-CO')}</td>
                            <td style="font-weight: bold; text-align: center; background-color: ${bgEstado} !important; color: #ffffff !important; border: 0.1px solid #ffffff;">${estadoGeneral}</td>
                            <td style="font-weight: bold; text-align: center; background-color: ${bgSaldoFecha} !important; color: #ffffff !important; border: 0.1px solid #ffffff;">$${saldoPendienteFecha.toLocaleString('es-CO')}</td>
                            <td style="font-weight: bold; text-align: center; background-color: #ef6c00 !important; color: #ffffff !important; border: 0.1px solid #ffffff;">$${saldoPendienteAnio.toLocaleString('es-CO')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    if (btnPDF) btnPDF.style.display = 'inline-block';
};

window.descargarReporteIndividualDocentePDF = async function () {
    let contenedor = document.getElementById('contenedorReporteIndividualPDF');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedorReporteIndividualPDF';
        document.body.appendChild(contenedor);
    }

    const docID = String(usuarioDocenteActual?.documento || usuarioDocenteActual?.cedula || "").trim();
    const nomDoc = String(usuarioDocenteActual?.nombre || "").toLowerCase().trim();

    const pagosDoc = pagosCache.filter(p => {
        const pDoc = String(p.documento || "").trim();
        const pNom = String(p.docente || "").toLowerCase().trim();
        return (docID !== "" && pDoc === docID) || (nomDoc !== "" && (pNom.includes(nomDoc) || nomDoc.includes(pNom)));
    });

    let mesesPagados = [];
    pagosDoc.forEach(p => {
        if (p.meses && Array.isArray(p.meses)) mesesPagados.push(...p.meses);
        else if (p.mes) mesesPagados.push(p.mes);
    });

    const mesActualIndex = new Date().getMonth();
    let totalPagado = 0;
    let mesesPendientesFecha = 0;
    let mesesFaltantesAnio = 0;
    let celdasMesesHTML = "";

    MESES_ANIO.forEach((mesNombre, index) => {
        const pagado = mesesPagados.some(m => String(m).toLowerCase().includes(mesNombre.toLowerCase()));
        if (pagado) {
            totalPagado += VALOR_CUOTA_FIJA;
            celdasMesesHTML += `<td class="celda-pagado" style="background-color: #2e7d32 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>`;
        } else if (index <= mesActualIndex) {
            mesesPendientesFecha++;
            celdasMesesHTML += `<td class="celda-pendiente" style="background-color: #d32f2f !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-</td>`;
        } else {
            mesesFaltantesAnio++;
            celdasMesesHTML += `<td class="celda-futuro" style="background-color: #ef6c00 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-</td>`;
        }
    });

    const saldoPendienteFecha = mesesPendientesFecha * VALOR_CUOTA_FIJA;
    const saldoPendienteAnio = (mesesPendientesFecha + mesesFaltantesAnio) * VALOR_CUOTA_FIJA;
    const estadoGeneral = mesesPendientesFecha === 0 ? "AL DIA" : "PENDIENTE";

    const bgEstado = estadoGeneral === 'AL DIA' ? '#2e7d32' : '#d32f2f';
    const bgSaldoFecha = saldoPendienteFecha === 0 ? '#2e7d32' : '#d32f2f';

    const ahora = new Date();
    const fechaHoraStr = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO')}`;

    contenedor.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; background: #ffffff !important; z-index: 99999; display: block; padding: 10px;";

    contenedor.innerHTML = `
        <div id="elementoReporteIndividualAImprimir" style="width: 100%; background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 8.5px !important; box-sizing: border-box; padding-bottom: 60px;">
            
            <div style="text-align: center; font-size: 11px !important; background: transparent !important; margin-bottom: 6px;">
                <img src="../img/logo.png" alt="Escudo Institucional" style="width: 58px; height: auto; margin-bottom: 2px; display: block; margin-left: auto; margin-right: auto;" />
                <span style="font-weight: bold; font-size: 15px !important; color: #2e7d32 !important;">INSTITUCION EDUCATIVA ALTO HORIZONTE</span><br>
                <span style="font-weight: bold; font-size: 11px !important; color: #000000 !important;">REPORTE INDIVIDUAL DE APORTES - 2026</span><br>
                <span style="color: #6b7280 !important; font-size: 9.5px !important;">FECHA / HORA GENERACION: ${fechaHoraStr}</span>
            </div>

            <div style="border-bottom: 0.5px solid #d1d5db; margin: 4px 0 10px 0;"></div>

            ${CONVENCIONES_HTML}

            <style>
                #elementoReporteIndividualAImprimir table { width: 100%; border-collapse: collapse; font-size: 8px; color: #000000 !important; }
                #elementoReporteIndividualAImprimir th { background-color: #1b5e20 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #d1d5db !important; padding: 4px 2px; }
                #elementoReporteIndividualAImprimir td { border: 0.1px solid #e5e7eb !important; padding: 2.5px 2px; text-align: center; }
                
                #elementoReporteIndividualAImprimir .col-identificacion, 
                #elementoReporteIndividualAImprimir .col-nombre { color: #000000 !important; font-weight: normal !important; }
                #elementoReporteIndividualAImprimir .col-total { color: #000000 !important; font-weight: normal !important; }

                #elementoReporteIndividualAImprimir .celda-pagado { background-color: #2e7d32 !important; color: #ffffff !important; font-weight: bold; border: 0.1px solid #ffffff !important; }
                #elementoReporteIndividualAImprimir .celda-pendiente { background-color: #d32f2f !important; color: #ffffff !important; font-weight: bold; border: 0.1px solid #ffffff !important; }
                #elementoReporteIndividualAImprimir .celda-futuro { background-color: #ef6c00 !important; color: #ffffff !important; font-weight: bold; border: 0.1px solid #ffffff !important; }
            </style>

            <div style="margin-bottom: 10px;">
                <table>
                    <thead>
                        <tr style="background-color: #1b5e20 !important; color: #ffffff !important;">
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Identificación</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Nombre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Enero</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Febrero</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Marzo</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Abril</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Mayo</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Junio</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Julio</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Agosto</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Septiembre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Octubre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Noviembre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Diciembre</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Total Pagado</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Estado</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente a la Fecha</th>
                            <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente en el Año</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="col-identificacion" style="color: #000000; font-weight: normal; text-align: center; border: 0.1px solid #e5e7eb;">${usuarioDocenteActual?.documento || 'Sin dato'}</td>
                            <td class="col-nombre" style="color: #000000; font-weight: normal; border: 0.1px solid #e5e7eb;">${usuarioDocenteActual?.nombre || 'Docente'}</td>
                            ${celdasMesesHTML}
                            <td class="col-total" style="font-weight: normal; text-align: center; color: #000000; border: 0.1px solid #e5e7eb;">$${totalPagado.toLocaleString('es-CO')}</td>
                            <td style="font-weight: bold; text-align: center; background-color: ${bgEstado} !important; color: #ffffff !important; border: 0.1px solid #ffffff;">${estadoGeneral}</td>
                            <td style="font-weight: bold; text-align: center; background-color: ${bgSaldoFecha} !important; color: #ffffff !important; border: 0.1px solid #ffffff;">$${saldoPendienteFecha.toLocaleString('es-CO')}</td>
                            <td style="font-weight: bold; text-align: center; background-color: #ef6c00 !important; color: #ffffff !important; border: 0.1px solid #ffffff;">$${saldoPendienteAnio.toLocaleString('es-CO')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style="text-align: center; font-size: 10px !important; line-height: 1.5; font-weight: normal; margin-top: 25px; padding: 15px 10px 30px 10px; color: #212121 !important; page-break-inside: avoid; display: block; clear: both; width: 100%;">
                Estimad@ profesor@ - Administrativ@ - rector@<br>
                con su aporte contribuye al bienestar de todo el talento humano de nuestra institución.<br>
                <strong style="font-size: 11px; color: #000000; letter-spacing: 0.5px;">¡GRACIAS POR SU APORTE!</strong><br>
                <span style="font-weight: bold; margin-top: 6px; display: inline-block; color: #1b5e20; font-size: 10.5px;">Cemled corp 2026</span>
            </div>
        </div>
    `;

    setTimeout(() => {
        const elemento = document.getElementById('elementoReporteIndividualAImprimir');
        if (typeof html2pdf === "undefined") {
            alert("La librería html2pdf no está cargada.");
            return;
        }

        const opt = {
            margin: [5, 5, 15, 5],
            filename: `REPORTE_INDIVIDUAL_${usuarioDocenteActual?.documento || 'DOCENTE'}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: { scale: 2, logging: false, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(elemento).save().then(() => {
            contenedor.innerHTML = "";
        }).catch(err => {
            console.error("Error generando PDF individual:", err);
            contenedor.innerHTML = "";
        });
    }, 400);
};

// ----------------------------------------------------
// AUTENTICACIÓN Y ROLES
// ----------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        
        // --- CAMBIO AQUÍ: Validación de usuario eliminado o inexistente ---
        const data = userDoc.exists() ? userDoc.data() : null;
        const estaEliminado = !userDoc.exists() || 
                              data.isDeleted === true || 
                              data.eliminado === true || 
                              data.activo === false || 
                              data.estado === "inactivo";

        if (estaEliminado) {
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }
        // -----------------------------------------------------------------

        usuarioRolActual = (data.rol || "docente").toLowerCase().trim();
        usuarioDocenteActual = { uid: user.uid, email: user.email, ...data };

        const docentesSnap = await getDocs(collection(db, "docentes"));
        docentesCache = [];
        docentesSnap.forEach(d => docentesCache.push({ id: d.id, ...d.data() }));

        const docenteMatch = docentesCache.find(d => 
            String(d.correo || '').toLowerCase().trim() === user.email.toLowerCase().trim() ||
            String(d.documento || '').trim() === String(usuarioDocenteActual.documento || '').trim() ||
            String(d.nombre || '').toLowerCase().trim() === String(usuarioDocenteActual.nombre || '').toLowerCase().trim()
        );

        if (docenteMatch) {
            usuarioDocenteActual.documento = docenteMatch.documento;
            if (!usuarioDocenteActual.nombre) usuarioDocenteActual.nombre = docenteMatch.nombre;
        }

        const lblNombre = document.getElementById('lblUsuarioNombre');
        if (lblNombre) lblNombre.innerText = usuarioDocenteActual.nombre || user.email;
        
        const lblRol = document.getElementById('lblUsuarioRol');
        if (lblRol) lblRol.innerText = usuarioRolActual;

        const primerNombre = obtenerPrimerNombre(usuarioDocenteActual.nombre);
        const lblBienvenida = document.getElementById('mensajeBienvenidaDocente');
        if (lblBienvenida) {
            lblBienvenida.innerText = `👋 Hola profe ${primerNombre}, Bienvenid@ a la Plataforma Institucional`;
        }

        await aplicarPermisosRol(usuarioRolActual);
    } catch (error) {
        console.error("Error al obtener autenticación:", error);
        await aplicarPermisosRol("docente");
    }
});

async function aplicarPermisosRol(rol) {
    const rolLimpio = String(rol).toLowerCase().trim();

    const formDocenteBox = document.getElementById('contenedorFormDocente');
    const formPagoBox = document.getElementById('contenedorFormPago');
    const formEgresoBox = document.getElementById('contenedorFormEgreso');
    const formNoticiaBox = document.getElementById('contenedorFormNoticia');
    const formUsuarioBox = document.getElementById('contenedorFormUsuario');

    const menuAdmin = document.getElementById('menuAdministrativo');
    const gridStats = document.getElementById('tarjetasEstadisticas');
    
    // Referencia a la botonera global de administración
    const botoneraGlobal = document.querySelector('.dash-botonera-global');

    // Contenedores de Bienvenida según el Rol
    const secBienvenidaDocente = document.getElementById('sec-docente-bienvenida');
    const secBienvenidaBienestar = document.getElementById('sec-bienestar-bienvenida');
    const secBienvenidaSuperadmin = document.getElementById('sec-superadmin-bienvenida');

    const btnInicioPanel = document.getElementById('inicio-panel');
    
    // Control de visibilidad para elementos exclusivos de docente (.solo-docente)
    if (rolLimpio === "bienestar" || rolLimpio === "superadmin") {
        document.querySelectorAll('.solo-docente').forEach(el => el.style.setProperty('display', 'none', 'important'));
    } else {
        document.querySelectorAll('.solo-docente').forEach(el => {
            if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                el.style.setProperty('display', 'inline-flex', 'important');
            } else {
                el.style.setProperty('display', 'block', 'important');
            }
        });
    }

    // Visibilidad del botón inicio-panel (solo visible para docente)
    if (btnInicioPanel) {
        if (rolLimpio === 'docente') {
            btnInicioPanel.style.setProperty('display', 'inline-block', 'important');
        } else {
            btnInicioPanel.style.setProperty('display', 'none', 'important');
        }
    }

    // Ocultamos primero todas las secciones de bienvenida para evitar solapamientos
    if (secBienvenidaDocente) {
        secBienvenidaDocente.style.setProperty('display', 'none', 'important');
        secBienvenidaDocente.classList.remove('activa');
    }
    if (secBienvenidaBienestar) {
        secBienvenidaBienestar.style.setProperty('display', 'none', 'important');
        secBienvenidaBienestar.classList.remove('activa');
    }
    if (secBienvenidaSuperadmin) {
        secBienvenidaSuperadmin.style.setProperty('display', 'none', 'important');
        secBienvenidaSuperadmin.classList.remove('activa');
    }

    if (rolLimpio === "docente") {
        // OCULTAR BOTONERA GLOBAL EN DOCENTE
        if (botoneraGlobal) botoneraGlobal.style.setProperty('display', 'none', 'important');
        if (gridStats) gridStats.style.setProperty('display', 'none', 'important');

        if (secBienvenidaDocente) {
            secBienvenidaDocente.style.setProperty('display', 'block', 'important');
            secBienvenidaDocente.classList.add('activa');
        }

        if (menuAdmin) menuAdmin.style.display = "block";

        document.getElementById('tituloVista').innerText = "Panel del Docente";

        document.querySelectorAll('.ver-bienestar').forEach(el => el.style.setProperty('display', 'none', 'important'));
        document.querySelectorAll('.solo-superadmin').forEach(el => el.style.setProperty('display', 'none', 'important'));
        document.querySelectorAll('.col-accion').forEach(el => el.style.setProperty('display', 'none', 'important'));

        if (formNoticiaBox) formNoticiaBox.style.cssText = "display: block !important;";

        await window.renderizarNoticias();

    } else if (rolLimpio === "bienestar") {
        // MOSTRAR BOTONERA GLOBAL EN BIENESTAR
        if (botoneraGlobal) botoneraGlobal.style.setProperty('display', 'flex', 'important');
        if (gridStats) gridStats.style.display = "grid";

        if (secBienvenidaBienestar) {
            secBienvenidaBienestar.style.setProperty('display', 'block', 'important');
            secBienvenidaBienestar.classList.add('activa');
        }

        if (menuAdmin) menuAdmin.style.display = "block";

        document.getElementById('tituloVista').innerText = "Panel de Gestión - Bienestar";

        document.querySelectorAll('.ver-bienestar').forEach(el => el.style.setProperty('display', 'block', 'important'));
        document.querySelectorAll('.solo-superadmin').forEach(el => el.style.setProperty('display', 'none', 'important'));

        if (formDocenteBox) formDocenteBox.style.setProperty('display', 'none', 'important');
        if (formPagoBox) formPagoBox.style.setProperty('display', 'none', 'important');
        if (formEgresoBox) formEgresoBox.style.setProperty('display', 'none', 'important');
        if (formNoticiaBox) formNoticiaBox.style.setProperty('display', 'none', 'important');
        if (formUsuarioBox) formUsuarioBox.style.setProperty('display', 'none', 'important');

        document.querySelectorAll('.col-accion').forEach(el => el.style.setProperty('display', 'none', 'important'));

        await window.renderizarDocentes();
        await window.renderizarPagos();
        await window.renderizarEgresos();
        await window.renderizarUsuarios();

    } else {
        // MOSTRAR BOTONERA GLOBAL EN SUPERADMIN
        if (botoneraGlobal) botoneraGlobal.style.setProperty('display', 'flex', 'important');
        if (menuAdmin) menuAdmin.style.display = "block";
        if (gridStats) gridStats.style.display = "grid";

        if (secBienvenidaSuperadmin) {
            secBienvenidaSuperadmin.style.setProperty('display', 'block', 'important');
            secBienvenidaSuperadmin.classList.add('activa');
        }

        document.getElementById('tituloVista').innerText = "Panel de Administración General";

        document.querySelectorAll('.ver-bienestar').forEach(el => el.style.setProperty('display', 'block', 'important'));
        document.querySelectorAll('.solo-superadmin').forEach(el => el.style.setProperty('display', 'block', 'important'));

        if (formDocenteBox) formDocenteBox.style.cssText = "display: block !important;";
        if (formPagoBox) formPagoBox.style.cssText = "display: block !important;";
        if (formEgresoBox) formEgresoBox.style.cssText = "display: block !important;";
        if (formUsuarioBox) formUsuarioBox.style.cssText = "display: block !important;";
        if (formNoticiaBox) formNoticiaBox.style.setProperty('display', 'none', 'important');

        document.querySelectorAll('.col-accion').forEach(el => el.style.setProperty('display', 'table-cell', 'important'));

        await window.cargarMensajes();
        await window.renderizarDocentes();
        await window.renderizarPagos();
        await window.renderizarEgresos();
        await window.renderizarUsuarios();
    }
}

document.getElementById('btnCerrarSesion')?.addEventListener('click', () => {
    signOut(auth).then(() => { window.location.href = "login.html"; });
});

document.addEventListener('click', (e) => {
    const target = e.target.closest('button, a, [onclick]');
    if (!target) return;

    const texto = target.innerText ? target.innerText.toLowerCase() : '';
    const id = target.id ? target.id.toLowerCase() : '';

    if (id.includes('reporte') || texto.includes('consultar reporte') || target.classList.contains('btn-reporte-docente')) {
        window.consultarReporteIndividualDocente();
    } else if ((id.includes('noticia') || id.includes('btnnoticias')) && !id.includes('form') || texto.includes('ver noticias') || texto.includes('noticias y eventos')) {
        window.mostrarSeccion('noticias', target);
    } else if (id.includes('inicio') || texto.includes('inicio')) {
        window.mostrarSeccion('docente-bienvenida', target);
    }
});

// ----------------------------------------------------
// COMPROBANTES DE PAGOS DEL DOCENTE
// ----------------------------------------------------
window.renderizarPagosDocente = async function () {
    const tabla = document.getElementById('cuerpoTablaPagosDocente') || document.getElementById('cuerpoTablaPagos');
    if (!tabla) return;

    tabla.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Cargando comprobantes...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "pagos"));
        pagosCache = [];

        let docID = String(usuarioDocenteActual?.documento || usuarioDocenteActual?.cedula || "").trim();
        let nomDoc = String(usuarioDocenteActual?.nombre || "").toLowerCase().trim();

        querySnapshot.forEach(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
            const pDoc = String(p.documento || "").trim();
            const pNom = String(p.docente || "").toLowerCase().trim();

            const coincideDocumento = docID !== "" && pDoc === docID;
            const coincideNombre = nomDoc !== "" && (pNom.includes(nomDoc) || nomDoc.includes(pNom));

            if (usuarioRolActual === 'superadmin' || usuarioRolActual === 'bienestar' || coincideDocumento || coincideNombre) {
                pagosCache.push(p);
            }
        });

        pagosCache.sort((a, b) => (b.numTicket || b.idFecha || 0) - (a.numTicket || a.idFecha || 0));

        tabla.innerHTML = "";

        if (pagosCache.length === 0) {
            tabla.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No se encontraron comprobantes de pago registrados.</td></tr>";
            return;
        }

        pagosCache.forEach(p => {
            const textoMeses = p.meses ? p.meses.join(', ') : p.mes;
            tabla.innerHTML += `
                <tr>
                    <td><strong>#${p.numTicket || ''}</strong></td>
                    <td>${p.fecha || ''}</td>
                    <td>Cuota(s): ${textoMeses || ''}</td>
                    <td>$${(p.totalPagar || 0).toLocaleString('es-CO')}</td>
                    <td style="text-align:center;">
                        <button class="btn-pdf" type="button" onclick="window.descargarTicketPDF('${p.id}')">Descargar Ticket</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error comprobantes:", error);
        tabla.innerHTML = "<tr><td colspan='5' style='text-align:center; color:red;'>Error al cargar comprobantes.</td></tr>";
    }
};

// ----------------------------------------------------
// GESTIÓN DE NOTICIAS
// ----------------------------------------------------
document.getElementById('formNoticia')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (usuarioRolActual !== 'docente') {
        alert("Solo los usuarios con rol Docente tienen permisos para publicar noticias.");
        return;
    }

    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const archivoImagen = document.getElementById('noticiaImagenFile')?.files[0];

    const titulo = document.getElementById('noticiaTitulo').value.trim();
    const descripcion = document.getElementById('noticiaDescripcion').value.trim();
    const contenidoCompleto = document.getElementById('noticiaContenidoCompleto')?.value.trim() || descripcion;
    const enlace = document.getElementById('noticiaEnlace')?.value.trim() || "";

    try {
        if (btnSubmit) btnSubmit.disabled = true;

        let imagenDataUrl = "";
        if (archivoImagen) {
            imagenDataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(archivoImagen);
            });
        }

        const nuevaNoticia = {
            titulo: titulo,
            descripcion: descripcion,
            contenidoCompleto: contenidoCompleto,
            imagen: imagenDataUrl || "",
            rutaLocal: archivoImagen ? "img/" + archivoImagen.name : "",
            enlace: enlace,
            fechaCreacion: Date.now()
        };

        await addDoc(collection(db, "noticias"), nuevaNoticia);
        document.getElementById('formNoticia').reset();
        await window.renderizarNoticias();
        alert("¡Noticia o evento publicado exitosamente!");

    } catch (error) {
        alert("Error al publicar la noticia: " + error.message);
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
    }
});

window.renderizarNoticias = async function () {
    const tabla = document.getElementById('cuerpoTablaNoticias');
    if (!tabla) return;

    try {
        const querySnapshot = await getDocs(collection(db, "noticias"));
        tabla.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const n = docSnap.data();
            const tr = document.createElement("tr");

            const btnAccion = (usuarioRolActual === 'superadmin')
                ? `<button class="btn-del btn-eliminar-noticia" onclick="window.eliminarNoticia('${docSnap.id}')">Eliminar</button>`
                : '<span style="color:#a0aec0;">Lectura</span>';

            tr.innerHTML = `
                <td><strong>${n.titulo}</strong></td>
                <td>${n.descripcion}</td>
                <td>${n.enlace ? `<a href="${n.enlace}" target="_blank">Ver enlace</a>` : 'Sin enlace'}</td>
                <td class="col-accion" style="text-align:center;">${btnAccion}</td>
            `;
            tabla.appendChild(tr);
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
            await window.renderizarNoticias();
            alert("Noticia eliminada.");
        } catch (error) {
            alert("Error al eliminar: " + error.message);
        }
    }
};

// ----------------------------------------------------
// GESTIÓN DE EGRESOS
// ----------------------------------------------------
document.getElementById('formEgreso')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (usuarioRolActual !== 'superadmin') return;

    const inputConcepto = document.getElementById('egresoConcepto') || document.getElementById('conceptoEgreso');
    const inputValor = document.getElementById('egresoValor') || document.getElementById('valorEgreso');
    const inputFecha = document.getElementById('egresoFecha') || document.getElementById('fechaEgreso');

    const concepto = inputConcepto ? inputConcepto.value.trim() : "";
    const valor = Number(inputValor ? inputValor.value : 0);
    const fecha = inputFecha && inputFecha.value ? inputFecha.value : new Date().toLocaleDateString('es-CO');

    if (!concepto || valor <= 0 || isNaN(valor)) {
        alert("Por favor ingrese un concepto y un valor válido para el egreso.");
        return;
    }

    try {
        await addDoc(collection(db, "egresos"), {
            concepto,
            valor,
            fecha,
            fechaCreacion: Date.now()
        });
        document.getElementById('formEgreso').reset();
        await window.renderizarEgresos();
        alert("Egreso registrado correctamente.");
    } catch (error) {
        alert("Error al registrar egreso: " + error.message);
    }
});

window.renderizarEgresos = async function () {
    const tabla = document.getElementById('cuerpoTablaEgresos');
    if (!tabla) return;

    try {
        const querySnapshot = await getDocs(collection(db, "egresos"));
        egresosCache = [];
        tabla.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const eg = { id: docSnap.id, ...docSnap.data() };
            egresosCache.push(eg);
        });

        egresosCache.sort((a, b) => (b.fechaCreacion || 0) - (a.fechaCreacion || 0));

        await actualizarResumenFinanciero();

        if (egresosCache.length === 0) {
            tabla.innerHTML = "<tr><td colspan='4' style='text-align:center; color:#a0aec0;'>No hay egresos registrados.</td></tr>";
            return;
        }

        let htmlFilas = "";
        egresosCache.forEach(eg => {
            const btnAccion = (usuarioRolActual === 'superadmin')
                ? `<button class="btn-del" onclick="window.eliminarEgreso('${eg.id}')">Eliminar</button>`
                : '<span style="color:#a0aec0;">Lectura</span>';

            htmlFilas += `
                <tr>
                    <td>${eg.fecha || ''}</td>
                    <td><strong>${eg.concepto || ''}</strong></td>
                    <td>$${(Number(eg.valor) || 0).toLocaleString('es-CO')}</td>
                    <td class="col-accion" style="text-align:center;">${btnAccion}</td>
                </tr>
            `;
        });

        tabla.innerHTML = htmlFilas;
    } catch (error) {
        console.error("Error al renderizar egresos:", error);
    }
};

window.eliminarEgreso = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Estás seguro de eliminar este egreso?")) {
        try {
            await deleteDoc(doc(db, "egresos", idDoc));
            await window.renderizarEgresos();
            alert("Egreso eliminado con éxito.");
        } catch (error) {
            alert("Error al eliminar egreso: " + error.message);
        }
    }
};

window.descargarEgresosPDF = async function () {
    let contenedor = document.getElementById('contenedorEgresosPDF');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedorEgresosPDF';
        document.body.appendChild(contenedor);
    }

    const totalIngresos = pagosCache.reduce((sum, p) => sum + (Number(p.totalPagar) || 0), 0);
    const totalEgresos = egresosCache.reduce((sum, e) => sum + (Number(e.valor) || 0), 0);
    const saldoActual = totalIngresos - totalEgresos;

    let filasEgresosHTML = "";
    if (egresosCache.length === 0) {
        filasEgresosHTML = `<tr><td colspan="3" style="text-align: center; padding: 10px;">No hay egresos registrados.</td></tr>`;
    } else {
        egresosCache.forEach(e => {
            filasEgresosHTML += `
                <tr>
                    <td style="text-align: center;">${e.fecha || ''}</td>
                    <td style="text-align: left;">${e.concepto || ''}</td>
                    <td style="text-align: right; font-weight: bold;">$${(Number(e.valor) || 0).toLocaleString('es-CO')}</td>
                </tr>
            `;
        });
    }

    const ahora = new Date();
    const fechaHoraStr = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO')}`;

    contenedor.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; background: #ffffff !important; z-index: 99999; display: block; padding: 10px;";

    contenedor.innerHTML = `
        <div id="elementoEgresosAImprimir" style="width: 100%; background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 9px !important; box-sizing: border-box; padding-bottom: 30px;">
            <div style="text-align: center; font-size: 11px !important; background: transparent !important; margin-bottom: 6px;">
                <img src="../img/logo.png" alt="Escudo" style="width: 58px; height: auto; margin-bottom: 2px; display: block; margin-left: auto; margin-right: auto;" />
                <span style="font-weight: bold; font-size: 15px !important; color: #2e7d32 !important;">INSTITUCIÓN EDUCATIVA ALTO HORIZONTE</span><br>
                <span style="font-weight: bold; font-size: 11px !important; color: #000000 !important;">REGISTRO GENERAL DE EGRESOS - BIENESTAR</span><br>
                <span style="color: #6b7280 !important; font-size: 9.5px !important;">FECHA / HORA GENERACIÓN: ${fechaHoraStr}</span>
            </div>

            <div style="border-bottom: 1px solid #d1d5db; margin: 6px 0 12px 0;"></div>

            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <div style="flex: 1; background-color: #2e7d32 !important; color: #ffffff !important; padding: 8px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 9px; font-weight: bold;">TOTAL INGRESOS</div>
                    <div style="font-size: 13px; font-weight: bold;">$${totalIngresos.toLocaleString('es-CO')}</div>
                </div>
                <div style="flex: 1; background-color: #d32f2f !important; color: #ffffff !important; padding: 8px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 9px; font-weight: bold;">TOTAL EGRESOS</div>
                    <div style="font-size: 13px; font-weight: bold;">$${totalEgresos.toLocaleString('es-CO')}</div>
                </div>
                <div style="flex: 1; background-color: #ef6c00 !important; color: #ffffff !important; padding: 8px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 9px; font-weight: bold;">SALDO ACTUAL</div>
                    <div style="font-size: 13px; font-weight: bold;">$${saldoActual.toLocaleString('es-CO')}</div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <thead>
                    <tr>
                        <th style="width: 20%; text-align: center;">Fecha</th>
                        <th style="width: 55%; text-align: center;">Concepto / Descripción</th>
                        <th style="width: 25%; text-align: center;">Valor Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasEgresosHTML}
                </tbody>
            </table>

            <div style="text-align: center; font-size: 10px !important; margin-top: 30px; color: #000000 !important;">
                <strong style="font-size: 11px; color: #000000;">¡GRACIAS POR SU GESTIÓN Y TRANSPARENCIA!</strong><br>
                <span style="font-weight: bold; margin-top: 4px; display: inline-block; color: #1b5e20;">Cemled corp 2026</span>
            </div>
        </div>
    `;

    setTimeout(() => {
        const elemento = document.getElementById('elementoEgresosAImprimir');
        if (typeof html2pdf === "undefined") {
            alert("La librería html2pdf no está cargada.");
            return;
        }

        const opt = {
            margin: [8, 8, 12, 8],
            filename: `REGISTRO_EGRESOS_${new Date().getFullYear()}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: { scale: 2, logging: false, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(elemento).save().then(() => {
            contenedor.innerHTML = "";
        }).catch(err => {
            console.error("Error generando PDF egresos:", err);
            contenedor.innerHTML = "";
        });
    }, 400);
};

// ----------------------------------------------------
// GENERACIÓN OFICIAL DE TICKETS PDF
// ----------------------------------------------------
window.descargarTicketPDF = async function (id) {
    let pago = pagosCache.find(p => p.id === id);
    
    if (!pago) {
        try {
            const docSnap = await getDoc(doc(db, "pagos", id));
            if (docSnap.exists()) {
                pago = { id: docSnap.id, ...docSnap.data() };
            }
        } catch (err) {
            console.error("Error consultando ticket:", err);
        }
    }

    if (!pago) {
        alert("No se encontró el registro del ticket.");
        return;
    }

    let contenedor = document.getElementById('contenedorPDF');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedorPDF';
        document.body.appendChild(contenedor);
    }

    const formatMoneda = (valor) => {
        const num = Math.round(Number(valor) || 0);
        return `$${num.toLocaleString('es-CO')}`;
    };

    let filasMesesHTML = "";
    if (pago.meses && Array.isArray(pago.meses)) {
        pago.meses.forEach(m => {
            filasMesesHTML += `
                <tr style="background: transparent !important; color: #000000 !important;">
                    <td style="text-align: center; vertical-align: top; padding: 4px 0; border: none !important; width: 20%; font-size: 12px !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">1</td>
                    <td style="text-align: center; vertical-align: top; padding: 4px 0; border: none !important; width: 50%; font-size: 12px !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">Cuota ${m}</td>
                    <td style="text-align: center; vertical-align: top; padding: 4px 0; border: none !important; width: 30%; font-size: 12px !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">${formatMoneda(35000)}</td>
                </tr>
            `;
        });
    } else if (pago.mes) {
        filasMesesHTML = `
            <tr style="background: transparent !important; color: #000000 !important;">
                <td style="text-align: center; vertical-align: top; padding: 4px 0; border: none !important; width: 20%; font-size: 12px !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">1</td>
                <td style="text-align: center; vertical-align: top; padding: 4px 0; border: none !important; width: 50%; font-size: 12px !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">Cuota ${pago.mes}</td>
                <td style="text-align: center; vertical-align: top; padding: 4px 0; border: none !important; width: 30%; font-size: 12px !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">${formatMoneda(35000)}</td>
            </tr>
        `;
    }

    const totalPagarFormatted = formatMoneda(pago.totalPagar || 35000);
    const totalPagadoFormatted = formatMoneda(pago.totalPagado || pago.totalPagar || 35000);
    const cambioFormatted = formatMoneda(pago.cambio || 0);
    const codigoAlpha = `Y419J3T0F4-${pago.numTicket || 57}`;

    contenedor.style.cssText = "position: absolute; top: 0; left: 0; width: 78mm; background: #ffffff !important; z-index: 99999; visibility: visible; display: block;";

    contenedor.innerHTML = `
        <div id="elementoAImprimir" style="width: 72mm; padding: 8mm 2mm 4mm 2mm; background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 12px !important; font-weight: normal; line-height: 1.35; box-sizing: border-box; margin: 0 auto;">
            
            <div style="text-align: center; font-size: 12px !important; background: transparent !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; margin-bottom: 4px;">
                <img src="../img/logo.png" alt="Escudo" style="width: 50px; height: auto; margin-bottom: 5px; display: block; margin-left: auto; margin-right: auto;" />
                <span style="font-weight: bold; color: #000000 !important;">INSTITUCION EDUCATIVA ALTO<br>HORIZONTE 2026</span><br>
                <span style="color: #000000 !important;">
                    Vereda Alto Horizonte<br>
                    Teléfono: 3214115248<br>
                    Email: altohorizonte.suaza@sedhuila.gov.co
                </span>
            </div>

            <div style="border-bottom: 1px dashed #000000; margin: 10px 0;"></div>

            <div style="text-align: center; font-size: 12px !important; font-weight: normal; background: transparent !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; padding: 2px 0;">
                Fecha: ${pago.fecha || ''}<br>
                Caja Nro: 1<br>
                Cajero: Bienestar I E Alto Horizonte<br>
                <span style="font-weight: bold; color: #000000 !important;">TICKET NRO: #${pago.numTicket || ''}</span>
            </div>

            <div style="border-bottom: 1px dashed #000000; margin: 10px 0;"></div>

            <div style="text-align: center; font-size: 12px !important; font-weight: normal; background: transparent !important; color: #000000 !important; padding: 2px 0; font-family: Arial, Helvetica, sans-serif !important;">
                Cliente: ${pago.docente || ''}<br>
                Documento: Otro ${pago.documento || ''}<br>
                Teléfono: ${pago.telefono || ''}<br>
                Dirección: ${pago.direccion || ''}
            </div>

            <div style="border-bottom: 1px dashed #000000; margin: 10px 0;"></div>

            <table style="width: 100%; border-collapse: collapse; border: none !important; font-size: 12px !important; font-weight: normal; font-family: Arial, Helvetica, sans-serif !important; background: transparent !important; color: #000000 !important; margin: 4px 0;">
                <thead>
                    <tr style="background: transparent !important; color: #000000 !important; border-bottom: 1px dashed #000000 !important;">
                        <th style="text-align: center; width: 20%; font-weight: normal; padding: 5px 0; background: transparent !important; color: #000000 !important; border: none !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">Cant.</th>
                        <th style="text-align: center; width: 50%; font-weight: normal; padding: 5px 0; background: transparent !important; color: #000000 !important; border: none !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">Precio</th>
                        <th style="text-align: center; width: 30%; font-weight: normal; padding: 5px 0; background: transparent !important; color: #000000 !important; border: none !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasMesesHTML}
                </tbody>
            </table>

            <div style="border-bottom: 1px dashed #000000; margin: 10px 0;"></div>

            <table style="width: 100%; border-collapse: collapse; border: none !important; font-size: 12px !important; font-weight: normal; font-family: Arial, Helvetica, sans-serif !important; background: transparent !important; color: #000000 !important; margin: 4px 0;">
                <tr style="background: transparent !important; color: #000000 !important;">
                    <td style="text-align: left; padding: 3px 0 3px 10px; border: none !important; width: 55%; color: #000000 !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">TOTAL A PAGAR</td>
                    <td style="text-align: right; padding: 3px 10px 3px 0; border: none !important; width: 45%; color: #000000 !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">${totalPagarFormatted}</td>
                </tr>
                <tr style="background: transparent !important; color: #000000 !important;">
                    <td style="text-align: left; padding: 3px 0 3px 10px; border: none !important; color: #000000 !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">TOTAL PAGADO</td>
                    <td style="text-align: right; padding: 3px 10px 3px 0; border: none !important; color: #000000 !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">${totalPagadoFormatted}</td>
                </tr>
                <tr style="background: transparent !important; color: #000000 !important;">
                    <td style="text-align: left; padding: 3px 0 3px 10px; border: none !important; color: #000000 !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">CAMBIO</td>
                    <td style="text-align: right; padding: 3px 10px 3px 0; border: none !important; color: #000000 !important; font-size: 12px !important; font-family: Arial, Helvetica, sans-serif !important;">${cambioFormatted}</td>
                </tr>
            </table>

            <div style="border-bottom: 1px dashed #000000; margin: 10px 0;"></div>

            <div style="text-align: center; font-size: 12px !important; font-weight: normal; line-height: 1.35; margin-top: 14px; background: transparent !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">
                <div style="color: #000000 !important;">*** Para poder realizar un reclamo o devolución debe de presentar este ticket ***</div>
                <div style="margin-top: 10px; color: #000000 !important;">*** Estimad@ profesor@ - Adminstrativ@ Rector@, con su cuota contribuye al bienestar de todo el talento humano de nuestra institución ***</div>
            </div>

            <div style="text-align: center; font-size: 12px !important; font-weight: normal; margin-top: 12px; background: transparent !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">
                ¡GRACIAS POR SU APORTE!
            </div>

            <div style="text-align: center; font-size: 13px !important; font-weight: bold; margin-top: 12px; background: transparent !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;">
                Cemled corp 2026
            </div>

            <div style="text-align: center; margin-top: 12px; background: transparent !important; width: 100%;">
                <div style="display: flex; justify-content: center; align-items: center; width: 100%;">
                    <svg id="barcodeTicket" style="margin: 0 auto; display: block;"></svg>
                </div>
                <div style="font-size: 12px !important; font-weight: normal; margin-top: 4px; color: #000000 !important; text-align: center; font-family: Arial, Helvetica, sans-serif !important;">${codigoAlpha}</div>
            </div>

        </div>
    `;

    try {
        if (typeof JsBarcode !== "undefined") {
            JsBarcode("#barcodeTicket", codigoAlpha, {
                format: "CODE128",
                displayValue: false,
                height: 48,
                width: 1.6,
                margin: 0,
                lineColor: "#000000"
            });
        }
    } catch (e) {
        console.error("Error al generar el código de barras:", e);
    }

    setTimeout(() => {
        const elemento = document.getElementById('elementoAImprimir');
        if (typeof html2pdf === "undefined") {
            alert("La librería html2pdf no está cargada en el sistema.");
            contenedor.style.display = "none";
            return;
        }

        const textoMesesPDF = pago.meses && Array.isArray(pago.meses) ? pago.meses.join(' ') : (pago.mes || '');
        const nombreDocentePDF = pago.docente || 'DOCENTE';

        const opt = {
            margin: [0, 0, 0, 0],
            filename: `ticket pago bienestar ${nombreDocentePDF} ${textoMesesPDF}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: {
                scale: 6,
                logging: false,
                useCORS: true,
                letterRendering: true,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: [78, 260], orientation: 'portrait' }
        };

        html2pdf().set(opt).from(elemento).save().then(() => {
            contenedor.style.display = "none";
            contenedor.style.visibility = "hidden";
        }).catch(err => {
            console.error("Error generando PDF:", err);
            contenedor.style.display = "none";
            contenedor.style.visibility = "hidden";
        });
    }, 400);
};

// ----------------------------------------------------
// RESTO DE MÓDULOS DE ADMINISTRACIÓN
// ----------------------------------------------------
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
            alert("Usuario actualizado.");
        } else {
            const userCred = await createUserWithEmailAndPassword(auth, correo, clave);
            await setDoc(doc(db, "usuarios", userCred.user.uid), { nombre, correo, clave, rol });
            alert("Usuario creado.");
        }
        document.getElementById('formUsuario').reset();
        await window.renderizarUsuarios();
    } catch (error) {
        alert("Error: " + error.message);
    }
});

window.renderizarUsuarios = async function () {
    if (usuarioRolActual !== 'superadmin') return;
    const tabla = document.getElementById('cuerpoTablaUsuarios');
    if (!tabla) return;

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
                    <td>${u.rol || 'docente'}</td>
                    <td class="col-accion">
                        <button class="btn-del" onclick="window.eliminarUsuario('${u.id}')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
    }
};

window.eliminarUsuario = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Eliminar este usuario?")) {
        await deleteDoc(doc(db, "usuarios", idDoc));
        await window.renderizarUsuarios();
    }
};

window.cargarMensajes = async function () {
    if (usuarioRolActual !== 'superadmin') return;
    try {
        const querySnapshot = await getDocs(collection(db, "mensajes"));
        const tabla = document.getElementById('cuerpoTablaBuzon');
        if (!tabla) return;
        tabla.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const m = docSnap.data();
            tabla.innerHTML += `
                <tr>
                    <td>${m.nombre || ''}</td>
                    <td>${m.correo || ''}</td>
                    <td>${m.contenido || ''}</td>
                    <td class="col-accion">
                        <button class="btn-del" onclick="window.eliminarMensaje('${docSnap.id}')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
    }
};

window.eliminarMensaje = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Eliminar mensaje?")) {
        await deleteDoc(doc(db, "mensajes", idDoc));
        await window.cargarMensajes();
    }
};

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
        await window.renderizarDocentes();
        alert("Docente guardado correctamente.");
    } catch (error) {
        alert("Error: " + error.message);
    }
});

window.renderizarDocentes = async function () {
    const tabla = document.getElementById('cuerpoTablaDocentes');
    const selectPago = document.getElementById('pagoSelectDocente');

    try {
        const querySnapshot = await getDocs(collection(db, "docentes"));
        docentesCache = [];
        if (tabla) tabla.innerHTML = "";
        if (selectPago) selectPago.innerHTML = '<option value="">-- Seleccionar Docente --</option>';

        querySnapshot.forEach((docSnap) => {
            const d = { id: docSnap.id, ...docSnap.data() };
            docentesCache.push(d);

            if (tabla) {
                const btnAccion = (usuarioRolActual === 'superadmin')
                    ? `<button class="btn-del" onclick="window.eliminarDocente('${d.id}')">Eliminar</button>`
                    : '';

                tabla.innerHTML += `
                    <tr>
                        <td>${d.documento}</td>
                        <td><strong>${d.nombre}</strong></td>
                        <td>${d.telefono}</td>
                        <td>${d.direccion}</td>
                        <td class="col-accion">${btnAccion}</td>
                    </tr>
                `;
            }
            if (selectPago) selectPago.innerHTML += `<option value="${d.documento}">${d.nombre} (${d.documento})</option>`;
        });
    } catch (error) {
        console.error(error);
    }
};

window.eliminarDocente = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Eliminar docente?")) {
        await deleteDoc(doc(db, "docentes", idDoc));
        await window.renderizarDocentes();
    }
};

window.renderizarPagos = async function () {
    const tabla = document.getElementById('cuerpoTablaPagos');
    if (!tabla) return;

    try {
        const querySnapshot = await getDocs(collection(db, "pagos"));
        pagosCache = [];
        tabla.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const p = { id: docSnap.id, ...docSnap.data() };
            pagosCache.push(p);
        });

        await actualizarResumenFinanciero();

        pagosCache.sort((a, b) => (b.numTicket || b.idFecha || 0) - (a.numTicket || a.idFecha || 0));

        pagosCache.forEach(p => {
            const textoMeses = p.meses ? p.meses.join(', ') : p.mes;
            const btnAccion = (usuarioRolActual === 'superadmin')
                ? `<button class="btn-del" onclick="window.eliminarPago('${p.id}')">Eliminar</button>`
                : '';

            tabla.innerHTML += `
                <tr>
                    <td><strong>#${p.numTicket || ''}</strong></td>
                    <td>${p.fecha || ''}</td>
                    <td>${p.docente || ''}</td>
                    <td>Cuota(s): ${textoMeses || ''}</td>
                    <td>$${(p.totalPagar || 0).toLocaleString('es-CO')}</td>
                    <td>
                        <button class="btn-pdf" type="button" onclick="window.descargarTicketPDF('${p.id}')">Imprimir Ticket</button>
                    </td>
                    <td class="col-accion" style="text-align:center;">${btnAccion}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
    }
};

window.eliminarPago = async function (idDoc) {
    if (usuarioRolActual !== 'superadmin') return;
    if (confirm("¿Eliminar comprobante de pago?")) {
        await deleteDoc(doc(db, "pagos", idDoc));
        await window.renderizarPagos();
    }
};

// ----------------------------------------------------
// MATRIZ ANUAL Y REPORTE GENERAL
// ----------------------------------------------------
window.renderizarMatrizPagos = async function () {
    const tbody = document.getElementById('cuerpoTablaMatriz');
    const thead = document.querySelector('#tablaMatriz thead') || document.querySelector('#sec-matriz table thead');
    
    if (thead) {
        thead.innerHTML = `
            <tr style="background-color: #1b5e20 !important; color: #ffffff !important;">
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Identificación</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Nombre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Enero</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Febrero</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Marzo</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Abril</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Mayo</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Junio</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Julio</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Agosto</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Septiembre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Octubre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Noviembre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Diciembre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Total Pagado</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Estado</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente a la Fecha</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente en el Año</th>
            </tr>
        `;
    }

    if (!tbody) return;

    try {
        await window.renderizarDocentes();
        await window.renderizarPagos();
        tbody.innerHTML = "";

        const mesActualIndex = new Date().getMonth();

        docentesCache.forEach(docente => {
            const docNum = String(docente.documento || "").trim();
            const docNom = String(docente.nombre || "").toLowerCase().trim();

            const pagosDocente = pagosCache.filter(p => {
                const pDoc = String(p.documento || "").trim();
                const pNom = String(p.docente || "").toLowerCase().trim();
                return (docNum !== "" && pDoc === docNum) || (docNom !== "" && pNom.includes(docNom));
            });

            let mesesPagados = [];
            pagosDocente.forEach(p => {
                if (p.meses && Array.isArray(p.meses)) mesesPagados.push(...p.meses);
                else if (p.mes) mesesPagados.push(p.mes);
            });

            let totalPagadoDocente = 0;
            let mesesPendientesFecha = 0;
            let mesesFaltantesAnio = 0;
            let celdasMesesHTML = "";

            MESES_ANIO.forEach((mesNombre, index) => {
                const estaPagado = mesesPagados.some(m => String(m).toLowerCase().includes(mesNombre.toLowerCase()));
                
                if (estaPagado) {
                    totalPagadoDocente += VALOR_CUOTA_FIJA;
                    celdasMesesHTML += `<td class="celda-pagado" style="background-color: #2e7d32 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>`;
                } else if (index <= mesActualIndex) {
                    mesesPendientesFecha++;
                    celdasMesesHTML += `<td class="celda-pendiente" style="background-color: #d32f2f !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-</td>`;
                } else {
                    mesesFaltantesAnio++;
                    celdasMesesHTML += `<td class="celda-futuro" style="background-color: #ef6c00 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff;">-$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}-</td>`;
                }
            });

            const saldoPendienteFecha = mesesPendientesFecha * VALOR_CUOTA_FIJA;
            const saldoPendienteAnio = (mesesPendientesFecha + mesesFaltantesAnio) * VALOR_CUOTA_FIJA;
            const estadoGeneral = mesesPendientesFecha === 0 ? "AL DIA" : "PENDIENTE";

            const bgEstado = estadoGeneral === 'AL DIA' ? '#2e7d32' : '#d32f2f';
            const bgSaldoFecha = saldoPendienteFecha === 0 ? '#2e7d32' : '#d32f2f';

            tbody.innerHTML += `
                <tr>
                    <td class="col-identificacion" style="color: #ffffff; font-weight: normal; text-align: center; border: 0.1px solid #e5e7eb;">${docente.documento}</td>
                    <td class="col-nombre" style="color: #ffffff; font-weight: normal; border: 0.1px solid #e5e7eb;">${docente.nombre}</td>
                    ${celdasMesesHTML}
                    <td class="col-total" style="font-weight: normal; text-align: center; color: #ffffff; border: 0.1px solid #e5e7eb;">$${totalPagadoDocente.toLocaleString('es-CO')}</td>
                    <td style="font-weight: bold; text-align: center; background-color: ${bgEstado} !important; color: #ffffff !important; border: 0.1px solid #ffffff;">${estadoGeneral}</td>
                    <td style="font-weight: bold; text-align: center; background-color: ${bgSaldoFecha} !important; color: #ffffff !important; border: 0.1px solid #ffffff;">$${saldoPendienteFecha.toLocaleString('es-CO')}</td>
                    <td style="font-weight: bold; text-align: center; background-color: #ef6c00 !important; color: #ffffff !important; border: 0.1px solid #ffffff;">$${saldoPendienteAnio.toLocaleString('es-CO')}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
    }
};

window.descargarMatrizPDF = async function () {
    await window.renderizarMatrizPagos();

    let contenedor = document.getElementById('contenedorMatrizPDF');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedorMatrizPDF';
        document.body.appendChild(contenedor);
    }

    const tablaOriginal = document.getElementById('tablaMatriz') || document.querySelector('#sec-matriz table');
    const contenidoTablaHTML = tablaOriginal ? tablaOriginal.outerHTML : '';

    const ahora = new Date();
    const fechaHoraStr = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO')}`;

    contenedor.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; background: #ffffff !important; z-index: 99999; display: block; padding: 10px;";

    contenedor.innerHTML = `
        <div id="elementoMatrizAImprimir" style="width: 100%; background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 8.5px !important; box-sizing: border-box; padding-bottom: 60px;">
            
            <div style="text-align: center; font-size: 11px !important; background: transparent !important; margin-bottom: 6px;">
                <img src="../img/logo.png" alt="Escudo Institucional" style="width: 58px; height: auto; margin-bottom: 2px; display: block; margin-left: auto; margin-right: auto;" />
                <span style="font-weight: bold; font-size: 15px !important; color: #2e7d32 !important;">INSTITUCION EDUCATIVA ALTO HORIZONTE</span><br>
                <span style="font-weight: bold; font-size: 11px !important; color: #000000 !important;">GRUPO BIENESTAR 2026 - Reporte General de Aportes</span><br>
                <span style="color: #6b7280 !important; font-size: 9.5px !important;">FECHA / HORA: ${fechaHoraStr}</span>
            </div>

            <div style="border-bottom: 0.5px solid #d1d5db; margin: 4px 0 10px 0;"></div>

            ${CONVENCIONES_HTML}

            <style>
                #elementoMatrizAImprimir table { width: 100%; border-collapse: collapse; font-size: 8px; color: #000000 !important; }
                #elementoMatrizAImprimir th { background-color: #1b5e20 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #d1d5db !important; padding: 4px 2px; }
                #elementoMatrizAImprimir td { border: 0.1px solid #e5e7eb !important; padding: 2.5px 2px; text-align: center; }
                
                #elementoMatrizAImprimir .col-identificacion, 
                #elementoMatrizAImprimir .col-nombre { color: #000000 !important; font-weight: normal !important; }
                #elementoMatrizAImprimir .col-total { color: #000000 !important; font-weight: normal !important; }

                #elementoMatrizAImprimir .celda-pagado { background-color: #2e7d32 !important; color: #ffffff !important; font-weight: bold; border: 0.1px solid #ffffff !important; }
                #elementoMatrizAImprimir .celda-pendiente { background-color: #d32f2f !important; color: #ffffff !important; font-weight: bold; border: 0.1px solid #ffffff !important; }
                #elementoMatrizAImprimir .celda-futuro { background-color: #ef6c00 !important; color: #ffffff !important; font-weight: bold; border: 0.1px solid #ffffff !important; }
            </style>

            <div style="margin-bottom: 10px;">
                ${contenidoTablaHTML}
            </div>

            <div style="text-align: center; font-size: 10px !important; line-height: 1.5; font-weight: normal; margin-top: 25px; padding: 15px 10px 30px 10px; color: #212121 !important; page-break-inside: avoid; display: block; clear: both; width: 100%;">
                Estimad@ profesor@ - Administrativ@ - rector@<br>
                con su aporte contribuye al bienestar de todo el talento humano de nuestra institución.<br>
                <strong style="font-size: 11px; color: #000000; letter-spacing: 0.5px;">¡GRACIAS POR SU APORTE!</strong><br>
                <span style="font-weight: bold; margin-top: 6px; display: inline-block; color: #1b5e20; font-size: 10.5px;">Cemled corp 2026</span>
            </div>
        </div>
    `;

    setTimeout(() => {
        const elemento = document.getElementById('elementoMatrizAImprimir');
        if (typeof html2pdf === "undefined") {
            alert("La librería html2pdf no está cargada.");
            return;
        }

        const opt = {
            margin: [5, 5, 15, 5],
            filename: `MATRIZ_GENERAL_APORTES_${new Date().getFullYear()}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: {
                scale: 2,
                logging: false,
                useCORS: true,
                backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(elemento).save().then(() => {
            contenedor.innerHTML = "";
        }).catch(err => {
            console.error("Error generando PDF:", err);
            contenedor.innerHTML = "";
        });
    }, 400);
};

document.getElementById('btnActualizarMatriz')?.addEventListener('click', async () => {
    await window.renderizarMatrizPagos();
});

document.getElementById('btnDescargarMatriz')?.addEventListener('click', async () => {
    await window.descargarMatrizPDF();
});

// ----------------------------------------------------
// CÁLCULO Y REACTIVIDAD DE PAGOS
// ----------------------------------------------------
function actualizarCalculosPago() {
    const selectDocente = document.getElementById('pagoSelectDocente');
    const inputDoc = document.getElementById('pagoDocumento');
    const prevDocente = document.getElementById('prevDocente');
    const tbodyPrevis = document.getElementById('cuerpoPrevisTabla');
    const lblTotal = document.getElementById('lblTotalCalculado');
    const inputRecibido = document.getElementById('pagoValorRecibido');
    const inputCambio = document.getElementById('pagoCambio');

    const docVal = selectDocente ? selectDocente.value.trim() : '';
    const docenteEncontrado = docentesCache.find(d => String(d.documento).trim() === docVal);

    if (docenteEncontrado) {
        if (inputDoc) inputDoc.value = docenteEncontrado.documento || '';
        if (prevDocente) prevDocente.innerText = `Docente: ${docenteEncontrado.nombre} (${docenteEncontrado.documento})`;
    } else {
        if (inputDoc) inputDoc.value = '';
        if (prevDocente) prevDocente.innerText = 'Docente: No seleccionado';
    }

    const checkboxes = document.querySelectorAll('.chk-mes:checked');
    const mesesSeleccionados = Array.from(checkboxes).map(c => c.value);

    if (tbodyPrevis) {
        if (mesesSeleccionados.length === 0) {
            tbodyPrevis.innerHTML = `<tr><td colspan="2" style="text-align:center;">Ningún mes seleccionado</td></tr>`;
        } else {
            tbodyPrevis.innerHTML = mesesSeleccionados.map(m => `
                <tr>
                    <td>${m}</td>
                    <td>$${VALOR_CUOTA_FIJA.toLocaleString('es-CO')}</td>
                </tr>
            `).join('');
        }
    }

    const totalCalculado = mesesSeleccionados.length * VALOR_CUOTA_FIJA;
    if (lblTotal) lblTotal.innerText = totalCalculado.toLocaleString('es-CO');

    const valorRecibido = Number(inputRecibido ? inputRecibido.value : 0);
    const cambio = Math.max(0, valorRecibido - totalCalculado);
    if (inputCambio) inputCambio.value = `$${cambio.toLocaleString('es-CO')}`;
}

document.getElementById('pagoSelectDocente')?.addEventListener('change', actualizarCalculosPago);
document.querySelectorAll('.chk-mes').forEach(chk => chk.addEventListener('change', actualizarCalculosPago));
document.getElementById('pagoValorRecibido')?.addEventListener('input', actualizarCalculosPago);

document.getElementById('formPago')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (usuarioRolActual !== 'superadmin') return;

    const selectDocente = document.getElementById('pagoSelectDocente');
    const documentoSeleccionado = selectDocente ? selectDocente.value.trim() : '';
    const docenteObj = docentesCache.find(d => String(d.documento).trim() === documentoSeleccionado);

    if (!docenteObj) {
        alert("Por favor selecciona un docente válido.");
        return;
    }

    const checkboxes = document.querySelectorAll('.chk-mes:checked');
    const mesesSeleccionados = Array.from(checkboxes).map(c => c.value);

    if (mesesSeleccionados.length === 0) {
        alert("Debes seleccionar al menos un mes a pagar.");
        return;
    }

    const totalPagar = mesesSeleccionados.length * VALOR_CUOTA_FIJA;
    const totalPagado = Number(document.getElementById('pagoValorRecibido').value) || totalPagar;

    if (totalPagado < totalPagar) {
        alert(`El valor recibido ($${totalPagado.toLocaleString('es-CO')}) no cubre el total a pagar ($${totalPagar.toLocaleString('es-CO')}).`);
        return;
    }

    const cambio = totalPagado - totalPagar;
    const fechaActual = new Date().toLocaleDateString('es-CO');

    try {
        let nuevoPagoId = "";

        await runTransaction(db, async (transaction) => {
            const counterRef = doc(db, "configuracion", "contadores");
            const counterSnap = await transaction.get(counterRef);

            let nuevoNumTicket = 1;
            if (counterSnap.exists()) {
                const data = counterSnap.data();
                nuevoNumTicket = (Number(data.ultimoTicket) || 0) + 1;
            }

            if (!counterSnap.exists()) {
                nuevoNumTicket = 1;
            }

            transaction.set(counterRef, { ultimoTicket: nuevoNumTicket }, { merge: true });

            const nuevoPagoRef = doc(collection(db, "pagos"));
            nuevoPagoId = nuevoPagoRef.id;

            const nuevoPago = {
                numTicket: nuevoNumTicket,
                fecha: fechaActual,
                idFecha: Date.now(),
                docente: docenteObj.nombre,
                documento: docenteObj.documento,
                telefono: docenteObj.telefono || '',
                direccion: docenteObj.direccion || '',
                meses: mesesSeleccionados,
                totalPagar: totalPagar,
                totalPagado: totalPagado,
                cambio: cambio
            };

            transaction.set(nuevoPagoRef, nuevoPago);
        });

        document.getElementById('formPago').reset();
        actualizarCalculosPago();
        await window.renderizarPagos();
        alert("Pago registrado e impreso con éxito.");
        await window.descargarTicketPDF(nuevoPagoId);
    } catch (error) {
        alert("Error al registrar el pago: " + error.message);
    }
    
});
// Función global para mantener visibles los botones superiores tanto en PC como en móviles
window.cargarSubContenido = async function (subseccion) {
    let contenedor = null;
    let secBienvenidaPadre = null;

    // 1. Identificar el contenedor dinámico y la sección padre según el rol
    if (usuarioRolActual === 'bienestar') {
        contenedor = document.getElementById('subvista-bienestar');
        secBienvenidaPadre = document.getElementById('sec-bienestar-bienvenida');
    } else if (usuarioRolActual === 'superadmin') {
        contenedor = document.getElementById('subvista-superadmin');
        secBienvenidaPadre = document.getElementById('sec-superadmin-bienvenida');
    }

    // Si no existen los contenedores por rol, usar comportamiento estándar
    if (!contenedor || !secBienvenidaPadre) {
        if (typeof window.mostrarSeccion === 'function') {
            await window.mostrarSeccion(subseccion, null);
        }
        return;
    }

    // 2. Garantizar que la sección de bienvenida permanezca visible con su botonera fija
    secBienvenidaPadre.style.setProperty('display', 'block', 'important');
    secBienvenidaPadre.classList.add('activa');

    // Ocultar otras secciones principales para no duplicar vistas
    document.querySelectorAll('.seccion-modulo').forEach(sec => {
        if (sec !== secBienvenidaPadre && !contenedor.contains(sec)) {
            sec.style.setProperty('display', 'none', 'important');
            sec.classList.remove('activa');
        }
    });

    // 3. Mapear el módulo solicitado
    let targetElement = null;
    if (subseccion === 'docentes') targetElement = document.getElementById('sec-docentes');
    else if (subseccion === 'pagos') targetElement = document.getElementById('sec-contabilidad') || document.getElementById('sec-pagos');
    else if (subseccion === 'egresos') targetElement = document.getElementById('sec-egresos');
    else if (subseccion === 'usuarios') targetElement = document.getElementById('sec-usuarios');
    else if (subseccion === 'mensajes') targetElement = document.getElementById('sec-buzon');

    if (targetElement) {
        // Renderizar los datos de la base de datos
        if (subseccion === 'docentes' && typeof window.renderizarDocentes === 'function') await window.renderizarDocentes();
        if (subseccion === 'pagos' && typeof window.renderizarPagos === 'function') await window.renderizarPagos();
        if (subseccion === 'egresos' && typeof window.renderizarEgresos === 'function') await window.renderizarEgresos();
        if (subseccion === 'usuarios' && typeof window.renderizarUsuarios === 'function') await window.renderizarUsuarios();
        if (subseccion === 'mensajes' && typeof window.cargarMensajes === 'function') await window.cargarMensajes();

        // 4. Mover el módulo dentro del contenedor desplegable debajo de los botones
        contenedor.innerHTML = '';
        contenedor.appendChild(targetElement);
        targetElement.style.setProperty('display', 'block', 'important');
        targetElement.classList.add('activa');

        // Desplazamiento suave para visualizar el contenido en móviles
        if (window.innerWidth <= 768) {
            contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
};

// AGREGAR AL FINAL DE panel.js
document.addEventListener('click', (event) => {
    const btn = event.target.closest('.menu-btn');
    if (btn) {
        event.preventDefault();
        const seccion = btn.getAttribute('data-seccion') || btn.dataset.seccion;
        if (seccion) {
            window.mostrarSeccion(seccion, btn);
        }
    }
});

// ==========================================
// NAVEGACIÓN ISOLADA Y EXCLUSIVA PARA EL DOCENTE
// ==========================================
window.navegarDocente = function (idSeccion, elementoBtn) {
    const secBienvenida = document.getElementById('sec-docente-bienvenida');

    // 1. Ocultar todos los submódulos dinámicos del docente
    const modulosDocente = [
        'sec-matriz-docente', 
        'sec-mis-comprobantes', 
        'sec-noticias', 
        'sec-formatos', 
        'contenedorFormNoticia'
    ];
    
    modulosDocente.forEach(id => {
        const mod = document.getElementById(id);
        if (mod) {
            mod.style.setProperty('display', 'none', 'important');
        }
    });

    // 2. Mostrar la sección seleccionada
    let target = document.getElementById(idSeccion) || document.getElementById(`sec-${idSeccion}`);
    if (target) {
        target.style.setProperty('display', 'block', 'important');
    }

    // 3. Casos especiales: Si es Noticias, forzar que se vea el formulario de publicar noticia
    if (idSeccion === 'sec-noticias') {
        const formNoticiaBox = document.getElementById('contenedorFormNoticia');
        if (formNoticiaBox) {
            formNoticiaBox.style.setProperty('display', 'block', 'important');
        }
    }

    // 4. Asegurar que la cabecera de bienvenida persista siempre arriba
    const fijarCabecera = () => {
        if (secBienvenida) {
            secBienvenida.style.setProperty('display', 'block', 'important');
            secBienvenida.classList.add('activa');
        }
    };

    fijarCabecera();
    setTimeout(fijarCabecera, 50);

    // 5. Destacar botón activo
    document.querySelectorAll('#sec-docente-bienvenida .dash-btn-fijo').forEach(b => {
        b.classList.remove('activo');
    });
    if (elementoBtn) {
        elementoBtn.classList.add('activo');
    }

    // 6. Ejecución de lógica según el botón presionado
    if (idSeccion === 'sec-matriz-docente' && typeof window.renderizarEstadoCuentaDocente === 'function') {
        window.renderizarEstadoCuentaDocente();
    } else if (idSeccion === 'sec-noticias' && typeof window.renderizarNoticias === 'function') {
        window.renderizarNoticias();
    } else if ((idSeccion === 'sec-mis-comprobantes' || idSeccion === 'pagos') && typeof window.renderizarPagosDocente === 'function') {
        window.renderizarPagosDocente();
    }
};
window.renderizarEstadoCuentaDocente = async function () {
    const tabla = document.getElementById('cuerpoMatrizDocente');
    if (!tabla) return;

    tabla.innerHTML = "<tr><td colspan='14' style='text-align:center;'>Cargando estado de cuenta...</td></tr>";

    try {
        // 1. Obtener datos del docente desde la variable global o la sesión activa
        let docID = String(usuarioDocenteActual?.documento || usuarioDocenteActual?.cedula || "").trim();
        let nomDoc = String(usuarioDocenteActual?.nombre || "Docente").trim();
        let correoDoc = String(usuarioDocenteActual?.correo || usuarioDocenteActual?.email || usuarioCorreoActual || "").toLowerCase().trim();

        // 2. Obtener los pagos registrados en Firestore
        const querySnapshot = await getDocs(collection(db, "pagos"));
        const mesesPagados = new Set();

        querySnapshot.forEach(docSnap => {
            const p = docSnap.data();
            const pCorreo = String(p.correo || p.email || "").toLowerCase().trim();
            const pDoc = String(p.documento || "").trim();
            const pNom = String(p.docente || "").toLowerCase().trim();

            const coincideDocumento = docID !== "" && pDoc === docID;
            const coincideCorreo = correoDoc !== "" && pCorreo === correoDoc;
            const coincideNombre = nomDoc !== "" && pNom === nomDoc.toLowerCase();

            // Si el pago pertenece al docente autenticado
            if (coincideDocumento || coincideCorreo || coincideNombre) {
                if (Array.isArray(p.meses)) {
                    p.meses.forEach(m => mesesPagados.add(String(m).toLowerCase().trim()));
                } else if (p.mes) {
                    mesesPagados.add(String(p.mes).toLowerCase().trim());
                }
            }
        });

        // 3. Mapeo de meses del año
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        
        let celdasMeses = "";
        meses.forEach(mes => {
            if (mesesPagados.has(mes)) {
                celdasMeses += `<td style="background-color: #dcfce7; color: #15803d; text-align:center; font-weight:bold;">Al día</td>`;
            } else {
                celdasMeses += `<td style="background-color: #fee2e2; color: #b91c1c; text-align:center;">Pendiente</td>`;
            }
        });

        // 4. Renderizar la fila del docente
        tabla.innerHTML = `
            <tr>
                <td><strong>${nomDoc}</strong></td>
                <td>${docID || 'N/A'}</td>
                ${celdasMeses}
            </tr>
        `;

    } catch (error) {
        console.error("Error al generar Estado de Cuenta Docente:", error);
        tabla.innerHTML = "<tr><td colspan='14' style='text-align:center; color:red;'>Error al cargar el estado de cuenta. Revisa la consola.</td></tr>";
    }
};
// ==========================================
// ESTADO DE CUENTA INDIVIDUAL DEL DOCENTE
// ==========================================

window.renderizarEstadoCuentaDocente = async function () {
    const tbody = document.getElementById('cuerpoMatrizDocente');
    const thead = document.querySelector('#tablaMatrizDocente thead') || document.querySelector('#sec-matriz-docente table thead');

    if (thead) {
        thead.innerHTML = `
            <tr style="background-color: #1b5e20 !important; color: #ffffff !important;">
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Identificación</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Nombre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Enero</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Febrero</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Marzo</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Abril</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Mayo</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Junio</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Julio</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Agosto</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Septiembre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Octubre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Noviembre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Diciembre</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Total Pagado</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Estado</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente a la Fecha</th>
                <th style="background-color: #1b5e20 !important; color: #ffffff !important; text-align: center; border: 0.1px solid #d1d5db; padding: 6px;">Saldo Pendiente en el Año</th>
            </tr>
        `;
    }

    if (!tbody) return;

    try {
        if (typeof window.renderizarPagos === "function") {
            await window.renderizarPagos();
        }
        tbody.innerHTML = "";

        const VALOR_CUOTA = 35000; // Cuota fija $35.000
        const mesActualIndex = new Date().getMonth(); // Mes actual del sistema (Septiembre = 8)
        const listaMeses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

        // Datos del docente logueado
        const docObj = window.usuarioDocenteActual || window.usuarioActual || {};
        let docNum = String(docObj.documento || docObj.cedula || docObj.identificacion || "").trim();
        let docNom = String(docObj.nombre || docObj.docente || "").trim();
        let correoDoc = String(docObj.correo || docObj.email || window.usuarioCorreoActual || "").toLowerCase().trim();

        // Si no hay objeto en sesión, busca el primer registro disponible del docente
        const todosLosPagos = window.pagosCache || [];
        
        if (!docNum && !docNom && todosLosPagos.length > 0) {
            const pRef = todosLosPagos[0];
            docNum = String(pRef.documento || pRef.cedula || "").trim();
            docNom = String(pRef.docente || pRef.nombre || "Docente").trim();
            correoDoc = String(pRef.correo || pRef.email || "").toLowerCase().trim();
        }

        // Obtener pagos correspondientes
        const pagosDocente = todosLosPagos.filter(p => {
            const pCorreo = String(p.correo || p.email || "").toLowerCase().trim();
            const pDoc = String(p.documento || p.cedula || "").trim();
            const pNom = String(p.docente || p.nombre || "").toLowerCase().trim();

            return (docNum !== "" && pDoc === docNum) ||
                   (correoDoc !== "" && pCorreo === correoDoc) ||
                   (docNom !== "" && pNom.length > 2 && (pNom.includes(docNom.toLowerCase()) || docNom.toLowerCase().includes(pNom)));
        });

        // Registrar qué meses están pagados
        let mesesPagadosSet = new Set();
        pagosDocente.forEach(p => {
            let arregloMeses = [];
            if (p.meses && Array.isArray(p.meses)) arregloMeses = p.meses;
            else if (p.mes) arregloMeses = [p.mes];

            arregloMeses.forEach(m => {
                const mesLimpio = String(m).toLowerCase().trim();
                mesesPagadosSet.add(mesLimpio);
            });
        });

        let totalPagadoDocente = 0;
        let mesesPendientesFecha = 0;
        let mesesFaltantesAnio = 0;
        let celdasMesesHTML = "";

        listaMeses.forEach((mesNombre, index) => {
            // Evaluamos si el mes de la iteración está dentro del conjunto de meses pagados
            let estaPagado = false;
            for (let mPagado of mesesPagadosSet) {
                if (mPagado.includes(mesNombre) || mesNombre.includes(mPagado)) {
                    estaPagado = true;
                    break;
                }
            }

            if (estaPagado) {
                totalPagadoDocente += VALOR_CUOTA;
                // SI ESTÁ PAGADO: Texto "$35.000" (sin guiones) y Fondo Verde (#2e7d32)
                celdasMesesHTML += `<td class="celda-pagado" style="background-color: #2e7d32 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff; padding: 6px;">$${VALOR_CUOTA.toLocaleString('es-CO')}</td>`;
            } else if (index <= mesActualIndex) {
                mesesPendientesFecha++;
                // PENDIENTE A LA FECHA: Texto "-$35.000-" y Fondo Rojo (#d32f2f)
                celdasMesesHTML += `<td class="celda-pendiente" style="background-color: #d32f2f !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff; padding: 6px;">-$${VALOR_CUOTA.toLocaleString('es-CO')}-</td>`;
            } else {
                mesesFaltantesAnio++;
                // MES FUTURO POR PAGAR: Texto "-$35.000-" y Fondo Naranja (#ef6c00)
                celdasMesesHTML += `<td class="celda-futuro" style="background-color: #ef6c00 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #ffffff; padding: 6px;">-$${VALOR_CUOTA.toLocaleString('es-CO')}-</td>`;
            }
        });

        // Cálculos Matematicos
        const saldoPendienteFecha = mesesPendientesFecha * VALOR_CUOTA;
        const saldoPendienteAnio = (mesesPendientesFecha + mesesFaltantesAnio) * VALOR_CUOTA;
        const estadoGeneral = mesesPendientesFecha === 0 ? "AL DIA" : "PENDIENTE";

        const bgEstado = estadoGeneral === 'AL DIA' ? '#2e7d32' : '#d32f2f';
        const bgSaldoFecha = saldoPendienteFecha === 0 ? '#2e7d32' : '#d32f2f';

        tbody.innerHTML = `
            <tr>
                <td class="col-identificacion" style="color: #333333 !important; font-weight: normal; text-align: center; border: 0.1px solid #e5e7eb; padding: 6px;">${docNum || 'N/A'}</td>
                <td class="col-nombre" style="color: #333333 !important; font-weight: normal; border: 0.1px solid #e5e7eb; padding: 6px;">${docNom || 'Docente'}</td>
                ${celdasMesesHTML}
                <td class="col-total" style="font-weight: bold; text-align: center; color: #333333 !important; border: 0.1px solid #e5e7eb; padding: 6px;">$${totalPagadoDocente.toLocaleString('es-CO')}</td>
                <td style="font-weight: bold; text-align: center; background-color: ${bgEstado} !important; color: #ffffff !important; border: 0.1px solid #ffffff; padding: 6px;">${estadoGeneral}</td>
                <td style="font-weight: bold; text-align: center; background-color: ${bgSaldoFecha} !important; color: #ffffff !important; border: 0.1px solid #ffffff; padding: 6px;">$${saldoPendienteFecha.toLocaleString('es-CO')}</td>
                <td style="font-weight: bold; text-align: center; background-color: #ef6c00 !important; color: #ffffff !important; border: 0.1px solid #ffffff; padding: 6px;">$${saldoPendienteAnio.toLocaleString('es-CO')}</td>
            </tr>
        `;
    } catch (error) {
        console.error("Error al renderizar Estado de Cuenta Docente:", error);
        tbody.innerHTML = "<tr><td colspan='18' style='text-align:center; color:red;'>Error al cargar el estado de cuenta.</td></tr>";
    }
};

// ==========================================
// DESCARGAR PDF ESTADO DE CUENTA DOCENTE
// ==========================================

window.descargarEstadoCuentaDocentePDF = async function () {
    await window.renderizarEstadoCuentaDocente();

    let contenedor = document.getElementById('contenedorEstadoCuentaPDF');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedorEstadoCuentaPDF';
        document.body.appendChild(contenedor);
    }

    const tablaOriginal = document.getElementById('tablaMatrizDocente');
    const contenidoTablaHTML = tablaOriginal ? tablaOriginal.outerHTML : '';

    const ahora = new Date();
    const fechaHoraStr = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO')}`;
    const docNom = String(usuarioDocenteActual?.nombre || "Docente").toUpperCase();

    contenedor.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; background: #ffffff !important; z-index: 99999; display: block; padding: 10px;";

    contenedor.innerHTML = `
        <div id="elementoEstadoCuentaAImprimir" style="width: 100%; background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 8.5px !important; box-sizing: border-box; padding-bottom: 40px;">
            
            <div style="text-align: center; font-size: 11px !important; background: transparent !important; margin-bottom: 6px;">
                <img src="../img/logo.png" alt="Escudo Institucional" style="width: 58px; height: auto; margin-bottom: 2px; display: block; margin-left: auto; margin-right: auto;" />
                <span style="font-weight: bold; font-size: 15px !important; color: #2e7d32 !important;">INSTITUCION EDUCATIVA ALTO HORIZONTE</span><br>
                <span style="font-weight: bold; font-size: 11px !important; color: #000000 !important;">GRUPO BIENESTAR 2026 - Estado de Cuenta Individual</span><br>
                <span style="color: #6b7280 !important; font-size: 9.5px !important;">DOCENTE: ${docNom} | FECHA / HORA: ${fechaHoraStr}</span>
            </div>

            <div style="border-bottom: 0.5px solid #d1d5db; margin: 4px 0 10px 0;"></div>

            <!-- Leyenda de Convenciones en Colores -->
            <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 12px; font-weight: bold; font-size: 9px;">
                <span style="background-color: #2e7d32; color: #ffffff; padding: 3px 8px; border-radius: 3px;">■ Meses Pagados</span>
                <span style="background-color: #d32f2f; color: #ffffff; padding: 3px 8px; border-radius: 3px;">■ Meses que debe a la Fecha</span>
                <span style="background-color: #ef6c00; color: #ffffff; padding: 3px 8px; border-radius: 3px;">■ Meses que aún faltan por pagar / Saldo Año</span>
            </div>

            <style>
                #elementoEstadoCuentaAImprimir table { width: 100%; border-collapse: collapse; font-size: 8px; color: #000000 !important; }
                #elementoEstadoCuentaAImprimir th { background-color: #1b5e20 !important; color: #ffffff !important; font-weight: bold; text-align: center; border: 0.1px solid #d1d5db !important; padding: 4px 2px; }
                #elementoEstadoCuentaAImprimir td { border: 0.1px solid #e5e7eb !important; padding: 4px 2px; text-align: center; }
                #elementoEstadoCuentaAImprimir .celda-pagado { background-color: #2e7d32 !important; color: #ffffff !important; font-weight: bold; }
                #elementoEstadoCuentaAImprimir .celda-pendiente { background-color: #d32f2f !important; color: #ffffff !important; font-weight: bold; }
                #elementoEstadoCuentaAImprimir .celda-futuro { background-color: #ef6c00 !important; color: #ffffff !important; font-weight: bold; }
            </style>

            <div style="margin-bottom: 10px;">
                ${contenidoTablaHTML}
            </div>

            <div style="text-align: center; font-size: 10px !important; line-height: 1.5; font-weight: normal; margin-top: 20px; color: #212121 !important;">
                Estimad@ profesor@ - Administrativ@ - rector@<br>
                con su aporte contribuye al bienestar de todo el talento humano de nuestra institución.<br>
                <strong style="font-size: 11px; color: #000000;">¡GRACIAS POR SU APORTE!</strong><br>
                <span style="font-weight: bold; margin-top: 4px; display: inline-block; color: #1b5e20; font-size: 10px;">Cemled corp 2026</span>
            </div>
        </div>
    `;

    setTimeout(() => {
        const elemento = document.getElementById('elementoEstadoCuentaAImprimir');
        const opt = {
            margin: [5, 5, 10, 5],
            filename: `ESTADO_DE_CUENTA_${docNom.replace(/\s+/g, '_')}_2026.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: { scale: 2, logging: false, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(elemento).save().then(() => {
            contenedor.innerHTML = "";
        }).catch(err => {
            console.error("Error al generar PDF Docente:", err);
            contenedor.innerHTML = "";
        });
    }, 400);
};

// Exposición global estricta
window.renderizarNoticias = window.renderizarNoticias;
window.renderizarPagosDocente = window.renderizarPagosDocente;
window.renderizarDocentes = window.renderizarDocentes;
window.renderizarPagos = window.renderizarPagos;
window.renderizarEgresos = window.renderizarEgresos;
window.eliminarEgreso = window.eliminarEgreso;
window.descargarEgresosPDF = window.descargarEgresosPDF;
window.renderizarUsuarios = window.renderizarUsuarios;
window.cargarMensajes = window.cargarMensajes;
window.renderizarMatrizPagos = window.renderizarMatrizPagos;
window.descargarMatrizPDF = window.descargarMatrizPDF;
window.consultarReporteIndividualDocente = window.consultarReporteIndividualDocente;
window.descargarReporteIndividualDocentePDF = window.descargarReporteIndividualDocentePDF;