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

// Variables Globales
let listaMovimientos = [];
let listaPedidos = [];
let datosParaExportar = [];
let graficoInstancia = null;
let graficoEstacionalidad = null;
let modalPedidoInstancia = null;
let modalEditarMovInstancia = null;

// ==========================================
// UTILIDADES
// ==========================================
function obtenerFechaLocal() {
    const hoy = new Date();
    const tzOffset = hoy.getTimezoneOffset() * 60000;
    return new Date(hoy.getTime() - tzOffset).toISOString().split('T')[0];
}

async function generarTicket(cliente, producto, precioTotal, deudaAnterior, abono, nuevoSaldo, estado, metodo) {
    document.getElementById('tkt-fecha').textContent = obtenerFechaLocal();
    document.getElementById('tkt-cliente').textContent = cliente;
    document.getElementById('tkt-producto').textContent = producto;
    document.getElementById('tkt-precio-total').textContent = `₡${precioTotal.toLocaleString('es-CR')}`;
    document.getElementById('tkt-anterior').textContent = `₡${deudaAnterior.toLocaleString('es-CR')}`;
    document.getElementById('tkt-abono').textContent = `₡${abono.toLocaleString('es-CR')}`;
    document.getElementById('tkt-metodo').textContent = metodo;
    document.getElementById('tkt-saldo').textContent = `₡${nuevoSaldo.toLocaleString('es-CR')}`;

    const divEstado = document.getElementById('tkt-estado');
    divEstado.textContent = estado;

    if (nuevoSaldo === 0) {
        divEstado.style.background = '#198754';
        divEstado.style.color = '#ffffff';
    } else {
        divEstado.style.background = '#ffc107';
        divEstado.style.color = '#000000';
    }

    const tktElement = document.getElementById('ticket-template');

    try {
        const canvas = await html2canvas(tktElement, {
            scale: 2,
            backgroundColor: '#ffffff'
        });

        const link = document.createElement('a');
        link.download = `Recibo_${cliente.replace(/\s+/g, '_')}_${new Date().getTime()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error("Error generando ticket:", error);
        Swal.fire('Error', 'No se pudo generar la imagen del recibo.', 'error');
    }
}

// ==========================================
// 3. NAVEGACIÓN Y AUTENTICACIÓN
// ==========================================
const vistas = {
    pedidos: document.getElementById('vista-pedidos'),
    historial: document.getElementById('vista-historial'),
    registro: document.getElementById('vista-registro'),
    reportes: document.getElementById('vista-reportes'),
    dashboard: document.getElementById('vista-dashboard')
};

const navLinks = {
    pedidos: document.getElementById('nav-pedidos'),
    historial: document.getElementById('nav-historial'),
    registro: document.getElementById('nav-registro'),
    reportes: document.getElementById('nav-reportes'),
    dashboard: document.getElementById('nav-dashboard')
};

function cambiarVista(vistaActiva) {
    Object.values(vistas).forEach(v => v.classList.remove('active'));
    Object.values(navLinks).forEach(n => n.classList.remove('active'));

    vistas[vistaActiva].classList.add('active');
    navLinks[vistaActiva].classList.add('active');

    if (vistaActiva === 'reportes') generarReporteFinanciero();
    if (vistaActiva === 'pedidos') renderizarPedidos();
    if (vistaActiva === 'historial') renderizarHistorialPedidos();
    if (vistaActiva === 'dashboard') renderizarDashboard();

    const navbarCollapse = document.getElementById('navbarNav');
    if (navbarCollapse.classList.contains('show')) {
        document.querySelector('.navbar-toggler').click();
    }
}

Object.keys(navLinks).forEach(key => {
    navLinks[key].addEventListener('click', (e) => {
        e.preventDefault();
        cambiarVista(key);
    });
});

document.getElementById('btn-login').addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
        Swal.fire('Error', 'Hubo un error al iniciar sesión.', 'error');
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    const result = await Swal.fire({ title: '¿Cerrar sesión?', icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) await signOut(auth);
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
        if (vistas.dashboard.classList.contains('active')) renderizarDashboard();
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
            if (ped.fecha_entrega) document.getElementById('ped-entrega').value = ped.fecha_entrega;
            document.getElementById('ped-cliente').value = ped.cliente;
            document.getElementById('ped-producto').value = ped.producto;
            document.getElementById('ped-desc').value = ped.descripcion || '';
            document.getElementById('ped-precio').value = ped.precio || '';
        }
    }
    modalPedidoInstancia.show();
};

document.getElementById('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ped-id').value;

    const datos = {
        fecha_solicitud: document.getElementById('ped-solicitado').value,
        fecha_entrega: document.getElementById('ped-entrega').value,
        cliente: document.getElementById('ped-cliente').value.trim(),
        producto: document.getElementById('ped-producto').value.trim(),
        descripcion: document.getElementById('ped-desc').value.trim(),
        precio: parseFloat(document.getElementById('ped-precio').value) || 0,
    };

    if (datos.fecha_entrega && datos.fecha_entrega < datos.fecha_solicitud) {
        return Swal.fire('Error', 'La fecha de entrega no puede ser menor a la de solicitud.', 'error');
    }

    const btnSubmit = e.target.querySelector('button');
    btnSubmit.disabled = true;

    try {
        if (id) {
            await updateDoc(doc(db, "pedidos", id), datos);
        } else {
            datos.estado = 'Pendiente';
            datos.monto_pagado = 0;
            datos.timestamp = new Date();
            await addDoc(collection(db, "pedidos"), datos);
        }
        modalPedidoInstancia.hide();
        Swal.fire({ icon: 'success', title: 'Guardado correctamente', timer: 1000, showConfirmButton: false });
    } catch (e) {
        Swal.fire('Error', 'No se pudo guardar el pedido.', 'error');
    } finally {
        btnSubmit.disabled = false;
    }
});

function renderizarPedidos() {
    if (!vistas.pedidos.classList.contains('active')) return;
    let pendientes = listaPedidos.filter(p => p.estado === 'Pendiente');

    const txtFiltro = document.getElementById('filtro-pedido-texto').value.toLowerCase();
    const fechaSolFiltro = document.getElementById('filtro-pedido-solicitud').value;
    const fechaEntFiltro = document.getElementById('filtro-pedido-entrega').value;

    if (txtFiltro) pendientes = pendientes.filter(p => p.cliente.toLowerCase().includes(txtFiltro) || p.producto.toLowerCase().includes(txtFiltro));
    if (fechaSolFiltro) pendientes = pendientes.filter(p => p.fecha_solicitud >= fechaSolFiltro);
    if (fechaEntFiltro) pendientes = pendientes.filter(p => p.fecha_entrega && p.fecha_entrega <= fechaEntFiltro);

    const tbody = document.getElementById('tabla-pedidos');
    let html = '';
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    pendientes.forEach(ped => {
        let badgeClass = '';
        let textoPrioridad = '';

        if (!ped.fecha_entrega) {
            badgeClass = 'bg-secondary';
            textoPrioridad = 'Sin Fecha';
        } else {
            const fechaEntregaObj = new Date(ped.fecha_entrega + 'T00:00:00');
            const diffDias = Math.ceil((fechaEntregaObj - hoy) / (1000 * 60 * 60 * 24));

            if (diffDias < 0) { badgeClass = 'bg-danger'; textoPrioridad = 'Atrasado'; }
            else if (diffDias === 0) { badgeClass = 'bg-danger'; textoPrioridad = 'Para Hoy'; }
            else if (diffDias <= 2) { badgeClass = 'bg-warning text-dark'; textoPrioridad = 'Alta'; }
            else if (diffDias <= 5) { badgeClass = 'bg-info text-dark'; textoPrioridad = 'Media'; }
            else { badgeClass = 'bg-success'; textoPrioridad = 'Baja'; }
        }

        const textoPrecio = ped.precio > 0 ? `₡${ped.precio.toLocaleString('es-CR')}` : '<span class="text-warning">Pendiente</span>';

        html += `
            <tr>
                <td><span class="badge ${badgeClass} w-100 py-2">${textoPrioridad}</span></td>
                <td class="small">
                    <span class="text-muted d-block">Sol: ${ped.fecha_solicitud}</span>
                    <strong class="text-dark d-block">Ent: ${ped.fecha_entrega || 'Pendiente'}</strong>
                </td>
                <td class="fw-bold">${ped.cliente}</td>
                <td>${ped.producto} <br><small class="text-muted">${ped.descripcion || ''}</small></td>
                <td class="fw-bold">${textoPrecio}</td>
                <td class="text-center align-middle">
                    <div class="d-flex justify-content-center gap-1">
                        <button class="btn btn-sm btn-outline-success" onclick="window.entregarPedido('${ped.id}')">Entregar</button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.abrirModalPedido('${ped.id}')">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.cancelarPedido('${ped.id}')">Anular</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html || '<tr><td colspan="6" class="text-center py-4 text-muted">No hay pedidos pendientes en este momento.</td></tr>';
}

['filtro-pedido-texto', 'filtro-pedido-solicitud', 'filtro-pedido-entrega'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderizarPedidos);
});

