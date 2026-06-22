require('dotenv').config();
// 1. IMPORTACIONES
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');          // 🔐 Seguridad para sesiones
const cookieParser = require('cookie-parser'); // 🔐 Lector de cookies seguras
const bcrypt = require('bcryptjs');

// IMPORTAR NUESTROS MÓDULOS MODULARES
const pool = require('./config/db');
const whatsappService = require('./services/whatsappService');
const reservasRoutes = require('./routes/reservas'); 

// 2. CONFIGURACIONES
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(cookieParser()); // 🔐 Habilitar el uso de cookies
app.use(express.static('public'));
app.use('/api/reservas', reservasRoutes); 

const VERIFY_TOKEN = "ALGO_SEGURO_123";
const JWT_SECRET = process.env.JWT_SECRET || "ClaveSecretaHotelDelLlano2024*"; // Firma de seguridad

// 🔐 MIDDLEWARE "GUARDIÁN": Detiene a cualquiera que no tenga sesión iniciada
const verificarTokenBackend = (req, res, next) => {
    const token = req.cookies?.session_token;

    if (!token) {
        return res.status(401).json({ error: "Acceso denegado. Inicie sesión." });
    }

    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        req.usuario = verificado;
        next(); 
    } catch (err) {
        res.clearCookie('session_token');
        return res.status(401).json({ error: "Sesión inválida o expirada." });
    }
};

// ==========================================================================
// 🔑 ENDPOINTS DE AUTENTICACIÓN (LOGIN, VERIFY, LOGOUT)
// ==========================================================================

// Procesar el formulario de login externo
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. Buscar al usuario en la tabla usuarios de PostgreSQL
        const resultado = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);

        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
        }

        const usuarioDB = resultado.rows[0];

        // 2. Comparar la contraseña ingresada con el hash encriptado de la DB
        const passwordCorrecto = await bcrypt.compare(password, usuarioDB.password);

        if (!passwordCorrecto) {
            return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
        }

        // 3. Si todo está bien, generar el Token JWT
        const token = jwt.sign({ user: usuarioDB.username, nombre: usuarioDB.nombre }, JWT_SECRET, { expiresIn: '24h' });

        // 4. Guardar en la cookie de sesión
        res.cookie('session_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 24 * 60 * 60 * 1000 
        });

        return res.json({ exito: true });

    } catch (err) {
        console.error("❌ Error en el proceso de login:", err.message);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
});

app.get('/api/auth/verify', (req, res) => {
    const token = req.cookies?.session_token;
    if (!token) return res.sendStatus(401);

    try {
        jwt.verify(token, JWT_SECRET);
        res.status(200).json({ valido: true });
    } catch (err) {
        res.sendStatus(401);
    }
});

// 🚪 ENDPOINT PARA CERRAR SESIÓN (DESTRUIR COOKIE)
// 🚪 ENDPOINT PARA CERRAR SESIÓN (DESTRUIR COOKIE)
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('session_token'); // Elimina la cookie de seguridad
    return res.json({ exito: true });
});

// ==========================================================================
// 3. RUTAS Y WEBHOOKS PROTEGIDOS
// ==========================================================================

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

app.get('/historial', verificarTokenBackend, async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: "No pude cargar el historial" });
    }
});

app.get('/contactos', verificarTokenBackend, async (req, res) => {
    try {
        // 1. Intentamos la consulta avanzada cruzando los últimos 10 dígitos de forma segura
        const queryAvanzada = `
            SELECT 
                m.telefono, 
                MAX(m.created_at) as ultima_fecha,
                COUNT(*) FILTER (WHERE m.leido = FALSE AND m.direction = 'incoming') as sin_leer,
                (
                    SELECT r.nombre_res 
                    FROM reservations r 
                    WHERE r.telef_res IS NOT NULL 
                      AND RIGHT(r.telef_res::text, 10) = RIGHT(m.telefono::text, 10) 
                    LIMIT 1
                ) as nombre
            FROM messages m
            GROUP BY m.telefono
            ORDER BY ultima_fecha DESC
        `;
        const result = await pool.query(queryAvanzada);
        return res.json(result.rows);
    } catch (err) {
        // 2. SISTEMA DE RESPALDO: Si la DB da error por tipos de datos, usa la consulta original para NO romper la pantalla
        console.error("⚠️ Alerta: La consulta de nombres falló, usando respaldo simple:", err.message);
        
        try {
            const queryRespaldo = `
                SELECT 
                    telefono, 
                    MAX(created_at) as ultima_fecha,
                    COUNT(*) FILTER (WHERE leido = FALSE AND direction = 'incoming') as sin_leer
                FROM messages
                GROUP BY telefono
                ORDER BY ultima_fecha DESC
            `;
            const resultRespaldo = await pool.query(queryRespaldo);
            return res.json(resultRespaldo.rows);
        } catch (err2) {
            return res.status(500).json({ error: "Error crítico en la base de datos" });
        }
    }
});

