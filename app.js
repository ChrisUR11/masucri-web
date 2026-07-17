// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 2. CONFIGURACIÓN Y SEGURIDAD
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

const CORREOS_PERMITIDOS = ["ulloarodriguezchris@gmail.com", "anisrmj5@gmail.com"];

let listaMovimientos = []; let listaPedidos = []; let datosParaExportar = [];
let graficoInstancia = null; let graficoEstacionalidad = null;
let modalPedidoInstancia = null; let modalEditarMovInstancia = null;

function obtenerFechaLocal() {
    const hoy = new Date(); const tzOffset = hoy.getTimezoneOffset() * 60000;
    return new Date(hoy.getTime() - tzOffset).toISOString().split('T')[0];
}

// ==========================================
// 3. GENERADOR DE TICKETS (html2canvas)
// ==========================================
async function generarTicket(cliente, producto, anterior, abono, nuevoSaldo, estado, metodo) {
    document.getElementById('tkt-fecha').textContent = obtenerFechaLocal();
    document.getElementById('tkt-cliente').textContent = cliente;
    document.getElementById('tkt-producto').textContent = producto;
    document.getElementById('tkt-metodo').textContent = metodo;
    document.getElementById('tkt-anterior').textContent = `₡${anterior.toLocaleString('es-CR')}`;
    document.getElementById('tkt-abono').textContent = `₡${abono.toLocaleString('es-CR')}`;
    document.getElementById('tkt-saldo').textContent = `₡${nuevoSaldo.toLocaleString('es-CR')}`;

    const divEstado = document.getElementById('tkt-estado');
    divEstado.textContent = estado;
    divEstado.style.background = (nuevoSaldo === 0) ? '#198754' : '#ffc107'; // Verde si pagó todo, Amarillo si debe
    divEstado.style.color = (nuevoSaldo === 0) ? '#fff' : '#000';

    const tktElement = document.getElementById('ticket-template');
    tktElement.style.top = '0'; tktElement.style.left = '0'; tktElement.style.zIndex = '-1'; // Ponerlo en DOM pero oculto

    try {
        const canvas = await html2canvas(tktElement, { scale: 2, backgroundColor: '#ffffff' });
        const link = document.createElement('a');
        link.download = `MASUCRI_${cliente.replace(/\s+/g, '_')}_${new Date().getTime()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) { console.error("Error generando ticket:", error); }
    finally { tktElement.style.top = '-9999px'; tktElement.style.left = '-9999px'; }
}

// ==========================================
// 4. NAVEGACIÓN
// ==========================================
const vistas = { pedidos: document.getElementById('vista-pedidos'), historial: document.getElementById('vista-historial'), registro: document.getElementById('vista-registro'), reportes: document.getElementById('vista-reportes'), dashboard: document.getElementById('vista-dashboard') };
const navLinks = { pedidos: document.getElementById('nav-pedidos'), historial: document.getElementById('nav-historial'), registro: document.getElementById('nav-registro'), reportes: document.getElementById('nav-reportes'), dashboard: document.getElementById('nav-dashboard') };

function cambiarVista(vistaActiva) {
    Object.values(vistas).forEach(v => v.classList.remove('active')); Object.values(navLinks).forEach(n => n.classList.remove('active'));
    vistas[vistaActiva].classList.add('active'); navLinks[vistaActiva].classList.add('active');

    if (vistaActiva === 'reportes') generarReporteFinanciero();
    if (vistaActiva === 'pedidos') renderizarPedidos();
    if (vistaActiva === 'historial') renderizarHistorialPedidos();
    if (vistaActiva === 'dashboard') renderizarDashboard();

    const navbarCollapse = document.getElementById('navbarNav');
    if (navbarCollapse.classList.contains('show')) document.querySelector('.navbar-toggler').click();
}
Object.keys(navLinks).forEach(key => { navLinks[key].addEventListener('click', (e) => { e.preventDefault(); cambiarVista(key); }); });

// Auth...
document.getElementById('btn-login').addEventListener('click', async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { } });
document.getElementById('btn-logout').addEventListener('click', async () => { if ((await Swal.fire({ title: '¿Cerrar sesión?', showCancelButton: true })).isConfirmed) await signOut(auth); });
onAuthStateChanged(auth, async (user) => {
    if (user && CORREOS_PERMITIDOS.includes(user.email)) {
        document.getElementById('login-container').classList.add('d-none'); document.getElementById('app-container').classList.remove('d-none'); document.getElementById('app-container').classList.add('d-flex');
        document.getElementById('user-info').textContent = `Admin: ${user.displayName}`;
        modalPedidoInstancia = new bootstrap.Modal(document.getElementById('modalPedido')); modalEditarMovInstancia = new bootstrap.Modal(document.getElementById('modalEditarMov'));
        cargarPedidos(); cargarFinanzas(); cambiarVista('pedidos');
    } else if (user) { await signOut(auth); Swal.fire('Error', 'Acceso Denegado', 'error'); }
    else { document.getElementById('login-container').classList.remove('d-none'); document.getElementById('app-container').classList.add('d-none'); document.getElementById('app-container').classList.remove('d-flex'); }
});

// ==========================================
// 5. MÓDULO DE PEDIDOS
// ==========================================
function cargarPedidos() {
    onSnapshot(query(collection(db, "pedidos"), orderBy("fecha_entrega", "asc")), (snapshot) => {
        listaPedidos = []; snapshot.forEach(doc => listaPedidos.push({ id: doc.id, ...doc.data() }));
        renderizarPedidos(); renderizarHistorialPedidos(); if (vistas.dashboard.classList.contains('active')) renderizarDashboard();
    });
}

window.abrirModalPedido = (id = null) => {
    const form = document.getElementById('form-pedido'); form.reset();
    document.getElementById('ped-id').value = ''; document.getElementById('ped-solicitado').value = obtenerFechaLocal();
    document.getElementById('tituloModalPedido').textContent = 'Nuevo Pedido';
    if (id) {
        const ped = listaPedidos.find(p => p.id === id);
        if (ped) {
            document.getElementById('ped-id').value = ped.id; document.getElementById('ped-solicitado').value = ped.fecha_solicitud;
            if (ped.fecha_entrega) document.getElementById('ped-entrega').value = ped.fecha_entrega;
            document.getElementById('ped-cliente').value = ped.cliente; document.getElementById('ped-producto').value = ped.producto;
            document.getElementById('ped-desc').value = ped.descripcion || ''; document.getElementById('ped-precio').value = ped.precio || '';
        }
    }
    modalPedidoInstancia.show();
}

document.getElementById('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault(); const id = document.getElementById('ped-id').value;
    const datos = {
        fecha_solicitud: document.getElementById('ped-solicitado').value, fecha_entrega: document.getElementById('ped-entrega').value,
        cliente: document.getElementById('ped-cliente').value.trim(), producto: document.getElementById('ped-producto').value.trim(),
        descripcion: document.getElementById('ped-desc').value.trim(), precio: parseFloat(document.getElementById('ped-precio').value) || 0,
    };
    if (datos.fecha_entrega && datos.fecha_entrega < datos.fecha_solicitud) return Swal.fire('Error', 'Fecha de entrega menor a solicitud.', 'error');
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
        if (id) { await updateDoc(doc(db, "pedidos", id), datos); }
        else { datos.estado = 'Pendiente'; datos.monto_pagado = 0; datos.timestamp = new Date(); await addDoc(collection(db, "pedidos"), datos); }
        modalPedidoInstancia.hide(); Swal.fire({ icon: 'success', title: 'Guardado', timer: 1000, showConfirmButton: false });
    } catch (e) { } finally { btn.disabled = false; }
});

function renderizarPedidos() {
    if (!vistas.pedidos.classList.contains('active')) return;
    let pendientes = listaPedidos.filter(p => p.estado === 'Pendiente');
    const txt = document.getElementById('filtro-pedido-texto').value.toLowerCase(); const fSol = document.getElementById('filtro-pedido-solicitud').value; const fEnt = document.getElementById('filtro-pedido-entrega').value;
    if (txt) pendientes = pendientes.filter(p => p.cliente.toLowerCase().includes(txt) || p.producto.toLowerCase().includes(txt));
    if (fSol) pendientes = pendientes.filter(p => p.fecha_solicitud >= fSol); if (fEnt) pendientes = pendientes.filter(p => p.fecha_entrega && p.fecha_entrega <= fEnt);
    const tbody = document.getElementById('tabla-pedidos'); let html = ''; const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    pendientes.forEach(ped => {
        let badgeClass = '', pt = '';
        if (!ped.fecha_entrega) { badgeClass = 'bg-secondary'; pt = 'Sin Fecha'; }
        else {
            const fd = new Date(ped.fecha_entrega + 'T00:00:00'); const diff = Math.ceil((fd - hoy) / (1000 * 60 * 60 * 24));
            if (diff < 0) { badgeClass = 'bg-danger'; pt = 'Atrasado'; } else if (diff === 0) { badgeClass = 'bg-danger'; pt = 'Para Hoy'; } else if (diff <= 2) { badgeClass = 'bg-warning text-dark'; pt = 'Alta'; } else if (diff <= 5) { badgeClass = 'bg-info text-dark'; pt = 'Media'; } else { badgeClass = 'bg-success'; pt = 'Baja'; }
        }
        html += `<tr><td><span class="badge ${badgeClass} w-100 py-2">${pt}</span></td><td class="small"><span class="text-muted d-block">Sol: ${ped.fecha_solicitud}</span><strong class="text-dark d-block">Ent: ${ped.fecha_entrega || 'Pendiente'}</strong></td><td class="fw-bold">${ped.cliente}</td><td>${ped.producto} <br><small class="text-muted">${ped.descripcion || ''}</small></td><td class="fw-bold">${ped.precio > 0 ? '₡' + ped.precio.toLocaleString() : 'Pendiente'}</td><td class="text-center text-nowrap"><button class="btn btn-outline-success btn-accion" onclick="window.entregarPedido('${ped.id}')">✅</button> <button class="btn btn-outline-secondary btn-accion" onclick="window.abrirModalPedido('${ped.id}')">✏️</button> <button class="btn btn-outline-danger btn-accion" onclick="window.cancelarPedido('${ped.id}')">❌</button></td></tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="6" class="text-center py-4 text-muted">No hay pedidos pendientes.</td></tr>';
}
['filtro-pedido-texto', 'filtro-pedido-solicitud', 'filtro-pedido-entrega'].forEach(id => { document.getElementById(id).addEventListener('input', renderizarPedidos); });
document.getElementById('btn-limpiar-pedidos').addEventListener('click', () => { document.getElementById('filtro-pedido-texto').value = ''; document.getElementById('filtro-pedido-solicitud').value = ''; document.getElementById('filtro-pedido-entrega').value = ''; renderizarPedidos(); });

window.cancelarPedido = async (id) => { if ((await Swal.fire({ title: '¿Cancelar pedido?', icon: 'warning', showCancelButton: true })).isConfirmed) await updateDoc(doc(db, "pedidos", id), { estado: 'Cancelado', fecha_cierre: obtenerFechaLocal() }); };

// ==========================================
// 6. FLUJO DE PAGO Y GENERACIÓN DE RECIBO
// ==========================================
window.entregarPedido = async (id) => {
    const ped = listaPedidos.find(p => p.id === id); if (!ped) return;
    let precioTotal = ped.precio;

    if (!precioTotal || precioTotal === 0) {
        const { value: nP } = await Swal.fire({ title: 'Fijar Precio', input: 'number', text: 'El pedido no tiene precio. Ingrésalo:', showCancelButton: true });
        if (!nP) return; precioTotal = parseFloat(nP); await updateDoc(doc(db, "pedidos", id), { precio: precioTotal }); ped.precio = precioTotal;
    }

    const result = await Swal.fire({
        title: 'Entregar y Cobrar',
        html: `
            <div class="mb-3 text-start"><label class="fw-bold">Monto pagado hoy (Total: ₡${precioTotal})</label><input id="swal-monto" type="number" class="form-control border-primary" value="${precioTotal}"></div>
            <div class="mb-3 text-start"><label class="fw-bold">Método de Pago</label><select id="swal-metodo" class="form-select border-primary"><option value="Efectivo">Efectivo 💵</option><option value="Sinpe Móvil">Sinpe Móvil 📱</option><option value="Transferencia">Transferencia 🏦</option></select></div>
        `,
        showCancelButton: true, confirmButtonText: 'Registrar', confirmButtonColor: '#198754',
        preConfirm: () => {
            const m = parseFloat(document.getElementById('swal-monto').value); const met = document.getElementById('swal-metodo').value;
            if (!m || m < 0) { Swal.showValidationMessage('Ingrese un monto válido'); return false; } return { monto: m, metodo: met };
        }
    });

    if (result.isConfirmed) {
        const montoCobrado = result.value.monto; const metodoPago = result.value.metodo; const fechaHoy = obtenerFechaLocal();
        try {
            await updateDoc(doc(db, "pedidos", id), { estado: 'Entregado', monto_pagado: montoCobrado, fecha_cierre: fechaHoy });
            if (montoCobrado > 0) await addDoc(collection(db, "movimientos"), { tipo: 'entrada', metodo_pago: metodoPago, fecha: fechaHoy, descripcion: `Pago: ${ped.producto}`, entidad: ped.cliente, monto: montoCobrado, timestamp: new Date() });

            // Lógica del Ticket
            const saldoActual = precioTotal - montoCobrado;
            const estadoRecibo = saldoActual <= 0 ? 'PAGADO EN SU TOTALIDAD' : 'SALDO PENDIENTE';

            Swal.fire({
                title: '¡Guardado!', text: '¿Deseas descargar el recibo como imagen para enviarlo al cliente?', icon: 'success',
                showCancelButton: true, confirmButtonText: 'Sí, descargar recibo', cancelButtonText: 'No, gracias'
            }).then((res2) => {
                if (res2.isConfirmed) generarTicket(ped.cliente, ped.producto, precioTotal, montoCobrado, Math.max(0, saldoActual), estadoRecibo, metodoPago);
            });
        } catch (e) { Swal.fire('Error', 'Hubo un error.', 'error'); }
    }
};

window.abonarPedido = async (id) => {
    const ped = listaPedidos.find(p => p.id === id); if (!ped) return;
    const deudaAnterior = ped.precio - (ped.monto_pagado || 0);

    const result = await Swal.fire({
        title: 'Ingresar Abono',
        html: `
            <div class="mb-3 text-start"><label class="fw-bold">Deuda Actual: ₡${deudaAnterior.toLocaleString()}</label><input id="swal-monto" type="number" class="form-control border-success" placeholder="¿Cuánto abona hoy?"></div>
            <div class="mb-3 text-start"><label class="fw-bold">Método de Pago</label><select id="swal-metodo" class="form-select"><option value="Efectivo">Efectivo 💵</option><option value="Sinpe Móvil">Sinpe Móvil 📱</option><option value="Transferencia">Transferencia 🏦</option></select></div>
        `,
        showCancelButton: true, confirmButtonText: 'Abonar',
        preConfirm: () => {
            const m = parseFloat(document.getElementById('swal-monto').value); const met = document.getElementById('swal-metodo').value;
            if (!m || m <= 0) { Swal.showValidationMessage('Ingrese un monto válido'); return false; } return { monto: m, metodo: met };
        }
    });

    if (result.isConfirmed) {
        const abono = result.value.monto; const metodo = result.value.metodo;
        const nuevoPagado = (ped.monto_pagado || 0) + abono; const deudaNueva = ped.precio - nuevoPagado;

        try {
            await updateDoc(doc(db, "pedidos", id), { monto_pagado: nuevoPagado });
            await addDoc(collection(db, "movimientos"), { tipo: 'entrada', metodo_pago: metodo, fecha: obtenerFechaLocal(), descripcion: `Abono: ${ped.producto}`, entidad: ped.cliente, monto: abono, timestamp: new Date() });

            const estadoRecibo = deudaNueva <= 0 ? 'DEUDA CANCELADA TOTALMENTE' : 'SALDO ACTUALIZADO';

            Swal.fire({
                title: '¡Abono registrado!', text: '¿Descargar el comprobante de abono?', icon: 'success',
                showCancelButton: true, confirmButtonText: 'Sí, descargar', cancelButtonText: 'Cerrar'
            }).then((res2) => {
                if (res2.isConfirmed) generarTicket(ped.cliente, ped.producto, deudaAnterior, abono, Math.max(0, deudaNueva), estadoRecibo, metodo);
            });
        } catch (e) { }
    }
};

// ==========================================
// 7. HISTORIAL DE PEDIDOS
// ==========================================
const fHist = document.getElementById('filtro-historial'); fHist.addEventListener('change', renderizarHistorialPedidos);
function renderizarHistorialPedidos() {
    if (!vistas.historial.classList.contains('active')) return;
    let hist = listaPedidos.filter(p => p.estado !== 'Pendiente').sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));
    const fa = fHist.value;
    if (fa === 'con_saldo') hist = hist.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) > 0);
    else if (fa === 'entregados') hist = hist.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) <= 0);
    else if (fa === 'cancelados') hist = hist.filter(p => p.estado === 'Cancelado');

    const tbody = document.getElementById('tabla-historial'); let html = '';
    hist.forEach(ped => {
        let badge = ped.estado === 'Entregado' ? 'bg-success' : 'bg-danger'; let est = ped.estado;
        const deuda = (ped.precio || 0) - (ped.monto_pagado || 0); let tp = `Pagado: ₡${(ped.monto_pagado || 0).toLocaleString()}`; let btn = '';
        if (ped.estado === 'Entregado') {
            if (deuda > 0) { badge = 'bg-warning text-dark'; est = 'Con Saldo'; tp += `<br><small class="text-danger fw-bold">Debe: ₡${deuda.toLocaleString()}</small>`; btn = `<button class="btn btn-sm btn-success w-100 mt-1 mb-1" onclick="window.abonarPedido('${ped.id}')">💰 Abonar</button>`; }
            else if (deuda < 0) tp += `<br><small class="text-success fw-bold">+ Propina: ₡${Math.abs(deuda).toLocaleString()}</small>`;
        }
        html += `<tr><td><span class="badge ${badge}">${est}</span></td><td>${ped.fecha_cierre}</td><td class="fw-bold">${ped.cliente}</td><td>${ped.producto}</td><td>${ped.estado === 'Cancelado' ? '-' : tp}</td><td class="text-center align-middle">${btn}<button class="btn btn-sm btn-outline-danger w-100" onclick="window.borrarHistorialPedido('${ped.id}')">🗑️ Borrar</button></td></tr>`;
    });
    tbody.innerHTML = html || `<tr><td colspan="6" class="text-center py-4 text-muted">Vacio</td></tr>`;
}
window.borrarHistorialPedido = async (id) => { if ((await Swal.fire({ title: '¿Borrar?', icon: 'warning', showCancelButton: true })).isConfirmed) await deleteDoc(doc(db, "pedidos", id)); };

