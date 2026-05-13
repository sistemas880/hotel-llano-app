const XLSX = require('xlsx');
const pool = require('../config/db');
const moment = require('moment');

const excelService = {
    async procesarReservas(filePath) {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const data = XLSX.utils.sheet_to_json(worksheet, { 
                raw: false, 
                dateNF: 'mm/dd/yyyy' 
            });

            let nuevosRegistros = 0;

            for (const fila of data) {
                const nreser_res = fila['nreser_res'];
                const nombre_res = fila['nombre_res'];
                
                const fllega_reh = moment(fila['fllega_reh'], 'MM/DD/YY HH:mm').format('YYYY-MM-DD');
                const fsalid_reh = moment(fila['fsalid_reh'], 'MM/DD/YY HH:mm').format('YYYY-MM-DD');
                
                // Si hay teléfono, limpiamos caracteres; si no, dejamos null
                const telef_res = fila['telef_res'] ? String(fila['telef_res']).replace(/\D/g, '') : null;

                // --- CAMBIO AQUÍ: Eliminamos !telef_res de la validación ---
                // Ahora solo se salta la fila si falta el número de reserva o la fecha es inválida
                if (!nreser_res || fllega_reh === 'Invalid date') continue;

                const query = `
                    INSERT INTO reservations 
                    (nreser_res, nombre_res, fllega_reh, fsalid_reh, telef_res)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (nreser_res) DO UPDATE 
                    SET telef_res = EXCLUDED.telef_res -- Opcional: actualiza el teléfono si la reserva ya existía
                    WHERE reservations.telef_res IS NULL OR reservations.telef_res = ''
                `;
                
                const values = [nreser_res, nombre_res, fllega_reh, fsalid_reh, telef_res];
                const result = await pool.query(query, values);
                
                if (result.rowCount > 0) nuevosRegistros++;
            }

            return nuevosRegistros;

        } catch (error) {
            console.error("❌ Error en excelService:", error.message);
            throw error;
        }
    }
};

module.exports = excelService;