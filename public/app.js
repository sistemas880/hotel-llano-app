// ==========================================================================
// CONFIGURACIONES INICIALES Y SOCKETS
// ==========================================================================
const socket = io();
let contactoSeleccionado = "";
let ordenAscendente = true;
let columnaActualOrdenada = null;
let charts = {};

if (Notification.permission !== "granted") {
    Notification.requestPermission();
}

// Inicialización de la ventana
window.onload = () => {
    cargarReservas();
    cargarContactos();
};

// Enviar mensajes con la tecla Enter
document.getElementById('mensajeInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviarMensaje();
});

// ==========================================================================
// MÓDULO: CHAT EN VIVO Y CONTACTOS
// ==========================================================================
async function cargarContactos() {
    try {
        const res = await fetch('/contactos');
        const contactos = await res.json();
        const lista = document.getElementById('listaContactos');
        if(!lista) return;

        lista.innerHTML = '';
        
        contactos.forEach(c => {
            const item = document.createElement('div');
            const tienePendientes = c.sin_leer > 0;
            const claseUnread = tienePendientes ? 'bg-light unread-chat' : '';
            
            item.className = `list-group-item list-group-item-action contact-item p-3 border-0 border-bottom ${claseUnread}`;
            
            let fechaMostrar = '';
            if (c.ultima_fecha) {
                const fechaMsg = new Date(c.ultima_fecha);
                const hoy = new Date();
                const ayer = new Date();
                ayer.setDate(hoy.getDate() - 1);
                const opcionesHora = { hour: '2-digit', minute: '2-digit', hour12: false };

                if (fechaMsg.toDateString() === hoy.toDateString()) {
                    fechaMostrar = fechaMsg.toLocaleTimeString([], opcionesHora);
                } else if (fechaMsg.toDateString() === ayer.toDateString()) {
                    fechaMostrar = 'Ayer';
                } else {
                    fechaMostrar = `${fechaMsg.getDate()}/${fechaMsg.getMonth() + 1}`;
                }
            }

            item.innerHTML = `
                <div class="d-flex align-items-center justify-content-between w-100">
                    <div class="d-flex align-items-center">
                        <div class="position-relative">
                            <div class="rounded-circle bg-success text-white p-2 me-3" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-person-fill"></i>
                            </div>
                            ${tienePendientes ? '<span class="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle" style="width: 12px; height: 12px;"></span>' : ''}
                        </div>
                        <div>
                            <h6 class="mb-0 ${tienePendientes ? 'fw-bold text-dark' : ''}">${c.telefono}</h6>
                            <small class="${tienePendientes ? 'text-success fw-bold' : 'text-muted'}">
                                ${tienePendientes ? 'Nuevo mensaje...' : 'Ver conversación'}
                            </small>
                        </div>
                    </div>
                    <div class="text-end">
                        <small class="${tienePendientes ? 'text-success fw-bold' : 'text-muted'} fw-lighter" style="font-size: 0.75rem;">${fechaMostrar}</small>
                    </div>
                </div>
            `;

            item.onclick = async () => {
                contactoSeleccionado = c.telefono;
                if (tienePendientes) {
                    try {
                        await fetch(`/api/leer-mensajes/${c.telefono}`, { method: 'POST' });
                        cargarContactos(); 
                    } catch (e) { console.error("Error al marcar como leído"); }
                }
                cargarChat(c.telefono);
                document.querySelectorAll('.contact-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            };

            lista.appendChild(item);
        });
    } catch (err) {
        console.error("Error cargando contactos:", err);
    }
}

async function cargarChat(telefono) {
    const res = await fetch('/historial');
    const todos = await res.json();
    const area = document.getElementById('mensajes');
    
    const filtrados = todos.filter(m => m.telefono === telefono);
    
    area.innerHTML = ''; 
    filtrados.forEach(m => {
        const div = document.createElement('div');
        const clase = m.direction === 'incoming' ? 'incoming' : 'outgoing';
        div.className = `message shadow-sm ${clase} position-relative`;
        
        const horaLimpia = formatearHora(m.created_at);

        div.innerHTML = `
            <div class="pe-4" style="word-break: break-word;">${m.body}</div>
            <span class="text-muted position-absolute" style="font-size: 0.65rem; bottom: 3px; right: 9px; opacity: 0.7;">
                ${horaLimpia}
            </span>
        `;
        area.appendChild(div);
    });
    area.scrollTop = area.scrollHeight;
}

async function enviarMensaje() {
    const input = document.getElementById('mensajeInput');
    const texto = input.value.trim();

    if (!contactoSeleccionado) {
        alert("Por favor, selecciona un chat de la lista izquierda primero.");
        return;
    }
    if (!texto) return;

    socket.emit('enviar_a_whatsapp', { a: contactoSeleccionado, texto: texto });
    input.value = '';
}

// ==========================================================================
// MÓDULO: GESTIÓN DE RESERVAS
// ==========================================================================
async function cargarReservas() {
    try {
        const res = await fetch('/api/reservas');
        const reservas = await res.json();
        const tbody = document.getElementById('tablaReservas');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        reservas.forEach(r => {
            const fechaLlegada = r.fllega_reh.split('T')[0].split('-').reverse().join('/');
            const fechaSalida = r.fsalid_reh.split('T')[0].split('-').reverse().join('/');

            const btnBienvenidaClase = r.welcome_sent ? 'btn-outline-secondary disabled' : 'btn-success';
            const btnBienvenidaTexto = r.welcome_sent ? '<i class="bi bi-check2-all"></i> Enviado' : '<i class="bi bi-whatsapp"></i> Bienvenida';
            
            const btnEncuestaClase = r.survey_sent ? 'btn-outline-secondary disabled' : 'btn-info text-white';
            const btnEncuestaTexto = r.survey_sent ? '<i class="bi bi-check-lg"></i> Enviado' : '<i class="bi bi-star-fill"></i> Encuesta';

            const tieneTelefono = r.telef_res && r.telef_res.trim() !== '' && r.telef_res !== '000';
            const displayTelefono = tieneTelefono ? `<span>${r.telef_res}</span>` : `<span class="text-danger small"><i class="bi bi-exclamation-triangle"></i> Sin número</span>`;
            
            const btnEditarTel = `
                <button class="btn btn-sm ${tieneTelefono ? 'btn-link text-primary' : 'btn-warning'} p-0 ms-2" 
                        onclick="solicitarNuevoTel(${r.id}, '${r.telef_res || ''}')">
                    <i class="bi ${tieneTelefono ? 'bi-pencil-square' : 'bi-plus-circle-fill'}"></i>
                </button>`;

            tbody.innerHTML += `
                <tr>
                    <td class="align-middle"><span class="badge bg-light text-dark border">${r.nreser_res}</span></td>
                    <td class="align-middle">
                        <div class="d-flex align-items-center justify-content-between">
                            <strong id="nombre-display-${r.id}">${r.nombre_res}</strong>
                            <button class="btn btn-sm btn-link text-primary p-0 ms-2" onclick="solicitarNuevoNombre(${r.id}, '${r.nombre_res}')">
                                <i class="bi bi-pencil-square"></i>
                            </button>
                        </div>
                    </td>
                    <td class="align-middle">${fechaLlegada}</td>
                    <td class="align-middle">
                        <div class="d-flex align-items-center justify-content-between">
                            <span id="salida-display-${r.id}">${fechaSalida}</span>
                            <button class="btn btn-sm btn-link text-primary p-0 ms-2" onclick="solicitarNuevaFechaSalida(${r.id}, '${r.fsalid_reh.split('T')[0]}')">
                                <i class="bi bi-pencil-square"></i>
                            </button>
                        </div>
                    </td>                    
                    <td class="align-middle"><div class="d-flex align-items-center justify-content-between">${displayTelefono} ${btnEditarTel}</div></td>
                    <td class="text-center">
                        <div class="btn-group">
                            <button class="btn btn-sm ${btnBienvenidaClase}" onclick="${r.welcome_sent || !tieneTelefono ? '' : `enviarBienvenida('${r.nreser_res}', '${r.telef_res}', '${r.nombre_res}')`}" ${!tieneTelefono ? 'disabled' : ''}>${btnBienvenidaTexto}</button>
                            <button class="btn btn-sm ${btnEncuestaClase}" onclick="${r.survey_sent || !tieneTelefono ? '' : `enviarEncuesta('${r.nreser_res}', '${r.telef_res}', '${r.nombre_res}')`}" ${!tieneTelefono ? 'disabled' : ''}>${btnEncuestaTexto}</button>
                        </div>
                    </td>
                </tr>`;
        });
        aplicarOrdenamientoVisual();
    } catch (err) { console.error("Error cargando reservas:", err); }
}

// Formulario Manual (Walk-in)
document.getElementById('formManual').onsubmit = async (e) => {
    e.preventDefault();
    const datos = {
        nombre: document.getElementById('m_nombre').value,
        telefono: document.getElementById('m_telefono').value,
        llegada: document.getElementById('m_llegada').value,
        salida: document.getElementById('m_salida').value
    };

    try {
        const res = await fetch('/api/reservas/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (res.ok) {
            alert("✅ Huésped registrado con éxito");
            const modalElement = document.getElementById('modalManual');
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) modal.hide();
            
            const cortinaGris = document.querySelector('.modal-backdrop');
            if (cortinaGris) cortinaGris.remove(); 
            
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';

            document.getElementById('formManual').reset();
            cargarReservas(); 
        }
    } catch (err) { console.error("Error:", err); }
};

// ==========================================================================
// ACCIONES DE EDICIÓN (PROMPTS)
// ==========================================================================
async function solicitarNuevaFechaSalida(id, fechaActual) {
    const nuevaFecha = prompt("Introduce la nueva fecha de salida (Formato: AAAA-MM-DD):", fechaActual);
    if (!nuevaFecha || !/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) return alert("Formato inválido.");

    try {
        const response = await fetch(`/api/reservas/${id}/fecha-salida`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha_salida: nuevaFecha })
        });
        if (response.ok) { alert("Fecha actualizada"); cargarReservas(); }
    } catch (err) { console.error(err); }
}

