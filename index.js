// 1. IMPORTACIONES
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// IMPORTAR NUESTROS MÓDULOS MODULARES
const pool = require('./config/db');

const whatsappService = require('./services/whatsappService');
const reservasRoutes = require('./routes/reservas'); // <-- Nueva línea

// 2. CONFIGURACIONES
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

app.use(express.static('public'));

app.use('/api/reservas', reservasRoutes); // <-- Nueva línea

const VERIFY_TOKEN = "ALGO_SEGURO_123";

// 3. RUTAS Y WEBHOOKS

// VALIDACIÓN: Respuesta al saludo de Meta
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook validado correctamente por Meta');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// HISTORIAL: Obtener mensajes de la DB
app.get('/historial', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: "No pude cargar el historial" });
    }
});

// CONTACTOS: Obtener lista de números únicos
app.get('/contactos', async (req, res) => {
    try {
        // Esta consulta busca los teléfonos únicos pero los ordena 
        // basándose en la fecha (timestamp) del último mensaje de cada uno
        const query = `
            SELECT telefono, MAX(created_at) as ultima_fecha
            FROM messages
            GROUP BY telefono
            ORDER BY ultima_fecha DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener contactos" });
    }
});

// RECEPCIÓN: Aquí llegan los mensajes de los clientes desde Meta
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object) {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message) {
            const telefono = message.from;

                        // --- LÓGICA PARA DETECTAR RESPUESTA DE ENCUESTA (FLOWS) ---
                    // Dentro de app.post('/webhook'...)
            // Dentro de app.post('/webhook'...) en la parte de nfm_reply
            if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
                try {
                    const response = JSON.parse(message.interactive.nfm_reply.response_json);
                    const de = message.from;

                    console.log(`📊 Limpiando y guardando encuesta de: ${de}`);

                    // Función interna para quitar el "0_", "1_", etc.
                    const limpiarRespuesta = (valor) => {
                        if (!valor) return "No responde";
                        // Si tiene un guion bajo, toma lo que está después del primero
                        return valor.includes('_') ? valor.split('_')[1] : valor;
                    };

                    const query = `
                        INSERT INTO surveys (
                            telefono, nombre_huesped, habitacion, servicio_reserva, 
                            aseo_habitacion, limpieza_areas, alimentos_bebidas,
                            carta_opinion, carta_sugerencia, amabilidad_personal, 
                            volveria_hospedarse, sugerencias_finales
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    `;

                    const values = [
                        de,
                        response.screen_0_Nombres_y_Apellidos_1,
                        response.screen_0_N_de_Habitacin_2,
                        limpiarRespuesta(response.screen_0_Servicio_en_Reservacin_3),
                        limpiarRespuesta(response.screen_0_Aseo_de_las_habitaciones_4),
                        limpiarRespuesta(response.screen_0_Limpieza_de_reas_comunes_5),
                        limpiarRespuesta(response.screen_0_Servicio_alimentos_y_bebidas_6),
                        limpiarRespuesta(response.screen_1_Nuestra_carta_es_opcional_0),
                        response.screen_1_Carta_opcional_1, // Este es TextArea, no necesita split
                        limpiarRespuesta(response.screen_1_Amabilidad_del_personal_2),
                        limpiarRespuesta(response.screen_1_Volvera_a_hospedarse_3),
                        response.screen_1_Sugerencias_4    // Este es TextArea
                    ];

                    await pool.query(query, values);
                    
                    console.log("✅ Encuesta guardada con datos limpios.");
                    await whatsappService.enviarTexto(de, "✅ ¡Gracias! Hemos recibido tu encuesta. Tu opinión es muy importante para el Hotel del Llano.");

                } catch (err) {
                    console.error("❌ Error al procesar Flow:", err);
                }
            }
            
            // --- LÓGICA NORMAL DE MENSAJES DE TEXTO ---
            else if (message.text) {
                const texto = message.text.body;
                await pool.query(
                    'INSERT INTO messages (direction, body, telefono) VALUES ($1, $2, $3)', 
                    ['incoming', texto, telefono]
                );
                io.emit('mensaje_nuevo', { direccion: 'entrante', texto: texto, de: telefono });
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// Ruta para obtener las estadísticas de las encuestas
app.get('/api/stats-encuestas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                servicio_reserva, 
                aseo_habitacion, 
                limpieza_areas, 
                alimentos_bebidas,
                carta_opinion,
                amabilidad_personal,
                habitacion,
                nombre_huesped,
                sugerencias_finales,
                volveria_hospedarse
            FROM surveys 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error en /api/stats-encuestas:", err);
        res.status(500).json({ error: "Error al obtener datos" });
    }
});


const XLSX = require('xlsx');

app.get('/api/exportar-encuestas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                created_at AS "Fecha",
                nombre_huesped AS "Huésped",
                habitacion AS "Habitación",
                servicio_reserva AS "Servicio Reserva",
                aseo_habitacion AS "Aseo Habitación",
                limpieza_areas AS "Limpieza Áreas",
                alimentos_bebidas AS "Alimentos y Bebidas",
                amabilidad_personal AS "Amabilidad",
                volveria_hospedarse AS "Volvería",
                sugerencias_finales AS "Sugerencias"
            FROM surveys 
            ORDER BY created_at DESC
        `);

        // Convertimos los datos a una hoja de Excel
        const worksheet = XLSX.utils.json_to_sheet(result.rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Encuestas");

        // Ajustar el ancho de las columnas automáticamente (opcional pero recomendado)
        worksheet['!cols'] = [
            { wch: 20 }, { wch: 25 }, { wch: 10 }, { wch: 15 }, 
            { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, 
            { wch: 10 }, { wch: 50 }
        ];

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="Reporte_Encuestas_Hotel_Llano.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (err) {
        console.error("Error al exportar:", err);
        res.status(500).send("Error al generar el Excel");
    }
});

// 4. SERVIR LA INTERFAZ WEB
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 5. EVENTOS DE SOCKET.IO
io.on('connection', (socket) => {
    console.log('👤 Recepcionista conectado a la interfaz web');

    socket.on('enviar_a_whatsapp', async (data) => {
        try {
            // USAMOS EL SERVICIO MODULAR PARA ENVIAR
            await whatsappService.enviarTexto(data.a, data.texto);

            // GUARDAMOS EN LA DB
            await pool.query(
                'INSERT INTO messages (direction, body, telefono) VALUES ($1, $2, $3)', 
                ['outgoing', data.texto, data.a]
            );

            // Emitir de vuelta para mostrarlo en pantalla
            io.emit('mensaje_nuevo', { direccion: 'saliente', texto: data.texto });
            console.log("🚀 Mensaje enviado y guardado");
        } catch (error) {
            console.error("❌ Error en el proceso de envío:", error.message);
        }
    });
});


const cron = require('node-cron');

/// Programado para las 9:40 AM hora de Colombia
cron.schedule('0 23 * * *', async () => {
    console.log('⏰ [CRON] Iniciando limpieza automática de reservas antiguas (9:40 AM)...');
    try {
        const hoy = new Date().toISOString().split('T')[0];
        
        const query = 'DELETE FROM reservations WHERE fsalid_reh < $1';
        const resultado = await pool.query(query, [hoy]);
        
        if (resultado.rowCount > 0) {
            console.log(`🧹 [CRON] ÉXITO: Se eliminaron ${resultado.rowCount} reservas antiguas.`);
        } else {
            console.log('✅ [CRON] Sin reservas antiguas para borrar.');
        }
    } catch (err) {
        console.error('❌ [CRON] Error en la ejecución:', err.message);
    }
}, {
    scheduled: true,
    timezone: "America/Bogota"
});


// 6. ENCENDIDO (Configurado para Railway)
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log('--- SISTEMA HOTEL DEL LLANO ONLINE ---');
    console.log(`Servidor corriendo en el puerto ${PORT}...`);
});