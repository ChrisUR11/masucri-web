// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
// 4. SISTEMA DE NAVEGACIÓN (SPA)
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
// 5. AUTENTICACIÓN CON SWEETALERT
// ==========================================
btnLogin.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    }
    catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'Oops...', text: 'Hubo un error al iniciar sesión.' });
    }
});

btnLogout.addEventListener('click', async () => {
    try {
        // Preguntar antes de salir
        const result = await Swal.fire({
            title: '¿Cerrar sesión?',
            text: "Tendrás que volver a ingresar con Google.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, salir',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            await signOut(auth);
        }
    } catch (error) { console.error(error); }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginContainer.classList.add('d-none');
        appContainer.classList.remove('d-none');
        userInfo.textContent = `Hola, ${user.displayName}`;
        cargarDatos();
    } else {
        loginContainer.classList.remove('d-none');
        appContainer.classList.add('d-none');
    }
});


// ==========================================
// 6. BASE DE DATOS (CRUD)
// ==========================================
formMovimiento.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnSubmit = formMovimiento.querySelector('button');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    // Construir objeto con los nuevos campos
    const nuevoMovimiento = {
        tipo: document.getElementById('tipo').value,
        fecha: document.getElementById('fecha').value,
        categoria: document.getElementById('categoria').value,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        descripcion: document.getElementById('descripcion').value,
        entidad: document.getElementById('entidad').value,
        monto: parseFloat(document.getElementById('monto').value),
        timestamp: new Date()
    };

    try {
        await addDoc(collection(db, "movimientos"), nuevoMovimiento);

        // Resetear form y mostrar alerta de éxito
        formMovimiento.reset();
        document.getElementById('fecha').valueAsDate = new Date();

        Swal.fire({
            icon: 'success',
            title: '¡Guardado!',
            text: 'El movimiento se registró correctamente.',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el registro en la base de datos.' });
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Guardar Movimiento";
    }
});

function cargarDatos() {
    const q = query(collection(db, "movimientos"), orderBy("fecha", "desc"));
    onSnapshot(q, (snapshot) => {
        listaMovimientos = [];
        snapshot.forEach((doc) => {
            listaMovimientos.push(doc.data());
        });

        if (vistaReportes.classList.contains('active')) {
            generarReporte();
        }
    });
}


// ==========================================
// 7. LÓGICA DE REPORTES Y GRÁFICOS
// ==========================================
btnFiltrar.addEventListener('click', generarReporte);

btnLimpiar.addEventListener('click', () => {
    filtroInicio.value = '';
    filtroFin.value = '';
    generarReporte();
});

function generarReporte() {
    let datosFiltrados = listaMovimientos;
    const inicio = filtroInicio.value;
    const fin = filtroFin.value;

    if (inicio && fin) {
        datosFiltrados = listaMovimientos.filter(mov => mov.fecha >= inicio && mov.fecha <= fin);
    } else if (inicio) {
        datosFiltrados = listaMovimientos.filter(mov => mov.fecha >= inicio);
    } else if (fin) {
        datosFiltrados = listaMovimientos.filter(mov => mov.fecha <= fin);
    }

    let totalEntradas = 0;
    let totalSalidas = 0;
    let htmlTabla = '';

    datosFiltrados.forEach(mov => {
        if (mov.tipo === 'entrada') { totalEntradas += mov.monto; }
        else { totalSalidas += mov.monto; }

        const colorTexto = mov.tipo === 'entrada' ? 'text-success' : 'text-danger';
        const icono = mov.tipo === 'entrada' ? 'fa-arrow-up' : 'fa-arrow-down';
        const colorBadge = mov.tipo === 'entrada' ? 'bg-success' : 'bg-danger';

        // Estructurando la nueva vista de la tabla
        htmlTabla += `
            <tr>
                <td class="text-nowrap">${mov.fecha}</td>
                <td>
                    <span class="badge bg-dark mb-1">${mov.categoria}</span>
                    <span class="badge ${colorBadge} mb-1">Cant: ${mov.cantidad}</span>
                    <br>
                    <strong>${mov.descripcion}</strong>
                    <br><small class="text-muted">${mov.entidad ? 'Ref: ' + mov.entidad : ''}</small>
                </td>
                <td class="${colorTexto} fw-bold text-nowrap">
                    ${mov.tipo === 'entrada' ? '+' : '-'} ₡${mov.monto.toLocaleString('es-CR')}
                </td>
            </tr>
        `;
    });

    if (datosFiltrados.length === 0) {
        htmlTabla = `<tr><td colspan="3" class="text-center text-muted py-4">No hay movimientos en este periodo.</td></tr>`;
    }

    tablaReportes.innerHTML = htmlTabla;
    resEntradas.textContent = `₡${totalEntradas.toLocaleString('es-CR')}`;
    resSalidas.textContent = `₡${totalSalidas.toLocaleString('es-CR')}`;
    resBalance.textContent = `₡${(totalEntradas - totalSalidas).toLocaleString('es-CR')}`;

    dibujarGrafico(totalEntradas, totalSalidas);
}

function dibujarGrafico(entradas, salidas) {
    if (graficoInstancia) {
        graficoInstancia.destroy();
    }

    if (entradas === 0 && salidas === 0) {
        return;
    }

    graficoInstancia = new Chart(ctxGrafico, {
        type: 'doughnut',
        data: {
            labels: ['Entradas (Ingresos)', 'Salidas (Gastos)'],
            datasets: [{
                data: [entradas, salidas],
                backgroundColor: ['#198754', '#dc3545'],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}