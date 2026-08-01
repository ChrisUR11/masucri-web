// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, collection, addDoc, onSnapshot, query, orderBy, limit, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 2. CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD_p1cLfHMoSugrfPrCJPuHJKEMIH7AvV8",
    authDomain: "masucri-65fed.firebaseapp.com",
    projectId: "masucri-65fed",
    storageBucket: "masucri-65fed.firebasestorage.app",
    messagingSenderId: "822954372342",
    appId: "1:822954372342:web:58f8d9b6181c66ce4190d7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ACTIVAR MODO OFFLINE (Caché local)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') console.log("Múltiples pestañas abiertas, persistencia falló");
    else if (err.code == 'unimplemented') console.log("Navegador no soporta persistencia");
});

const CORREOS_PERMITIDOS = ["ulloarodriguezchris@gmail.com", "anisrmj5@gmail.com"];

const Estado = {
    movimientos: [],
    pedidos: [],
    datosParaExportar: [],
    modales: { pedido: null, editarMov: null, detallePedido: null }
};

// ==========================================
// CLASE 1: UTILIDADES Y TICKETS
// ==========================================
class Utils {
    static obtenerFechaLocal() {
        const hoy = new Date();
        const tzOffset = hoy.getTimezoneOffset() * 60000;
        return new Date(hoy.getTime() - tzOffset).toISOString().split('T')[0];
    }
}

class TicketSystem {
    static async generar(ticketId, cliente, producto, precioTotal, deudaAnterior, abono, nuevoSaldo, estado, metodo) {
        const elConsecutivo = document.getElementById('tkt-consecutivo');
        if (elConsecutivo) elConsecutivo.textContent = ticketId;

        document.getElementById('tkt-fecha').textContent = Utils.obtenerFechaLocal();
        document.getElementById('tkt-cliente').textContent = cliente;
        document.getElementById('tkt-producto').textContent = producto;
        document.getElementById('tkt-precio-total').textContent = `₡${precioTotal.toLocaleString('es-CR')}`;
        document.getElementById('tkt-anterior').textContent = `₡${deudaAnterior.toLocaleString('es-CR')}`;
        document.getElementById('tkt-abono').textContent = `₡${abono.toLocaleString('es-CR')}`;
        document.getElementById('tkt-metodo').textContent = metodo;
        document.getElementById('tkt-saldo').textContent = `₡${nuevoSaldo.toLocaleString('es-CR')}`;

        const divEstado = document.getElementById('tkt-estado');
        divEstado.textContent = estado;
        divEstado.style.background = nuevoSaldo === 0 ? '#198754' : '#ffc107';
        divEstado.style.color = nuevoSaldo === 0 ? '#ffffff' : '#000000';

        try {
            const canvas = await html2canvas(document.getElementById('ticket-template'), { scale: 2, backgroundColor: '#ffffff' });
            canvas.toBlob(async (blob) => {
                const file = new File([blob], `Ticket_${cliente.replace(/\s+/g, '_')}.png`, { type: 'image/png' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try { await navigator.share({ files: [file], title: 'Comprobante MASUCRI' }); }
                    catch (err) { console.log("Compartir cancelado"); }
                } else {
                    const link = document.createElement('a'); link.download = file.name; link.href = URL.createObjectURL(blob); link.click();
                    const r = await Swal.fire({ title: 'Imagen Descargada', text: 'Tu navegador no soporta envío directo.', icon: 'info', confirmButtonText: 'Abrir WhatsApp Web', showCancelButton: true });
                    if (r.isConfirmed) window.open('https://web.whatsapp.com/', '_blank');
                }
            }, 'image/png');
        } catch (error) { Swal.fire('Error', 'No se pudo generar el recibo.', 'error'); }
    }
}

// ==========================================
// CLASE 2: GESTOR DE INTERFAZ Y NAVEGACIÓN
// ==========================================
class UIManager {
    static init() {
        this.vistas = {
            pedidos: document.getElementById('vista-pedidos'),
            historial: document.getElementById('vista-historial'),
            registro: document.getElementById('vista-registro'),
            reportes: document.getElementById('vista-reportes'),
            dashboard: document.getElementById('vista-dashboard')
        };
        this.navLinks = {
            pedidos: document.getElementById('nav-pedidos'), historial: document.getElementById('nav-historial'),
            registro: document.getElementById('nav-registro'), reportes: document.getElementById('nav-reportes'),
            dashboard: document.getElementById('nav-dashboard')
        };

        Object.keys(this.navLinks).forEach(key => {
            this.navLinks[key].addEventListener('click', (e) => { e.preventDefault(); this.cambiarVista(key); });
        });
    }

    static cambiarVista(vistaActiva) {
        Object.values(this.vistas).forEach(v => v.classList.remove('active'));
        Object.values(this.navLinks).forEach(n => n.classList.remove('active'));

        this.vistas[vistaActiva].classList.add('active');
        this.navLinks[vistaActiva].classList.add('active');

        if (vistaActiva === 'reportes') FinanzasSystem.renderizarReporte();
        if (vistaActiva === 'pedidos') PedidosSystem.renderizarPendientes();
        if (vistaActiva === 'historial') PedidosSystem.renderizarHistorial();
        if (vistaActiva === 'dashboard') DashboardSystem.renderizar();

        const navbarCollapse = document.getElementById('navbarNav');
        if (navbarCollapse.classList.contains('show')) document.querySelector('.navbar-toggler').click();
    }
}

// ==========================================
// CLASE 3: SISTEMA DE PEDIDOS (CON WHATSAPP Y LEALTAD)
// ==========================================
class PedidosSystem {
    static limiteHistorial = 50;
    static primeraCargaNotificaciones = true;

    static init() {
        onSnapshot(query(collection(db, "pedidos"), orderBy("fecha_entrega", "asc")), (snapshot) => {
            Estado.pedidos = [];
            snapshot.forEach(doc => Estado.pedidos.push({ id: doc.id, ...doc.data() }));
            this.actualizarCatalogo();
            this.renderizarPendientes();
            this.renderizarHistorial();
            if (UIManager.vistas.dashboard.classList.contains('active')) DashboardSystem.renderizar();

            if (this.primeraCargaNotificaciones) {
                this.analizarNotificaciones();
                this.primeraCargaNotificaciones = false;
            }
        }, (err) => { if (err.code === 'permission-denied') Swal.fire('Seguridad', 'Las reglas de Firebase bloquearon el acceso.', 'error'); });
    }

    // --- ALERTAS DE INICIO ---
    static analizarNotificaciones() {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        let atrasados = 0; let paraHoy = 0;

        Estado.pedidos.filter(p => p.estado === 'Pendiente').forEach(ped => {
            if (ped.fecha_entrega) {
                const diff = Math.ceil((new Date(ped.fecha_entrega + 'T00:00:00') - hoy) / 86400000);
                if (diff < 0) atrasados++;
                else if (diff === 0) paraHoy++;
            }
        });

        if (atrasados > 0 || paraHoy > 0) {
            const mensaje = `¡Hola! Tienes ${atrasados} pedido(s) atrasados y ${paraHoy} para entregar hoy.`;
            document.getElementById('toast-body-texto').textContent = mensaje;
            new bootstrap.Toast(document.getElementById('toast-notificacion'), { delay: 6000 }).show();

            if ("Notification" in window) {
                if (Notification.permission === "granted") {
                    new Notification("Trabajos Pendientes ⚠️", { body: mensaje, icon: "logo-masucri.png" });
                } else if (Notification.permission !== "denied") {
                    Notification.requestPermission().then(permission => {
                        if (permission === "granted") new Notification("Trabajos Pendientes ⚠️", { body: mensaje, icon: "logo-masucri.png" });
                    });
                }
            }
        }
    }

