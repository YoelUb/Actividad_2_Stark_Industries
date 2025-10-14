#Clase de Sensores
class MotionSensor:
    def process_event(self, data: dict) -> dict:
        is_authorized = data.get("is_authorized", True)
        if not is_authorized:
            return {"status": "critical", "message": f"ALERTA: Movimiento no autorizado detectado en la zona {data.get('zone', 'desconocida')}."}
        return {"status": "ok", "message": "Movimiento autorizado registrado."}


