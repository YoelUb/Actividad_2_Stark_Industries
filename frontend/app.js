// app.js (module)
const API_BASE = window.location.origin; // Ajusta si tu backend corre en otro host, ej: "http://localhost:8000"
const TOKEN_ENDPOINT = `${API_BASE}/token`;
const SENSORS_ENDPOINT = `${API_BASE}/api/sensors`;
const SIMULATE_ENDPOINT = `${API_BASE}/api/simulate`;
const METRICS_ENDPOINT = `${API_BASE}/api/metrics`;
const WS_ENDPOINT = `${API_BASE.replace(/^http/, 'ws')}/ws`; // ws://host/ws

// --- Helpers de Auth (Demo: JWT en localStorage) ---
function saveToken(token, user) {
  localStorage.setItem('stark_token', token);
  localStorage.setItem('stark_user', JSON.stringify(user || {}));
}
function getToken() { return localStorage.getItem('stark_token'); }
function clearToken() { localStorage.removeItem('stark_token'); localStorage.removeItem('stark_user'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('stark_user') || '{}'); }
  catch { return {}; }
}

function authHeaders() {
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

// --- DOM refs ---
const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const usernameLabel = document.getElementById('usernameLabel');
const btnLogout = document.getElementById('btnLogout');
const loginForm = document.getElementById('loginForm');
const btnGuest = document.getElementById('btnGuest');

const motionValue = document.getElementById('motionValue');
const motionMeta = document.getElementById('motionMeta');
const tempValue = document.getElementById('tempValue');
const tempMeta = document.getElementById('tempMeta');
const accessValue = document.getElementById('accessValue');
const accessMeta = document.getElementById('accessMeta');

const alertsList = document.getElementById('alertsList');
const metricEvents = document.getElementById('metricEvents');
const metricLatency = document.getElementById('metricLatency');
const btnRefreshMetrics = document.getElementById('btnRefreshMetrics');

const simulateForm = document.getElementById('simulateForm');
const simSensor = document.getElementById('simSensor');
const simPayload = document.getElementById('simPayload');

const btnSimMotion = document.getElementById('btnSimMotion');
const btnSimTemp = document.getElementById('btnSimTemp');
const btnSimAccess = document.getElementById('btnSimAccess');

let ws = null;
let wsReconnectAttempt = 0;
let wsBackoffMax = 10; // segundos cap

// --- UI management ---
function showLoggedIn() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  btnLogout.hidden = false;
  const user = getUser();
  usernameLabel.textContent = user.username ? `${user.username} (${user.role || 'user'})` : 'Usuario';
}

function showLoggedOut() {
  loginSection.hidden = false;
  dashboard.hidden = true;
  btnLogout.hidden = true;
  usernameLabel.textContent = '';
}

// --- Login flow ---
loginForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  try {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({username, password})
    });
    if (!resp.ok) throw new Error(`Autenticación fallida (${resp.status})`);
    const data = await resp.json();
    // se espera { access_token: "...", token_type:"bearer", user: {username, role} }
    saveToken(data.access_token, data.user || {username});
    setupAfterLogin();
  } catch (err) {
    alert('Error de login: ' + err.message);
    console.error(err);
  }
});

btnGuest.addEventListener('click', () => {
  // Guest demo: tokenless viewer (o pedir al backend un token "viewer")
  clearToken();
  saveToken('', {username: 'Observador', role: 'viewer'});
  setupAfterLogin();
});

btnLogout.addEventListener('click', () => {
  clearToken();
  disconnectWS();
  showLoggedOut();
  location.reload();
});

// --- Fetch sensors / metrics ---
async function fetchMetrics() {
  try {
    const resp = await fetch(METRICS_ENDPOINT, { headers: {...authHeaders()} });
    if (!resp.ok) {
      metricEvents.textContent = '—';
      metricLatency.textContent = '—';
      return;
    }
    const m = await resp.json();
    metricEvents.textContent = m.events_processed ?? '—';
    metricLatency.textContent = m.avg_latency_ms ?? '—';
  } catch (err) {
    console.warn('No se pudieron obtener métricas', err);
  }
}

async function fetchSensorsSnapshot() {
  try {
    const resp = await fetch(SENSORS_ENDPOINT, { headers: {...authHeaders()} });
    if (!resp.ok) return;
    const s = await resp.json();
    // Esperamos forma: { motion: {...}, temperature: {...}, access: {...} }
    if (s.motion) {
      motionValue.textContent = s.motion.last_state ?? '—';
      motionMeta.textContent = `Último: ${s.motion.last_ts ?? '—'}`;
    }
    if (s.temperature) {
      tempValue.textContent = (s.temperature.last_value !== undefined) ? `${s.temperature.last_value} °C` : '—';
      tempMeta.textContent = `Último: ${s.temperature.last_ts ?? '—'}`;
    }
    if (s.access) {
      accessValue.textContent = s.access.last_state ?? '—';
      accessMeta.textContent = `Último: ${s.access.last_ts ?? '—'}`;
    }
  } catch (err) {
    console.warn('No se pudo obtener snapshot de sensores', err);
  }
}

