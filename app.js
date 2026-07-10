// ==========================================
// 1. IMPORTACIONES DE FIREBASE (Vía CDN)
// ==========================================
// Usamos la versión 10.8.1 (puedes actualizarla en el futuro si lo deseas)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 2. CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD_p1cLfHMoSugrfPrCJPuHJKEMIH7AvV8",
    authDomain: "masucri-65fed.firebaseapp.com",
    projectId: "masucri-65fed",
    storageBucket: "masucri-65fed.firebasestorage.app",
    messagingSenderId: "822954372342",
    appId: "1:822954372342:web:58f8d9b6181c66ce4190d7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 3. REFERENCIAS AL DOM (HTML)
// ==========================================
// Contenedores
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');

// Botones y Textos de Auth
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');

// Dashboard
const totalIncomeEl = document.getElementById('total-income');
const totalSalesEl = document.getElementById('total-sales');

// Formulario y Tabla
const salesForm = document.getElementById('sales-form');
const salesTableBody = document.getElementById('sales-table-body');

// ==========================================
// 4. LÓGICA DE AUTENTICACIÓN
// ==========================================

// Iniciar sesión con Google
btnLogin.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        alert("Hubo un error al iniciar sesión.");
    }
});

// Cerrar sesión
btnLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
});

// Escuchar cambios en el estado de la sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario logueado: Ocultar login, mostrar app
        loginContainer.classList.add('d-none');
        appContainer.classList.remove('d-none');
        userInfo.textContent = `Hola, ${user.displayName}`;

        // Cargar los datos de Firestore
        cargarTrabajos();
    } else {
        // Usuario no logueado: Mostrar login, ocultar app
        loginContainer.classList.remove('d-none');
        appContainer.classList.add('d-none');
    }
});

// ==========================================
// 5. LÓGICA DE BASE DE DATOS (FIRESTORE)
// ==========================================

// Guardar un nuevo trabajo
salesForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue

    // Obtener valores del formulario
    const cliente = document.getElementById('cliente').value;
    const descripcion = document.getElementById('descripcion').value;
    const monto = parseFloat(document.getElementById('monto').value); // Convertir a número
    const fecha = document.getElementById('fecha').value;
    const estado = document.getElementById('estado').value;

    try {
        // Deshabilitar el botón temporalmente para evitar dobles envíos
        const btnSubmit = salesForm.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Guardando...";

        // Guardar en la colección "trabajos"
        await addDoc(collection(db, "trabajos"), {
            cliente: cliente,
            descripcion: descripcion,
            monto: monto,
            fecha: fecha,
            estado: estado,
            creadoEn: new Date() // Marca de tiempo interna
        });

        // Limpiar el formulario y restaurar el botón
        salesForm.reset();
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Guardar Trabajo";

    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Hubo un error al guardar el trabajo.");
    }
});

// Leer y mostrar los trabajos en tiempo real
function cargarTrabajos() {
    // Creamos una consulta ordenando por fecha (de más reciente a más antiguo)
    const q = query(collection(db, "trabajos"), orderBy("fecha", "desc"));

    // onSnapshot escucha los cambios en tiempo real
    onSnapshot(q, (querySnapshot) => {
        let tablaHTML = '';
        let sumaIngresos = 0;
        let contadorVentas = 0;

        querySnapshot.forEach((doc) => {
            const trabajo = doc.data();

            // Sumar al dashboard
            sumaIngresos += trabajo.monto;
            contadorVentas++;

            // Darle color al estado (Verde para entregado, Amarillo para pendiente)
            const badgeClass = trabajo.estado === 'Entregado' ? 'bg-success' : 'bg-warning text-dark';

            // Construir la fila de la tabla
            tablaHTML += `
                <tr>
                    <td>${trabajo.fecha}</td>
                    <td class="fw-bold">${trabajo.cliente}</td>
                    <td>${trabajo.descripcion}</td>
                    <td>₡${trabajo.monto.toLocaleString('es-CR')}</td>
                    <td><span class="badge ${badgeClass}">${trabajo.estado}</span></td>
                </tr>
            `;
        });

        // Si no hay datos, mostrar un mensaje
        if (contadorVentas === 0) {
            tablaHTML = `<tr><td colspan="5" class="text-center text-muted">Aún no hay trabajos registrados.</td></tr>`;
        }

        // Inyectar el HTML en la tabla
        salesTableBody.innerHTML = tablaHTML;

        // Actualizar el Dashboard
        totalIncomeEl.textContent = `₡ ${sumaIngresos.toLocaleString('es-CR')}`;
        totalSalesEl.textContent = contadorVentas;
    });
}