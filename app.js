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

const CORREOS_PERMITIDOS = [
    "ulloarodriguezchris@gmail.com",
    "anisrmj5@gmail.com"
];

let listaMovimientos = [];
let listaPedidos = [];
let datosParaExportar = [];
let graficoInstancia = null;
let modalPedidoInstancia = null;
let modalEditarMovInstancia = null;

function obtenerFechaLocal() {
    const hoy = new Date();
    const tzOffset = hoy.getTimezoneOffset() * 60000;
    return new Date(hoy.getTime() - tzOffset).toISOString().split('T')[0];
}

// ==========================================
// 3. AUTENTICACIÓN Y NAVEGACIÓN
// ==========================================
const vistas = {
    pedidos: document.getElementById('vista-pedidos'),
    historial: document.getElementById('vista-historial'),
    registro: document.getElementById('vista-registro'),
    reportes: document.getElementById('vista-reportes')
};
const navLinks = {
    pedidos: document.getElementById('nav-pedidos'),
    historial: document.getElementById('nav-historial'),
    registro: document.getElementById('nav-registro'),
    reportes: document.getElementById('nav-reportes')
};

function cambiarVista(vistaActiva) {
    Object.values(vistas).forEach(v => v.classList.remove('active'));
    Object.values(navLinks).forEach(n => n.classList.remove('active'));
    vistas[vistaActiva].classList.add('active');
    navLinks[vistaActiva].classList.add('active');

    if (vistaActiva === 'reportes') generarReporteFinanciero();
    if (vistaActiva === 'pedidos') renderizarPedidos();
    if (vistaActiva === 'historial') renderizarHistorialPedidos();

    const navbarCollapse = document.getElementById('navbarNav');
    if (navbarCollapse.classList.contains('show')) {
        document.querySelector('.navbar-toggler').click();
    }
}
Object.keys(navLinks).forEach(key => { navLinks[key].addEventListener('click', (e) => { e.preventDefault(); cambiarVista(key); }); });

document.getElementById('btn-login').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { Swal.fire('Error', 'Hubo un error al iniciar sesión.', 'error'); }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    if ((await Swal.fire({ title: '¿Cerrar sesión?', icon: 'warning', showCancelButton: true })).isConfirmed) await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
    if (user && CORREOS_PERMITIDOS.includes(user.email)) {
        document.getElementById('login-container').classList.add('d-none');
        document.getElementById('app-container').classList.remove('d-none');
        document.getElementById('app-container').classList.add('d-flex');
        document.getElementById('user-info').textContent = `Admin: ${user.displayName}`;

        modalPedidoInstancia = new bootstrap.Modal(document.getElementById('modalPedido'));
        modalEditarMovInstancia = new bootstrap.Modal(document.getElementById('modalEditarMov'));

        cargarPedidos();
        cargarFinanzas();
        cambiarVista('pedidos');
    } else if (user) {
        await signOut(auth);
        Swal.fire({ icon: 'error', title: 'Acceso Denegado', text: 'No tienes permisos para este sistema.' });
    } else {
        document.getElementById('login-container').classList.remove('d-none');
        document.getElementById('app-container').classList.add('d-none');
        document.getElementById('app-container').classList.remove('d-flex');
    }
});

// ==========================================
// 4. MÓDULO: GESTIÓN DE PEDIDOS
// ==========================================
function cargarPedidos() {
    onSnapshot(query(collection(db, "pedidos"), orderBy("fecha_entrega", "asc")), (snapshot) => {
        listaPedidos = [];
        snapshot.forEach(doc => listaPedidos.push({ id: doc.id, ...doc.data() }));
        renderizarPedidos();
        renderizarHistorialPedidos();
    });
}

