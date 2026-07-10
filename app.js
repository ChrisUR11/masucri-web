// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 2. CONFIGURACIÓN
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

let listaMovimientos = [];
let graficoInstancia = null;
let modalInstancia = null;

// ==========================================
// 3. REFERENCIAS AL DOM
// ==========================================
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');

const navRegistro = document.getElementById('nav-registro');
const navReportes = document.getElementById('nav-reportes');
const vistaRegistro = document.getElementById('vista-registro');
const vistaReportes = document.getElementById('vista-reportes');

const formMovimiento = document.getElementById('form-movimiento');
const formEditar = document.getElementById('form-editar');

const filtroModo = document.getElementById('filtro-modo');
const filtroInicio = document.getElementById('filtro-inicio');
const filtroFin = document.getElementById('filtro-fin');
const btnFiltrar = document.getElementById('btn-filtrar');
const btnLimpiar = document.getElementById('btn-limpiar');
const tablaReportes = document.getElementById('tabla-reportes');
const ctxGrafico = document.getElementById('miGrafico').getContext('2d');

const resEntradas = document.getElementById('resumen-entradas');
const resSalidas = document.getElementById('resumen-salidas');
const resBalance = document.getElementById('resumen-balance');

document.getElementById('fecha').valueAsDate = new Date();

// ==========================================
// 4. SISTEMA DE NAVEGACIÓN
// ==========================================
function cambiarVista(vistaActiva, linkActivo) {
    vistaRegistro.classList.remove('active');
    vistaReportes.classList.remove('active');
    navRegistro.classList.remove('active');
    navReportes.classList.remove('active');
    vistaActiva.classList.add('active');
    linkActivo.classList.add('active');
}

navRegistro.addEventListener('click', (e) => { e.preventDefault(); cambiarVista(vistaRegistro, navRegistro); });
navReportes.addEventListener('click', (e) => { e.preventDefault(); cambiarVista(vistaReportes, navReportes); generarReporte(); });

// ==========================================
// 5. AUTENTICACIÓN
// ==========================================
btnLogin.addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { Swal.fire({ icon: 'error', title: 'Oops...', text: 'Hubo un error al iniciar sesión.' }); }
});

btnLogout.addEventListener('click', async () => {
    const result = await Swal.fire({
        title: '¿Cerrar sesión?', text: "Tendrás que volver a ingresar.", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, salir', cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) { await signOut(auth); }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginContainer.classList.add('d-none');
        appContainer.classList.remove('d-none');
        userInfo.textContent = `Hola, ${user.displayName}`;
        modalInstancia = new bootstrap.Modal(document.getElementById('modalEditar')); // Inicializar Modal
        cargarDatos();
    } else {
        loginContainer.classList.remove('d-none');
        appContainer.classList.add('d-none');
    }
});

// ==========================================
// 6. CREAR, CARGAR, EDITAR Y BORRAR (CRUD)
// ==========================================

// CREAR
formMovimiento.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = formMovimiento.querySelector('button');
    btnSubmit.disabled = true;

    const nuevoMovimiento = {
        tipo: document.getElementById('tipo').value,
        fecha: document.getElementById('fecha').value,
        descripcion: document.getElementById('descripcion').value,
        entidad: document.getElementById('entidad').value,
        monto: parseFloat(document.getElementById('monto').value),
        timestamp: new Date()
    };

    try {
        await addDoc(collection(db, "movimientos"), nuevoMovimiento);
        formMovimiento.reset();
        document.getElementById('fecha').valueAsDate = new Date();
        Swal.fire({ icon: 'success', title: '¡Guardado!', timer: 1500, showConfirmButton: false });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar.' });
    } finally {
        btnSubmit.disabled = false;
    }
});

// CARGAR DATOS
function cargarDatos() {
    const q = query(collection(db, "movimientos"), orderBy("fecha", "desc"));
    onSnapshot(q, (snapshot) => {
        listaMovimientos = [];
        snapshot.forEach((doc) => {
            // Guardamos el ID del documento para poder editarlo/borrarlo luego
            listaMovimientos.push({ id: doc.id, ...doc.data() });
        });
        if (vistaReportes.classList.contains('active')) generarReporte();
    });
}

// DELEGAR EVENTOS A LA TABLA (EDITAR Y BORRAR)
tablaReportes.addEventListener('click', (e) => {
    if (e.target.closest('.btn-editar')) {
        const id = e.target.closest('.btn-editar').dataset.id;
        abrirModalEdicion(id);
    }
    if (e.target.closest('.btn-borrar')) {
        const id = e.target.closest('.btn-borrar').dataset.id;
        borrarMovimiento(id);
    }
});

// ABRIR MODAL CON DATOS
function abrirModalEdicion(id) {
    const mov = listaMovimientos.find(m => m.id === id);
    if (!mov) return;

    document.getElementById('edit-id').value = mov.id;
    document.getElementById('edit-tipo').value = mov.tipo;
    document.getElementById('edit-fecha').value = mov.fecha;
    document.getElementById('edit-descripcion').value = mov.descripcion;
    document.getElementById('edit-entidad').value = mov.entidad || '';
    document.getElementById('edit-monto').value = mov.monto;

    modalInstancia.show();
}