async function solicitarNuevoNombre(id, nombreActual) {
    const nuevoNom = prompt("Ingrese el nombre real:", nombreActual);
    if (nuevoNom && nuevoNom.trim() !== "" && nuevoNom !== nombreActual) {
        const respuesta = await fetch(`/api/reservas/${id}/nombre`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevoNombre: nuevoNom.trim() })
        });
        if (respuesta.ok) { alert("Nombre actualizado"); cargarReservas(); }
    }
}

async function solicitarNuevoTel(id, telActual) {
    const nuevoTel = prompt("Ingrese el número corregido:", telActual);
    if (nuevoTel && nuevoTel !== telActual) {
        const respuesta = await fetch(`/api/reservas/${id}/telefono`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevoTelefono: nuevoTel })
        });
        if (respuesta.ok) { alert("Teléfono actualizado"); cargarReservas(); }
    }
}

// ==========================================================================
// ENVIAR ACCIONES (TEMPLATE DE WHATSAPP)
// ==========================================================================
async function enviarBienvenida(idReserva, telefono, nombre) {
    if (!confirm(`¿Deseas enviar la bienvenida oficial a ${nombre}?`)) return;
    const res = await fetch('/api/reservas/enviar-bienvenida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nreser_res: idReserva, telefono: telefono, nombre: nombre })
    });
    const data = await res.json();
    if (data.success) { alert("🚀 Enviado con éxito!"); cargarReservas(); }
}

