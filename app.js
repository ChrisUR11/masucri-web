// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
let graficoInstancia = null;
let modalPedidoInstancia = null;

// Referencias DOM Generales
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const userInfo = document.getElementById('user-info');

// Vistas y Navegación
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
}

Object.keys(navLinks).forEach(key => {
    navLinks[key].addEventListener('click', (e) => { e.preventDefault(); cambiarVista(key); });
});

// ==========================================
// 3. AUTENTICACIÓN ESTRICTA
// ==========================================
document.getElementById('btn-login').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { Swal.fire('Error', 'Hubo un error al iniciar sesión.', 'error'); }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    if ((await Swal.fire({ title: '¿Cerrar sesión?', icon: 'warning', showCancelButton: true })).isConfirmed) {
        await signOut(auth);
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user && CORREOS_PERMITIDOS.includes(user.email)) {
        loginContainer.classList.add('d-none');
        appContainer.classList.remove('d-none');
        appContainer.classList.add('d-flex');
        userInfo.textContent = `Admin: ${user.displayName}`;

        modalPedidoInstancia = new bootstrap.Modal(document.getElementById('modalPedido'));

        // Cargar Base de Datos
        cargarPedidos();
        cargarFinanzas();

        // Vista por defecto
        cambiarVista('pedidos');
    } else if (user) {
        await signOut(auth);
        Swal.fire({ icon: 'error', title: 'Acceso Denegado', text: 'No tienes permisos para este sistema.' });
    } else {
        loginContainer.classList.remove('d-none');
        appContainer.classList.add('d-none');
        appContainer.classList.remove('d-flex');
    }
});


// ==========================================
// 4. MÓDULO: GESTIÓN DE PEDIDOS
// ==========================================
function cargarPedidos() {
    const q = query(collection(db, "pedidos"), orderBy("fecha_entrega", "asc"));
    onSnapshot(q, (snapshot) => {
        listaPedidos = [];
        snapshot.forEach(doc => listaPedidos.push({ id: doc.id, ...doc.data() }));
        renderizarPedidos();
        renderizarHistorialPedidos();
    });
}

// Lógica para el Modal de Pedido
window.abrirModalPedido = (id = null) => {
    const form = document.getElementById('form-pedido');
    form.reset();
    document.getElementById('ped-id').value = '';

    // Auto-completar fecha de hoy para nuevo pedido
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('ped-solicitado').value = hoy;
    document.getElementById('ped-entrega').value = hoy;
    document.getElementById('tituloModalPedido').textContent = 'Nuevo Pedido';

    if (id) {
        const ped = listaPedidos.find(p => p.id === id);
        if (ped) {
            document.getElementById('tituloModalPedido').textContent = 'Editar Pedido';
            document.getElementById('ped-id').value = ped.id;
            document.getElementById('ped-solicitado').value = ped.fecha_solicitud;
            document.getElementById('ped-entrega').value = ped.fecha_entrega;
            document.getElementById('ped-cliente').value = ped.cliente;
            document.getElementById('ped-producto').value = ped.producto;
            document.getElementById('ped-desc').value = ped.descripcion || '';
            document.getElementById('ped-precio').value = ped.precio;
        }
    }
    modalPedidoInstancia.show();
}

// Guardar / Editar Pedido
document.getElementById('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ped-id').value;
    const datos = {
        fecha_solicitud: document.getElementById('ped-solicitado').value,
        fecha_entrega: document.getElementById('ped-entrega').value,
        cliente: document.getElementById('ped-cliente').value.trim(),
        producto: document.getElementById('ped-producto').value.trim(),
        descripcion: document.getElementById('ped-desc').value.trim(),
        precio: parseFloat(document.getElementById('ped-precio').value),
    };

    if (datos.fecha_entrega < datos.fecha_solicitud) {
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
            datos.timestamp = new Date();
            await addDoc(collection(db, "pedidos"), datos);
            Swal.fire({ icon: 'success', title: 'Pedido Guardado', timer: 1000, showConfirmButton: false });
        }
        modalPedidoInstancia.hide();
    } catch (e) {
        Swal.fire('Error', 'No se pudo guardar.', 'error');
    } finally {
        btnSubmit.disabled = false;
    }
});