window.abrirModalPedido = (id = null) => {
    const form = document.getElementById('form-pedido');
    form.reset();
    document.getElementById('ped-id').value = '';
    document.getElementById('ped-solicitado').value = obtenerFechaLocal();
    document.getElementById('tituloModalPedido').textContent = 'Nuevo Pedido';

    if (id) {
        const ped = listaPedidos.find(p => p.id === id);
        if (ped) {
            document.getElementById('tituloModalPedido').textContent = 'Editar Pedido';
            document.getElementById('ped-id').value = ped.id;
            document.getElementById('ped-solicitado').value = ped.fecha_solicitud;

            if (ped.fecha_entrega) {
                document.getElementById('ped-entrega').value = ped.fecha_entrega;
            }

            document.getElementById('ped-cliente').value = ped.cliente;
            document.getElementById('ped-producto').value = ped.producto;
            document.getElementById('ped-desc').value = ped.descripcion || '';
            document.getElementById('ped-precio').value = ped.precio || '';
        }
    }
    modalPedidoInstancia.show();
}

document.getElementById('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ped-id').value;
    const fEntrega = document.getElementById('ped-entrega').value;
    const precioVal = parseFloat(document.getElementById('ped-precio').value) || 0;

    const datos = {
        fecha_solicitud: document.getElementById('ped-solicitado').value,
        fecha_entrega: fEntrega,
        cliente: document.getElementById('ped-cliente').value.trim(),
        producto: document.getElementById('ped-producto').value.trim(),
        descripcion: document.getElementById('ped-desc').value.trim(),
        precio: precioVal,
    };

    if (datos.fecha_entrega && datos.fecha_entrega < datos.fecha_solicitud) {
        return Swal.fire('Error', 'La fecha de entrega no puede ser menor a la de solicitud.', 'error');
    }

    const btnSubmit = e.target.querySelector('button');
    btnSubmit.disabled = true;

    try {
        if (id) {
            await updateDoc(doc(db, "pedidos", id), datos);
            Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1000, showConfirmButton: false });
        } else {
            datos.estado = 'Pendiente';
            datos.monto_pagado = 0;
            datos.timestamp = new Date();
            await addDoc(collection(db, "pedidos"), datos);
            Swal.fire({ icon: 'success', title: 'Pedido Guardado', timer: 1000, showConfirmButton: false });
        }
        modalPedidoInstancia.hide();
    } catch (e) { Swal.fire('Error', 'No se pudo guardar.', 'error'); }
    finally { btnSubmit.disabled = false; }
});

