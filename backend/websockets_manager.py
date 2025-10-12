from fastapi import WebSocket
from typing import List


class ConnectionManager:
    def __init__(self):
        # Lista de conexiones activas
        self.active_connections: List[WebSocket] = []

    # Funcion de conexion, crea el webscoket con la lista de usarios activos añdiendolos a la lista
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    # Funcion que elimina de la lista los usuarios cuando se desconectan
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

#Funcion que realice el mensaje a los usuarios de la lista admin
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)


# Crea una instancia única para ser usada en toda la aplicación
manager = ConnectionManager()
