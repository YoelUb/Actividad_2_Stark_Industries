#Clase de Sensor de Temperatura
class TemperatureSensor:
    def process_event(self, data: dict) -> dict:
        temperature = data.get("temperature", 20)
        if temperature > 50:
            return {"status": "critical", "message": f"ALERTA: Temperatura crítica de {temperature}°C detectada."}
        if temperature > 35:
            return {"status": "warning", "message": f"AVISO: Temperatura elevada de {temperature}°C detectada."}
        return {"status": "ok", "message": f"Temperatura normal de {temperature}°C registrada."}