function renderizarPedidos() {
    if (!vistas.pedidos.classList.contains('active')) return;
    let pendientes = listaPedidos.filter(p => p.estado === 'Pendiente');

    const txt = document.getElementById('filtro-pedido-texto').value.toLowerCase();
    const fSol = document.getElementById('filtro-pedido-solicitud').value;
    const fEnt = document.getElementById('filtro-pedido-entrega').value;

    if (txt) pendientes = pendientes.filter(p => p.cliente.toLowerCase().includes(txt) || p.producto.toLowerCase().includes(txt));
    if (fSol) pendientes = pendientes.filter(p => p.fecha_solicitud >= fSol);
    if (fEnt) pendientes = pendientes.filter(p => p.fecha_entrega && p.fecha_entrega <= fEnt);

    const tbody = document.getElementById('tabla-pedidos');
    let html = '';
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    pendientes.forEach(ped => {
        let badgeClass = '', prioridadTxt = '';

        if (!ped.fecha_entrega) {
            badgeClass = 'bg-secondary'; prioridadTxt = 'Sin Fecha';
        } else {
            const fEntregaDate = new Date(ped.fecha_entrega + 'T00:00:00');
            const diffDays = Math.ceil((fEntregaDate - hoy) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) { badgeClass = 'bg-danger'; prioridadTxt = 'Atrasado'; }
            else if (diffDays === 0) { badgeClass = 'bg-danger'; prioridadTxt = 'Para Hoy'; }
            else if (diffDays <= 2) { badgeClass = 'bg-warning text-dark'; prioridadTxt = 'Alta'; }
            else if (diffDays <= 5) { badgeClass = 'bg-info text-dark'; prioridadTxt = 'Media'; }
            else { badgeClass = 'bg-success'; prioridadTxt = 'Baja'; }
        }

        const fechaEntTxt = ped.fecha_entrega ? ped.fecha_entrega : '<span class="text-warning">Pendiente</span>';
        const precioTxt = ped.precio > 0 ? `₡${ped.precio.toLocaleString('es-CR')}` : '<span class="text-warning">Pendiente</span>';

        html += `
            <tr>
                <td><span class="badge ${badgeClass} w-100 py-2">${prioridadTxt}</span></td>
                <td class="small"><span class="text-muted d-block">Sol: ${ped.fecha_solicitud}</span><strong class="text-dark d-block">Ent: ${fechaEntTxt}</strong></td>
                <td class="fw-bold">${ped.cliente}</td>
                <td>${ped.producto} <br><small class="text-muted">${ped.descripcion || ''}</small></td>
                <td class="fw-bold">${precioTxt}</td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-outline-success btn-accion" onclick="window.entregarPedido('${ped.id}')" title="Marcar Entregado">✅</button>
                    <button class="btn btn-outline-secondary btn-accion" onclick="window.abrirModalPedido('${ped.id}')" title="Editar">✏️</button>
                    <button class="btn btn-outline-danger btn-accion" onclick="window.cancelarPedido('${ped.id}')" title="Cancelar Pedido">❌</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html || '<tr><td colspan="6" class="text-center py-4 text-muted">No hay pedidos pendientes.</td></tr>';
}

['filtro-pedido-texto', 'filtro-pedido-solicitud', 'filtro-pedido-entrega'].forEach(id => { document.getElementById(id).addEventListener('input', renderizarPedidos); });
document.getElementById('btn-limpiar-pedidos').addEventListener('click', () => {
    document.getElementById('filtro-pedido-texto').value = '';
    document.getElementById('filtro-pedido-solicitud').value = '';
    document.getElementById('filtro-pedido-entrega').value = '';
    renderizarPedidos();
});

window.cancelarPedido = async (id) => {
    if ((await Swal.fire({ title: '¿Cancelar este pedido?', text: 'Pasará al historial como cancelado.', icon: 'warning', showCancelButton: true })).isConfirmed) {
        await updateDoc(doc(db, "pedidos", id), { estado: 'Cancelado', fecha_cierre: obtenerFechaLocal() });
    }
};

window.entregarPedido = async (id) => {
    const ped = listaPedidos.find(p => p.id === id);
    if (!ped) return;
    let precioActual = ped.precio;

    if (!precioActual || precioActual === 0) {
        const { value: nuevoPrecio } = await Swal.fire({
            title: 'Fijar Precio Final', input: 'number', text: 'Este pedido no tiene precio. Ingresa el precio total acordado:',
            showCancelButton: true, inputValidator: (v) => { if (!v || v <= 0) return 'Ingresa un precio válido'; }
        });
        if (!nuevoPrecio) return;
        precioActual = parseFloat(nuevoPrecio);
        await updateDoc(doc(db, "pedidos", id), { precio: precioActual });
        ped.precio = precioActual;
    }

    const resPago = await Swal.fire({
        title: 'Entregar Pedido', html: `Precio Total: <h3 class="text-success">₡${precioActual.toLocaleString('es-CR')}</h3><br>¿El cliente pagó la totalidad?`,
        icon: 'question', showDenyButton: true, showCancelButton: true,
        confirmButtonText: 'Sí, canceló todo', denyButtonText: 'No, abonó una parte', cancelButtonText: 'Cancelar acción',
        confirmButtonColor: '#198754', denyButtonColor: '#ffc107'
    });

    let montoCobrado = 0;
    if (resPago.isConfirmed) { montoCobrado = precioActual; }
    else if (resPago.isDenied) {
        const { value: montoIngresado } = await Swal.fire({
            title: 'Monto Recibido', input: 'number', inputLabel: 'Ingrese la cantidad en colones que el cliente pagó hoy:',
            showCancelButton: true, inputValidator: (v) => { if (!v || v < 0) return 'Ingrese un monto válido'; }
        });
        if (!montoIngresado) return;
        montoCobrado = parseFloat(montoIngresado);
    } else { return; }

    try {
        const fechaHoy = obtenerFechaLocal();
        await updateDoc(doc(db, "pedidos", id), { estado: 'Entregado', monto_pagado: montoCobrado, fecha_cierre: fechaHoy });
        if (montoCobrado > 0) {
            await addDoc(collection(db, "movimientos"), {
                tipo: 'entrada', fecha: fechaHoy, descripcion: `Pago de pedido: ${ped.producto}`,
                entidad: ped.cliente, monto: montoCobrado, timestamp: new Date()
            });
        }
        Swal.fire('¡Éxito!', 'Pedido entregado y caja actualizada.', 'success');
    } catch (e) { Swal.fire('Error', 'Hubo un error.', 'error'); }
};

// ==========================================
// 6. HISTORIAL DE PEDIDOS Y ABONOS (CON FILTRO DE SALDO)
// ==========================================
const filtroHistorial = document.getElementById('filtro-historial');
filtroHistorial.addEventListener('change', renderizarHistorialPedidos);

function renderizarHistorialPedidos() {
    if (!vistas.historial.classList.contains('active')) return;

    let historial = listaPedidos.filter(p => p.estado !== 'Pendiente').sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));
    const filtroActual = filtroHistorial.value;

    if (filtroActual === 'con_saldo') {
        historial = historial.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) > 0);
    } else if (filtroActual === 'entregados') {
        historial = historial.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) <= 0);
    } else if (filtroActual === 'cancelados') {
        historial = historial.filter(p => p.estado === 'Cancelado');
    }

    const tbody = document.getElementById('tabla-historial');
    let html = '';

    historial.forEach(ped => {
        let estadoTxt = ped.estado;
        let badge = ped.estado === 'Entregado' ? 'bg-success' : 'bg-danger';
        const precioTotal = ped.precio || 0;
        const montoPagado = ped.monto_pagado || 0;
        const deuda = precioTotal - montoPagado;

        let txtPago = `Pagado: ₡${montoPagado.toLocaleString('es-CR')}`;
        let btnAbonar = '';

        if (ped.estado === 'Entregado') {
            if (deuda > 0) {
                badge = 'bg-warning text-dark'; estadoTxt = 'Con Saldo';
                txtPago += `<br><small class="text-danger fw-bold">Debe: ₡${deuda.toLocaleString('es-CR')}</small>`;
                btnAbonar = `<button class="btn btn-sm btn-success w-100 mt-1 mb-1" onclick="window.abonarPedido('${ped.id}')">💰 Abonar</button>`;
            } else if (deuda < 0) {
                txtPago += `<br><small class="text-success fw-bold">+ Propina: ₡${Math.abs(deuda).toLocaleString('es-CR')}</small>`;
            }
        }

        html += `
            <tr>
                <td><span class="badge ${badge}">${estadoTxt}</span></td>
                <td>${ped.fecha_cierre}</td>
                <td class="fw-bold">${ped.cliente}</td>
                <td>${ped.producto}</td>
                <td>${ped.estado === 'Cancelado' ? '-' : txtPago}</td>
                <td class="text-center align-middle">
                    ${btnAbonar}
                    <button class="btn btn-sm btn-outline-danger w-100" onclick="window.borrarHistorialPedido('${ped.id}')" title="Eliminar del Historial">🗑️ Borrar</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html || `<tr><td colspan="6" class="text-center py-4 text-muted">No hay registros para la opción: ${filtroHistorial.options[filtroHistorial.selectedIndex].text}</td></tr>`;
}

window.abonarPedido = async (id) => {
    const ped = listaPedidos.find(p => p.id === id);
    if (!ped) return;
    const deuda = ped.precio - (ped.monto_pagado || 0);

    const { value: abono } = await Swal.fire({
        title: 'Ingresar Abono', input: 'number',
        html: `El cliente debe: <b>₡${deuda.toLocaleString('es-CR')}</b><br>¿Cuánto está abonando hoy?`,
        showCancelButton: true, inputValidator: (v) => { if (!v || v <= 0) return 'Ingrese un monto válido'; }
    });

    if (abono) {
        try {
            const montoAbono = parseFloat(abono);
            const nuevoPagado = (ped.monto_pagado || 0) + montoAbono;

            await updateDoc(doc(db, "pedidos", id), { monto_pagado: nuevoPagado });
            await addDoc(collection(db, "movimientos"), {
                tipo: 'entrada', fecha: obtenerFechaLocal(), descripcion: `Abono a deuda de pedido: ${ped.producto}`,
                entidad: ped.cliente, monto: montoAbono, timestamp: new Date()
            });

            Swal.fire('¡Éxito!', 'Abono registrado en caja.', 'success');
        } catch (e) { Swal.fire('Error', 'No se pudo guardar el abono.', 'error'); }
    }
};

window.borrarHistorialPedido = async (id) => {
    const result = await Swal.fire({
        title: '¿Eliminar del historial?', text: "Se borrará el pedido permanentemente. Los movimientos en caja no se borrarán.",
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Sí, borrar definitivamente'
    });
    if (result.isConfirmed) {
        try { await deleteDoc(doc(db, "pedidos", id)); Swal.fire({ icon: 'success', title: 'Borrado', timer: 1500, showConfirmButton: false }); }
        catch (error) { Swal.fire('Error', 'No se pudo eliminar el pedido.', 'error'); }
    }
};

// ==========================================
// 7. MÓDULO FINANCIERO (CAJA Y REPORTES)
// ==========================================
document.getElementById('fecha-mov').value = obtenerFechaLocal();

document.getElementById('form-movimiento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button');
    btnSubmit.disabled = true;
    try {
        await addDoc(collection(db, "movimientos"), {
            tipo: document.getElementById('tipo').value,
            fecha: document.getElementById('fecha-mov').value,
            descripcion: document.getElementById('descripcion-mov').value.trim(),
            entidad: document.getElementById('entidad-mov').value.trim(),
            monto: parseFloat(document.getElementById('monto-mov').value),
            timestamp: new Date()
        });
        e.target.reset();
        document.getElementById('fecha-mov').value = obtenerFechaLocal();
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1000, showConfirmButton: false });
    } catch (err) { Swal.fire('Error', 'No se guardó', 'error'); }
    finally { btnSubmit.disabled = false; }
});

