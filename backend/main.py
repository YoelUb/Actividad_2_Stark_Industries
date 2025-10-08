import os
from pathlib import Path
from datetime import datetime, timedelta
import hashlib

from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, create_engine, select
import jwt
from dotenv import load_dotenv

from db.models import Empleado, Rol, EmpleadoRol  # Tus modelos SQLModel

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
engine = create_engine(DATABASE_URL, echo=True)
def get_session():
    with Session(engine) as session:
        yield session

# --------------------------
# Configuración JWT
# --------------------------
SECRET_KEY = os.getenv("JWT_SECRET", "mi_super_secreto")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --------------------------
# Funciones de hash
# --------------------------
def hash_password(plain_password: str) -> str:
    return hashlib.sha256(plain_password.encode('utf-8')).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

# --------------------------
# Inicializar FastAPI
# --------------------------
app = FastAPI(title="Stark Industries API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------
# Servir frontend
# --------------------------
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=frontend_dir / "static"), name="static")

@app.get("/")
def serve_index():
    index_file = frontend_dir / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="index.html no encontrado")
    return FileResponse(index_file)

# --------------------------
# OAuth2
# --------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# --------------------------
# Endpoint /token (login normal o guest)
# --------------------------
@app.post("/token")
async def login(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    guest = data.get("guest", False)

    if guest:
        # Observador invitado
        stmt = select(Empleado).where(Empleado.correo == "observador@stark.com")
        user = session.exec(stmt).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuario observador no encontrado")
        token_data = {"sub": user.correo, "nombre": user.nombre, "rol": "observador"}
        token = create_access_token(token_data)
        return {"access_token": token, "token_type": "bearer", "user": {"username": user.nombre, "rol": "observador"}}

    # Login normal
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Usuario y contraseña requeridos")

    stmt = select(Empleado).where(Empleado.correo == username)
    user = session.exec(stmt).first()
    if not user or not verify_password(password, user.contrasena_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Usuario o contraseña incorrectos")

    # Obtener roles por ID
    stmt_roles = select(Rol.nombre).join(EmpleadoRol, Rol.id == EmpleadoRol.rol_id).where(EmpleadoRol.empleado_id == user.id)
    roles = session.exec(stmt_roles).all()
    rol_real = roles[0] if roles else "viewer"  # Default a viewer si no tiene rol

    token_data = {"sub": user.correo, "nombre": user.nombre, "rol": rol_real}
    token = create_access_token(token_data)
    return {"access_token": token, "token_type": "bearer", "user": {"username": user.nombre, "rol": rol_real}}

# --------------------------
# Endpoint protegido /me
# --------------------------
@app.get("/me")
def read_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        return {"username": "Observador", "rol": "observador"}
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("nombre")
        rol = payload.get("rol", "viewer")
        if username is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        return {"username": username, "rol": rol}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