    // --- NUEVO: SISTEMA DE LEALTAD ---
    static verificarLealtad() {
        const tel = document.getElementById('ped-telefono').value.trim();
        const nom = document.getElementById('ped-cliente').value.trim().toLowerCase();

        // Si no ha escrito nada útil, no hacemos nada
        if (tel.length < 4 && nom.length < 3) return;

        let comprasHistoricas = 0;

        Estado.pedidos.forEach(p => {
            if (p.estado !== 'Cancelado') {
                // Buscamos por teléfono (prioridad) o por nombre
                if (tel && p.telefono && p.telefono.includes(tel)) {
                    comprasHistoricas++;
                } else if (!tel && nom && p.cliente && p.cliente.toLowerCase().includes(nom)) {
                    comprasHistoricas++;
                }
            }
        });

        // Si es su compra número 3 o más
        if (comprasHistoricas >= 3) {
            const msj = `¡Cliente Estrella! ⭐ ${document.getElementById('ped-cliente').value || 'Esta persona'} lleva ${comprasHistoricas} compras registradas en MASUCRI. ¿Qué tal si le ofreces un descuento o una regalía? 🎁`;
            document.getElementById('toast-body-texto').textContent = msj;

            const toastEl = document.getElementById('toast-notificacion');
            // Le ponemos un borde amarillo para que se vea diferente a una alerta normal
            toastEl.classList.add('border-warning', 'border-2');
            new bootstrap.Toast(toastEl, { delay: 6000 }).show();

            // Quitamos el borde amarillo después para no afectar otras alertas
            setTimeout(() => toastEl.classList.remove('border-warning', 'border-2'), 6000);
        }
    }

    // --- NUEVO: ENVIAR WHATSAPP AUTOMÁTICO ---
    static enviarWhatsApp(id, motivo) {
        const ped = Estado.pedidos.find(p => p.id === id);
        if (!ped || !ped.telefono) return;

        // Limpiar el teléfono para que a WhatsApp le guste
        let telLimpio = ped.telefono.replace(/[\s-]/g, '');
        if (telLimpio.length === 8) {
            telLimpio = '506' + telLimpio; // Código de Costa Rica por defecto
        }

        const deuda = (ped.precio || 0) - (ped.monto_pagado || 0);
        let texto = '';

        if (motivo === 'listo') {
            texto = `¡Hola ${ped.cliente}! Te escribo de MASUCRI. 🎨 Te aviso que tu pedido de "${ped.producto}" ya está listo para retirar. 🎉`;
            if (deuda > 0) texto += ` Queda un saldo pendiente de ₡${deuda.toLocaleString('es-CR')}.`;
            texto += ` ¡Te esperamos!`;
        } else if (motivo === 'cobro') {
            texto = `¡Hola ${ped.cliente}! Te escribo de MASUCRI. 🎨 Te recuerdo que tienes un saldo pendiente de ₡${deuda.toLocaleString('es-CR')} por tu pedido de "${ped.producto}". ¿Te quedaría bien realizar el pago por Sinpe Móvil hoy?`;
        }

        // Abrir la app o la web de WhatsApp
        const url = `https://wa.me/${telLimpio}?text=${encodeURIComponent(texto)}`;
        window.open(url, '_blank');
    }

    static actualizarCatalogo() {
        const listaHtml = document.getElementById('catalogo-productos');
        if (!listaHtml) return;
        const productosUnicos = [...new Set(Estado.pedidos.map(p => p.producto ? p.producto.trim() : ''))].filter(p => p !== '');
        listaHtml.innerHTML = productosUnicos.map(prod => `<option value="${prod}">`).join('');
    }

