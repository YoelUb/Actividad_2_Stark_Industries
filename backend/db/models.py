from sqlmodel import SQLModel, Field

#Clase de prueba
class Test(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    message: str
