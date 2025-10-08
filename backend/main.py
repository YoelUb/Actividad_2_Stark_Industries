import os
from pathlib import Path
from datetime import datetime, timedelta
import hashlib

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, create_engine, select
from pydantic import BaseModel
import jwt
from dotenv import load_dotenv

from db.models import Empleado

# --------------------------
# Cargar variables de entorno
# --------------------------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("No se encontró DATABASE_URL en el archivo .env")

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
    """Crea un token JWT con expiración."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --------------------------
# Funciones de hash
# --------------------------
def hash_password(plain_password: str) -> str:
    """Devuelve el hash SHA-256 compatible con MySQL SHA2(...,256)"""
    return hashlib.sha256(plain_password.encode('utf-8')).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica que la contraseña ingresada coincida con el hash almacenado."""
    return hash_password(plain_password) == hashed_password

# --------------------------
# Inicializar FastAPI
# --------------------------
app = FastAPI(title="Stark Industries API", version="1.0")

# Middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todos los orígenes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------
# Servir frontend
# --------------------------
frontend_dir = Path(__file__).parent.parent / "frontend"

app.mount("/static", StaticFiles(directory=frontend_dir / "static"), name="static")

# Servir index.html
@app.get("/")
def serve_index():
    index_file = frontend_dir / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="index.html no encontrado")
    return FileResponse(index_file)

# --------------------------
# Modelo de login
# --------------------------
class LoginRequest(BaseModel):
    username: str
    password: str

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# --------------------------
# Endpoint de login (admin + observador)
# --------------------------
@app.post("/token")
def login(req: LoginRequest, session: Session = Depends(get_session)):
    """Verifica usuario y contraseña, devuelve token JWT si es válido."""
    stmt = select(Empleado).where(Empleado.correo == req.username)
    user = session.exec(stmt).first()

    if not user or not verify_password(req.password, user.contrasena_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos"
        )

    # Crear token JWT (agregamos correo, nombre y rol si existe)
    token_data = {
        "sub": user.correo,
        "nombre": user.nombre,
        "rol": getattr(user, "rol", "empleado")  # Por si tiene un campo rol
    }
    token = create_access_token(token_data)

    print(f"[DEBUG] Login recibido: {req.username} ({token_data['rol']}) / Token generado")

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"username": user.nombre, "rol": token_data["rol"]}
    }

# --------------------------
# Endpoint protegido (ver perfil actual)
# --------------------------
@app.get("/me")
def read_current_user(token: str = Depends(oauth2_scheme)):
    """Devuelve la información del usuario autenticado."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("nombre")
        rol = payload.get("rol", "empleado")
        if username is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        return {"username": username, "rol": rol}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
