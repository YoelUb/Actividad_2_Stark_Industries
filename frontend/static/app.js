const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const TOKEN_ENDPOINT = `${API_BASE}/token`;
const SIMULATE_ENDPOINT = `${API_BASE}/api/v1/simulate`;

let socket = null;

function connectWebSocket() {
  const token = getToken();
  if (!token || socket) return;

  socket = new WebSocket(`${WS_BASE}/ws`);
  socket.onopen = () => console.log("WebSocket conectado.");
  socket.onmessage = (event) => addAlert(JSON.parse(event.data));
  socket.onclose = () => { console.log("WebSocket desconectado."); socket = null; };
  socket.onerror = (error) => { console.error("Error en WebSocket:", error); socket = null; };
}

function disconnectWebSocket() {
    if (socket) socket.close();
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
  operador: { description: "Operador: puede procesar eventos.", buttons: true, show_alerts: false },
  viewer: { description: "Usuario viewer: solo lectura.", buttons: false, show_alerts: false },
  invitado: { description: "Invitado: solo lectura.", buttons: false, show_alerts: false },
  observador: { description: "Observador: puede simular eventos.", buttons: true, show_alerts: false }
};

function showLoggedIn() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  btnLogout.hidden = false;
  const user = getUser();
  usernameLabel.textContent = user.username || 'Usuario';
  updateUIByRole(user.rol || 'viewer');
  connectWebSocket();
}

function showLoggedOut() {
  loginSection.hidden = false;
  dashboard.hidden = true;
  btnLogout.hidden = true;
  usernameLabel.textContent = '';
  actionButtons.forEach(btn => btn.disabled = true);
  if (alertsCard) alertsCard.style.display = 'none'; // Usamos style.display
  disconnectWebSocket();
  if (alertsList) alertsList.innerHTML = '';
}

function updateUIByRole(role) {
  const perms = ROLE_PERMISSIONS[role.toLowerCase()] || ROLE_PERMISSIONS['viewer'];

  actionButtons.forEach(btn => btn.hidden = !perms.buttons);

  // =============================================================
  // ESTA ES LA ÚNICA LÍNEA QUE HA CAMBIADO Y QUE LO ARREGLA TODO
  // =============================================================
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

btnGuest.addEventListener('click', () => {
    saveToken('guest-token', { username: 'Invitado', rol: 'invitado' });
    showLoggedIn();
});

async function simulate(sensorType, payload) {
    const token = getToken();
    try {
        const resp = await fetch(`${SIMULATE_ENDPOINT}/${sensorType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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

function addAlert(alertData) {
    if (!alertsList) return;
    const item = document.createElement('li');
    item.className = `alert-item ${alertData.status}`;
    item.innerHTML = `<span>${alertData.message}</span><small>${alertData.timestamp}</small>`;
    alertsList.prepend(item);
    if (alertsList.children.length > 20) {
        alertsList.removeChild(alertsList.lastChild);
    }
}

document.getElementById('btnSimMotion').addEventListener('click', () => simulate('motion', { is_authorized: false, zone: 'Laboratorio 3' }));
document.getElementById('btnSimTemp').addEventListener('click', () => simulate('temperature', { temperature: Math.floor(Math.random() * 31) + 30 }));
document.getElementById('btnSimAccess').addEventListener('click', () => simulate('access', { access_granted: false, user: 'Dr. Doom' }));

document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) {
    showLoggedIn();
  } else {
    showLoggedOut();
  }
});