async function enviarEncuesta(idReserva, telefono, nombre) {
    if (!confirm(`¿Enviar encuesta a ${nombre}?`)) return;
    const res = await fetch('/api/reservas/enviar-encuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nreser_res: idReserva, telefono: telefono, nombre: nombre })
    });
    const data = await res.json();
    if (data.success) { alert("📊 Encuesta enviada!"); cargarReservas(); }
}

// ==========================================================================
// NOTIFICACIONES, FILTROS Y ORDENAMIENTO
// ==========================================================================
async function verificarNotificacionesGlobales() {
    try {
        const response = await fetch('/api/reservas/notificaciones/pendientes');
        const data = await response.json();
        const indicador = document.getElementById('alerta-global-chat');
        if (indicador) data.hayPendientes ? indicador.classList.remove('d-none') : indicador.classList.add('d-none');
    } catch (err) { console.error(err); }
}
setInterval(verificarNotificacionesGlobales, 5000);

function ordenarTablaPorFecha(columna) {
    ordenAscendente = !ordenAscendente;
    columnaActualOrdenada = columna;
    aplicarOrdenamientoVisual();
}

function aplicarOrdenamientoVisual() {
    if (!columnaActualOrdenada) return;
    const tbody = document.getElementById('tablaReservas');
    const filas = Array.from(tbody.querySelectorAll('tr'));

    filas.sort((a, b) => {
        const indice = (columnaActualOrdenada === 'fllega_reh') ? 2 : 3;
        const fechaA = reconstruirFecha(a.cells[indice].innerText);
        const fechaB = reconstruirFecha(b.cells[indice].innerText);
        return ordenAscendente ? fechaA - fechaB : fechaB - fechaA;
    });

    tbody.innerHTML = '';
    filas.forEach(fila => tbody.appendChild(fila));
}