// ==========================================
// 8. FINANZAS Y CAJA
// ==========================================
document.getElementById('fecha-mov').value = obtenerFechaLocal();
document.getElementById('form-movimiento').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
        await addDoc(collection(db, "movimientos"), {
            tipo: document.getElementById('tipo').value, fecha: document.getElementById('fecha-mov').value,
            metodo_pago: document.getElementById('metodo-pago-mov').value, descripcion: document.getElementById('descripcion-mov').value.trim(),
            entidad: document.getElementById('entidad-mov').value.trim(), monto: parseFloat(document.getElementById('monto-mov').value), timestamp: new Date()
        });
        e.target.reset(); document.getElementById('fecha-mov').value = obtenerFechaLocal(); Swal.fire({ icon: 'success', title: 'Guardado', timer: 1000, showConfirmButton: false });
    } catch (err) { } finally { btn.disabled = false; }
});

function cargarFinanzas() {
    onSnapshot(query(collection(db, "movimientos"), orderBy("fecha", "desc")), (snapshot) => {
        listaMovimientos = []; snapshot.forEach(doc => listaMovimientos.push({ id: doc.id, ...doc.data() }));
        if (vistas.reportes.classList.contains('active')) generarReporteFinanciero(); if (vistas.dashboard.classList.contains('active')) renderizarDashboard();
    });
}

