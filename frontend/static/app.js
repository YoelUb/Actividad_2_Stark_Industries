const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const TOKEN_ENDPOINT = `${API_BASE}/token`;
const SIMULATE_ENDPOINT = `${API_BASE}/api/v1/simulate`;
const INCIDENTS_ENDPOINT = `${API_BASE}/api/v1/incidencias`;

let socket = null;
let reconnectTimer = null;

function connectWebSocket() {
  const token = getToken();
  if (!token || socket) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  socket = new WebSocket(`${WS_BASE}/ws`);
  socket.onopen = () => {
      console.log("WebSocket conectado.");
      // <<-- SOLUCIÓN: Habilita los botones solo cuando la conexión está abierta -->>
      updateUIByRole(getUser().rol || 'viewer', true);
  };
  socket.onmessage = (event) => {
      const alertData = JSON.parse(event.data);
      updateSensorCard(alertData);
      addAlertToList(alertData);
  };
  socket.onclose = () => {
      console.log("WebSocket desconectado. Intentando reconectar en 3 segundos...");
      socket = null;
      // <<-- SOLUCIÓN: Deshabilita los botones si la conexión se pierde -->>
      updateUIByRole(getUser().rol || 'viewer', false);
      if (getToken()) {
          reconnectTimer = setTimeout(connectWebSocket, 3000);
      }
  };
  socket.onerror = (error) => {
      console.error("Error en WebSocket:", error);
      socket.close();
  };
}

function disconnectWebSocket() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
    }
}

function saveToken(token, user) {
  localStorage.setItem('stark_token', token);
  localStorage.setItem('stark_user', JSON.stringify(user || {}));
}

function getToken() { return localStorage.getItem('stark_token'); }
function clearToken() {
  localStorage.removeItem('stark_token');
  localStorage.removeItem('stark_user');
}
function getUser() {
  try { return JSON.parse(localStorage.getItem('stark_user') || '{}'); } catch { return {}; }
}

const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const btnGuest = document.getElementById('btnGuest');
const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const usernameLabel = document.getElementById('usernameLabel');
const actionButtons = document.querySelectorAll('#dashboard button[data-sensor]');
const alertsCard = document.getElementById('alertsCard');
const alertsList = document.getElementById('alertsList');

const ROLE_PERMISSIONS = {
  admin: { description: "Administrador: acceso completo.", buttons: true, show_alerts: true },
  observador: { description: "Observador: puede simular eventos.", buttons: true, show_alerts: false },
  invitado: { description: "Invitado: solo lectura.", buttons: false, show_alerts: false },
  operador: { description: "Operador: puede procesar eventos.", buttons: true, show_alerts: false },
  viewer: { description: "Usuario viewer: solo lectura.", buttons: false, show_alerts: false }
};

function showLoggedIn() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  btnLogout.hidden = false;
  const user = getUser();
  usernameLabel.textContent = user.username || 'Usuario';
  updateUIByRole(user.rol || 'viewer', false);
  connectWebSocket();
  loadInitialAlerts();
}

function showLoggedOut() {
  loginSection.hidden = false;
  dashboard.hidden = true;
  btnLogout.hidden = true;
  usernameLabel.textContent = '';
  // Llama a updateUIByRole para deshabilitar y ocultar botones al cerrar sesión
  updateUIByRole('invitado', false);
  if (alertsCard) alertsCard.style.display = 'none';
  disconnectWebSocket();
  if (alertsList) alertsList.innerHTML = '';
}

// <<-- FUNCIÓN MODIFICADA para controlar el estado 'disabled' de los botones -->>
function updateUIByRole(role, isConnected) {
  const perms = ROLE_PERMISSIONS[role.toLowerCase()] || ROLE_PERMISSIONS['viewer'];
  actionButtons.forEach(btn => {
    // Muestra u oculta el botón según el permiso
    btn.hidden = !perms.buttons;
    // Deshabilita el botón si no está oculto Y la conexión no está activa
    if (!btn.hidden) {
      btn.disabled = !isConnected;
    }
  });
  if (alertsCard) {
    alertsCard.style.display = perms.show_alerts ? 'flex' : 'none';
  }
}

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
    try {
        const resp = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ guest: true })
        });
        if (!resp.ok) {
            throw new Error("No se pudo iniciar sesión como invitado.");
        }
        const data = await resp.json();
        saveToken(data.access_token, data.user);
        showLoggedIn();
    } catch (err) {
        alert(err.message);
    }
});

