const API_BASE = window.location.origin;
const TOKEN_ENDPOINT = `${API_BASE}/token`;

// --- Manejo token ---
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

// --- Elementos DOM ---
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const btnGuest = document.getElementById('btnGuest');
const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const usernameLabel = document.getElementById('usernameLabel');
const roleDescription = document.getElementById('roleDescription') || null;
const actionButtons = document.querySelectorAll('#dashboard button[data-sensor]');

// --- Definición permisos ---
const ROLE_PERMISSIONS = {
  admin: { description: "Administrador: acceso completo a sensores y simulaciones.", buttons: true },
  operador: { description: "Operador: puede recibir y procesar eventos de sensores.", buttons: true },
  viewer: { description: "Usuario viewer: solo lectura, sin interacción.", buttons: false },
  observador: { description: "Observador invitado: solo lectura, acceso limitado.", buttons: false }
};

// --- Mostrar interfaz según rol ---
function showLoggedIn() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  btnLogout.hidden = false;

  const user = getUser();
  usernameLabel.textContent = user.username || 'Usuario';
  updateUIByRole(user.rol || 'viewer');
}

function showLoggedOut() {
  loginSection.hidden = false;
  dashboard.hidden = true;
  btnLogout.hidden = true;
  usernameLabel.textContent = '';
  if (roleDescription) roleDescription.textContent = '';
  actionButtons.forEach(btn => btn.disabled = true);
}

// --- Habilitar/deshabilitar botones según rol ---
function updateUIByRole(role) {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['viewer'];
  actionButtons.forEach(btn => btn.disabled = !perms.buttons);
  if (roleDescription) roleDescription.textContent = perms.description;
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
      const msg = await resp.json().catch(() => null);
      const friendly = msg?.detail || "Usuario o contraseña incorrectos. Por favor verifica.";
      throw new Error(friendly);
    }

    const data = await resp.json();
    saveToken(data.access_token, data.user);
    showLoggedIn();

  } catch (err) {
    alert(err.message);
    console.error(err);
  }
});

// --- Logout ---
btnLogout.addEventListener('click', () => {
  clearToken();
  showLoggedOut();
});

// --- Modo Observador ---
btnGuest.addEventListener('click', async () => {
  try {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ guest: true })
    });
    if (!resp.ok) throw new Error("No se pudo entrar como observador");
    const data = await resp.json();
    saveToken(data.access_token, data.user);
    showLoggedIn();
  } catch (err) {
    alert(err.message);
    console.error(err);
  }
});

// --- Revisar token al cargar ---
document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const user = getUser();
  if (token && user.username) showLoggedIn();
  else showLoggedOut();
});