const fModo = document.getElementById('filtro-modo'), fIni = document.getElementById('filtro-inicio'), fFin = document.getElementById('filtro-fin');
[fModo, fIni, fFin].forEach(el => el.addEventListener('input', generarReporteFinanciero));

function generarReporteFinanciero() {
    if (!vistas.reportes.classList.contains('active')) return;
    let filtrados = listaMovimientos;
    if (fIni.value) filtrados = filtrados.filter(m => m.fecha >= fIni.value); if (fFin.value) filtrados = filtrados.filter(m => m.fecha <= fFin.value);
    if (fModo.value !== 'ambos') filtrados = filtrados.filter(m => m.tipo === (fModo.value === 'entradas' ? 'entrada' : 'salida'));
    datosParaExportar = filtrados; let tEnt = 0, tSal = 0, html = '';

    filtrados.forEach(m => {
        if (m.tipo === 'entrada') tEnt += m.monto; else tSal += m.monto;
        let badgeMetodo = `<span class="badge bg-secondary ms-2">${m.metodo_pago || 'Manual'}</span>`;
        html += `<tr><td class="text-nowrap">${m.fecha}</td><td><strong>${m.descripcion}</strong> ${badgeMetodo}<br><small class="text-muted">${m.entidad || ''}</small></td><td class="${m.tipo === 'entrada' ? 'text-success' : 'text-danger'} fw-bold text-nowrap">₡${m.monto.toLocaleString()}</td><td class="text-center text-nowrap"><button class="btn btn-sm btn-outline-secondary btn-accion" onclick="window.editarMov('${m.id}')">✏️</button> <button class="btn btn-sm btn-outline-danger btn-accion" onclick="window.borrarMov('${m.id}')">🗑️</button></td></tr>`;
    });
    document.getElementById('tabla-reportes').innerHTML = html || '<tr><td colspan="4" class="text-center">No hay movimientos.</td></tr>';
    document.getElementById('resumen-entradas').textContent = `₡${tEnt.toLocaleString()}`; document.getElementById('resumen-salidas').textContent = `₡${tSal.toLocaleString()}`; document.getElementById('resumen-balance').textContent = `₡${(tEnt - tSal).toLocaleString()}`;
    dibujarGraficoFinanciero(tEnt, tSal, fModo.value);
}

