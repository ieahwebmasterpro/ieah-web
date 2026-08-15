const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta al archivo de almacenamiento
const FILE_PATH = path.join(__dirname, 'datos.json');

// Funciones auxiliares para leer y escribir JSON
function obtenerDatos() {
    if (!fs.existsSync(FILE_PATH)) {
        const datosIniciales = { mensajes: [], docentes: [], pagos: [] };
        fs.writeFileSync(FILE_PATH, JSON.stringify(datosIniciales, null, 2));
        return datosIniciales;
    }
    try {
        const contenido = fs.readFileSync(FILE_PATH, 'utf-8');
        return JSON.parse(contenido);
    } catch (e) {
        return { mensajes: [], docentes: [], pagos: [] };
    }
}

function guardarDatos(datos) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(datos, null, 2));
}

// Ruta principal de prueba
app.get('/', (req, res) => {
    res.send('Servidor IEAH Backend activo 🚀');
});

// ==========================================
// 1. ENDPOINTS PARA MENSAJES DEL BUZÓN
// ==========================================
app.get('/ver-mensajes', (req, res) => {
    const datos = obtenerDatos();
    res.json(datos.mensajes || []);
});

app.post('/enviar-mensaje', (req, res) => {
    const datos = obtenerDatos();
    const nuevoMensaje = {
        id: Date.now(),
        nombre: req.body.nombre,
        correo: req.body.correo,
        contenido: req.body.contenido
    };
    datos.mensajes.push(nuevoMensaje);
    guardarDatos(datos);
    res.status(201).json({ status: 'ok', mensaje: 'Mensaje guardado' });
});

app.delete('/eliminar-mensaje/:id', (req, res) => {
    const datos = obtenerDatos();
    const id = parseInt(req.params.id);
    datos.mensajes = datos.mensajes.filter(m => m.id !== id);
    guardarDatos(datos);
    res.json({ status: 'ok' });
});

// ==========================================
// 2. ENDPOINTS PARA DOCENTES
// ==========================================
app.get('/docentes', (req, res) => {
    const datos = obtenerDatos();
    res.json(datos.docentes || []);
});

app.post('/docentes', (req, res) => {
    const { nombre, documento, telefono, direccion } = req.body;
    if (!documento || !nombre) {
        return res.status(400).json({ error: 'Nombre y documento son obligatorios.' });
    }

    const datos = obtenerDatos();
    const index = datos.docentes.findIndex(d => d.documento === documento);

    if (index !== -1) {
        datos.docentes[index] = { nombre, documento, telefono, direccion };
    } else {
        datos.docentes.push({ nombre, documento, telefono, direccion });
    }

    guardarDatos(datos);
    res.status(201).json({ status: 'ok', mensaje: 'Docente guardado correctamente' });
});

app.delete('/docentes/:documento', (req, res) => {
    const datos = obtenerDatos();
    const doc = req.params.documento;
    datos.docentes = datos.docentes.filter(d => d.documento !== doc);
    guardarDatos(datos);
    res.json({ status: 'ok' });
});

// ==========================================
// 3. ENDPOINTS PARA PAGOS Y TICKETS
// ==========================================
app.get('/pagos', (req, res) => {
    const datos = obtenerDatos();
    res.json(datos.pagos || []);
});

app.post('/pagos', (req, res) => {
    const nuevoPago = req.body;
    const datos = obtenerDatos();
    datos.pagos.push(nuevoPago);
    guardarDatos(datos);
    res.status(201).json({ status: 'ok', mensaje: 'Pago registrado con éxito' });
});

app.delete('/pagos/:id', (req, res) => {
    const datos = obtenerDatos();
    const id = parseInt(req.params.id);
    datos.pagos = datos.pagos.filter(p => p.id !== id);
    guardarDatos(datos);
    res.json({ status: 'ok' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});