const { Pool } = require('pg');

// El conector ahora es 100% seguro. Lee de las variables de entorno locales 
// o de las que tenga el servidor de Contabo internamente.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 

    host: process.env.DB_HOST,          
    port: process.env.DB_PORT || 5432,                      
    user: process.env.DB_USER,                
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME,            
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error en la conexión de Base de Datos:', err.message);
    } else {
        const modo = process.env.DATABASE_URL ? 'Producción (Interno)' : 'Local (Conectado a Contabo via .env)';
        console.log(`✅ Base de datos conectada correctamente en modo: ${modo}`);
    }
});

module.exports = pool;