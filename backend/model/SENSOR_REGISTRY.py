#Clase para ser escalable
from .MotionSensor import MotionSensor
from .TemperatureSensor import TemperatureSensor
from .AccessSensor import AccessSensor

class SENSOR_REGISTRY:
    def __init__(self):
        self.motion = MotionSensor()
        self.temperature = TemperatureSensor()
        self.access = AccessSensor()

    def get_sensor(self, sensor_type: str):
        if sensor_type == "motion":
            return self.motion
        if sensor_type == "temperature":
            return self.temperature
        if sensor_type == "access":
            return self.access
        return None

sensor_registry = SENSOR_REGISTRY()