function cargarFinanzas() {
    onSnapshot(query(collection(db, "movimientos"), orderBy("fecha", "desc")), (snapshot) => {
        listaMovimientos = [];
        snapshot.forEach((doc) => listaMovimientos.push({ id: doc.id, ...doc.data() }));
        if (vistas.reportes.classList.contains('active')) generarReporteFinanciero();
    });
}

const filtroModo = document.getElementById('filtro-modo');
const filtroInicio = document.getElementById('filtro-inicio');
const filtroFin = document.getElementById('filtro-fin');
[filtroModo, filtroInicio, filtroFin].forEach(el => el.addEventListener('input', generarReporteFinanciero));

function generarReporteFinanciero() {
    if (!vistas.reportes.classList.contains('active')) return;

    let filtrados = listaMovimientos;
    if (filtroInicio.value) filtrados = filtrados.filter(m => m.fecha >= filtroInicio.value);
    if (filtroFin.value) filtrados = filtrados.filter(m => m.fecha <= filtroFin.value);
    if (filtroModo.value !== 'ambos') filtrados = filtrados.filter(m => m.tipo === (filtroModo.value === 'entradas' ? 'entrada' : 'salida'));
    datosParaExportar = filtrados;

    let tEntradas = 0, tSalidas = 0, html = '';

    filtrados.forEach(m => {
        if (m.tipo === 'entrada') tEntradas += m.monto; else tSalidas += m.monto;
        html += `
            <tr>
                <td class="text-nowrap">${m.fecha}</td>
                <td><strong>${m.descripcion}</strong><br><small class="text-muted">${m.entidad || ''}</small></td>
                <td class="${m.tipo === 'entrada' ? 'text-success' : 'text-danger'} fw-bold text-nowrap">₡${m.monto.toLocaleString('es-CR')}</td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-outline-secondary btn-accion" onclick="window.editarMov('${m.id}')" title="Editar">✏️</button>
                    <button class="btn btn-sm btn-outline-danger btn-accion" onclick="window.borrarMov('${m.id}')" title="Borrar">🗑️</button>
                </td>
            </tr>`;
    });

    document.getElementById('tabla-reportes').innerHTML = html || '<tr><td colspan="4" class="text-center text-muted">No hay movimientos.</td></tr>';
    document.getElementById('resumen-entradas').textContent = `₡${tEntradas.toLocaleString('es-CR')}`;
    document.getElementById('resumen-salidas').textContent = `₡${tSalidas.toLocaleString('es-CR')}`;
    document.getElementById('resumen-balance').textContent = `₡${(tEntradas - tSalidas).toLocaleString('es-CR')}`;

    dibujarGraficoFinanciero(tEntradas, tSalidas, filtroModo.value);
}

