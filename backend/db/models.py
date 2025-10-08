from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


#Tabla empleado
class Empleado(SQLModel, table=True):
    __tablename__ = "empleados"
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    correo: str
    contrasena_hash: str
    creado_en: Optional[datetime] = None
    actualizado_en: Optional[datetime] = None
