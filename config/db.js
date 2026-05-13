const { Pool } = require('pg');

// Railway usa la variable de entorno DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Obligatorio para conexiones seguras en la nube
    }
});

// Probamos la conexión al iniciar
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error conectando a la base de datos desde el módulo DB:', err.message);
    } else {
        console.log('✅ Módulo DB conectado correctamente a Railway');
    }
});

module.exports = pool;