const axios = require('axios');

// Configuraciones de Meta (Lo ideal es que luego estas vayan al archivo .env)
const TOKEN = "EAANXnxOurKkBRCIGKidt17wbGWaZB4avHYrnZCSLKKO76b1FytOaJByUpj4YVqv9pyFxGYPNtyjVqru9RhRyBL3XCEnOZBB3ymryYONgo4I2ubZCL1IZCEsETVkw3bv3MGqOqZACYR8ZBKNBMHBkmuaZAejOZAuTf31eC28tAaqShD2ZCstspljmGdgpqqmJZAK4wZDZD";
const PHONE_ID = "973694502502248";
const VERSION = "v22.0"; // Versión de la API de Meta

const whatsappService = {
    
    /**
     * Envía mensajes de texto libre (Chat en vivo)
     */
    async enviarTexto(to, text) {
        try {
            // Limpiamos el teléfono: solo números
            const cleanNumber = String(to).replace(/\D/g, '');
            
            await axios.post(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: cleanNumber,
                type: "text",
                text: { body: text }
            }, { 
                headers: { Authorization: `Bearer ${TOKEN}` } 
            });
            
            return true;
        } catch (error) {
            console.error("❌ Error enviando texto:", error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Envía plantillas oficiales (Bienvenida, Encuestas, etc.)
     */
    async enviarPlantilla(to, templateName, components) {
        try {
            // Limpiamos el teléfono por si llega con el "+"
            const cleanNumber = String(to).replace(/\D/g, '');

            await axios.post(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`, {
                messaging_product: "whatsapp",
                to: cleanNumber,
                type: "template",
                template: {
                    name: templateName,
                    language: { 
                        code: "es_CO" // Asegúrate que en Meta sea es_CO y no es
                    },
                    components: components
                }
            }, { 
                headers: { Authorization: `Bearer ${TOKEN}` } 
            });

            return true;
        } catch (error) {
            console.error("❌ Error enviando plantilla:", error.response?.data || error.message);
            throw error;
        }
    }
};

module.exports = whatsappService;