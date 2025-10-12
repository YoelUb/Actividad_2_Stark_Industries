const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace(/http/, 'ws'); // Cambia http por ws para la conexión WebSocket
const TOKEN_ENDPOINT = `${API_BASE}/token`;
const SIMULATE_ENDPOINT = `${API_BASE}/api/v1/simulate`;

// Variable global para mantener la conexión WebSocket
let socket = null;

// --- 1. Gestión del WebSocket ---
function connectWebSocket() {
  const token = getToken();
  // Evita reconectar si ya existe una conexión
  if (!token || socket) return;

  // Crea la conexión apuntando al endpoint /ws del backend
  socket = new WebSocket(`${WS_BASE}/ws`);

  socket.onopen = () => {
    console.log("WebSocket conectado exitosamente.");
    // Podrías enviar el token para una autenticación de WS si fuera necesario
    // socket.send(JSON.stringify({ token: getToken() }));
  };

  // El "oyente": se ejecuta cada vez que el servidor envía un mensaje
  socket.onmessage = (event) => {
    const alertData = JSON.parse(event.data);
    addAlert(alertData); // Llama a la función para mostrar la alerta en la UI
  };

  socket.onclose = () => {
    console.log("WebSocket desconectado.");
    socket = null; // Limpia la variable para permitir una futura reconexión
  };

  socket.onerror = (error) => {
    console.error("Error en la conexión WebSocket:", error);
    socket = null;
  };
}

function disconnectWebSocket() {
    if (socket) {
        socket.close();
    }
}

// --- Manejo de Token y Usuario (sin cambios) ---
function saveToken(token, user) {
  localStorage.setItem('stark_token', token);
  localStorage.setItem('stark_user', JSON.stringify(user || {}));
}
function getToken() {
  return localStorage.getItem('stark_token');
}
function clearToken() {
  localStorage.removeItem('stark_token');
  localStorage.removeItem('stark_user');
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('stark_user') || '{}');
  } catch {
    return {};
  }
}

// --- Elementos DOM (se añade alertsList) ---
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const btnGuest = document.getElementById('btnGuest');
const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const usernameLabel = document.getElementById('usernameLabel');
const roleDescription = document.getElementById('roleDescription') || null;
const actionButtons = document.querySelectorAll('#dashboard button[data-sensor]');
const alertsList = document.getElementById('alertsList'); // Referencia a la lista de alertas

// --- Definición de Permisos (sin cambios) ---
const ROLE_PERMISSIONS = {
  admin: { description: "Administrador: acceso completo a sensores y simulaciones.", buttons: true },
  operador: { description: "Operador: puede recibir y procesar eventos de sensores.", buttons: true },
  viewer: { description: "Usuario viewer: solo lectura, sin interacción.", buttons: false },
  invitado: { description: "Invitado: solo lectura, acceso limitado.", buttons: false },
  observador: { description: "Observador: puede simular eventos con credenciales.", buttons: true }
};

// --- 2. Integración en el Flujo de Sesión ---
function showLoggedIn() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  btnLogout.hidden = false;

  const user = getUser();
  usernameLabel.textContent = user.username || 'Usuario';
  updateUIByRole(user.rol || 'viewer');
  connectWebSocket(); // Conectar al WebSocket al iniciar sesión
}

function showLoggedOut() {
  loginSection.hidden = false;
  dashboard.hidden = true;
  btnLogout.hidden = true;
  usernameLabel.textContent = '';
  if (roleDescription) roleDescription.textContent = '';
  actionButtons.forEach(btn => btn.disabled = true);
  disconnectWebSocket(); // Desconectar al cerrar sesión
  if(alertsList) alertsList.innerHTML = ''; // Limpiar alertas al salir
}

// --- Habilitar/deshabilitar botones (sin cambios) ---
function updateUIByRole(role) {
  const perms = ROLE_PERMISSIONS[role.toLowerCase()] || ROLE_PERMISSIONS['viewer'];
  actionButtons.forEach(btn => btn.hidden = !perms.buttons);
  if (roleDescription) roleDescription.textContent = perms.description;
}

// --- Login y Logout (sin cambios en la lógica principal) ---
loginForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  try {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password })
    });
    if (!resp.ok) {
      const msg = await resp.json().catch(() => null);
      throw new Error(msg?.detail || "Usuario o contraseña incorrectos.");
    }
    const data = await resp.json();
    saveToken(data.access_token, data.user);
    showLoggedIn();
  } catch (err) {
    alert(err.message);
  }
});

btnLogout.addEventListener('click', () => {
  clearToken();
  showLoggedOut();
});

btnGuest.addEventListener('click', async () => {
    // Para el modo invitado, no se hace llamada a /token para el WS, sino que se loguea directamente en frontend
    // ya que no tiene permisos de simulación y solo recibe alertas.
    saveToken('guest-token', { username: 'Invitado', rol: 'invitado' });
    showLoggedIn();
});

// --- 3. Llamadas a la API de Simulación ---
async function simulate(sensorType, payload) {
    const token = getToken();
    try {
        const resp = await fetch(`${SIMULATE_ENDPOINT}/${sensorType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Envía el token para autorización
            },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Error en la simulación');
        }
        console.log(`Simulación de ${sensorType} enviada correctamente.`);
    } catch (err) {
        alert(err.message);
    }
}

// --- 4. Visualización de Alertas ---
function addAlert(alertData) {
    if (!alertsList) return;
    const item = document.createElement('li');
    // Asigna una clase CSS basada en el status de la alerta para darle color
    item.className = `alert-item ${alertData.status}`; // status puede ser 'critical', 'warning', 'ok'

    // Crea el contenido HTML del item de la alerta
    item.innerHTML = `
        <span>${alertData.message}</span>
        <small>${alertData.timestamp}</small>
    `;

    // Inserta la nueva alerta al principio de la lista
    alertsList.prepend(item);

    // Mantiene la lista con un máximo de 20 alertas para no sobrecargar la UI
    if (alertsList.children.length > 20) {
        alertsList.removeChild(alertsList.lastChild);
    }
}

// --- 5. Interacción del Usuario (Botones de Simulación) ---
document.getElementById('btnSimMotion').addEventListener('click', () => {
    simulate('motion', { is_authorized: false, zone: 'Laboratorio 3' });
});
document.getElementById('btnSimTemp').addEventListener('click', () => {
    // Genera una temperatura aleatoria entre 30 y 60 para simular avisos y alertas
    const temp = Math.floor(Math.random() * (60 - 30 + 1) + 30);
    simulate('temperature', { temperature: temp });
});
document.getElementById('btnSimAccess').addEventListener('click', () => {
    simulate('access', { access_granted: false, user: 'Dr. Doom' });
});


// --- Revisar token al cargar ---
document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  if (token) {
    showLoggedIn();
  } else {
    showLoggedOut();
  }
});