// ==========================================================================
// DASHBOARD Y ESTADÍSTICAS (CHART.JS)
// ==========================================================================
async function cargarDashboard() {
    try {
        const res = await fetch('/api/stats-encuestas');
        const datos = await res.json();
        
        const renderChart = (id, columna) => {
            const counts = {};
            datos.forEach(d => { const val = d[columna] || 'N/A'; counts[val] = (counts[val] || 0) + 1; });
            if (charts[id]) charts[id].destroy();
            
            charts[id] = new Chart(document.getElementById(id), {
                type: 'doughnut',
                data: {
                    labels: Object.keys(counts),
                    datasets: [{ data: Object.values(counts), backgroundColor: ['#198754', '#ffc107', '#fd7e14', '#dc3545'] }]
                },
                options: { maintainAspectRatio: false }
            });
        };

        renderChart('chartReservas', 'servicio_reserva');
        renderChart('chartAseo', 'aseo_habitacion');
        renderChart('chartLimpieza', 'limpieza_areas');
        renderChart('chartAlimentos', 'alimentos_bebidas');
        renderChart('chartAmabilidad', 'amabilidad_personal');
        renderChart('chartCarta', 'carta_opinion');

        document.getElementById('listaSugerencias').innerHTML = datos.map(d => `
            <tr>
                <td><span class="badge bg-secondary">${d.habitacion || '---'}</span></td>
                <td>${d.nombre_huesped}</td>
                <td class="small text-muted">"${d.sugerencias_finales || 'Sin comentarios'}"</td>
                <td><span class="badge ${d.volveria_hospedarse === 'Si' ? 'bg-success' : 'bg-danger'}">${d.volveria_hospedarse}</span></td>
            </tr>
        `).join('');
    } catch (err) { console.error(err); }
}

// Auxiliares internos
function formatearHora(fechaISO) {
    if (!fechaISO) return '';
    const date = new Date(fechaISO);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function reconstruirFecha(fechaStr) {
    const [dia, mes, anio] = fechaStr.split('/').map(Number);
    return new Date(anio, mes - 1, dia);
}


// ==========================================================================
// 📡 ESCUCHAR EVENTOS EN TIEMPO REAL DESDE EL SERVIDOR (SOCKET.IO)
// ==========================================================================
socket.on('mensaje_nuevo', (datos) => {
    console.log("🔔 Socket recibido en frontend:", datos);

    // 1. Verificamos si el mensaje pertenece al chat que el recepcionista tiene abierto
    const esMismoChat = (datos.telefono === contactoSeleccionado || datos.de === contactoSeleccionado);
    
    // 2. Verificamos si es una respuesta saliente de la recepción
    const direccion = datos.direccion || datos.direction;
    const esMensajePropio = (direccion === 'saliente' || direccion === 'outgoing');

    // Si el chat del cliente está abierto en pantalla o es nuestro, lo pintamos ya mismo
    if (esMismoChat || esMensajePropio) {
        renderizarMensaje(datos);
    }
    
    // Movemos el contacto arriba en la lista izquierda
    cargarContactos();
});

// 🎨 FUNCIÓN PARA DIBUJAR EL MENSAJE EN PANTALLA EN TIEMPO REAL
function renderizarMensaje(datos) {
    const area = document.getElementById('mensajes');
    if (!area) return;

    // Quitamos el logo de WhatsApp del inicio si está puesto
    if (area.querySelector('.bi-whatsapp')) {
        area.innerHTML = '';
    }

    const div = document.createElement('div');
    const direccion = datos.direccion || datos.direction;
    const clase = (direccion === 'incoming' || direccion === 'entrante') ? 'incoming' : 'outgoing';
    
    div.className = `message shadow-sm ${clase} position-relative`;
    
    // Obtenemos el texto del mensaje
    const contenidoTexto = datos.texto || datos.body;
    
    // Ponemos la hora del minuto actual
    const ahora = new Date();
    const horaLimpia = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    div.innerHTML = `
        <div class="pe-4" style="word-break: break-word;">${contenidoTexto}</div>
        <span class="text-muted position-absolute" style="font-size: 0.65rem; bottom: 3px; right: 9px; opacity: 0.7;">
            ${horaLimpia}
        </span>
    `;
    
    area.appendChild(div);
    area.scrollTop = area.scrollHeight; // Scroll automático al fondo
}