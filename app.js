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
let datosParaExportar = []; // Almacena los datos filtrados actuales
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

// Filtros y Búsqueda
const busquedaTexto = document.getElementById('busqueda-texto');
const filtroModo = document.getElementById('filtro-modo');
const filtroInicio = document.getElementById('filtro-inicio');
const filtroFin = document.getElementById('filtro-fin');
const btnLimpiar = document.getElementById('btn-limpiar');
const tablaReportes = document.getElementById('tabla-reportes');
const ctxGrafico = document.getElementById('miGrafico').getContext('2d');

// Botones de Exportar
const btnExportPdf = document.getElementById('btn-export-pdf');
const btnExportExcel = document.getElementById('btn-export-excel');

// Resúmenes y Tarjetas
const cardEntradas = document.getElementById('card-entradas');
const cardSalidas = document.getElementById('card-salidas');
const cardBalance = document.getElementById('card-balance');
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
        modalInstancia = new bootstrap.Modal(document.getElementById('modalEditar'));
        cargarDatos();
    } else {
        loginContainer.classList.remove('d-none');
        appContainer.classList.add('d-none');
    }
});

// ==========================================
// 6. CREAR, CARGAR, EDITAR Y BORRAR
// ==========================================
formMovimiento.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descripcionStr = document.getElementById('descripcion').value.trim();
    const montoNum = parseFloat(document.getElementById('monto').value);

    if (descripcionStr === "") return Swal.fire({ icon: 'warning', title: 'Atención', text: 'El concepto/descripción no puede estar vacío.' });
    if (isNaN(montoNum) || montoNum <= 0) return Swal.fire({ icon: 'warning', title: 'Atención', text: 'El monto debe ser un número mayor a cero.' });

    const btnSubmit = formMovimiento.querySelector('button');
    btnSubmit.disabled = true;

    try {
        await addDoc(collection(db, "movimientos"), {
            tipo: document.getElementById('tipo').value,
            fecha: document.getElementById('fecha').value,
            descripcion: descripcionStr,
            entidad: document.getElementById('entidad').value.trim(),
            monto: montoNum,
            timestamp: new Date()
        });
        formMovimiento.reset();
        document.getElementById('fecha').valueAsDate = new Date();
        Swal.fire({ icon: 'success', title: '¡Guardado!', timer: 1500, showConfirmButton: false });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar.' });
    } finally {
        btnSubmit.disabled = false;
    }
});

function cargarDatos() {
    const q = query(collection(db, "movimientos"), orderBy("fecha", "desc"));
    onSnapshot(q, (snapshot) => {
        listaMovimientos = [];
        snapshot.forEach((doc) => { listaMovimientos.push({ id: doc.id, ...doc.data() }); });
        if (vistaReportes.classList.contains('active')) generarReporte();
    });
}

tablaReportes.addEventListener('click', (e) => {
    if (e.target.closest('.btn-editar')) abrirModalEdicion(e.target.closest('.btn-editar').dataset.id);
    if (e.target.closest('.btn-borrar')) borrarMovimiento(e.target.closest('.btn-borrar').dataset.id);
});

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

formEditar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descripcionStr = document.getElementById('edit-descripcion').value.trim();
    const montoNum = parseFloat(document.getElementById('edit-monto').value);

    if (descripcionStr === "") return Swal.fire({ icon: 'warning', title: 'Atención', text: 'El concepto no puede estar vacío.' });
    if (isNaN(montoNum) || montoNum <= 0) return Swal.fire({ icon: 'warning', title: 'Atención', text: 'El monto debe ser un número mayor a cero.' });

    try {
        await updateDoc(doc(db, "movimientos", document.getElementById('edit-id').value), {
            tipo: document.getElementById('edit-tipo').value,
            fecha: document.getElementById('edit-fecha').value,
            descripcion: descripcionStr,
            entidad: document.getElementById('edit-entidad').value.trim(),
            monto: montoNum
        });
        modalInstancia.hide();
        Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1500, showConfirmButton: false });
    } catch (error) { Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo actualizar.' }); }
});