document.getElementById('btn-limpiar-pedidos').addEventListener('click', () => {
    document.getElementById('filtro-pedido-texto').value = '';
    document.getElementById('filtro-pedido-solicitud').value = '';
    document.getElementById('filtro-pedido-entrega').value = '';
    renderizarPedidos();
});

window.cancelarPedido = async (id) => {
    const result = await Swal.fire({
        title: '¿Anular este pedido?',
        text: 'Pasará al historial como un trabajo anulado o cancelado por el cliente.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, anular',
        confirmButtonColor: '#dc3545'
    });

    if (result.isConfirmed) {
        await updateDoc(doc(db, "pedidos", id), { estado: 'Cancelado', fecha_cierre: obtenerFechaLocal() });
    }
};

// ==========================================
// 5. FLUJO DE PAGO Y GENERACIÓN DE TICKET
// ==========================================
window.entregarPedido = async (id) => {
    const ped = listaPedidos.find(p => p.id === id);
    if (!ped) return;

    let precioTotal = ped.precio;

    if (!precioTotal || precioTotal === 0) {
        const { value: nuevoPrecioStr } = await Swal.fire({
            title: 'Fijar Precio Final',
            input: 'number',
            text: 'Este pedido no tenía un precio definido. Ingresa el total:',
            showCancelButton: true,
            inputValidator: (v) => { if (!v || v <= 0) return 'Debe ingresar un monto mayor a 0'; }
        });

        if (!nuevoPrecioStr) return;

        precioTotal = parseFloat(nuevoPrecioStr);
        await updateDoc(doc(db, "pedidos", id), { precio: precioTotal });
        ped.precio = precioTotal;
    }

    const result = await Swal.fire({
        title: 'Entregar Trabajo y Cobrar',
        html: `
            <div class="mb-3 text-start">
                <label class="fw-bold">Monto pagado hoy (Total a cobrar: ₡${precioTotal.toLocaleString('es-CR')})</label>
                <input id="swal-monto" type="number" class="form-control border-primary mt-1" value="${precioTotal}">
                <small class="text-muted">Puedes cambiar el monto si el cliente solo deja un adelanto.</small>
            </div>
            <div class="mb-3 text-start">
                <label class="fw-bold">Método de Pago</label>
                <select id="swal-metodo" class="form-select border-primary mt-1">
                    <option value="Efectivo">Efectivo</option>
                    <option value="Sinpe Móvil">Sinpe Móvil</option>
                    <option value="Transferencia">Transferencia</option>
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Registrar y Guardar',
        confirmButtonColor: '#198754',
        cancelButtonText: 'Cerrar',
        preConfirm: () => {
            const montoIngresado = parseFloat(document.getElementById('swal-monto').value);
            const metodoSeleccionado = document.getElementById('swal-metodo').value;
            if (!montoIngresado || montoIngresado < 0) {
                Swal.showValidationMessage('Ingrese un monto de pago válido');
                return false;
            }
            return { monto: montoIngresado, metodo: metodoSeleccionado };
        }
    });

    if (result.isConfirmed) {
        const montoCobrado = result.value.monto;
        const metodoPago = result.value.metodo;
        const fechaHoy = obtenerFechaLocal();

        try {
            await updateDoc(doc(db, "pedidos", id), {
                estado: 'Entregado',
                monto_pagado: montoCobrado,
                fecha_cierre: fechaHoy
            });

            if (montoCobrado > 0) {
                await addDoc(collection(db, "movimientos"), {
                    tipo: 'entrada',
                    metodo_pago: metodoPago,
                    fecha: fechaHoy,
                    descripcion: `Pago de pedido: ${ped.producto}`,
                    entidad: ped.cliente,
                    monto: montoCobrado,
                    timestamp: new Date()
                });
            }

            const saldoRestante = precioTotal - montoCobrado;
            let textoEstado = '';
            if (saldoRestante <= 0) {
                textoEstado = 'CANCELADO EN SU TOTALIDAD';
            } else {
                textoEstado = 'ABONO REGISTRADO - QUEDA SALDO';
            }

            Swal.fire({
                title: 'Operación Exitosa',
                text: '¿Deseas descargar el recibo como imagen para enviarlo?',
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: 'Sí, descargar ticket',
                cancelButtonText: 'No, terminar'
            }).then((resDescarga) => {
                if (resDescarga.isConfirmed) {
                    generarTicket(
                        ped.cliente,
                        ped.producto,
                        precioTotal,
                        precioTotal,
                        montoCobrado,
                        Math.max(0, saldoRestante),
                        textoEstado,
                        metodoPago
                    );
                }
            });
        } catch (e) {
            Swal.fire('Error', 'Ocurrió un problema guardando en la base de datos.', 'error');
        }
    }
};

window.abonarPedido = async (id) => {
    const ped = listaPedidos.find(p => p.id === id);
    if (!ped) return;

    const deudaAnterior = ped.precio - (ped.monto_pagado || 0);

    const result = await Swal.fire({
        title: 'Ingresar Nuevo Abono',
        html: `
            <div class="mb-3 text-start">
                <label class="fw-bold">Deuda Actual: ₡${deudaAnterior.toLocaleString('es-CR')}</label>
                <input id="swal-monto" type="number" class="form-control border-success mt-1" placeholder="¿Cuánto dinero abona hoy?">
            </div>
            <div class="mb-3 text-start">
                <label class="fw-bold">Método de Pago</label>
                <select id="swal-metodo" class="form-select mt-1">
                    <option value="Efectivo">Efectivo</option>
                    <option value="Sinpe Móvil">Sinpe Móvil</option>
                    <option value="Transferencia">Transferencia</option>
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar Abono',
        preConfirm: () => {
            const montoAbono = parseFloat(document.getElementById('swal-monto').value);
            const metodoSeleccionado = document.getElementById('swal-metodo').value;
            if (!montoAbono || montoAbono <= 0) {
                Swal.showValidationMessage('Ingrese un monto válido mayor a 0');
                return false;
            }
            return { monto: montoAbono, metodo: metodoSeleccionado };
        }
    });

    if (result.isConfirmed) {
        const montoAbonado = result.value.monto;
        const metodoPago = result.value.metodo;
        const totalPagadoAcumulado = (ped.monto_pagado || 0) + montoAbonado;
        const saldoRestante = ped.precio - totalPagadoAcumulado;

        try {
            await updateDoc(doc(db, "pedidos", id), { monto_pagado: totalPagadoAcumulado });

            await addDoc(collection(db, "movimientos"), {
                tipo: 'entrada',
                metodo_pago: metodoPago,
                fecha: obtenerFechaLocal(),
                descripcion: `Abono a deuda de pedido: ${ped.producto}`,
                entidad: ped.cliente,
                monto: montoAbonado,
                timestamp: new Date()
            });

            let textoEstado = '';
            if (saldoRestante <= 0) {
                textoEstado = 'CANCELADO EN SU TOTALIDAD';
            } else {
                textoEstado = 'ABONO REGISTRADO - QUEDA SALDO';
            }

            Swal.fire({
                title: 'Abono registrado',
                text: '¿Deseas descargar el comprobante del abono?',
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: 'Sí, descargar recibo',
                cancelButtonText: 'Cerrar'
            }).then((resDescarga) => {
                if (resDescarga.isConfirmed) {
                    generarTicket(
                        ped.cliente,
                        ped.producto,
                        ped.precio,
                        deudaAnterior,
                        montoAbonado,
                        Math.max(0, saldoRestante),
                        textoEstado,
                        metodoPago
                    );
                }
            });
        } catch (e) {
            Swal.fire('Error', 'No se pudo guardar el abono.', 'error');
        }
    }
};

