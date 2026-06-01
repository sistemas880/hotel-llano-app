const express = require('express');
const router = express.Router();
const multer = require('multer');
const excelService = require('../services/excelService');
const whatsappService = require('../services/whatsappService'); 
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

// 2. Listar Reservas para la tabla web
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reservations ORDER BY fllega_reh DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Crear reserva manual (Walk-in)
router.post('/manual', async (req, res) => {
    const { nombre, telefono, llegada, salida } = req.body;
    const nreser_res = 'W-' + Math.floor(1000 + Math.random() * 9000);

    try {
        const query = `
            INSERT INTO reservations (nreser_res, nombre_res, telef_res, fllega_reh, fsalid_reh)
            VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        
        const telLimpio = telefono ? telefono.replace(/\D/g, '') : '';
        const values = [nreser_res, nombre.toUpperCase(), telLimpio, llegada, salida];
        
        await pool.query(query, values);
        res.json({ success: true, mensaje: "Huésped agregado correctamente" });
    } catch (err) {
        console.error("Error en registro manual:", err);
        res.status(500).json({ error: "Error al guardar el huésped manual" });
    }
});

// 4. ACTUALIZAR TELÉFONO
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

// 5. ACTUALIZAR NOMBRE
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

// 🔥 6. NUEVA RUTA: ACTUALIZAR FECHA DE SALIDA (Soluciona el error 404)
router.put('/:id/fecha-salida', async (req, res) => {
    const { id } = req.params;
    const { fecha_salida } = req.body;

    try {
        const query = "UPDATE reservations SET fsalid_reh = $1 WHERE id = $2";
        const resultado = await pool.query(query, [fecha_salida, id]);

        if (resultado.rowCount > 0) {
            res.json({ success: true, message: "Fecha de salida modificada con éxito." });
        } else {
            res.status(404).json({ error: "No se encontró la reserva indicada." });
        }
    } catch (err) {
        console.error("❌ Error actualizando fecha de salida:", err.message);
        res.status(500).json({ error: "Error de servidor al modificar fecha de salida" });
    }
});

// 7. Enviar Bienvenida Real
router.post('/enviar-bienvenida', async (req, res) => {
    const { nreser_res, telefono, nombre } = req.body;

    try {
        const telefonoConIndicativo = `57${String(telefono).trim()}`;
        const componentes = [
            { type: "header", parameters: [{ type: "text", text: "¡Bienvenida!" }] },
            { type: "body", parameters: [{ type: "text", text: nombre }] }
        ];

        await whatsappService.enviarPlantilla(telefonoConIndicativo, "bienvenida2", componentes);
        await pool.query('UPDATE reservations SET welcome_sent = true WHERE nreser_res = $1', [nreser_res]);

        res.json({ success: true, mensaje: "Mensaje enviado con éxito" });
    } catch (error) {
        console.error("Error en la ruta de bienvenida:", error);
        res.status(500).json({ error: "Error al enviar el WhatsApp. Revisa el número." });
    }
});

// 8. VERIFICAR SI HAY MENSAJES GLOBALES SIN LEER
router.get('/notificaciones/pendientes', async (req, res) => {
    try {
        const resultado = await pool.query("SELECT COUNT(*) FROM messages WHERE direction = 'incoming' AND leido = false");
        const cantidad = parseInt(resultado.rows[0].count);
        res.json({ hayPendientes: cantidad > 0, conteo: cantidad });
    } catch (err) {
        console.error("Error al contar mensajes pendientes:", err);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// 9. Enviar Encuesta Real
router.post('/enviar-encuesta', async (req, res) => {
    const { nreser_res, telefono, nombre } = req.body;

    try {
        const telefonoConIndicativo = `57${String(telefono).trim()}`;
        const bodyComponent = { type: "body", parameters: [{ type: "text", text: nombre || "Huésped" }] };
        const buttonComponent = { type: "button", sub_type: "FLOW", index: 0, parameters: [{ type: "text", text: "Llamar ahora" }] };

        await whatsappService.enviarPlantilla(telefonoConIndicativo, "encuesta_version_2", [bodyComponent, buttonComponent]);
        await pool.query('UPDATE reservations SET survey_sent = true WHERE nreser_res = $1', [nreser_res]);

        res.json({ success: true });
    } catch (error) {
        console.error("Error enviando encuesta:", error);
        res.status(500).json({ error: "No se pudo enviar la encuesta" });
    }
});


// 🔥 RUTA TEMPORAL PARA ELIMINAR DUPLICADOS DE ENCUESTAS
app.get('/api/limpiar-encuestas-duplicadas', async (req, res) => {
    try {
        const query = `
            DELETE FROM surveys 
            WHERE id NOT IN (
                SELECT MIN(id) 
                FROM surveys 
                GROUP BY telefono, nombre_huesped, habitacion
            )
        `;
        const resultado = await pool.query(query);
        res.json({ 
            success: true, 
            mensaje: `¡Limpieza de base de datos completada con éxito! Se eliminaron ${resultado.rowCount} registros duplicados de la tabla surveys.` 
        });
    } catch (err) {
        console.error("❌ Error al ejecutar la limpieza de surveys:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;