async function borrarMovimiento(id) {
    const result = await Swal.fire({
        title: '¿Eliminar registro?', text: "Esta acción no se puede deshacer.", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Sí, borrar', cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
        try { await deleteDoc(doc(db, "movimientos", id)); Swal.fire({ icon: 'success', title: 'Borrado', timer: 1500, showConfirmButton: false }); }
        catch (error) { Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo eliminar.' }); }
    }
}

// ==========================================
// 7. LÓGICA DE REPORTES EN TIEMPO REAL
// ==========================================
busquedaTexto.addEventListener('input', generarReporte);
filtroModo.addEventListener('change', generarReporte);
filtroInicio.addEventListener('change', generarReporte);
filtroFin.addEventListener('change', generarReporte);

btnLimpiar.addEventListener('click', () => {
    busquedaTexto.value = ''; filtroInicio.value = ''; filtroFin.value = ''; filtroModo.value = 'ambos';
    generarReporte();
});

function generarReporte() {
    let datosFiltrados = listaMovimientos;
    const texto = busquedaTexto.value.toLowerCase().trim();
    const inicio = filtroInicio.value;
    const fin = filtroFin.value;
    const modo = filtroModo.value;

    // Control de visualización de las tarjetas
    cardEntradas.classList.toggle('d-none', modo === 'salidas');
    cardSalidas.classList.toggle('d-none', modo === 'entradas');
    cardBalance.classList.toggle('d-none', modo !== 'ambos');

    // 1. Filtrar por Búsqueda de Texto
    if (texto) {
        datosFiltrados = datosFiltrados.filter(mov =>
            mov.descripcion.toLowerCase().includes(texto) ||
            (mov.entidad && mov.entidad.toLowerCase().includes(texto))
        );
    }

    // 2. Filtrar por Fecha
    if (inicio && fin) datosFiltrados = datosFiltrados.filter(mov => mov.fecha >= inicio && mov.fecha <= fin);
    else if (inicio) datosFiltrados = datosFiltrados.filter(mov => mov.fecha >= inicio);
    else if (fin) datosFiltrados = datosFiltrados.filter(mov => mov.fecha <= fin);

    // 3. Filtrar por Modo
    if (modo === 'entradas') datosFiltrados = datosFiltrados.filter(mov => mov.tipo === 'entrada');
    if (modo === 'salidas') datosFiltrados = datosFiltrados.filter(mov => mov.tipo === 'salida');

    // Actualizamos la variable global para las exportaciones
    datosParaExportar = datosFiltrados;

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
        htmlTabla = `<tr><td colspan="4" class="text-center text-muted py-4">No hay datos para mostrar con estos filtros.</td></tr>`;
    }

    tablaReportes.innerHTML = htmlTabla;
    resEntradas.textContent = `₡${totalEntradas.toLocaleString('es-CR')}`;
    resSalidas.textContent = `₡${totalSalidas.toLocaleString('es-CR')}`;
    resBalance.textContent = `₡${(totalEntradas - totalSalidas).toLocaleString('es-CR')}`;

    dibujarGrafico(totalEntradas, totalSalidas, modo);
}

function dibujarGrafico(entradas, salidas, modo) {
    if (graficoInstancia) graficoInstancia.destroy();
    if (entradas === 0 && salidas === 0) return;

    let labels = []; let data = []; let colors = [];
    if (modo === 'ambos') { labels = ['Entradas', 'Salidas']; data = [entradas, salidas]; colors = ['#198754', '#dc3545']; }
    else if (modo === 'entradas') { labels = ['Entradas']; data = [entradas]; colors = ['#198754']; }
    else if (modo === 'salidas') { labels = ['Salidas']; data = [salidas]; colors = ['#dc3545']; }

    graficoInstancia = new Chart(ctxGrafico, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, hoverOffset: 4 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// ==========================================
// 8. EXPORTACIONES (PDF Y EXCEL)
// ==========================================

btnExportPdf.addEventListener('click', () => {
    if (datosParaExportar.length === 0) return Swal.fire({ icon: 'warning', title: 'Vacío', text: 'No hay datos para exportar.' });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Título del PDF
    doc.setFontSize(16);
    doc.text("Reporte de Movimientos - MASUCRI", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado el: ${new Date().toLocaleDateString('es-CR')}`, 14, 22);

    // Configurar tabla
    const tableColumn = ["Fecha", "Tipo", "Concepto / Detalle", "Entidad", "Monto"];
    const tableRows = [];

    datosParaExportar.forEach(mov => {
        const movData = [
            mov.fecha,
            mov.tipo.toUpperCase(),
            mov.descripcion,
            mov.entidad || 'N/A',
            `₡${mov.monto.toLocaleString('es-CR')}`
        ];
        tableRows.push(movData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 28,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`Reporte_MASUCRI_${new Date().getTime()}.pdf`);
    Swal.fire({ icon: 'success', title: 'Exportado', text: 'El reporte PDF se ha descargado.', timer: 1500, showConfirmButton: false });
});

btnExportExcel.addEventListener('click', () => {
    if (datosParaExportar.length === 0) return Swal.fire({ icon: 'warning', title: 'Vacío', text: 'No hay datos para exportar.' });

    // Formatear datos para el Excel
    const dataSheet = datosParaExportar.map(mov => ({
        "Fecha": mov.fecha,
        "Tipo": mov.tipo.toUpperCase(),
        "Concepto / Detalle": mov.descripcion,
        "Cliente / Proveedor": mov.entidad || '',
        "Monto (Colones)": mov.monto
    }));

    const ws = XLSX.utils.json_to_sheet(dataSheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");

    XLSX.writeFile(wb, `Reporte_MASUCRI_${new Date().getTime()}.xlsx`);
    Swal.fire({ icon: 'success', title: 'Exportado', text: 'El reporte de Excel se ha descargado.', timer: 1500, showConfirmButton: false });
});