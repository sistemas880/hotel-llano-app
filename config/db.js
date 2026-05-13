const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'hotel_llano_local',
    password: 'qzpm', 
    port: 5432,
});

// Probamos la conexión al iniciar
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error conectando a la base de datos:', err.stack);
    } else {
        console.log('✅ Base de datos conectada correctamente');
    }
});

module.exports = pool;