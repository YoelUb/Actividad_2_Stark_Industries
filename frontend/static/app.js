// app.js (Login + Roles + Invitado)
const API_BASE = window.location.origin;
const TOKEN_ENDPOINT = `${API_BASE}/token`;

// --- Manejo de token en localStorage ---
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
  try { return JSON.parse(localStorage.getItem('stark_user') || '{}'); }
  catch { return {}; }
}

// --- Elementos del DOM ---
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const btnGuest = document.getElementById('btnGuest');
const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const usernameLabel = document.getElementById('usernameLabel');

// Botones que dependen del rol
const btnViewer = document.getElementById('btnViewer');  // modo viewer (si existe)
const btnAdmin = document.getElementById('btnAdmin');    // ejemplo para admin

// Botones de acción del dashboard (sensor, simulación)
const actionButtons = document.querySelectorAll('#dashboard button');

// --- Mostrar interfaz según login ---
function showLoggedIn() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  btnLogout.hidden = false;

  const user = getUser();
  usernameLabel.textContent = user.username || 'Usuario';

  // Bloquear o habilitar botones según rol
  updateUIByRole(user.rol);
}

function showLoggedOut() {
  loginSection.hidden = false;
  dashboard.hidden = true;
  btnLogout.hidden = true;
  usernameLabel.textContent = '';

  // Deshabilitar botones de acción
  actionButtons.forEach(btn => btn.disabled = true);
  if (btnViewer) btnViewer.disabled = true;
  if (btnAdmin) btnAdmin.disabled = true;
}

// --- Habilitar/Deshabilitar botones según rol ---
function updateUIByRole(role) {
  if (!role) return;

  actionButtons.forEach(btn => {
    // Solo viewer ve los datos pero no puede tocar nada
    if (role === "viewer") btn.disabled = true;
    else btn.disabled = false;
  });

  if (btnViewer) btnViewer.disabled = role !== "viewer";
  if (btnAdmin) btnAdmin.disabled = role !== "admin";
}

// --- Login ---
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
      const text = await resp.text();
      throw new Error(text || `Error ${resp.status}`);
    }

    const data = await resp.json();
    saveToken(data.access_token, data.user || { username });
    showLoggedIn();
    console.log("Login exitoso:", data);
  } catch (err) {
    alert("Login fallido: " + err.message);
    console.error(err);
  }
});

// --- Logout ---
btnLogout.addEventListener('click', () => {
  clearToken();
  showLoggedOut();
});

// --- Modo Observador sin login ---
btnGuest.addEventListener('click', () => {
  clearToken(); // Limpiamos cualquier token
  saveToken(null, { username: 'Observador', rol: 'viewer' });
  showLoggedIn();
});

// --- Verificar token al cargar página ---
document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const user = getUser();

  if (token && user.username) {
    showLoggedIn();
  } else {
    showLoggedOut();
  }
});