    static renderizarPendientes() {
        if (!UIManager.vistas.pedidos.classList.contains('active')) return;
        let pendientes = Estado.pedidos.filter(p => p.estado === 'Pendiente');

        const fTexto = document.getElementById('filtro-pedido-texto').value.toLowerCase();
        const fSol = document.getElementById('filtro-pedido-solicitud').value;
        const fEnt = document.getElementById('filtro-pedido-entrega').value;

        if (fTexto) pendientes = pendientes.filter(p => p.cliente.toLowerCase().includes(fTexto) || p.producto.toLowerCase().includes(fTexto));
        if (fSol) pendientes = pendientes.filter(p => p.fecha_solicitud >= fSol);
        if (fEnt) pendientes = pendientes.filter(p => p.fecha_entrega && p.fecha_entrega <= fEnt);

        const tbody = document.getElementById('tabla-pedidos');
        let html = ''; const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

        pendientes.forEach(ped => {
            let bClass = '', txtPrio = '';
            if (!ped.fecha_entrega) { bClass = 'bg-secondary'; txtPrio = 'Sin Fecha'; }
            else {
                const diff = Math.ceil((new Date(ped.fecha_entrega + 'T00:00:00') - hoy) / 86400000);
                if (diff < 0) { bClass = 'bg-danger'; txtPrio = 'Atrasado'; }
                else if (diff === 0) { bClass = 'bg-danger'; txtPrio = 'Para Hoy'; }
                else if (diff <= 2) { bClass = 'bg-warning text-dark'; txtPrio = 'Alta'; }
                else if (diff <= 5) { bClass = 'bg-info text-dark'; txtPrio = 'Media'; }
                else { bClass = 'bg-success'; txtPrio = 'Baja'; }
            }

            html += `<tr>
                <td class="align-middle"><span class="badge ${bClass} w-100">${txtPrio}</span></td>
                <td class="align-middle small"><span class="text-muted d-block">S: ${ped.fecha_solicitud}</span><strong class="d-block">E: ${ped.fecha_entrega || 'N/A'}</strong></td>
                <td class="align-middle fw-bold">${ped.cliente}</td>
                <td class="align-middle text-truncate" style="max-width: 100px;">${ped.producto}</td>
                <td class="align-middle text-center"><button class="btn btn-sm btn-primary rounded-pill px-3" onclick="PedidosSystem.abrirDetallePedido('${ped.id}')"><i class="fas fa-search"></i> Ver</button></td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="5" class="text-center py-4">No hay pedidos pendientes.</td></tr>';
    }

    static renderizarHistorial() {
        if (!UIManager.vistas.historial.classList.contains('active')) return;

        let historial = Estado.pedidos.filter(p => p.estado !== 'Pendiente').sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));
        const filtro = document.getElementById('filtro-historial').value;

        if (filtro === 'con_saldo') historial = historial.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) > 0);
        else if (filtro === 'entregados') historial = historial.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) <= 0);
        else if (filtro === 'anulados') historial = historial.filter(p => p.estado === 'Cancelado');

        const totalHistorial = historial.length;
        const historialCortado = historial.slice(0, this.limiteHistorial);

        const tbody = document.getElementById('tabla-historial');
        let html = '';

        historialCortado.forEach(ped => {
            let bColor = ped.estado === 'Entregado' ? 'bg-success' : 'bg-danger';
            let txtEst = ped.estado;
            const deuda = (ped.precio || 0) - (ped.monto_pagado || 0);

            if (ped.estado === 'Entregado' && deuda > 0) {
                bColor = 'bg-warning text-dark';
                txtEst = 'Con Saldo';
            }

            html += `<tr>
                <td class="align-middle"><span class="badge ${bColor}">${txtEst}</span></td>
                <td class="align-middle fw-bold">${ped.cliente}</td>
                <td class="align-middle text-truncate" style="max-width: 120px;">${ped.producto}</td>
                <td class="align-middle text-center">
                    <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="PedidosSystem.abrirDetallePedido('${ped.id}')">
                        <i class="fas fa-search"></i> Ver
                    </button>
                </td>
            </tr>`;
        });

        if (totalHistorial > this.limiteHistorial) {
            html += `<tr><td colspan="4" class="text-center py-3"><button class="btn btn-sm btn-secondary" onclick="window.cargarMasHistorial()">👇 Cargar más antiguos (${totalHistorial - this.limiteHistorial} restantes)</button></td></tr>`;
        }
        tbody.innerHTML = html || `<tr><td colspan="4" class="text-center py-4 text-muted">No hay registros con la opción seleccionada.</td></tr>`;
    }

    static abrirDetallePedido(id) {
        const ped = Estado.pedidos.find(p => p.id === id); if (!ped) return;

        const deuda = (ped.precio || 0) - (ped.monto_pagado || 0);
        let bColor = 'secondary'; let txtEst = ped.estado;
        if (ped.estado === 'Pendiente') bColor = 'primary';
        else if (ped.estado === 'Entregado' && deuda <= 0) bColor = 'success';
        else if (ped.estado === 'Entregado' && deuda > 0) { bColor = 'warning text-dark'; txtEst = 'Entregado - Con Saldo'; }
        else if (ped.estado === 'Cancelado') bColor = 'danger';

        let pagosHtml = '';
        let histPagos = ped.historial_pagos || [];

        if (histPagos.length === 0 && (ped.monto_pagado || 0) > 0) {
            histPagos = [{ fecha: ped.fecha_solicitud || 'Inicial', monto: ped.monto_pagado, metodo: ped.ultimo_metodo_pago || 'Desconocido' }];
        }

        if (histPagos.length > 0) {
            pagosHtml = `<li class="list-group-item bg-light"><small class="fw-bold d-block mb-2 text-primary"><i class="fas fa-history"></i> Historial de Pagos</small>`;
            histPagos.forEach((p, idx) => {
                pagosHtml += `<div class="d-flex justify-content-between small border-bottom pb-1 mb-1">
                    <span>${idx + 1}. ${p.fecha} <span class="badge bg-secondary ms-1">${p.metodo}</span></span>
                    <span class="text-success fw-bold">₡${p.monto.toLocaleString('es-CR')}</span>
                </div>`;
            });
            pagosHtml += `</li>`;
        }

        const bodyHtml = `
            <div class="text-center py-3 bg-light border-bottom">
                <span class="badge bg-${bColor} fs-6 px-3 py-2">${txtEst}</span>
                ${ped.fecha_cierre ? `<p class="text-muted small mt-2 mb-0">Cerrado el: ${ped.fecha_cierre}</p>` : `<p class="text-muted small mt-2 mb-0">Entrega pautada: <strong>${ped.fecha_entrega || 'Sin fecha'}</strong></p>`}
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <small class="text-muted d-block">Cliente</small>
                    <span class="fw-bold fs-5">${ped.cliente}</span>
                    ${ped.telefono ? `<div class="mt-1"><a href="tel:${ped.telefono}" class="badge bg-success text-decoration-none fs-6"><i class="fas fa-phone"></i> ${ped.telefono}</a></div>` : ''}
                </li>
                <li class="list-group-item">
                    <small class="text-muted d-block">Producto</small>
                    <span class="fw-bold">${ped.producto}</span>
                    ${ped.descripcion ? `<p class="small text-muted mt-1 mb-0">${ped.descripcion}</p>` : ''}
                </li>
                <li class="list-group-item">
                    <div class="row text-center">
                        <div class="col-6 border-end">
                            <small class="text-muted d-block">Precio Total</small>
                            <span class="fw-bold">₡${(ped.precio || 0).toLocaleString('es-CR')}</span>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block">Total Pagado</small>
                            <span class="fw-bold text-success">₡${(ped.monto_pagado || 0).toLocaleString('es-CR')}</span>
                        </div>
                    </div>
                </li>
                ${pagosHtml}
                ${deuda > 0 ? `<li class="list-group-item text-center bg-warning text-dark fw-bold fs-5">Debe: ₡${deuda.toLocaleString('es-CR')}</li>` : ''}
                ${deuda < 0 ? `<li class="list-group-item text-center bg-success text-white fw-bold">Propina a favor: ₡${Math.abs(deuda).toLocaleString('es-CR')}</li>` : ''}
            </ul>
        `;
        document.getElementById('detalle-pedido-body').innerHTML = bodyHtml;

        // --- BOTONES CON WHATSAPP ---
        let footerHtml = '';
        if (ped.estado === 'Pendiente') {
            footerHtml += `<button class="btn btn-primary" onclick="PedidosSystem.ejecutarAccionDetalle('entregar', '${ped.id}')"><i class="fas fa-check"></i> Entregar</button>`;

            // Botón de Avisar por WhatsApp
            if (ped.telefono) {
                footerHtml += `<button class="btn text-white shadow-sm" style="background-color: #25D366;" onclick="PedidosSystem.enviarWhatsApp('${ped.id}', 'listo')" title="Avisar que está listo"><i class="fab fa-whatsapp"></i> Avisar</button>`;
            }

            if (deuda > 0 || !ped.precio) footerHtml += `<button class="btn btn-outline-primary" onclick="PedidosSystem.ejecutarAccionDetalle('abonar', '${ped.id}')"><i class="fas fa-coins"></i></button>`;
            footerHtml += `<button class="btn btn-outline-secondary" onclick="PedidosSystem.ejecutarAccionDetalle('editar', '${ped.id}')"><i class="fas fa-pen"></i></button>`;
            footerHtml += `<button class="btn btn-outline-danger" onclick="PedidosSystem.ejecutarAccionDetalle('cancelar', '${ped.id}')"><i class="fas fa-times"></i></button>`;
        } else {
            footerHtml += `<button class="btn btn-outline-info" onclick="PedidosSystem.ejecutarAccionDetalle('reimprimir', '${ped.id}')"><i class="fas fa-receipt"></i> Ticket</button>`;
            if (ped.estado === 'Entregado' && deuda > 0) {
                footerHtml += `<button class="btn btn-success" onclick="PedidosSystem.ejecutarAccionDetalle('abonar', '${ped.id}')"><i class="fas fa-coins"></i> Abonar</button>`;

                // Botón de Cobrar por WhatsApp
                if (ped.telefono) {
                    footerHtml += `<button class="btn text-white shadow-sm" style="background-color: #25D366;" onclick="PedidosSystem.enviarWhatsApp('${ped.id}', 'cobro')" title="Cobrar saldo por WhatsApp"><i class="fab fa-whatsapp"></i> Cobrar</button>`;
                }
            }
            footerHtml += `<button class="btn btn-outline-danger" onclick="PedidosSystem.ejecutarAccionDetalle('borrar', '${ped.id}')"><i class="fas fa-trash"></i></button>`;
        }
        document.getElementById('detalle-pedido-footer').innerHTML = footerHtml;

        if (Estado.modales.detallePedido) Estado.modales.detallePedido.show();
    }

    static ejecutarAccionDetalle(accion, id) {
        if (Estado.modales.detallePedido) Estado.modales.detallePedido.hide();
        setTimeout(() => {
            if (accion === 'entregar') this.entregar(id);
            else if (accion === 'abonar') this.abonar(id);
            else if (accion === 'editar') this.abrirModal(id);
            else if (accion === 'cancelar') this.cancelar(id);
            else if (accion === 'reimprimir') this.reimprimir(id);
            else if (accion === 'borrar') this.borrarHistorial(id);
        }, 400);
    }

    static abrirModal(id = null) {
        document.getElementById('form-pedido').reset();
        document.getElementById('ped-id').value = '';
        document.getElementById('ped-solicitado').value = Utils.obtenerFechaLocal();
        document.getElementById('ped-telefono').value = '';

        const elAdelanto = document.getElementById('ped-adelanto');
        const elMetodoAd = document.getElementById('ped-metodo-adelanto');
        if (elAdelanto) elAdelanto.value = '';
        if (elMetodoAd) elMetodoAd.value = 'Sinpe Móvil';

        document.getElementById('tituloModalPedido').textContent = 'Nuevo Pedido';

        if (id) {
            if (elAdelanto) elAdelanto.disabled = true;
            if (elMetodoAd) elMetodoAd.disabled = true;

            const p = Estado.pedidos.find(x => x.id === id);
            if (p) {
                document.getElementById('tituloModalPedido').textContent = 'Editar Pedido';
                document.getElementById('ped-id').value = p.id;
                document.getElementById('ped-solicitado').value = p.fecha_solicitud;
                if (p.fecha_entrega) document.getElementById('ped-entrega').value = p.fecha_entrega;
                document.getElementById('ped-cliente').value = p.cliente;
                document.getElementById('ped-telefono').value = p.telefono || '';
                document.getElementById('ped-producto').value = p.producto;
                document.getElementById('ped-desc').value = p.descripcion || '';
                document.getElementById('ped-precio').value = p.precio || '';
            }
        } else {
            if (elAdelanto) elAdelanto.disabled = false;
            if (elMetodoAd) elMetodoAd.disabled = false;
        }
        if (Estado.modales.pedido) Estado.modales.pedido.show();
    }

    static async guardar(e) {
        e.preventDefault(); const id = document.getElementById('ped-id').value;
        const elAdelanto = document.getElementById('ped-adelanto');
        const adelanto = elAdelanto ? parseFloat(elAdelanto.value) || 0 : 0;
        const elMetodoAd = document.getElementById('ped-metodo-adelanto');
        const metodoAdelanto = elMetodoAd ? elMetodoAd.value : 'Efectivo';

        const datos = {
            fecha_solicitud: document.getElementById('ped-solicitado').value,
            fecha_entrega: document.getElementById('ped-entrega').value,
            cliente: document.getElementById('ped-cliente').value.trim(),
            telefono: document.getElementById('ped-telefono').value.trim(),
            producto: document.getElementById('ped-producto').value.trim(),
            descripcion: document.getElementById('ped-desc').value.trim(),
            precio: parseFloat(document.getElementById('ped-precio').value) || 0
        };

        if (datos.fecha_entrega && datos.fecha_entrega < datos.fecha_solicitud) return Swal.fire('Error', 'La fecha de entrega no puede ser menor a la de solicitud.', 'error');
        if (adelanto > datos.precio && datos.precio > 0) return Swal.fire('Error', 'El adelanto no puede ser mayor al precio total.', 'error');

        const btn = e.target.querySelector('button'); btn.disabled = true;
        try {
            if (id) {
                await updateDoc(doc(db, "pedidos", id), datos);
            } else {
                datos.estado = 'Pendiente';
                datos.monto_pagado = adelanto;
                datos.historial_pagos = [];
                if (adelanto > 0) {
                    datos.ultimo_metodo_pago = metodoAdelanto;
                    datos.historial_pagos.push({ fecha: Utils.obtenerFechaLocal(), monto: adelanto, metodo: metodoAdelanto });
                }
                datos.timestamp = new Date();
                await addDoc(collection(db, "pedidos"), datos);

                if (adelanto > 0) {
                    FinanzasSystem.registrarDesdePedido(metodoAdelanto, Utils.obtenerFechaLocal(), `Adelanto de pedido: ${datos.producto}`, datos.cliente, adelanto);
                }
            }
            if (Estado.modales.pedido) Estado.modales.pedido.hide();
            Swal.fire({ icon: 'success', title: 'Guardado correctamente', timer: 1000, showConfirmButton: false });
        } catch (error) { Swal.fire('Error', 'No se pudo guardar.', 'error'); } finally { btn.disabled = false; }
    }

    static async entregar(id) {
        const ped = Estado.pedidos.find(p => p.id === id); if (!ped) return;
        let pTot = ped.precio;

        if (!pTot || pTot === 0) {
            const { value: nP } = await Swal.fire({ title: 'Fijar Precio Final', input: 'number', showCancelButton: true, inputValidator: v => (!v || v <= 0) ? 'Ingrese monto mayor a 0' : null });
            if (!nP) return; pTot = parseFloat(nP); await updateDoc(doc(db, "pedidos", id), { precio: pTot }); ped.precio = pTot;
        }

        const saldoPendiente = pTot - (ped.monto_pagado || 0);

        const r = await Swal.fire({
            title: 'Entregar y Cobrar',
            html: `<div class="text-start mb-2"><label class="fw-bold">Pagado hoy (Resta cobrar: ₡${saldoPendiente.toLocaleString()})</label><input id="swal-monto" type="number" class="form-control border-primary" value="${saldoPendiente}"><small class="text-muted">Si el pago queda pendiente, ingresa 0.</small></div>
                   <div class="text-start"><label class="fw-bold">Método de Pago</label><select id="swal-metodo" class="form-select border-primary"><option>Efectivo</option><option>Sinpe Móvil</option><option>Transferencia</option></select></div>`,
            showCancelButton: true, confirmButtonText: 'Registrar', confirmButtonColor: '#198754',
            preConfirm: () => {
                const crudo = document.getElementById('swal-monto').value;
                const m = parseFloat(crudo);
                if (crudo === '' || isNaN(m) || m < 0) { Swal.showValidationMessage('Ingrese un monto válido'); return false; }
                return { monto: m, metodo: document.getElementById('swal-metodo').value };
            }
        });

        if (r.isConfirmed) {
            const cobradoHoy = r.value.monto;
            const metodo = r.value.metodo;
            const hoy = Utils.obtenerFechaLocal();
            const totalPagadoHistorico = (ped.monto_pagado || 0) + cobradoHoy;
            const saldoFinalDeuda = pTot - totalPagadoHistorico;

            let arrPagos = ped.historial_pagos || [];
            if (arrPagos.length === 0 && (ped.monto_pagado || 0) > 0) arrPagos.push({ fecha: ped.fecha_solicitud, monto: ped.monto_pagado, metodo: 'Anterior' });
            if (cobradoHoy > 0) arrPagos.push({ fecha: hoy, monto: cobradoHoy, metodo: metodo });

            try {
                await updateDoc(doc(db, "pedidos", id), { estado: 'Entregado', monto_pagado: totalPagadoHistorico, fecha_cierre: hoy, ultimo_metodo_pago: metodo, historial_pagos: arrPagos });

                if (cobradoHoy > 0) FinanzasSystem.registrarDesdePedido(metodo, hoy, `Pago final de pedido: ${ped.producto}`, ped.cliente, cobradoHoy);

                if ((await Swal.fire({ title: 'Éxito', text: '¿Enviar ticket?', icon: 'success', showCancelButton: true })).isConfirmed) {
                    TicketSystem.generar(ped.id.slice(-5).toUpperCase(), ped.cliente, ped.producto, pTot, saldoPendiente, cobradoHoy, Math.max(0, saldoFinalDeuda), saldoFinalDeuda <= 0 ? 'CANCELADO' : 'SALDO PENDIENTE', metodo);
                }
            } catch (e) { Swal.fire('Error', 'Ocurrió un problema guardando en la base de datos.', 'error'); }
        }
    }

    static async abonar(id) {
        const ped = Estado.pedidos.find(p => p.id === id); if (!ped) return;

        let pTot = ped.precio;
        if (!pTot || pTot === 0) {
            const { value: nP } = await Swal.fire({ title: 'Fijar Precio Final', text: 'Antes de abonar, debes definir el precio total del pedido:', input: 'number', showCancelButton: true, inputValidator: v => (!v || v <= 0) ? 'Ingrese monto mayor a 0' : null });
            if (!nP) return; pTot = parseFloat(nP); await updateDoc(doc(db, "pedidos", id), { precio: pTot }); ped.precio = pTot;
        }

        const dAnt = pTot - (ped.monto_pagado || 0);
        if (dAnt <= 0) return Swal.fire('Aviso', 'Este pedido ya está pagado en su totalidad.', 'info');

        const r = await Swal.fire({
            title: 'Registrar Abono',
            html: `<div class="text-start mb-2"><label class="fw-bold">Deuda Actual: ₡${dAnt.toLocaleString()}</label><input id="swal-monto" type="number" class="form-control border-success mt-1" placeholder="Monto a abonar"></div>
            <div class="text-start"><label class="fw-bold">Método</label><select id="swal-metodo" class="form-select mt-1"><option>Efectivo</option><option>Sinpe Móvil</option><option>Transferencia</option></select></div>`,
            showCancelButton: true, confirmButtonText: 'Guardar', preConfirm: () => {
                const m = parseFloat(document.getElementById('swal-monto').value);
                if (!m || m <= 0 || m > dAnt) { Swal.showValidationMessage(`Ingrese un monto entre 1 y ${dAnt}`); return false; }
                return { m, met: document.getElementById('swal-metodo').value };
            }
        });
        if (r.isConfirmed) {
            const { m, met } = r.value; const nPagado = (ped.monto_pagado || 0) + m; const saldo = pTot - nPagado; const hoy = Utils.obtenerFechaLocal();

            let arrPagos = ped.historial_pagos || [];
            if (arrPagos.length === 0 && (ped.monto_pagado || 0) > 0) arrPagos.push({ fecha: ped.fecha_solicitud, monto: ped.monto_pagado, metodo: 'Anterior' });
            arrPagos.push({ fecha: hoy, monto: m, metodo: met });

            try {
                await updateDoc(doc(db, "pedidos", id), { monto_pagado: nPagado, ultimo_metodo_pago: met, historial_pagos: arrPagos });
                FinanzasSystem.registrarDesdePedido(met, hoy, `Abono a deuda: ${ped.producto}`, ped.cliente, m);
                if ((await Swal.fire({ title: 'Abono registrado', icon: 'success', showCancelButton: true, confirmButtonText: 'Ticket' })).isConfirmed) {
                    TicketSystem.generar(ped.id.slice(-5).toUpperCase(), ped.cliente, ped.producto, pTot, dAnt, m, Math.max(0, saldo), saldo <= 0 ? 'CANCELADO' : 'ABONO', met);
                }
            } catch (e) { Swal.fire('Error', 'No se pudo guardar el abono.', 'error'); }
        }
    }

    static async cancelar(id) {
        if ((await Swal.fire({ title: '¿Anular este pedido?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545' })).isConfirmed) {
            await updateDoc(doc(db, "pedidos", id), { estado: 'Cancelado', fecha_cierre: Utils.obtenerFechaLocal() });
        }
    }

    static reimprimir(id) {
        const p = Estado.pedidos.find(x => x.id === id); if (!p) return;
        const pTot = p.precio || 0, pag = p.monto_pagado || 0, sal = pTot - pag;
        TicketSystem.generar(p.id.slice(-5).toUpperCase(), p.cliente, p.producto, pTot, pTot, pag, Math.max(0, sal), sal <= 0 ? 'CANCELADO' : 'SALDO PENDIENTE', p.ultimo_metodo_pago || 'Historial');
    }

    static async borrarHistorial(id) {
        if ((await Swal.fire({ title: '¿Borrar definitivo?', text: 'Se borrará el registro de pedidos (finanzas queda intacto).', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' })).isConfirmed) await deleteDoc(doc(db, "pedidos", id));
    }
}

// ==========================================
// CLASE 4: SISTEMA DE FINANZAS
// ==========================================
class FinanzasSystem {
    static limiteActual = 150;
    static conexionFirebase = null;

    static init() {
        document.getElementById('fecha-mov').value = Utils.obtenerFechaLocal();
        this.cargarDatos();

        const btnCargarMas = document.getElementById('btn-cargar-mas-finanzas');
        if (btnCargarMas) {
            btnCargarMas.addEventListener('click', () => {
                this.limiteActual += 150;
                btnCargarMas.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Cargando...';
                this.cargarDatos();
            });
        }
    }

    static cargarDatos() {
        if (this.conexionFirebase) this.conexionFirebase();

        this.conexionFirebase = onSnapshot(
            query(collection(db, "movimientos"), orderBy("fecha", "desc"), limit(this.limiteActual)),
            (snapshot) => {
                Estado.movimientos = [];
                snapshot.forEach(doc => Estado.movimientos.push({ id: doc.id, ...doc.data() }));

                if (UIManager.vistas.reportes.classList.contains('active')) this.renderizarReporte();
                if (UIManager.vistas.dashboard.classList.contains('active')) DashboardSystem.renderizar();

                const btnCargarMas = document.getElementById('btn-cargar-mas-finanzas');
                if (btnCargarMas) {
                    btnCargarMas.innerHTML = '<i class="fas fa-arrow-down me-1"></i> Cargar más antiguos';
                    btnCargarMas.style.display = snapshot.docs.length < this.limiteActual ? 'none' : 'inline-block';
                }
            }
        );
    }

    static async registrarManual(e) {
        e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
        try {
            await addDoc(collection(db, "movimientos"), {
                tipo: document.getElementById('tipo').value, fecha: document.getElementById('fecha-mov').value,
                metodo_pago: document.getElementById('metodo-pago-mov').value, descripcion: document.getElementById('descripcion-mov').value.trim(),
                entidad: document.getElementById('entidad-mov').value.trim(), monto: parseFloat(document.getElementById('monto-mov').value), timestamp: new Date()
            });
            e.target.reset(); document.getElementById('fecha-mov').value = Utils.obtenerFechaLocal();
            Swal.fire({ icon: 'success', title: 'Registrado', timer: 1500, showConfirmButton: false });
        } catch (err) { Swal.fire('Error', 'No se guardó el movimiento', 'error'); } finally { btn.disabled = false; }
    }

    static async registrarDesdePedido(metodo, fecha, desc, entidad, monto) {
        await addDoc(collection(db, "movimientos"), { tipo: 'entrada', metodo_pago: metodo, fecha, descripcion: desc, entidad, monto, timestamp: new Date() });
    }

    static renderizarReporte() {
        if (!UIManager.vistas.reportes.classList.contains('active')) return;
        let filt = Estado.movimientos;
        const fIni = document.getElementById('filtro-inicio').value, fFin = document.getElementById('filtro-fin').value, fMod = document.getElementById('filtro-modo').value;
        if (fIni) filt = filt.filter(m => m.fecha >= fIni); if (fFin) filt = filt.filter(m => m.fecha <= fFin);
        if (fMod !== 'ambos') filt = filt.filter(m => m.tipo === (fMod === 'entradas' ? 'entrada' : 'salida'));

        Estado.datosParaExportar = filt; let tEnt = 0, tSal = 0, html = '';
        filt.forEach(m => {
            if (m.tipo === 'entrada') tEnt += m.monto; else tSal += m.monto;
            html += `<tr><td class="text-nowrap">${m.fecha}</td><td><strong>${m.descripcion}</strong> <span class="badge bg-secondary ms-1">${m.metodo_pago || 'Manual'}</span><br><small class="text-muted">${m.entidad || ''}</small></td><td class="${m.tipo === 'entrada' ? 'text-success' : 'text-danger'} fw-bold text-nowrap">₡${m.monto.toLocaleString('es-CR')}</td><td class="text-center align-middle"><div class="d-flex justify-content-center gap-1"><button class="btn btn-sm btn-outline-secondary" onclick="FinanzasSystem.abrirEdicion('${m.id}')">Editar</button><button class="btn btn-sm btn-outline-danger" onclick="FinanzasSystem.borrarMov('${m.id}')">Eliminar</button></div></td></tr>`;
        });
        document.getElementById('tabla-reportes').innerHTML = html || '<tr><td colspan="4" class="text-center py-4">No hay movimientos registrados.</td></tr>';
        document.getElementById('resumen-entradas').textContent = `₡${tEnt.toLocaleString('es-CR')}`; document.getElementById('resumen-salidas').textContent = `₡${tSal.toLocaleString('es-CR')}`; document.getElementById('resumen-balance').textContent = `₡${(tEnt - tSal).toLocaleString('es-CR')}`;
        this.dibujarGrafico(tEnt, tSal, fMod);
    }

    static abrirEdicion(id) {
        const m = Estado.movimientos.find(x => x.id === id); if (!m) return;
        const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        setVal('edit-id-mov', m.id); setVal('edit-tipo-mov', m.tipo); setVal('edit-fecha-mov', m.fecha);
        setVal('edit-desc-mov', m.descripcion); setVal('edit-ent-mov', m.entidad || ''); setVal('edit-monto-mov', m.monto); setVal('edit-metodo-mov', m.metodo_pago || 'Efectivo');
        if (Estado.modales.editarMov) Estado.modales.editarMov.show();
    }

    static async guardarEdicion(e) {
        e.preventDefault(); const id = document.getElementById('edit-id-mov').value;
        const getVal = (elId, def) => { const el = document.getElementById(elId); return el ? el.value : def; };
        try {
            await updateDoc(doc(db, "movimientos", id), {
                tipo: getVal('edit-tipo-mov', 'entrada'), fecha: getVal('edit-fecha-mov', Utils.obtenerFechaLocal()),
                descripcion: getVal('edit-desc-mov', '').trim(), metodo_pago: getVal('edit-metodo-mov', 'Efectivo'),
                entidad: getVal('edit-ent-mov', '').trim(), monto: parseFloat(getVal('edit-monto-mov', 0))
            });
            if (Estado.modales.editarMov) Estado.modales.editarMov.hide();
            Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1500, showConfirmButton: false });
        } catch (e) { Swal.fire('Error', 'Fallo al actualizar.', 'error'); }
    }

    static async borrarMov(id) {
        if ((await Swal.fire({ title: '¿Eliminar movimiento?', text: 'Altera el balance de caja.', icon: 'warning', showCancelButton: true })).isConfirmed) await deleteDoc(doc(db, "movimientos", id));
    }

    static dibujarGrafico(e, s, m) {
        if (window.graficoInstancia) window.graficoInstancia.destroy(); if (e === 0 && s === 0) return;
        let l = [], d = [], c = [];
        if (m === 'ambos') { l = ['Ingresos', 'Gastos']; d = [e, s]; c = ['#198754', '#dc3545']; }
        else if (m === 'entradas') { l = ['Ingresos']; d = [e]; c = ['#198754']; }
        else { l = ['Gastos']; d = [s]; c = ['#dc3545']; }
        window.graficoInstancia = new Chart(document.getElementById('miGrafico').getContext('2d'), { type: 'doughnut', data: { labels: l, datasets: [{ data: d, backgroundColor: c }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
}

// ==========================================
// CLASE 5: DASHBOARD E INTELIGENCIA DE NEGOCIOS (BI)
// ==========================================
class DashboardSystem {
    static renderizar() {
        if (!UIManager.vistas.dashboard.classList.contains('active')) return;
        this.renderUtilidadNeta();
        this.renderCRM();
        this.renderVolatilidad();
        this.renderEstacionalidad();
        this.renderRetencion();
        this.renderGastosAgrupados();
        this.renderMetricasAvanzadas();
    }

    static renderMetricasAvanzadas() {
        const contenedor = document.getElementById('bi-metricas-avanzadas');
        if (!contenedor) return;

        let totalTrabajos = 0; let anulados = 0; let pagados100 = 0; let conDeuda = 0;
        let deudores = [];
        const pedidosPorMes = {};

        Estado.pedidos.forEach(p => {
            if (p.estado === 'Cancelado') { anulados++; }
            else {
                totalTrabajos++;

                const mes = p.fecha_solicitud.substring(0, 7);
                pedidosPorMes[mes] = (pedidosPorMes[mes] || 0) + 1;

                const deuda = (p.precio || 0) - (p.monto_pagado || 0);
                if (p.estado === 'Entregado') {
                    if (deuda > 0) {
                        conDeuda++;
                        deudores.push({ cliente: p.cliente, telefono: p.telefono, debe: deuda });
                    } else { pagados100++; }
                }
            }
        });

        const valoresMes = Object.values(pedidosPorMes);
        let htmlEstadistica = `<p class="text-muted small">Insuficientes datos históricos.</p>`;
        if (valoresMes.length > 0) {
            const media = valoresMes.reduce((a, b) => a + b, 0) / valoresMes.length;
            const varianza = valoresMes.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / valoresMes.length;
            const desviacion = Math.sqrt(varianza);

            htmlEstadistica = `
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Promedio de Pedidos (Mes):</span>
                    <strong class="text-primary">${media.toFixed(1)} pedidos</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Desviación (Variabilidad):</span>
                    <strong class="text-secondary">± ${desviacion.toFixed(1)} pedidos</strong>
                </div>
                <div class="d-flex justify-content-between">
                    <span class="text-muted">Tasa de Cancelación:</span>
                    <strong class="text-danger">${totalTrabajos > 0 ? ((anulados / (totalTrabajos + anulados)) * 100).toFixed(1) : 0}%</strong>
                </div>`;
        }

        deudores.sort((a, b) => b.debe - a.debe);
        let mayorDeudorHtml = `<div class="alert alert-success py-2 mb-0 text-center"><i class="fas fa-check-circle"></i> No hay deudas pendientes.</div>`;
        if (deudores.length > 0) {
            mayorDeudorHtml = `
                <div class="alert alert-warning py-2 mb-0">
                    <i class="fas fa-exclamation-triangle"></i> <strong>Mayor Deuda:</strong> ${deudores[0].cliente} 
                    <br><span class="fs-5 fw-bold text-danger">₡${deudores[0].debe.toLocaleString('es-CR')}</span>
                    ${deudores[0].telefono ? `<br><a href="tel:${deudores[0].telefono}" class="small text-dark text-decoration-none mt-1 d-inline-block"><i class="fas fa-phone"></i> Llamar / Cobrar</a>` : ''}
                </div>`;
        }

        contenedor.innerHTML = `
            <div class="row">
                <div class="col-md-6 mb-3">
                    <h6 class="fw-bold"><i class="fas fa-chart-bar"></i> Volumen de Trabajo</h6>
                    ${htmlEstadistica}
                </div>
                <div class="col-md-6">
                    <h6 class="fw-bold"><i class="fas fa-hand-holding-usd"></i> Salud de Cobros (Entregados)</h6>
                    <div class="d-flex justify-content-between mb-2 small">
                        <span><i class="fas fa-circle text-success"></i> Pagados 100%:</span> <strong>${pagados100}</strong>
                    </div>
                    <div class="d-flex justify-content-between mb-3 small">
                        <span><i class="fas fa-circle text-warning"></i> Con Saldo:</span> <strong>${conDeuda}</strong>
                    </div>
                    ${mayorDeudorHtml}
                </div>
            </div>
        `;
    }

    static renderUtilidadNeta() {
        const mesActual = Utils.obtenerFechaLocal().substring(0, 7);
        let ingresosMes = 0; let gastosMes = 0;

        Estado.movimientos.forEach(m => {
            if (m.fecha.startsWith(mesActual)) {
                if (m.tipo === 'entrada') ingresosMes += m.monto;
                else gastosMes += m.monto;
            }
        });

        const utilidad = ingresosMes - gastosMes;
        const divMonto = document.getElementById('bi-utilidad-neta');
        divMonto.textContent = `₡${utilidad.toLocaleString('es-CR')}`;
        document.getElementById('bi-utilidad-detalle').textContent = `Ingresos: ₡${ingresosMes.toLocaleString('es-CR')} | Gastos: ₡${gastosMes.toLocaleString('es-CR')}`;

        if (utilidad < 0) divMonto.className = "fw-bold mb-1 text-danger";
        else if (utilidad === 0) divMonto.className = "fw-bold mb-1 text-dark";
        else divMonto.className = "fw-bold mb-1 text-success";
    }

    static renderCRM() {
        const cMap = {};
        Estado.pedidos.forEach(p => {
            if (p.estado !== 'Cancelado' && p.cliente) {
                const telLimpio = p.telefono ? p.telefono.replace(/[\s-]/g, '') : '';
                const idUnico = (telLimpio !== '') ? telLimpio : p.cliente.trim().toUpperCase();

                if (!cMap[idUnico]) {
                    cMap[idUnico] = { nombreAMostrar: p.cliente.trim(), telefonoAMostrar: p.telefono || '', tc: 0, uc: '2000-01-01', cp: 0 };
                }
                cMap[idUnico].tc += (p.precio || 0); cMap[idUnico].cp += 1;
                if (p.fecha_solicitud > cMap[idUnico].uc) cMap[idUnico].uc = p.fecha_solicitud;
            }
        });

        const tCli = Object.entries(cMap).sort((a, b) => b[1].tc - a[1].tc).slice(0, 5); let html = '';
        tCli.forEach((c) => {
            const data = c[1];
            const badgeTelefono = data.telefonoAMostrar ? ` - 📱 ${data.telefonoAMostrar}` : '';
            html += `<li class="list-group-item d-flex justify-content-between align-items-start"><div class="ms-2 me-auto"><div class="fw-bold">${data.nombreAMostrar}${badgeTelefono}</div><span class="small text-muted">Última compra: ${data.uc} (${data.cp} pedidos)</span></div><span class="badge bg-success rounded-pill">₡${data.tc.toLocaleString('es-CR')}</span></li>`;
        });
        document.getElementById('lista-crm-clientes').innerHTML = html || '<li class="list-group-item">Datos insuficientes.</li>';
    }

    static renderVolatilidad() {
        const iMes = {};
        Estado.movimientos.filter(m => m.tipo === 'entrada').forEach(m => {
            const ma = m.fecha.substring(0, 7); iMes[ma] = (iMes[ma] || 0) + m.monto;
        });
        const vals = Object.values(iMes); const bx = document.getElementById('alerta-volatilidad'); const tR = document.getElementById('stat-recomendacion');
        if (vals.length < 2) {
            document.getElementById('stat-media').textContent = 'N/A'; document.getElementById('stat-desv').textContent = 'N/A';
            bx.className = 'alert alert-secondary py-2 mb-3 mt-3 fw-bold'; bx.textContent = 'Requiere 2 meses de historial'; tR.textContent = '';
        } else {
            const media = vals.reduce((a, b) => a + b, 0) / vals.length;
            const desv = Math.sqrt(vals.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / vals.length);
            const coef = desv / media;
            document.getElementById('stat-media').textContent = `₡${Math.round(media).toLocaleString('es-CR')}`; document.getElementById('stat-desv').textContent = `₡${Math.round(desv).toLocaleString('es-CR')}`;
            if (coef > 0.4) { bx.className = 'alert alert-danger py-2 mb-3 mt-3 fw-bold'; bx.textContent = 'Alta Volatilidad'; tR.textContent = 'Tus ingresos mensuales varían bruscamenete. Requiere fondo de emergencia.'; }
            else if (coef > 0.15) { bx.className = 'alert alert-warning py-2 mb-3 mt-3 fw-bold text-dark'; bx.textContent = 'Moderada'; tR.textContent = 'Flujo de caja normal para un emprendimiento.'; }
            else { bx.className = 'alert alert-success py-2 mb-3 mt-3 fw-bold'; bx.textContent = 'Ingresos Estables'; tR.textContent = 'Tus ventas son predecibles. Ideal para invertir.'; }
        }
    }

    static renderRetencion() {
        let entregados = 0; let cancelados = 0;
        Estado.pedidos.forEach(p => {
            if (p.estado === 'Entregado') entregados++;
            else if (p.estado === 'Cancelado') cancelados++;
        });
        if (window.chartRetencion) window.chartRetencion.destroy();
        window.chartRetencion = new Chart(document.getElementById('graficoRetencion').getContext('2d'), {
            type: 'pie',
            data: { labels: ['Éxito (Entregados)', 'Anulados'], datasets: [{ data: [entregados, cancelados], backgroundColor: ['#198754', '#dc3545'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    static renderEstacionalidad() {
        const catMap = {};
        Estado.pedidos.filter(p => p.estado !== 'Cancelado' && p.producto).forEach(p => {
            const n = p.producto.toLowerCase(); let cat = 'Otros Diseños';
            if (n.includes('pijama') || n.includes('camis') || n.includes('talla') || n.includes('short') || n.includes('juego') || n.includes('textil')) { cat = 'Ropa y Textiles'; }
            else if (n.includes('llavero') || n.includes('placa')) { cat = 'Llaveros y Placas'; }
            else if (n.includes('relicario') || n.includes('retablo') || n.includes('roca')) { cat = 'Regalos Especiales'; }
            else if (n.includes('taza') || n.includes('vaso') || n.includes('mug')) { cat = 'Tazas y Vasos'; }
            else if (n.includes('sticker') || n.includes('vinil') || n.includes('corte')) { cat = 'Vinil y Stickers'; }
            catMap[cat] = (catMap[cat] || 0) + 1;
        });
        const data = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        if (window.chartEstacion) window.chartEstacion.destroy();
        window.chartEstacion = new Chart(document.getElementById('graficoEstacionalidad').getContext('2d'), {
            type: 'bar',
            data: { labels: data.map(d => d[0]), datasets: [{ label: 'Trabajos Realizados', data: data.map(d => d[1]), backgroundColor: '#0d6efd' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    static renderGastosAgrupados() {
        let gastos = { 'Telas y Costura': 0, 'Suministros (Sublimación)': 0, 'Transporte': 0, 'Gastos Generales': 0 };
        Estado.movimientos.filter(m => m.tipo === 'salida').forEach(m => {
            let desc = (m.descripcion || '').toLowerCase();
            let entidad = (m.entidad || '').toLowerCase();
            let textoUnido = desc + " " + entidad;
            if (textoUnido.includes('tela') || textoUnido.includes('aracely') || textoUnido.includes('brush') || textoUnido.includes('hilo')) { gastos['Telas y Costura'] += m.monto; }
            else if (textoUnido.includes('ubora') || textoUnido.includes('suministro') || textoUnido.includes('sublimación') || textoUnido.includes('sublimacion') || textoUnido.includes('tinta') || textoUnido.includes('papel') || textoUnido.includes('vinil')) { gastos['Suministros (Sublimación)'] += m.monto; }
            else if (textoUnido.includes('pasaje') || textoUnido.includes('bus') || textoUnido.includes('uber') || textoUnido.includes('transporte') || textoUnido.includes('gasolina')) { gastos['Transporte'] += m.monto; }
            else { gastos['Gastos Generales'] += m.monto; }
        });
        if (window.chartGastos) window.chartGastos.destroy();
        window.chartGastos = new Chart(document.getElementById('graficoGastos').getContext('2d'), {
            type: 'doughnut',
            data: { labels: Object.keys(gastos), datasets: [{ data: Object.values(gastos), backgroundColor: ['#e83e8c', '#0dcaf0', '#fd7e14', '#6c757d'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// ==========================================
// CLASE 6: INICIALIZACIÓN Y EXPORTACIÓN
// ==========================================
class App {
    static init() {
        UIManager.init();

        // INSTALAR LA PWA Y EL SERVICE WORKER
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(reg => console.log('PWA instalada correctamente.', reg))
                    .catch(err => console.log('PWA falló.', err));
            });
        }

        // EVENTOS DEL NUEVO SISTEMA DE LEALTAD
        const inputTel = document.getElementById('ped-telefono');
        const inputNom = document.getElementById('ped-cliente');
        if (inputTel) inputTel.addEventListener('change', () => PedidosSystem.verificarLealtad());
        if (inputNom) inputNom.addEventListener('change', () => PedidosSystem.verificarLealtad());

        document.getElementById('form-pedido').addEventListener('submit', PedidosSystem.guardar);
        document.getElementById('form-movimiento').addEventListener('submit', FinanzasSystem.registrarManual);
        document.getElementById('form-editar-mov').addEventListener('submit', FinanzasSystem.guardarEdicion);

        document.getElementById('btn-export-pdf').addEventListener('click', () => this.exportar('pdf'));
        document.getElementById('btn-export-excel').addEventListener('click', () => this.exportar('excel'));

        ['filtro-pedido-texto', 'filtro-pedido-solicitud', 'filtro-pedido-entrega'].forEach(id => document.getElementById(id).addEventListener('input', () => PedidosSystem.renderizarPendientes()));
        document.getElementById('btn-limpiar-pedidos').addEventListener('click', () => { ['filtro-pedido-texto', 'filtro-pedido-solicitud', 'filtro-pedido-entrega'].forEach(id => document.getElementById(id).value = ''); PedidosSystem.renderizarPendientes(); });
        document.getElementById('filtro-historial').addEventListener('change', () => PedidosSystem.renderizarHistorial());
        ['filtro-modo', 'filtro-inicio', 'filtro-fin'].forEach(id => document.getElementById(id).addEventListener('input', () => FinanzasSystem.renderizarReporte()));

        const btnContactos = document.getElementById('btn-contactos');
        if (btnContactos) {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                btnContactos.addEventListener('click', async () => {
                    try {
                        const contactosAgarrados = await navigator.contacts.select(['name', 'tel'], { multiple: false });
                        if (contactosAgarrados.length > 0) {
                            const contacto = contactosAgarrados[0];
                            if (contacto.tel && contacto.tel.length > 0) {
                                let num = contacto.tel[0].replace(/[\s-]/g, '');
                                if (num.startsWith('+506')) num = num.substring(4);
                                document.getElementById('ped-telefono').value = num;
                                PedidosSystem.verificarLealtad(); // Verificar lealtad si se usa la agenda
                            }
                            if (contacto.name && contacto.name.length > 0) {
                                const inputNombre = document.getElementById('ped-cliente');
                                if (!inputNombre.value) inputNombre.value = contacto.name[0];
                            }
                        }
                    } catch (ex) { console.log("Selección de contacto cancelada."); }
                });
            } else { btnContactos.style.display = 'none'; }
        }

        document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()).catch(() => Swal.fire('Error', 'Fallo en login', 'error')));
        document.getElementById('btn-logout').addEventListener('click', async () => { if ((await Swal.fire({ title: '¿Salir?', icon: 'warning', showCancelButton: true })).isConfirmed) signOut(auth); });

        onAuthStateChanged(auth, async (user) => {
            if (user && CORREOS_PERMITIDOS.includes(user.email)) {
                document.getElementById('login-container').classList.add('d-none'); document.getElementById('app-container').classList.remove('d-none'); document.getElementById('app-container').classList.add('d-flex');
                document.getElementById('user-info').textContent = `Admin: ${user.displayName}`;

                const mP = document.getElementById('modalPedido'); if (mP) Estado.modales.pedido = new bootstrap.Modal(mP);
                const mM = document.getElementById('modalEditarMov'); if (mM) Estado.modales.editarMov = new bootstrap.Modal(mM);
                const mDP = document.getElementById('modalDetallePedido'); if (mDP) Estado.modales.detallePedido = new bootstrap.Modal(mDP);

                PedidosSystem.init(); FinanzasSystem.init(); UIManager.cambiarVista('pedidos');
            } else if (user) { await signOut(auth); Swal.fire({ icon: 'error', title: 'Acceso Denegado' }); }
            else { document.getElementById('login-container').classList.remove('d-none'); document.getElementById('app-container').classList.add('d-none'); document.getElementById('app-container').classList.remove('d-flex'); }
        });
    }

    static exportar(tipo) {
        if (Estado.datosParaExportar.length === 0) return Swal.fire('Aviso', 'Sin datos', 'warning');
        if (tipo === 'pdf') {
            const doc = new window.jspdf.jsPDF(); doc.text("Reporte Contable - MASUCRI", 14, 15);
            doc.autoTable({ head: [["Fecha", "Método", "Tipo", "Concepto", "Monto"]], body: Estado.datosParaExportar.map(m => [m.fecha, m.metodo_pago || 'Manual', m.tipo.toUpperCase(), m.descripcion, `₡${m.monto.toLocaleString('es-CR')}`]), startY: 28 });
            doc.save("Finanzas_MASUCRI.pdf");
        } else {
            const ws = XLSX.utils.json_to_sheet(Estado.datosParaExportar.map(m => ({ "Fecha": m.fecha, "Método": m.metodo_pago || 'Manual', "Tipo": m.tipo.toUpperCase(), "Concepto": m.descripcion, "Monto": m.monto })));
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Datos"); XLSX.writeFile(wb, "Finanzas_MASUCRI.xlsx");
        }
    }
}

// Inicializar la App
App.init();

// Exponer módulos a Window
window.PedidosSystem = PedidosSystem;
window.FinanzasSystem = FinanzasSystem;
window.abrirModalPedido = () => PedidosSystem.abrirModal();
window.cargarMasHistorial = () => { PedidosSystem.limiteHistorial += 50; PedidosSystem.renderizarHistorial(); };