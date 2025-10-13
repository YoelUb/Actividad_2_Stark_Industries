import os
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta
import hashlib
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, Depends, status, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import SQLModel, Session, create_engine, select  # Asegúrate que SQLModel está importado
import jwt
from dotenv import load_dotenv
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import Counter, Histogram

from db.models import Empleado, Rol, EmpleadoRol, Incidencia  # <<-- 1. IMPORTA EL NUEVO MODELO
from websockets_manager import manager
from model.SENSOR_REGISTRY import sensor_registry

# --- Configuración de Logging y Métricas (sin cambios) ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
EVENTS_PROCESSED = Counter('events_processed_total', 'Total de eventos de sensor procesados', ['sensor_type', 'status'])
EVENT_LATENCY = Histogram('event_processing_latency_seconds', 'Latencia del procesamiento de eventos de sensor',
                          ['sensor_type'])

# --- Pool de Hilos (sin cambios) ---
thread_pool = ThreadPoolExecutor(max_workers=4)

# --- Carga de variables de entorno y configuración de BD ---
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL: raise RuntimeError("No se encontró DATABASE_URL en .env")

engine = create_engine(DATABASE_URL, echo=False)


def create_db_and_tables():
    """Función para crear las tablas en la base de datos si no existen."""
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


# --- Configuración de JWT y Seguridad (sin cambios) ---
SECRET_KEY = os.getenv("JWT_SECRET", "mi_super_secreto")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("nombre")
        rol: str = payload.get("rol")
        if username is None or rol is None: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                                                detail="Token inválido")
        return {"username": username, "rol": rol}
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")


def hash_password(plain_password: str): return hashlib.sha256(plain_password.encode('utf-8')).hexdigest()


def verify_password(plain_password: str, hashed_password: str): return hash_password(plain_password) == hashed_password


# --- Funciones de Notificación (ACTUALIZADAS) ---
def get_admin_emails(session: Session) -> list[str]:
    admin_users_query = session.exec(
        select(Empleado.correo).join(EmpleadoRol).join(Rol).where(Rol.nombre == "admin")).all()
    # <<-- AÑADE EL NUEVO CORREO A LA LISTA -->>
    all_recipients = admin_users_query + ["uaxconcurrente@gmail.com"]
    return list(set(all_recipients))  # Usamos set para evitar duplicados


async def send_email_to_admins_async(message: str, session: Session):
    admin_emails = get_admin_emails(session)
    if not admin_emails: logging.warning(
        "ALERTA CRÍTICA, pero no se encontraron administradores para notificar."); return
    logging.info(f"Iniciando envío de email de alerta a: {', '.join(admin_emails)}")
    await asyncio.sleep(1)
    logging.info(f"Email enviado a administradores con el mensaje: '{message}'")


async def send_push_notification_async(message: str):
    logging.info(f"Simulando envío de push notification: {message}")
    await asyncio.sleep(0.5)
    logging.info("Notificación push enviada.")


def send_sms_sync(message: str):
    logging.info(f"Iniciando envío de SMS síncrono (bloqueante)...")
    time.sleep(2)
    logging.info(f"SMS síncrono enviado con mensaje: '{message}'")
    return "SMS Entregado"


# --------------------------
# Inicializar FastAPI
# --------------------------
app = FastAPI(title="Stark Industries API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])
Instrumentator().instrument(app).expose(app)


# <<-- 2. LLAMADA A LA FUNCIÓN DE CREACIÓN DE TABLAS AL INICIAR -->>
@app.on_event("startup")
def on_startup():
    create_db_and_tables()


# (El resto de endpoints de Frontend, Autenticación y WebSocket se mantienen igual...)
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=frontend_dir / "static"), name="static")


@app.get("/")
def serve_index(): return FileResponse(frontend_dir / "index.html")


@app.post("/token")
async def login(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    if data.get("guest", False):
        user_info, token_data = {"username": "Invitado", "rol": "invitado"}, {"sub": "guest@stark.com",
                                                                              "nombre": "Invitado", "rol": "invitado"}
    else:
        username, password = data.get("username"), data.get("password")
        if not username or not password: raise HTTPException(status_code=400, detail="Usuario y contraseña requeridos")
        user = session.exec(select(Empleado).where(Empleado.correo == username)).first()
        if not user or not verify_password(password, user.contrasena_hash): raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")
        roles = session.exec(select(Rol.nombre).join(EmpleadoRol).where(EmpleadoRol.empleado_id == user.id)).all()
        rol_real = roles[0] if roles else "viewer"
        user_info, token_data = {"username": user.nombre, "rol": rol_real}, {"sub": user.correo, "nombre": user.nombre,
                                                                             "rol": rol_real}
    token = create_access_token(token_data)
    return {"access_token": token, "token_type": "bearer", "user": user_info}


@app.get("/me")
def read_current_user(current_user: dict = Depends(get_current_user)): return current_user


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logging.info("Cliente desconectado del WebSocket.")


# <<-- 3. LÓGICA DE PROCESAMIENTO ACTUALIZADA -->>
@app.post("/api/v1/simulate/{sensor_type}")
async def simulate_event(sensor_type: str, request: Request, current_user: dict = Depends(get_current_user),
                         db_session: Session = Depends(get_session)):
    if current_user["rol"] not in ["admin", "observador"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para realizar esta acción")
    data = await request.json()
    sensor = sensor_registry.get_sensor(sensor_type)
    if not sensor: raise HTTPException(status_code=404, detail="Tipo de sensor no encontrado")
    asyncio.create_task(process_and_notify(sensor, data, db_session, sensor_type))
    return {"message": f"Simulación del sensor '{sensor_type}' iniciada."}


async def process_and_notify(sensor, data: dict, session: Session, sensor_type: str):
    start_time = time.time()
    result = sensor.process_event(data)

    # Notificar siempre por WebSocket para que el admin lo vea en su div
    result_with_timestamp = {**result, "timestamp": datetime.now().strftime("%H:%M:%S")}
    await manager.broadcast(json.dumps(result_with_timestamp))

    # Solo si es una alerta (warning o critical), la guardamos en la BBDD
    if result["status"] in ["critical", "warning"]:
        incidencia = Incidencia(
            sensor_type=sensor_type,
            status=result["status"],
            message=result["message"]
        )
        session.add(incidencia)
        session.commit()
        logging.info(f"Incidencia guardada en la base de datos: {incidencia.message}")

    # Si es una alerta CRÍTICA, realizar acciones adicionales (email, push, sms)
    if result["status"] == "critical":
        loop = asyncio.get_running_loop()
        sms_task = loop.run_in_executor(thread_pool, send_sms_sync, result["message"])

        await asyncio.gather(
            send_email_to_admins_async(result["message"], session),
            send_push_notification_async(result["message"]),
            sms_task
        )

    latency = time.time() - start_time
    EVENT_LATENCY.labels(sensor_type=sensor_type).observe(latency)
    EVENTS_PROCESSED.labels(sensor_type=sensor_type, status=result["status"]).inc()
    logging.info(f"Evento procesado para sensor '{sensor_type}' con estado '{result['status']}' en {latency:.4f}s")