// ACTUALIZAR (EDITAR)
formEditar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;

    const datosActualizados = {
        tipo: document.getElementById('edit-tipo').value,
        fecha: document.getElementById('edit-fecha').value,
        descripcion: document.getElementById('edit-descripcion').value,
        entidad: document.getElementById('edit-entidad').value,
        monto: parseFloat(document.getElementById('edit-monto').value)
    };

    try {
        await updateDoc(doc(db, "movimientos", id), datosActualizados);
        modalInstancia.hide();
        Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1500, showConfirmButton: false });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo actualizar.' });
    }
});

// BORRAR
async function borrarMovimiento(id) {
    const result = await Swal.fire({
        title: '¿Eliminar registro?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            await deleteDoc(doc(db, "movimientos", id));
            Swal.fire({ icon: 'success', title: 'Borrado', timer: 1500, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo eliminar.' });
        }
    }
}


// ==========================================
// 7. LÓGICA DE REPORTES Y GRÁFICOS
// ==========================================
btnFiltrar.addEventListener('click', generarReporte);
filtroModo.addEventListener('change', generarReporte);

btnLimpiar.addEventListener('click', () => {
    filtroInicio.value = ''; filtroFin.value = ''; filtroModo.value = 'ambos';
    generarReporte();
});

function generarReporte() {
    let datosFiltrados = listaMovimientos;
    const inicio = filtroInicio.value;
    const fin = filtroFin.value;
    const modo = filtroModo.value;

    // 1. Filtrar por Fecha
    if (inicio && fin) datosFiltrados = datosFiltrados.filter(mov => mov.fecha >= inicio && mov.fecha <= fin);
    else if (inicio) datosFiltrados = datosFiltrados.filter(mov => mov.fecha >= inicio);
    else if (fin) datosFiltrados = datosFiltrados.filter(mov => mov.fecha <= fin);

    // 2. Filtrar por Modo (Entradas, Salidas, Ambos)
    if (modo === 'entradas') datosFiltrados = datosFiltrados.filter(mov => mov.tipo === 'entrada');
    if (modo === 'salidas') datosFiltrados = datosFiltrados.filter(mov => mov.tipo === 'salida');

    let totalEntradas = 0; let totalSalidas = 0; let htmlTabla = '';

    datosFiltrados.forEach(mov => {
        if (mov.tipo === 'entrada') totalEntradas += mov.monto;
        else totalSalidas += mov.monto;

        const colorTexto = mov.tipo === 'entrada' ? 'text-success' : 'text-danger';
        const icono = mov.tipo === 'entrada' ? '+' : '-';

        htmlTabla += `
            <tr>
                <td class="text-nowrap">${mov.fecha}</td>
                <td>
                    <strong>${mov.descripcion}</strong>
                    <br><small class="text-muted">${mov.entidad ? mov.entidad : ''}</small>
                </td>
                <td class="${colorTexto} fw-bold text-nowrap">
                    ${icono} ₡${mov.monto.toLocaleString('es-CR')}
                </td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-outline-secondary btn-editar me-1" data-id="${mov.id}" title="Editar">✏️</button>
                    <button class="btn btn-sm btn-outline-danger btn-borrar" data-id="${mov.id}" title="Borrar">🗑️</button>
                </td>
            </tr>
        `;
    });

    if (datosFiltrados.length === 0) {
        htmlTabla = `<tr><td colspan="4" class="text-center text-muted py-4">No hay datos para mostrar en esta vista.</td></tr>`;
    }

    tablaReportes.innerHTML = htmlTabla;

    // El resumen siempre muestra el cálculo real de lo que se está viendo
    resEntradas.textContent = `₡${totalEntradas.toLocaleString('es-CR')}`;
    resSalidas.textContent = `₡${totalSalidas.toLocaleString('es-CR')}`;
    resBalance.textContent = `₡${(totalEntradas - totalSalidas).toLocaleString('es-CR')}`;

    dibujarGrafico(totalEntradas, totalSalidas, modo);
}

function dibujarGrafico(entradas, salidas, modo) {
    if (graficoInstancia) graficoInstancia.destroy();
    if (entradas === 0 && salidas === 0) return;

    // Configurar etiquetas y colores según el modo seleccionado
    let labelsGrafico = [];
    let dataGrafico = [];
    let coloresGrafico = [];

    if (modo === 'ambos') {
        labelsGrafico = ['Entradas', 'Salidas'];
        dataGrafico = [entradas, salidas];
        coloresGrafico = ['#198754', '#dc3545'];
    } else if (modo === 'entradas') {
        labelsGrafico = ['Entradas'];
        dataGrafico = [entradas];
        coloresGrafico = ['#198754'];
    } else if (modo === 'salidas') {
        labelsGrafico = ['Salidas'];
        dataGrafico = [salidas];
        coloresGrafico = ['#dc3545'];
    }

    graficoInstancia = new Chart(ctxGrafico, {
        type: 'doughnut',
        data: {
            labels: labelsGrafico,
            datasets: [{
                data: dataGrafico,
                backgroundColor: coloresGrafico,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}