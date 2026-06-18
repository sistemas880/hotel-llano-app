/**
 * Guardián de Autenticación Front-End - Hotel del Llano
 * Verifica que el cliente tenga una sesión JWT activa antes de procesar el resto de scripts.
 */
(async function verificarSesion() {
    try {
        const respuesta = await fetch('/api/auth/verify');
        if (!respuesta.ok) {
            // Si el token es inválido, expiró o no existe, redirige inmediatamente
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error("Error crítico verificando credenciales:", error);
        window.location.href = '/login.html';
    }
})();