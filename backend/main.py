import os
from pathlib import Path
from datetime import datetime, timedelta
import hashlib
import asyncio
import json

from fastapi import FastAPI, HTTPException, Depends, status, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, create_engine, select
import jwt
from dotenv import load_dotenv

from db.models import Empleado, Rol, EmpleadoRol
from websockets_manager import manager
from model.SENSOR_REGISTRY import sensor_registry

# --------------------------
# Cargar variables de entorno
# --------------------------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("No se encontró DATABASE_URL en .env")

# --------------------------
# Crear engine (conexión a BD)
# --------------------------
engine = create_engine(DATABASE_URL, echo=False)  # echo=False para un log más limpio en producción


def get_session():
    with Session(engine) as session:
        yield session


# --------------------------
# Configuración JWT y Seguridad
# --------------------------
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
    """Dependencia para obtener el usuario actual a partir del token JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("nombre")
        rol: str = payload.get("rol")
        if username is None or rol is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        return {"username": username, "rol": rol}
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")


# --------------------------
# Funciones de hash
# --------------------------
def hash_password(plain_password: str) -> str:
    return hashlib.sha256(plain_password.encode('utf-8')).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password


# --------------------------
# Funciones de Notificación Asíncronas
# --------------------------
def get_admin_emails(session: Session) -> list[str]:
    """Obtiene los correos de todos los empleados con el rol de 'admin'."""
    admin_users = session.exec(
        select(Empleado.correo)
        .join(EmpleadoRol)
        .join(Rol)
        .where(Rol.nombre == "admin")
    ).all()
    return admin_users


async def send_email_to_admins_async(message: str, session: Session):
    """Simula el envío de un correo a todos los administradores."""
    admin_emails = get_admin_emails(session)
    if not admin_emails:
        print("ALERTA CRÍTICA, pero no se encontraron administradores para notificar.")
        return

    print(f"Iniciando envío de email de alerta a: {', '.join(admin_emails)}")
    await asyncio.sleep(1)  # Simula una operación de red (conexión a servidor SMTP)
    print(f"Email enviado a administradores con el mensaje: '{message}'")


async def send_push_notification_async(message: str):
    """Simula el envío de una notificación push a todos los dispositivos."""
    print(f"Simulando envío de push notification: {message}")
    await asyncio.sleep(0.5)
    print("Notificación push enviada.")


# --------------------------
# Inicializar FastAPI
# --------------------------
app = FastAPI(title="Stark Industries API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])

# --------------------------
# Servir Frontend
# --------------------------
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=frontend_dir / "static"), name="static")


@app.get("/")
def serve_index():
    return FileResponse(frontend_dir / "index.html")


# --------------------------
# Endpoints de Autenticación
# --------------------------
@app.post("/token")
async def login(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    if data.get("guest", False):
        user_info = {"username": "Invitado", "rol": "invitado"}
        token_data = {"sub": "guest@stark.com", "nombre": user_info["username"], "rol": user_info["rol"]}
    else:
        username = data.get("username")
        password = data.get("password")
        if not username or not password:
            raise HTTPException(status_code=400, detail="Usuario y contraseña requeridos")

        user = session.exec(select(Empleado).where(Empleado.correo == username)).first()
        if not user or not verify_password(password, user.contrasena_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")

        roles = session.exec(select(Rol.nombre).join(EmpleadoRol).where(EmpleadoRol.empleado_id == user.id)).all()
        rol_real = roles[0] if roles else "viewer"
        user_info = {"username": user.nombre, "rol": rol_real}
        token_data = {"sub": user.correo, "nombre": user.nombre, "rol": rol_real}

    token = create_access_token(token_data)
    return {"access_token": token, "token_type": "bearer", "user": user_info}


@app.get("/me")
def read_current_user(current_user: dict = Depends(get_current_user)):
    return current_user


# --------------------------
# Endpoint de WebSocket
# --------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("Cliente desconectado del WebSocket.")


# --------------------------
# Endpoints de Simulación y Procesamiento
# --------------------------
@app.post("/api/v1/simulate/{sensor_type}")
async def simulate_event(sensor_type: str, request: Request, current_user: dict = Depends(get_current_user),
                         db_session: Session = Depends(get_session)):
    if current_user["rol"] not in ["admin", "observador"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para realizar esta acción")

    data = await request.json()
    sensor = sensor_registry.get_sensor(sensor_type)
    if not sensor:
        raise HTTPException(status_code=404, detail="Tipo de sensor no encontrado")

    asyncio.create_task(process_and_notify(sensor, data, db_session))
    return {"message": f"Simulación del sensor '{sensor_type}' iniciada."}


async def process_and_notify(sensor, data: dict, session: Session):
    """Procesa el evento del sensor y notifica a través de los canales correspondientes."""
    result = sensor.process_event(data)
    result_with_timestamp = {**result, "timestamp": datetime.now().strftime("%H:%M:%S")}

    # 1. Notificar a TODOS los clientes conectados por WebSocket
    await manager.broadcast(json.dumps(result_with_timestamp))

    # 2. Si es una alerta crítica, realizar acciones adicionales
    if result["status"] == "critical":
        # Ejecutar notificaciones de email y push en paralelo sin bloquear
        await asyncio.gather(
            send_email_to_admins_async(result["message"], session),
            send_push_notification_async(result["message"])
        )