// --- Simulador ---
async function sendSimulatedEvent(sensorType, payloadObj) {
  try {
    const resp = await fetch(SIMULATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ sensor: sensorType, payload: payloadObj })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(txt || 'Error al simular');
    }
    const r = await resp.json();
    console.log('Simulado', r);
    return r;
  } catch (err) {
    alert('Error simulando: ' + err.message);
    console.error(err);
  }
}

simulateForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const sensor = simSensor.value;
  let payload;
  try {
    payload = simPayload.value ? JSON.parse(simPayload.value) : {};
  } catch (e) {
    alert('Payload JSON inválido');
    return;
  }
  await sendSimulatedEvent(sensor, payload);
});

// quick simulator buttons
btnSimMotion.addEventListener('click', () => sendSimulatedEvent('motion', {detected:true}));
btnSimTemp.addEventListener('click', () => {
  const val = (20 + Math.round(Math.random()*15));
  sendSimulatedEvent('temperature', {value: val});
});
btnSimAccess.addEventListener('click', () => sendSimulatedEvent('access', {granted:false, card_id:'CARD-001'}));

// --- Alerts management ---
function pushAlert({level='info', title='Alerta', message='—', ts=(new Date()).toISOString()}) {
  const li = document.createElement('li');
  li.className = `alert-item ${level}`;
  li.innerHTML = `<div><strong>${title}</strong><div class="muted">${ts}</div><div>${message}</div></div>`;
  alertsList.prepend(li);
  // keep only recent 200
  while (alertsList.children.length > 200) alertsList.removeChild(alertsList.lastChild);
}

// --- WebSocket real-time connection ---
function buildWsUrl() {
  const base = WS_ENDPOINT;
  const t = getToken();
  // Si tu backend acepta token por query param:
  const query = t ? `?token=${encodeURIComponent(t)}` : '';
  return `${base}${query}`;
}

function connectWS() {
  if (ws) return;
  const url = buildWsUrl();
  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.error('No se pudo crear WebSocket', err);
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    console.log('WS conectado');
    wsReconnectAttempt = 0;
    pushAlert({level:'info', title:'Conexión', message:'Conexión WebSocket establecida', ts: (new Date()).toISOString()});
  });

  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      // estructura esperada: { type: 'alert'|'sensor_update', level:'critical'|'info', sensor:'motion', payload:{...}, ts: '...' }
      if (data.type === 'alert') {
        pushAlert({ level: data.level || 'critical', title: data.title || 'Alerta crítica', message: data.message || JSON.stringify(data.payload || {}), ts: data.ts });
      } else if (data.type === 'sensor_update') {
        const s = data.sensor;
        if (s === 'motion') {
          motionValue.textContent = data.payload.state ?? motionValue.textContent;
          motionMeta.textContent = `Último: ${data.ts ?? '-'}`;
        } else if (s === 'temperature') {
          tempValue.textContent = (data.payload.value !== undefined) ? `${data.payload.value} °C` : tempValue.textContent;
          tempMeta.textContent = `Último: ${data.ts ?? '-'}`;
        } else if (s === 'access') {
          accessValue.textContent = data.payload.state ?? accessValue.textContent;
          accessMeta.textContent = `Último: ${data.ts ?? '-'}`;
        }
      } else {
        console.log('WS mensaje', data);
      }
    } catch (err) {
      console.warn('WS: fallo parseo msg', err);
    }
  });

  ws.addEventListener('close', (ev) => {
    console.warn('WS cerrado', ev);
    ws = null;
    pushAlert({level:'warning', title:'Conexión', message:'WebSocket desconectado', ts:(new Date()).toISOString()});
    scheduleReconnect();
  });

  ws.addEventListener('error', (ev) => {
    console.error('WS error', ev);
    // se cerrará y reconectará vía close
  });
}

function disconnectWS() {
  if (!ws) return;
  try {
    ws.close();
  } catch (e) { console.warn(e); }
  ws = null;
}

function scheduleReconnect() {
  wsReconnectAttempt++;
  const wait = Math.min((2 ** (wsReconnectAttempt - 1)), wsBackoffMax);
  console.log(`Reconectando WS en ${wait}s (intento ${wsReconnectAttempt})`);
  setTimeout(() => {
    if (!getToken()) {
      // si no hay token, es porque probablemente hicimos logout; no reconectar
      return;
    }
    connectWS();
  }, wait * 1000);
}

// --- After login setup ---
function setupAfterLogin() {
  showLoggedIn();
  fetchSensorsSnapshot();
  fetchMetrics();
  connectWS();
}

// --- Initial load ---
document.addEventListener('DOMContentLoaded', () => {
  const t = getToken();
  if (t !== null && t !== '') {
    setupAfterLogin();
  } else {
    showLoggedOut();
  }
});

// manual refresh metrics
btnRefreshMetrics.addEventListener('click', () => fetchMetrics());
