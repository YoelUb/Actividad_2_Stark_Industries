import os
from dotenv import load_dotenv
from sqlmodel import Field, Session, create_engine, select, SQLModel
from typing import Annotated
from fastapi import Depends


# Cargar variables de entorno desde .env
load_dotenv()

#Definir el Modelo sql y la conexion
Database_url = os.getenv("DATABASE_URL")

if not Database_url:
    raise ValueError("No se encontro la variable de entorno")

engine = create_engine(Database_url, echo = True)


# Sesión de base de datos
def get_session():
    with Session(engine) as session:
        yield session


session_dep = Annotated[get_session(), Depends(get_session)]