window.editarMov = (id) => {
    const mov = listaMovimientos.find(m => m.id === id);
    if (!mov) return;
    document.getElementById('edit-id-mov').value = mov.id;
    document.getElementById('edit-tipo-mov').value = mov.tipo;
    document.getElementById('edit-fecha-mov').value = mov.fecha;
    document.getElementById('edit-desc-mov').value = mov.descripcion;
    document.getElementById('edit-ent-mov').value = mov.entidad || '';
    document.getElementById('edit-monto-mov').value = mov.monto;
    modalEditarMovInstancia.show();
};

document.getElementById('form-editar-mov').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id-mov').value;
    try {
        await updateDoc(doc(db, "movimientos", id), {
            tipo: document.getElementById('edit-tipo-mov').value,
            fecha: document.getElementById('edit-fecha-mov').value,
            descripcion: document.getElementById('edit-desc-mov').value.trim(),
            entidad: document.getElementById('edit-ent-mov').value.trim(),
            monto: parseFloat(document.getElementById('edit-monto-mov').value)
        });
        modalEditarMovInstancia.hide();
        Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1500, showConfirmButton: false });
    } catch (error) { Swal.fire('Error', 'No se pudo actualizar.', 'error'); }
});

window.borrarMov = async (id) => {
    if ((await Swal.fire({ title: '¿Eliminar movimiento?', text: "Se borrará del historial financiero.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' })).isConfirmed) {
        try { await deleteDoc(doc(db, "movimientos", id)); Swal.fire({ icon: 'success', title: 'Borrado', timer: 1500, showConfirmButton: false }); }
        catch (error) { Swal.fire('Error', 'No se pudo eliminar.', 'error'); }
    }
};

function dibujarGraficoFinanciero(entradas, salidas, modo) {
    if (graficoInstancia) graficoInstancia.destroy();
    if (entradas === 0 && salidas === 0) return;

    let labels = [], data = [], colors = [];
    if (modo === 'ambos') { labels = ['Ingresos', 'Gastos']; data = [entradas, salidas]; colors = ['#198754', '#dc3545']; }
    else if (modo === 'entradas') { labels = ['Ingresos']; data = [entradas]; colors = ['#198754']; }
    else if (modo === 'salidas') { labels = ['Gastos']; data = [salidas]; colors = ['#dc3545']; }

    graficoInstancia = new Chart(document.getElementById('miGrafico').getContext('2d'), {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

// ==========================================
// 8. EXPORTACIONES (PDF Y EXCEL)
// ==========================================
document.getElementById('btn-export-pdf').addEventListener('click', () => {
    if (datosParaExportar.length === 0) return Swal.fire({ icon: 'warning', title: 'Vacío', text: 'No hay datos para exportar.' });
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Reporte Financiero - MASUCRI", 14, 15);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`Generado el: ${new Date().toLocaleDateString('es-CR')}`, 14, 22);

    const tableRows = datosParaExportar.map(m => [m.fecha, m.tipo.toUpperCase(), m.descripcion, m.entidad || 'N/A', `₡${m.monto.toLocaleString('es-CR')}`]);
    doc.autoTable({ head: [["Fecha", "Tipo", "Concepto", "Entidad", "Monto"]], body: tableRows, startY: 28, theme: 'striped', headStyles: { fillColor: [41, 128, 185] } });
    doc.save(`Finanzas_MASUCRI_${new Date().getTime()}.pdf`);
});

document.getElementById('btn-export-excel').addEventListener('click', () => {
    if (datosParaExportar.length === 0) return Swal.fire({ icon: 'warning', title: 'Vacío', text: 'No hay datos para exportar.' });
    const dataSheet = datosParaExportar.map(m => ({ "Fecha": m.fecha, "Tipo": m.tipo.toUpperCase(), "Concepto": m.descripcion, "Entidad": m.entidad || '', "Monto (₡)": m.monto }));
    const ws = XLSX.utils.json_to_sheet(dataSheet); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `Finanzas_MASUCRI_${new Date().getTime()}.xlsx`);
});