// ==========================================
// 6. HISTORIAL DE PEDIDOS
// ==========================================
const selectFiltroHistorial = document.getElementById('filtro-historial');
selectFiltroHistorial.addEventListener('change', renderizarHistorialPedidos);

function renderizarHistorialPedidos() {
    if (!vistas.historial.classList.contains('active')) return;

    let historial = listaPedidos.filter(p => p.estado !== 'Pendiente').sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));
    const tipoFiltro = selectFiltroHistorial.value;

    if (tipoFiltro === 'con_saldo') {
        historial = historial.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) > 0);
    } else if (tipoFiltro === 'entregados') {
        historial = historial.filter(p => p.estado === 'Entregado' && (p.precio - (p.monto_pagado || 0)) <= 0);
    } else if (tipoFiltro === 'anulados') {
        historial = historial.filter(p => p.estado === 'Cancelado');
    }

    const tbody = document.getElementById('tabla-historial');
    let html = '';

    historial.forEach(ped => {
        let badgeColor = ped.estado === 'Entregado' ? 'bg-success' : 'bg-danger';
        let textoEstado = ped.estado;
        const deuda = (ped.precio || 0) - (ped.monto_pagado || 0);
        let textoPago = `Pagado: ₡${(ped.monto_pagado || 0).toLocaleString('es-CR')}`;
        let btnAbonar = '';

        if (ped.estado === 'Entregado') {
            if (deuda > 0) {
                badgeColor = 'bg-warning text-dark';
                textoEstado = 'Con Saldo';
                textoPago += `<br><small class="text-danger fw-bold">Debe: ₡${deuda.toLocaleString('es-CR')}</small>`;
                btnAbonar = `<button class="btn btn-sm btn-success" onclick="window.abonarPedido('${ped.id}')">Abonar</button>`;
            } else if (deuda < 0) {
                textoPago += `<br><small class="text-success fw-bold">+ Propina: ₡${Math.abs(deuda).toLocaleString('es-CR')}</small>`;
            }
        }

        html += `
            <tr>
                <td><span class="badge ${badgeColor}">${textoEstado}</span></td>
                <td>${ped.fecha_cierre}</td>
                <td class="fw-bold">${ped.cliente}</td>
                <td>${ped.producto}</td>
                <td>${ped.estado === 'Cancelado' ? '-' : textoPago}</td>
                <td class="text-center align-middle">
                    <div class="d-flex justify-content-center gap-2">
                        ${btnAbonar}
                        <button class="btn btn-sm btn-outline-danger" onclick="window.borrarHistorialPedido('${ped.id}')">Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html || `<tr><td colspan="6" class="text-center py-4 text-muted">No hay registros con la opción seleccionada.</td></tr>`;
}

window.borrarHistorialPedido = async (id) => {
    const result = await Swal.fire({
        title: '¿Eliminar del sistema?',
        text: 'Se borrará el registro permanentemente. Los movimientos en caja no se borrarán.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, borrar definitivamente'
    });

    if (result.isConfirmed) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            Swal.fire({ icon: 'success', title: 'Borrado', timer: 1500, showConfirmButton: false });
        } catch (error) {
            Swal.fire('Error', 'No se pudo eliminar el pedido.', 'error');
        }
    }
};

// ==========================================
// 7. FINANZAS Y CAJA MANUAL
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
            metodo_pago: document.getElementById('metodo-pago-mov').value,
            descripcion: document.getElementById('descripcion-mov').value.trim(),
            entidad: document.getElementById('entidad-mov').value.trim(),
            monto: parseFloat(document.getElementById('monto-mov').value),
            timestamp: new Date()
        });

        e.target.reset();
        document.getElementById('fecha-mov').value = obtenerFechaLocal();
        Swal.fire({ icon: 'success', title: 'Movimiento Registrado', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('Error', 'No se guardó el movimiento', 'error');
    } finally {
        btnSubmit.disabled = false;
    }
});

function cargarFinanzas() {
    onSnapshot(query(collection(db, "movimientos"), orderBy("fecha", "desc")), (snapshot) => {
        listaMovimientos = [];
        snapshot.forEach(doc => listaMovimientos.push({ id: doc.id, ...doc.data() }));
        if (vistas.reportes.classList.contains('active')) generarReporteFinanciero();
        if (vistas.dashboard.classList.contains('active')) renderizarDashboard();
    });
}

const filtroModoFinanzas = document.getElementById('filtro-modo');
const filtroIniFinanzas = document.getElementById('filtro-inicio');
const filtroFinFinanzas = document.getElementById('filtro-fin');
[filtroModoFinanzas, filtroIniFinanzas, filtroFinFinanzas].forEach(el => el.addEventListener('input', generarReporteFinanciero));

function generarReporteFinanciero() {
    if (!vistas.reportes.classList.contains('active')) return;

    let filtrados = listaMovimientos;
    if (filtroIniFinanzas.value) filtrados = filtrados.filter(m => m.fecha >= filtroIniFinanzas.value);
    if (filtroFinFinanzas.value) filtrados = filtrados.filter(m => m.fecha <= filtroFinFinanzas.value);
    if (filtroModoFinanzas.value !== 'ambos') filtrados = filtrados.filter(m => m.tipo === (filtroModoFinanzas.value === 'entradas' ? 'entrada' : 'salida'));

    datosParaExportar = filtrados;
    let totalEntradas = 0;
    let totalSalidas = 0;
    let html = '';

    filtrados.forEach(m => {
        if (m.tipo === 'entrada') totalEntradas += m.monto;
        else totalSalidas += m.monto;

        let badgeMetodo = m.metodo_pago ? `<span class="badge bg-secondary ms-2">${m.metodo_pago}</span>` : `<span class="badge bg-secondary ms-2">Manual</span>`;

        html += `
            <tr>
                <td class="text-nowrap">${m.fecha}</td>
                <td><strong>${m.descripcion}</strong> ${badgeMetodo}<br><small class="text-muted">${m.entidad || ''}</small></td>
                <td class="${m.tipo === 'entrada' ? 'text-success' : 'text-danger'} fw-bold text-nowrap">₡${m.monto.toLocaleString('es-CR')}</td>
                <td class="text-center align-middle">
                    <div class="d-flex justify-content-center gap-1">
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.editarMov('${m.id}')">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.borrarMov('${m.id}')">Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    });

    document.getElementById('tabla-reportes').innerHTML = html || '<tr><td colspan="4" class="text-center">No hay movimientos registrados.</td></tr>';
    document.getElementById('resumen-entradas').textContent = `₡${totalEntradas.toLocaleString('es-CR')}`;
    document.getElementById('resumen-salidas').textContent = `₡${totalSalidas.toLocaleString('es-CR')}`;
    document.getElementById('resumen-balance').textContent = `₡${(totalEntradas - totalSalidas).toLocaleString('es-CR')}`;

    dibujarGraficoFinanciero(totalEntradas, totalSalidas, filtroModoFinanzas.value);
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

    if (mov.metodo_pago) document.getElementById('edit-metodo-mov').value = mov.metodo_pago;

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
            metodo_pago: document.getElementById('edit-metodo-mov').value,
            entidad: document.getElementById('edit-ent-mov').value.trim(),
            monto: parseFloat(document.getElementById('edit-monto-mov').value)
        });
        modalEditarMovInstancia.hide();
        Swal.fire({ icon: 'success', title: 'Registro actualizado', timer: 1500, showConfirmButton: false });
    } catch (error) {
        Swal.fire('Error', 'No se pudo actualizar.', 'error');
    }
});

