const { Pool } = require('pg');

const isProduction = process.env.DATABASE_URL ? true : false;

const pool = new Pool({
    // Si hay DATABASE_URL (Railway), la usa. Si no, usa tus datos locales.
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:qzpm@localhost:5432/hotel_llano_local',
    ssl: isProduction ? { rejectUnauthorized: false } : false 
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error en DB:', err.message);
    } else {
        console.log('✅ Base de datos conectada (Modo: ' + (isProduction ? 'Producción' : 'Local') + ')');
    }
});

module.exports = pool;