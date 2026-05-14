const express = require('express');
const router = express.Router();
const multer = require('multer');
const excelService = require('../services/excelService');
const whatsappService = require('../services/whatsappService'); // <-- IMPORTANTE
const pool = require('../config/db');

const upload = multer({ dest: 'uploads/' });

// 1. Subir Excel e importar a DB
router.post('/importar', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No hay archivo');
        const count = await excelService.procesarReservas(req.file.path);
        res.json({ mensaje: `Se agregaron ${count} reservas nuevas.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Ruta para crear reserva manual (Walk-in)
// CAMBIO: app por router Y simplificamos la ruta a '/manual'
router.post('/manual', async (req, res) => {
    const { nombre, telefono, llegada, salida } = req.body;
    
    // Generamos un número de reserva ficticio para Walk-ins
    const nreser_res = 'W-' + Math.floor(1000 + Math.random() * 9000);

    try {
        const query = `
            INSERT INTO reservations (nreser_res, nombre_res, telef_res, fllega_reh, fsalid_reh)
            VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        
        // Limpiamos el teléfono por si llega con espacios o símbolos
        const telLimpio = telefono ? telefono.replace(/\D/g, '') : '';
        
        const values = [nreser_res, nombre.toUpperCase(), telLimpio, llegada, salida];
        
        await pool.query(query, values);
        res.json({ success: true, mensaje: "Huésped agregado correctamente" });
    } catch (err) {
        console.error("Error en registro manual:", err);
        res.status(500).json({ error: "Error al guardar el huésped manual" });
    }
});


// --- ACTUALIZAR TELÉFONO ---
router.put('/:id/telefono', async (req, res) => {
    const { id } = req.params;
    const { nuevoTelefono } = req.body;
    const telLimpio = nuevoTelefono ? nuevoTelefono.replace(/\D/g, '') : null;

    try {
        await pool.query("UPDATE reservations SET telef_res = $1 WHERE id = $2", [telLimpio, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar teléfono" });
    }
});

// --- ACTUALIZAR NOMBRE ---
router.put('/:id/nombre', async (req, res) => {
    const { id } = req.params;
    const { nuevoNombre } = req.body;

    try {
        await pool.query("UPDATE reservations SET nombre_res = $1 WHERE id = $2", [nuevoNombre.toUpperCase(), id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar nombre" });
    }
});

// 2. Listar Reservas para la tabla web
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reservations ORDER BY fllega_reh DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. NUEVA RUTA: Enviar Bienvenida Real
// ... (resto del código igual)

router.post('/enviar-bienvenida', async (req, res) => {
    const { nreser_res, telefono, nombre } = req.body;

    try {
        // NORMALIZACIÓN: Nos aseguramos de que el teléfono sea un string
        // y le pegamos el indicativo '57' al inicio.
        const telefonoConIndicativo = `57${String(telefono).trim()}`;

        const componentes = [
            {
                type: "header",
                parameters: [{ type: "text", text: "¡Bienvenida!" }]
            },
            {
                type: "body",
                parameters: [{ type: "text", text: nombre }]
            }
        ];

        // Ahora enviamos el número ya procesado
        await whatsappService.enviarPlantilla(telefonoConIndicativo, "bienvenida2", componentes);

        await pool.query(
            'UPDATE reservations SET welcome_sent = true WHERE nreser_res = $1',
            [nreser_res]
        );

        res.json({ success: true, mensaje: "Mensaje enviado con éxito" });
    } catch (error) {
        console.error("Error en la ruta de bienvenida:", error);
        res.status(500).json({ error: "Error al enviar el WhatsApp. Revisa el número." });
    }
});

router.post('/enviar-encuesta', async (req, res) => {
    const { nreser_res, telefono, nombre } = req.body;

    try {
        const telefonoConIndicativo = `57${String(telefono).trim()}`;

        // 1. Componente del cuerpo con el nombre (igual que en tu GAS)
        const bodyComponent = {
            type: "body",
            parameters: [
                {
                    type: "text",
                    text: nombre || "Huésped"
                }
            ]
        };

        // 2. Componente de botón para el FLOW (encuesta_version_2)
        const buttonComponent = {
            type: "button",
            sub_type: "FLOW",
            index: 0,
            parameters: [
                {
                    type: "text",
                    text: "Llamar ahora" // Aunque sea un Flow, Meta a veces pide este parámetro de texto
                }
            ]
        };

        // 3. Enviamos usando tu whatsappService
        await whatsappService.enviarPlantilla(
            telefonoConIndicativo, 
            "encuesta_version_2", 
            [bodyComponent, buttonComponent]
        );

        // ACTUALIZACIÓN: Marcamos en la DB que se envió
        await pool.query(
            'UPDATE reservations SET survey_sent = true WHERE nreser_res = $1',
            [nreser_res]
        );

        res.json({ success: true });
    } catch (error) {
        console.error("Error enviando encuesta:", error);
        res.status(500).json({ error: "No se pudo enviar la encuesta" });
    }
});

module.exports = router;