async function simulate(sensorType, payload) {
    console.log(` -> Dentro de la función simulate() para ${sensorType}...`);
    const token = getToken();
    try {
        const resp = await fetch(`${SIMULATE_ENDPOINT}/${sensorType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(errText || 'Error en la simulación');
        }
    } catch (err) {
        console.error("Error en la simulación:", err);
        alert(err.message);
    }
}

function addAlertToList(alertData) {
    const user = getUser();
    const perms = ROLE_PERMISSIONS[user.rol.toLowerCase()] || ROLE_PERMISSIONS['viewer'];
    if (!perms.show_alerts || !alertsList) return;

    const displayTimestamp = alertData.timestamp.includes("T")
      ? new Date(alertData.timestamp).toLocaleTimeString()
      : alertData.timestamp;

    const item = document.createElement('li');
    item.className = `alert-item ${alertData.status}`;
    item.innerHTML = `<span>${alertData.message}</span><small>${displayTimestamp}</small>`;
    alertsList.prepend(item);
    if (alertsList.children.length > 20) {
        alertsList.removeChild(alertsList.lastChild);
    }
}

function updateSensorCard(data) {
    const timestamp = data.timestamp.includes("T")
      ? new Date(data.timestamp).toLocaleTimeString()
      : data.timestamp;

    let valueEl, metaEl;
    switch(data.sensor_type) {
        case 'motion':
            valueEl = document.getElementById('motionValue');
            metaEl = document.getElementById('motionMeta');
            valueEl.textContent = data.status === 'critical' ? 'NO AUTORIZADO' : 'OK';
            break;
        case 'temperature':
            valueEl = document.getElementById('tempValue');
            metaEl = document.getElementById('tempMeta');
            const tempMatch = data.message.match(/(\d+)/);
            if (tempMatch) valueEl.textContent = `${tempMatch[1]} °C`;
            break;
        case 'access':
            valueEl = document.getElementById('accessValue');
            metaEl = document.getElementById('accessMeta');
            valueEl.textContent = data.status === 'critical' ? 'DENEGADO' : 'CONCEDIDO';
            break;
        default:
            return;
    }
    metaEl.textContent = `Último evento: ${timestamp}`;
}

async function loadInitialAlerts() {
    const token = getToken();
    const user = getUser();
    const perms = ROLE_PERMISSIONS[user.rol.toLowerCase()] || ROLE_PERMISSIONS['viewer'];
    if (!perms.show_alerts) return;

    try {
        const resp = await fetch(INCIDENTS_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) return;

        const incidents = await resp.json();
        alertsList.innerHTML = '';
        incidents.forEach(incident => {
            addAlertToList(incident);
        });
        if (incidents.length > 0) {
            updateSensorCard(incidents[0]);
        }

    } catch (err) {
        console.error("Error al cargar incidencias iniciales:", err);
    }
}


document.getElementById('btnSimMotion').addEventListener('click', () => {
    console.log("Botón 'Simular movimiento' pulsado.");
    simulate('motion', { is_authorized: false, zone: 'Laboratorio 3' });
});
document.getElementById('btnSimTemp').addEventListener('click', () => {
    console.log("Botón 'Simular temperatura' pulsado.");
    simulate('temperature', { temperature: Math.floor(Math.random() * 31) + 30 });
});
document.getElementById('btnSimAccess').addEventListener('click', () => {
    console.log("Botón 'Simular acceso' pulsado.");
    simulate('access', { access_granted: false, user: 'Dr. Doom' });
});


document.addEventListener('DOMContentLoaded', () => {
  console.log("El DOM se ha cargado completamente. Listeners de botones deberían estar activos.");
  if (getToken()) {
    showLoggedIn();
  } else {
    showLoggedOut();
  }
});