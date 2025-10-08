from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime

class Rol(SQLModel, table=True):
    __tablename__ = "roles"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str = Field(nullable=False, unique=True)
    descripcion: Optional[str] = None

    empleados: list["EmpleadoRol"] = Relationship(back_populates="rol")


class Empleado(SQLModel, table=True):
    __tablename__ = "empleados"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    correo: str
    contrasena_hash: str
    creado_en: Optional[datetime] = Field(default=None)
    actualizado_en: Optional[datetime] = Field(default=None)

    roles: list["EmpleadoRol"] = Relationship(back_populates="empleado")


class EmpleadoRol(SQLModel, table=True):
    __tablename__ = "empleado_roles"

    empleado_id: int = Field(foreign_key="empleados.id", primary_key=True)
    rol_id: int = Field(foreign_key="roles.id", primary_key=True)

    empleado: Empleado = Relationship(back_populates="roles")
    rol: Rol = Relationship(back_populates="empleados")
