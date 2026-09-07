import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let pagosCache = [];
let usuarioDocenteActual = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (userDoc.exists()) {
            usuarioDocenteActual = userDoc.data();
        } else {
            usuarioDocenteActual = { correo: user.email, nombre: user.displayName || user.email };
        }

        document.getElementById('infoDocente').innerText = `Docente: ${usuarioDocenteActual.nombre || user.email}`;
        await cargarComprobantes();
    } catch (error) {
        console.error("Error consultando usuario:", error);
    }
});

async function cargarComprobantes() {
    const tabla = document.getElementById('cuerpoTablaPagosDocente');
    if (!tabla) return;

    try {
        const querySnapshot = await getDocs(collection(db, "pagos"));
        pagosCache = [];

        const docID = String(usuarioDocenteActual?.documento || usuarioDocenteActual?.cedula || "").trim();
        const nomDoc = String(usuarioDocenteActual?.nombre || "").toLowerCase().trim();

        querySnapshot.forEach(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
            const pDoc = String(p.documento || "").trim();
            const pNom = String(p.docente || "").toLowerCase().trim();

            const coincideDocumento = docID !== "" && pDoc === docID;
            const coincideNombre = nomDoc !== "" && (pNom.includes(nomDoc) || nomDoc.includes(pNom));

            if (coincideDocumento || coincideNombre) {
                pagosCache.push(p);
            }
        });

        tabla.innerHTML = "";

        if (pagosCache.length === 0) {
            tabla.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No registras comprobantes de pago en el sistema.</td></tr>";
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
                        <button class="btn-pdf" onclick="descargarTicketPDF('${p.id}')">Descargar Ticket</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error al obtener los comprobantes:", error);
        tabla.innerHTML = "<tr><td colspan='5' style='text-align:center; color:red;'>Error al cargar comprobantes.</td></tr>";
    }
}

window.descargarTicketPDF = function (id) {
    const pago = pagosCache.find(p => p.id === id);
    if (!pago) {
        alert("No se encontró la información del ticket.");
        return;
    }

    let contenedor = document.getElementById('contenedorPDF');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedorPDF';
        document.body.appendChild(contenedor);
    }

    const formatMoneda = (valor) => `$${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`;

    let filasMesesHTML = "";
    if (pago.meses && Array.isArray(pago.meses)) {
        pago.meses.forEach(m => {
            filasMesesHTML += `
                <tr style="background: transparent !important; color: #000000 !important;">
                    <td style="text-align: center; padding: 4px 0; font-size: 12px !important;">1</td>
                    <td style="text-align: center; padding: 4px 0; font-size: 12px !important;">Cuota ${m}</td>
                    <td style="text-align: center; padding: 4px 0; font-size: 12px !important;">${formatMoneda(35000)}</td>
                </tr>
            `;
        });
    } else if (pago.mes) {
        filasMesesHTML = `
            <tr style="background: transparent !important; color: #000000 !important;">
                <td style="text-align: center; padding: 4px 0; font-size: 12px !important;">1</td>
                <td style="text-align: center; padding: 4px 0; font-size: 12px !important;">Cuota ${pago.mes}</td>
                <td style="text-align: center; padding: 4px 0; font-size: 12px !important;">${formatMoneda(35000)}</td>
            </tr>
        `;
    }

    const totalPagarFormatted = formatMoneda(pago.totalPagar || 35000);
    const totalPagadoFormatted = formatMoneda(pago.totalPagado || pago.totalPagar || 35000);
    const cambioFormatted = formatMoneda(pago.cambio || 0);
    const codigoAlpha = `Y419J3T0F4-${pago.numTicket || 57}`;

    contenedor.style.cssText = "position: absolute; top: 0; left: 0; width: 78mm; background: #ffffff !important; z-index: 99999;";

    contenedor.innerHTML = `
        <div id="elementoAImprimir" style="width: 72mm; padding: 8mm 2mm 4mm 2mm; background: #ffffff !important; color: #000000 !important; font-family: Arial, sans-serif !important; font-size: 12px !important; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 4px;">
                <span style="font-weight: bold;">INSTITUCION EDUCATIVA ALTO<br>HORIZONTE 2026</span><br>
                Vereda Alto Horizonte<br>Teléfono: 3214115248<br>Email: altohorizonte.suaza@sedhuila.gov.co
            </div>
            <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
            <div style="text-align: center;">
                Fecha: ${pago.fecha || ''}<br>Caja Nro: 1<br>Cajero: Bienestar I E Alto Horizonte<br>
                <strong>TICKET NRO: ${pago.numTicket || ''}</strong>
            </div>
            <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
            <div style="text-align: center;">
                Cliente: ${pago.docente || ''}<br>Documento: Otro ${pago.documento || ''}<br>Teléfono: ${pago.telefono || ''}<br>Dirección: ${pago.direccion || ''}
            </div>
            <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
            <table style="width: 100%; font-size: 12px !important; margin: 4px 0;">
                <thead>
                    <tr style="border-bottom: 1px dashed #000;">
                        <th>Cant.</th><th>Precio</th><th>Total</th>
                    </tr>
                </thead>
                <tbody>${filasMesesHTML}</tbody>
            </table>
            <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
            <table style="width: 100%; font-size: 12px !important;">
                <tr><td>TOTAL A PAGAR</td><td style="text-align: right;">${totalPagarFormatted}</td></tr>
                <tr><td>TOTAL PAGADO</td><td style="text-align: right;">${totalPagadoFormatted}</td></tr>
                <tr><td>CAMBIO</td><td style="text-align: right;">${cambioFormatted}</td></tr>
            </table>
            <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
            <div style="text-align: center; font-size: 11px !important; margin-top: 10px;">
                *** Para poder realizar un reclamo o devolución debe de presentar este ticket ***<br><br>
                *** Estimad@ profesor@ - Adminstrativ@ Rector@, con su cuota contribuye al bienestar de todo el talento humano de nuestra institución ***
            </div>
            <div style="text-align: center; margin-top: 10px; font-weight: bold;">¡GRACIAS POR SU APORTE!</div>
            <div style="text-align: center; font-size: 12px !important; margin-top: 8px;">Cemled corp 2026</div>
            <div style="text-align: center; margin-top: 10px;">
                <svg id="barcodeTicket"></svg>
                <div style="font-size: 11px !important;">${codigoAlpha}</div>
            </div>
        </div>
    `;

    try {
        if (typeof JsBarcode !== "undefined") {
            JsBarcode("#barcodeTicket", codigoAlpha, {
                format: "CODE128", displayValue: false, height: 40, width: 1.5, margin: 0
            });
        }
    } catch (e) {
        console.error(e);
    }

    setTimeout(() => {
        const elemento = document.getElementById('elementoAImprimir');
        const opt = {
            margin: 0,
            filename: `TICKET_${pago.numTicket || 'PAGO'}.pdf`,
            image: { type: 'png', quality: 1.0 },
            html2canvas: { scale: 4, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: [78, 250], orientation: 'portrait' }
        };

        html2pdf().set(opt).from(elemento).save().then(() => {
            contenedor.innerHTML = "";
        });
    }, 300);
};