window.borrarMov = async (id) => {
    const result = await Swal.fire({ title: '¿Eliminar movimiento?', text: 'Esto altera tu balance de caja.', icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) await deleteDoc(doc(db, "movimientos", id));
};

function dibujarGraficoFinanciero(entradas, salidas, modo) {
    if (graficoInstancia) graficoInstancia.destroy();
    if (entradas === 0 && salidas === 0) return;

    let labelsGrafico = []; let datosGrafico = []; let coloresGrafico = [];

    if (modo === 'ambos') {
        labelsGrafico = ['Ingresos', 'Gastos']; datosGrafico = [entradas, salidas]; coloresGrafico = ['#198754', '#dc3545'];
    } else if (modo === 'entradas') {
        labelsGrafico = ['Ingresos']; datosGrafico = [entradas]; coloresGrafico = ['#198754'];
    } else if (modo === 'salidas') {
        labelsGrafico = ['Gastos']; datosGrafico = [salidas]; coloresGrafico = ['#dc3545'];
    }

    graficoInstancia = new Chart(document.getElementById('miGrafico').getContext('2d'), {
        type: 'doughnut',
        data: { labels: labelsGrafico, datasets: [{ data: datosGrafico, backgroundColor: coloresGrafico }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// ==========================================
// 8. INTELIGENCIA DE NEGOCIOS (DASHBOARD)
// ==========================================
function renderizarDashboard() {
    if (!vistas.dashboard.classList.contains('active')) return;

    // A. CRM: Perfiles de Clientes (Top 5 Histórico)
    const clientesMap = {};

    listaPedidos.forEach(p => {
        if (p.estado !== 'Cancelado' && p.cliente) {
            const nombre = p.cliente.trim().toUpperCase();
            if (!clientesMap[nombre]) {
                clientesMap[nombre] = { totalComprado: 0, ultimaCompra: '2000-01-01', cantidadPedidos: 0 };
            }
            clientesMap[nombre].totalComprado += (p.precio || 0);
            clientesMap[nombre].cantidadPedidos += 1;
            if (p.fecha_solicitud > clientesMap[nombre].ultimaCompra) {
                clientesMap[nombre].ultimaCompra = p.fecha_solicitud;
            }
        }
    });

    const topClientes = Object.entries(clientesMap).sort((a, b) => b[1].totalComprado - a[1].totalComprado).slice(0, 5);
    let htmlCRM = '';

    topClientes.forEach((clienteObj, index) => {
        let posicion = (index + 1) + '.';
        htmlCRM += `
            <li class="list-group-item d-flex justify-content-between align-items-start">
                <div class="ms-2 me-auto">
                    <div class="fw-bold">${posicion} ${clienteObj[0]}</div>
                    <span class="small text-muted">Última compra: ${clienteObj[1].ultimaCompra} (${clienteObj[1].cantidadPedidos} pedidos)</span>
                </div>
                <span class="badge bg-success rounded-pill">₡${clienteObj[1].totalComprado.toLocaleString('es-CR')}</span>
            </li>
        `;
    });

    document.getElementById('lista-crm-clientes').innerHTML = htmlCRM || '<li class="list-group-item">No hay datos suficientes para generar el Top 5.</li>';

    // B. VOLATILIDAD (Desviación Estándar Poblacional)
    const ingresosPorMes = {};

    listaMovimientos.filter(m => m.tipo === 'entrada').forEach(m => {
        const mesAnio = m.fecha.substring(0, 7);
        ingresosPorMes[mesAnio] = (ingresosPorMes[mesAnio] || 0) + m.monto;
    });

    const valoresMeses = Object.values(ingresosPorMes);
    const boxAlerta = document.getElementById('alerta-volatilidad');
    const txtRecomendacion = document.getElementById('stat-recomendacion');

    if (valoresMeses.length < 2) {
        document.getElementById('stat-media').textContent = 'N/A';
        document.getElementById('stat-desv').textContent = 'N/A';
        boxAlerta.className = 'alert alert-secondary text-center py-2 mb-3 fw-bold';
        boxAlerta.textContent = 'Requiere más historial';
        txtRecomendacion.textContent = 'El sistema necesita al menos 2 meses distintos de ingresos en la caja para poder calcular la volatilidad matemática de tu negocio.';
    } else {
        const N = valoresMeses.length;
        const sumatoria = valoresMeses.reduce((a, b) => a + b, 0);
        const mediaPoblacional = sumatoria / N;

        const sumatoriaDiferenciasAlCuadrado = valoresMeses.reduce((acc, val) => acc + Math.pow(val - mediaPoblacional, 2), 0);
        const varianzaPoblacional = sumatoriaDiferenciasAlCuadrado / N;
        const desviacionEstandar = Math.sqrt(varianzaPoblacional);

        const coeficienteVariacion = desviacionEstandar / mediaPoblacional;

        document.getElementById('stat-media').textContent = `₡${Math.round(mediaPoblacional).toLocaleString('es-CR')}`;
        document.getElementById('stat-desv').textContent = `₡${Math.round(desviacionEstandar).toLocaleString('es-CR')}`;

        if (coeficienteVariacion > 0.4) {
            boxAlerta.className = 'alert alert-danger text-center py-2 mb-3 fw-bold';
            boxAlerta.innerHTML = 'Alta Volatilidad Detectada';
            txtRecomendacion.innerHTML = 'Tus ingresos mensuales varían de forma brusca e impredecible. Sugerencia clave: Necesitas crear un fondo de emergencia empresarial que cubra los gastos fijos de MASUCRI para los meses bajos.';
        } else if (coeficienteVariacion > 0.15) {
            boxAlerta.className = 'alert alert-warning text-center py-2 mb-3 fw-bold text-dark';
            boxAlerta.innerHTML = 'Volatilidad Moderada';
            txtRecomendacion.innerHTML = 'Flujo de caja normal para un emprendimiento. Mantén reservas estándar y enfócate en fidelizar a tus clientes Top para asegurar entradas estables.';
        } else {
            boxAlerta.className = 'alert alert-success text-center py-2 mb-3 fw-bold';
            boxAlerta.innerHTML = 'Ingresos Altamente Estables';
            txtRecomendacion.innerHTML = 'Excelente. Tus ventas son predecibles mes a mes. Este es el momento ideal para pensar en invertir sin desestabilizar tus finanzas.';
        }
    }

    // C. ESTACIONALIDAD (Clasificación de productos)
    const categoriasContador = {};

    listaPedidos.forEach(p => {
        if (p.estado !== 'Cancelado' && p.producto) {
            const nombreProd = p.producto.toLowerCase();
            let categoriaDeterminada = 'Otros Diseños';

            if (nombreProd.includes('taza') || nombreProd.includes('mug') || nombreProd.includes('vaso')) {
                categoriaDeterminada = 'Tazas y Vasos';
            } else if (nombreProd.includes('camis') || nombreProd.includes('textil') || nombreProd.includes('gorra')) {
                categoriaDeterminada = 'Sublimación Textil';
            } else if (nombreProd.includes('sticker') || nombreProd.includes('vinil') || nombreProd.includes('corte')) {
                categoriaDeterminada = 'Vinil y Stickers';
            }

            categoriasContador[categoriaDeterminada] = (categoriasContador[categoriaDeterminada] || 0) + 1;
        }
    });

    const topCategoriasArray = Object.entries(categoriasContador).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (graficoEstacionalidad) graficoEstacionalidad.destroy();

    graficoEstacionalidad = new Chart(document.getElementById('graficoEstacionalidad').getContext('2d'), {
        type: 'bar',
        data: {
            labels: topCategoriasArray.map(c => c[0]),
            datasets: [{
                label: 'Cantidad de Trabajos Realizados',
                data: topCategoriasArray.map(c => c[1]),
                backgroundColor: '#0d6efd'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// ==========================================
// 9. EXPORTACIONES (PDF Y EXCEL)
// ==========================================
document.getElementById('btn-export-pdf').addEventListener('click', () => {
    if (datosParaExportar.length === 0) return Swal.fire('Aviso', 'No hay datos financieros para exportar', 'warning');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16); doc.text("Reporte Financiero - MASUCRI", 14, 15);
    doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleDateString('es-CR')}`, 14, 22);

    const tableRows = datosParaExportar.map(m => [m.fecha, m.metodo_pago || 'Manual', m.tipo.toUpperCase(), m.descripcion, `₡${m.monto.toLocaleString('es-CR')}`]);

    doc.autoTable({
        head: [["Fecha", "Método", "Tipo", "Concepto", "Monto"]],
        body: tableRows,
        startY: 28,
        theme: 'striped'
    });

    doc.save(`Reporte_Finanzas_MASUCRI.pdf`);
});

document.getElementById('btn-export-excel').addEventListener('click', () => {
    if (datosParaExportar.length === 0) return Swal.fire('Aviso', 'No hay datos financieros para exportar', 'warning');

    const dataSheet = datosParaExportar.map(m => ({
        "Fecha": m.fecha,
        "Método": m.metodo_pago || 'Manual',
        "Tipo": m.tipo.toUpperCase(),
        "Concepto": m.descripcion,
        "Monto (₡)": m.monto
    }));

    const ws = XLSX.utils.json_to_sheet(dataSheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte_Contable");
    XLSX.writeFile(wb, `Reporte_Finanzas_MASUCRI.xlsx`);
});