app.post('/api/leer-mensajes/:telefono', verificarTokenBackend, async (req, res) => {
    try {
        await pool.query(
            "UPDATE messages SET leido = TRUE WHERE telefono = $1 AND direction = 'incoming'",
            [req.params.telefono]
        );
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(500);
    }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object) {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message) {
            const telefono = message.from;

            if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
                try {
                    const response = JSON.parse(message.interactive.nfm_reply.response_json);
                    const de = message.from;
                    const limpiarRespuesta = (valor) => {
                        if (!valor) return "No responde";
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
                        de, response.screen_0_Nombres_y_Apellidos_1, response.screen_0_N_de_Habitacin_2,
                        limpiarRespuesta(response.screen_0_Servicio_en_Reservacin_3),
                        limpiarRespuesta(response.screen_0_Aseo_de_las_habitaciones_4),
                        limpiarRespuesta(response.screen_0_Limpieza_de_reas_comunes_5),
                        limpiarRespuesta(response.screen_0_Servicio_alimentos_y_bebidas_6),
                        limpiarRespuesta(response.screen_1_Nuestra_carta_es_opcional_0),
                        response.screen_1_Carta_opcional_1, limpiarRespuesta(response.screen_1_Amabilidad_del_personal_2),
                        limpiarRespuesta(response.screen_1_Volvera_a_hospedarse_3), response.screen_1_Sugerencias_4 
                    ];

                    await pool.query(query, values);
                    await whatsappService.enviarTexto(de, "✅ ¡Gracias! Hemos recibido tu encuesta.");
                } catch (err) { console.error(err); }
            } else if (message.text) {
                const texto = message.text.body;
                await pool.query('INSERT INTO messages (direction, body, telefono) VALUES ($1, $2, $3)', ['incoming', texto, telefono]);
                io.emit('mensaje_nuevo', { direccion: 'entrante', direction: 'incoming', texto: texto, body: texto, de: telefono, telefono: telefono });
            }
        }
        res.sendStatus(200);
    } else { res.sendStatus(404); }
});

app.get('/api/stats-encuestas', verificarTokenBackend, async (req, res) => {
    try {
        const { mes } = req.query;
        let query = `SELECT servicio_reserva, aseo_habitacion, limpieza_areas, alimentos_bebidas, carta_opinion, amabilidad_personal, habitacion, nombre_huesped, sugerencias_finales, volveria_hospedarse FROM surveys `;
        const params = [];
        if (mes) { query += ` WHERE TO_CHAR(created_at, 'YYYY-MM') = $1 `; params.push(mes); }
        query += ` ORDER BY created_at DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

const XLSX = require('xlsx');
app.get('/api/exportar-encuestas', verificarTokenBackend, async (req, res) => {
    try {
        const { mes } = req.query;
        let query = `SELECT created_at AS "Fecha", nombre_huesped AS "Huésped", habitacion AS "Habitación", servicio_reserva AS "Servicio Reserva", aseo_habitacion AS "Aseo Habitación", limpieza_areas AS "Limpieza Áreas", alimentos_bebidas AS "Alimentos y Bebidas", amabilidad_personal AS "Amabilidad", volveria_hospedarse AS "Volvería", sugerencias_finales AS "Sugerencias" FROM surveys `;
        const params = [];
        if (mes) { query += ` WHERE TO_CHAR(created_at, 'YYYY-MM') = $1 `; params.push(mes); }
        query += ` ORDER BY created_at DESC`;
        const result = await pool.query(query, params);
        const worksheet = XLSX.utils.json_to_sheet(result.rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Encuestas");
        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="Reporte_Encuestas_Hotel_Llano.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) { res.status(500).send("Error"); }
});

// ==========================================================================
// 4. SERVIR LA INTERFAZ WEB CON FILTRO INTERNO 🔒
// ==========================================================================
app.get('/', (req, res) => {
    const token = req.cookies?.session_token;
    
    // Si no tiene la cookie del token iniciada, lo saca volando a login.html
    if (!token) {
        return res.redirect('/login.html');
    }
    try {
        jwt.verify(token, JWT_SECRET);
        // Si el token es correcto, le muestra el panel
        res.sendFile(__dirname + '/index.html'); 
    } catch (err) {
        res.clearCookie('session_token');
        res.redirect('/login.html');
    }
});

// ==========================================================================
// 5. CONFIGURACIÓN DE SOCKET.IO
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`🔌 Recepción conectada al panel (ID: ${socket.id})`);
    socket.on('enviar_a_whatsapp', async (data) => {
        try {
            await whatsappService.enviarTexto(data.a, data.texto);
            await pool.query('INSERT INTO messages (direction, body, telefono) VALUES ($1, $2, $3)', ['outgoing', data.texto, data.a]);
            io.emit('mensaje_nuevo', { direccion: 'saliente', direction: 'outgoing', texto: data.texto, body: data.texto, telefono: data.a });
        } catch (error) { socket.emit('error_envio', { mensaje: "Error" }); }
    });
    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('--- SISTEMA HOTEL DEL LLANO ONLINE CON LOGIN ---');
    console.log(`Servidor corriendo en el puerto ${PORT}...`);
});