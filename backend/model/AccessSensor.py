#Clase de Acceso
class AccessSensor:
    def process_event(self, data: dict) -> dict:
        access_granted = data.get("access_granted", True)
        user = data.get("user", "desconocido")
        if not access_granted:
            return {"status": "critical", "message": f"ALERTA: Intento de acceso denegado al usuario '{user}'."}
        return {"status": "ok", "message": f"Acceso concedido al usuario '{user}'."}