// Lógica editar/borrar movimientos igual...
window.editarMov = (id) => { const mov = listaMovimientos.find(m => m.id === id); if (!mov) return; document.getElementById('edit-id-mov').value = mov.id; document.getElementById('edit-tipo-mov').value = mov.tipo; document.getElementById('edit-fecha-mov').value = mov.fecha; document.getElementById('edit-desc-mov').value = mov.descripcion; document.getElementById('edit-ent-mov').value = mov.entidad || ''; document.getElementById('edit-monto-mov').value = mov.monto; modalEditarMovInstancia.show(); };
document.getElementById('form-editar-mov').addEventListener('submit', async (e) => { e.preventDefault(); try { await updateDoc(doc(db, "movimientos", document.getElementById('edit-id-mov').value), { tipo: document.getElementById('edit-tipo-mov').value, fecha: document.getElementById('edit-fecha-mov').value, descripcion: document.getElementById('edit-desc-mov').value.trim(), entidad: document.getElementById('edit-ent-mov').value.trim(), monto: parseFloat(document.getElementById('edit-monto-mov').value) }); modalEditarMovInstancia.hide(); Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1500, showConfirmButton: false }); } catch (error) { } });
window.borrarMov = async (id) => { if ((await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true })).isConfirmed) await deleteDoc(doc(db, "movimientos", id)); };