// Renderizar Tabla de Pendientes (Con motor de Prioridad)
function renderizarPedidos() {
    if (!vistas.pedidos.classList.contains('active')) return;

    let pendientes = listaPedidos.filter(p => p.estado === 'Pendiente');

    // Aplicar Filtros de Pedidos
    const txt = document.getElementById('filtro-pedido-texto').value.toLowerCase();
    const fSol = document.getElementById('filtro-pedido-solicitud').value;
    const fEnt = document.getElementById('filtro-pedido-entrega').value;

    if (txt) pendientes = pendientes.filter(p => p.cliente.toLowerCase().includes(txt) || p.producto.toLowerCase().includes(txt));
    if (fSol) pendientes = pendientes.filter(p => p.fecha_solicitud >= fSol);
    if (fEnt) pendientes = pendientes.filter(p => p.fecha_entrega <= fEnt);

    const tbody = document.getElementById('tabla-pedidos');
    let html = '';

    // Fecha actual para calcular prioridad a las 00:00 hrs
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    pendientes.forEach(ped => {
        // Cálculo de Prioridad
        const fechaEntrega = new Date(ped.fecha_entrega + 'T00:00:00'); // Evitar desfase de zona horaria
        const diffTime = fechaEntrega - hoy;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let badgeClass = '', prioridadTxt = '';
        if (diffDays < 0) { badgeClass = 'bg-danger'; prioridadTxt = 'Atrasado'; }
        else if (diffDays === 0) { badgeClass = 'bg-danger'; prioridadTxt = 'Para Hoy'; }
        else if (diffDays <= 2) { badgeClass = 'bg-warning text-dark'; prioridadTxt = 'Alta'; }
        else if (diffDays <= 5) { badgeClass = 'bg-info text-dark'; prioridadTxt = 'Media'; }
        else { badgeClass = 'bg-success'; prioridadTxt = 'Baja'; }

        html += `
            <tr>
                <td><span class="badge ${badgeClass} w-100 py-2">${prioridadTxt}</span></td>
                <td class="small">
                    <span class="text-muted d-block">Sol: ${ped.fecha_solicitud}</span>
                    <strong class="text-primary d-block">Ent: ${ped.fecha_entrega}</strong>
                </td>
                <td class="fw-bold">${ped.cliente}</td>
                <td>
                    ${ped.producto}
                    ${ped.descripcion ? `<br><small class="text-muted">${ped.descripcion}</small>` : ''}
                </td>
                <td class="fw-bold">₡${ped.precio.toLocaleString('es-CR')}</td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-outline-success btn-accion" onclick="window.entregarPedido('${ped.id}')" title="Marcar Entregado">✅</button>
                    <button class="btn btn-outline-secondary btn-accion" onclick="window.abrirModalPedido('${ped.id}')" title="Editar">✏️</button>
                    <button class="btn btn-outline-danger btn-accion" onclick="window.cancelarPedido('${ped.id}')" title="Cancelar Pedido">❌</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html || '<tr><td colspan="6" class="text-center py-4 text-muted">No hay pedidos pendientes que coincidan con la búsqueda.</td></tr>';
}

// Filtros en tiempo real
['filtro-pedido-texto', 'filtro-pedido-solicitud', 'filtro-pedido-entrega'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderizarPedidos);
});
document.getElementById('btn-limpiar-pedidos').addEventListener('click', () => {
    document.getElementById('filtro-pedido-texto').value = '';
    document.getElementById('filtro-pedido-solicitud').value = '';
    document.getElementById('filtro-pedido-entrega').value = '';
    renderizarPedidos();
});

// Cancelar Pedido
window.cancelarPedido = async (id) => {
    if ((await Swal.fire({ title: '¿Cancelar este pedido?', text: 'Pasará al historial como cancelado.', icon: 'warning', showCancelButton: true })).isConfirmed) {
        await updateDoc(doc(db, "pedidos", id), { estado: 'Cancelado', fecha_cierre: new Date().toISOString().split('T')[0] });
    }
};

// ==========================================
// 5. FLUJO DE ENTREGA Y PAGO
// ==========================================
window.entregarPedido = async (id) => {
    const ped = listaPedidos.find(p => p.id === id);
    if (!ped) return;

    // 1. Preguntar si pagó todo
    const resPago = await Swal.fire({
        title: 'Entregar Pedido',
        html: `¿El cliente <b>${ped.cliente}</b> canceló la totalidad del pedido?<br><br><h3 class="text-success">₡${ped.precio.toLocaleString('es-CR')}</h3>`,
        icon: 'question',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Sí, pagó todo',
        denyButtonText: 'No, abonó una parte',
        cancelButtonText: 'Cancelar acción',
        confirmButtonColor: '#198754',
        denyButtonColor: '#ffc107'
    });

    let montoCobrado = 0;

    if (resPago.isConfirmed) {
        montoCobrado = ped.precio;
    } else if (resPago.isDenied) {
        // 2. Si no pagó todo, preguntar cuánto
        const { value: montoIngresado } = await Swal.fire({
            title: 'Monto Recibido',
            input: 'number',
            inputLabel: 'Ingrese la cantidad en colones que el cliente pagó hoy:',
            inputAttributes: { min: 0, max: ped.precio, step: 1 },
            showCancelButton: true,
            inputValidator: (value) => {
                if (!value || value < 0) return 'Ingrese un monto válido';
                if (value > ped.precio) return 'El monto no puede ser mayor al precio del pedido';
            }
        });
        if (!montoIngresado) return; // Canceló el prompt
        montoCobrado = parseFloat(montoIngresado);
    } else {
        return; // Canceló todo el proceso
    }

    // 3. Ejecutar actualizaciones en Firebase
    try {
        const fechaHoy = new Date().toISOString().split('T')[0];

        // Actualizar el pedido
        await updateDoc(doc(db, "pedidos", id), {
            estado: 'Entregado',
            monto_pagado: montoCobrado,
            fecha_cierre: fechaHoy
        });

        // Registrar en las finanzas automáticamente si hubo dinero de por medio
        if (montoCobrado > 0) {
            await addDoc(collection(db, "movimientos"), {
                tipo: 'entrada',
                fecha: fechaHoy,
                descripcion: `Pago de pedido: ${ped.producto}`,
                entidad: ped.cliente,
                monto: montoCobrado,
                timestamp: new Date()
            });
        }

        Swal.fire('¡Éxito!', 'Pedido entregado y caja actualizada.', 'success');
    } catch (e) {
        Swal.fire('Error', 'Hubo un error al procesar la entrega.', 'error');
    }
};

// ==========================================
// 6. HISTORIAL DE PEDIDOS
// ==========================================
function renderizarHistorialPedidos() {
    const historial = listaPedidos.filter(p => p.estado !== 'Pendiente').sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));
    const tbody = document.getElementById('tabla-historial');
    let html = '';

    historial.forEach(ped => {
        const badge = ped.estado === 'Entregado' ? 'bg-success' : 'bg-danger';
        const pago = ped.monto_pagado ? `₡${ped.monto_pagado.toLocaleString('es-CR')}` : '₡0';

        html += `
            <tr>
                <td><span class="badge ${badge}">${ped.estado}</span></td>
                <td>${ped.fecha_cierre}</td>
                <td class="fw-bold">${ped.cliente}</td>
                <td>${ped.producto}</td>
                <td class="fw-bold text-muted">${ped.estado === 'Entregado' ? pago : '-'}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html || '<tr><td colspan="5" class="text-center py-4 text-muted">Aún no hay historial de entregas.</td></tr>';
}

// ==========================================
// 7. MÓDULO FINANCIERO (CAJA Y REPORTES)
// ==========================================
document.getElementById('fecha-mov').valueAsDate = new Date();

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
        document.getElementById('fecha-mov').valueAsDate = new Date();
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

    let tEntradas = 0, tSalidas = 0, html = '';

    filtrados.forEach(m => {
        if (m.tipo === 'entrada') tEntradas += m.monto; else tSalidas += m.monto;
        html += `<tr><td>${m.fecha}</td><td><strong>${m.descripcion}</strong><br><small>${m.entidad || ''}</small></td>
                 <td class="${m.tipo === 'entrada' ? 'text-success' : 'text-danger'} fw-bold">₡${m.monto.toLocaleString('es-CR')}</td></tr>`;
    });

    document.getElementById('tabla-reportes').innerHTML = html || '<tr><td colspan="3" class="text-center text-muted">No hay movimientos.</td></tr>';
    document.getElementById('resumen-entradas').textContent = `₡${tEntradas.toLocaleString('es-CR')}`;
    document.getElementById('resumen-salidas').textContent = `₡${tSalidas.toLocaleString('es-CR')}`;
    document.getElementById('resumen-balance').textContent = `₡${(tEntradas - tSalidas).toLocaleString('es-CR')}`;

    dibujarGraficoFinanciero(tEntradas, tSalidas, filtroModo.value);
}

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