function dibujarGraficoFinanciero(entradas, salidas, modo) {
    if (graficoInstancia) graficoInstancia.destroy(); if (entradas === 0 && salidas === 0) return;
    let l = [], d = [], c = [];
    if (modo === 'ambos') { l = ['Ingresos', 'Gastos']; d = [entradas, salidas]; c = ['#198754', '#dc3545']; } else if (modo === 'entradas') { l = ['Ingresos']; d = [entradas]; c = ['#198754']; } else if (modo === 'salidas') { l = ['Gastos']; d = [salidas]; c = ['#dc3545']; }
    graficoInstancia = new Chart(document.getElementById('miGrafico').getContext('2d'), { type: 'doughnut', data: { labels: l, datasets: [{ data: d, backgroundColor: c }] }, options: { responsive: true, maintainAspectRatio: false } });
}

// ==========================================
// 9. INTELIGENCIA DE NEGOCIOS (DASHBOARD CRM Y ESTADÍSTICA)
// ==========================================
function renderizarDashboard() {
    if (!vistas.dashboard.classList.contains('active')) return;

    // A. CRM: Perfiles de Clientes
    const clientesMap = {};
    let clientesNuevosMes = 0; let clientesRecurrentesMes = 0;
    const mesActual = obtenerFechaLocal().substring(0, 7);

    listaPedidos.forEach(p => {
        if (p.estado !== 'Cancelado' && p.cliente) {
            const nombre = p.cliente.trim().toUpperCase();
            if (!clientesMap[nombre]) clientesMap[nombre] = { total: 0, ultimaCompra: '2000-01-01', comprasTotales: 0, mesesActivos: new Set() };
            clientesMap[nombre].total += (p.precio || 0);
            clientesMap[nombre].comprasTotales += 1;
            clientesMap[nombre].mesesActivos.add(p.fecha_solicitud.substring(0, 7));
            if (p.fecha_solicitud > clientesMap[nombre].ultimaCompra) clientesMap[nombre].ultimaCompra = p.fecha_solicitud;
        }
    });

    const top5 = Object.entries(clientesMap).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    let htmlCRM = '';
    top5.forEach((cli, index) => {
        let medalla = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
        htmlCRM += `<li class="list-group-item d-flex justify-content-between align-items-start">
                        <div class="ms-2 me-auto"><div class="fw-bold">${medalla} ${cli[0]}</div><span class="small text-muted">Última compra: ${cli[1].ultimaCompra} (${cli[1].comprasTotales} pedidos)</span></div>
                        <span class="badge bg-success rounded-pill">₡${cli[1].total.toLocaleString()}</span>
                    </li>`;
    });
    document.getElementById('lista-crm-clientes').innerHTML = htmlCRM || '<li class="list-group-item">No hay datos suficientes.</li>';

    // B. VOLATILIDAD (Desviación Estándar)
    const ingresosPorMes = {};
    listaMovimientos.filter(m => m.tipo === 'entrada').forEach(m => {
        const mes = m.fecha.substring(0, 7);
        ingresosPorMes[mes] = (ingresosPorMes[mes] || 0) + m.monto;
    });

    const valores = Object.values(ingresosPorMes);
    const boxAlerta = document.getElementById('alerta-volatilidad');
    const txtRecom = document.getElementById('stat-recomendacion');

    if (valores.length < 2) {
        document.getElementById('stat-media').textContent = 'N/A'; document.getElementById('stat-desv').textContent = 'N/A';
        boxAlerta.className = 'alert alert-secondary text-center py-2 mb-3 fw-bold'; boxAlerta.textContent = 'Faltan meses de registro';
        txtRecom.textContent = 'Necesitas al menos 2 meses de ventas registradas para calcular la volatilidad.';
    } else {
        const n = valores.length;
        const media = valores.reduce((a, b) => a + b, 0) / n;
        // Formula varianza poblacional: (Sumatoria (Xi - media)^2) / N
        const varianza = valores.reduce((a, b) => a + Math.pow(b - media, 2), 0) / n;
        const desvEstandar = Math.sqrt(varianza);
        const coefVariacion = desvEstandar / media;

        document.getElementById('stat-media').textContent = `₡${Math.round(media).toLocaleString()}`;
        document.getElementById('stat-desv').textContent = `₡${Math.round(desvEstandar).toLocaleString()}`;

        if (coefVariacion > 0.4) {
            boxAlerta.className = 'alert alert-danger text-center py-2 mb-3 fw-bold'; boxAlerta.innerHTML = '⚠️ Alta Volatilidad Detectada';
            txtRecom.innerHTML = 'Tus ingresos varían bruscamente. <strong>Sugerencia:</strong> Crea un fondo de emergencia empresarial que cubra al menos 2 meses de tus gastos fijos (materiales/tiempo) por si las ventas bajan.';
        } else if (coefVariacion > 0.15) {
            boxAlerta.className = 'alert alert-warning text-center py-2 mb-3 fw-bold text-dark'; boxAlerta.innerHTML = '⚖️ Volatilidad Moderada';
            txtRecom.innerHTML = 'Flujo de caja normal para un emprendimiento. Mantén tus reservas actuales e intenta fidelizar a tus clientes Top 5 para asegurar ingresos fijos.';
        } else {
            boxAlerta.className = 'alert alert-success text-center py-2 mb-3 fw-bold'; boxAlerta.innerHTML = '✅ Ingresos Altamente Estables';
            txtRecom.innerHTML = '¡Excelente! Tus ventas son predecibles mes a mes. Es un buen momento para invertir en crecer (ej. comprar un equipo de corte nuevo o hacer publicidad).';
        }
    }

    // C. ESTACIONALIDAD (Categorización simple)
    const categoriasMap = {};
    listaPedidos.forEach(p => {
        if (p.estado !== 'Cancelado' && p.producto) {
            const prod = p.producto.toLowerCase();
            // Asignación rápida de keywords para estacionalidad
            let cat = 'Otros Diseños';
            if (prod.includes('taza')) cat = 'Tazas';
            else if (prod.includes('camis') || prod.includes('textil')) cat = 'Textiles (Camisas)';
            else if (prod.includes('sticker') || prod.includes('vinil') || prod.includes('corte')) cat = 'Stickers/Viniles';

            categoriasMap[cat] = (categoriasMap[cat] || 0) + 1;
        }
    });

    const topCategorias = Object.entries(categoriasMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (graficoEstacionalidad) graficoEstacionalidad.destroy();
    graficoEstacionalidad = new Chart(document.getElementById('graficoEstacionalidad').getContext('2d'), {
        type: 'bar',
        data: {
            labels: topCategorias.map(c => c[0]),
            datasets: [{ label: 'Cantidad de Trabajos Realizados', data: topCategorias.map(c => c[1]), backgroundColor: '#3498db' }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// Exportar doc code igual...
document.getElementById('btn-export-pdf').addEventListener('click', () => { if (datosParaExportar.length === 0) return Swal.fire('Aviso', 'Vacío', 'warning'); const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(16); doc.text("Reporte Financiero - MASUCRI", 14, 15); doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleDateString('es-CR')}`, 14, 22); const tableRows = datosParaExportar.map(m => [m.fecha, m.metodo_pago || 'N/A', m.tipo.toUpperCase(), m.descripcion, `₡${m.monto.toLocaleString()}`]); doc.autoTable({ head: [["Fecha", "Método", "Tipo", "Concepto", "Monto"]], body: tableRows, startY: 28, theme: 'striped' }); doc.save(`Finanzas_MASUCRI.pdf`); });
document.getElementById('btn-export-excel').addEventListener('click', () => { if (datosParaExportar.length === 0) return Swal.fire('Aviso', 'Vacío', 'warning'); const dataSheet = datosParaExportar.map(m => ({ "Fecha": m.fecha, "Método": m.metodo_pago || 'N/A', "Tipo": m.tipo.toUpperCase(), "Concepto": m.descripcion, "Monto (₡)": m.monto })); const ws = XLSX.utils.json_to_sheet(dataSheet); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Reporte"); XLSX.writeFile(wb, `Finanzas_MASUCRI.xlsx`); });