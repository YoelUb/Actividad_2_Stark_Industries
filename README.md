# Stark Industries - Security Dashboard

## Descripción
**Stark Industries - Security Dashboard** es una aplicación web en tiempo real desarrollada con **Python (FastAPI), SQLModel y JavaScript puro**. Está diseñada para monitorizar y simular eventos de seguridad de diferentes sensores en las instalaciones de Stark Industries. La aplicación permite a los usuarios con distintos niveles de permiso visualizar datos, simular incidencias y recibir notificaciones críticas de forma instantánea.

Link al repositorio: `https://github.com/YoelUb/Actividad_2_Stark_Industries`

## Tecnologías Utilizadas
-   **Backend**: **Python** con el framework **FastAPI**.
-   **Base de Datos**: **MySQL**, gestionada con **SQLModel**.
-   **Frontend**: **JavaScript** puro (ES Modules), **HTML5** y **CSS3**.
-   **Comunicación en Tiempo Real**: **WebSockets**.
-   **Autenticación**: Tokens **JWT (JSON Web Tokens)**.
-   **Entorno y Dependencias**: Entornos virtuales de Python (`venv`).

## Diagramas de UML
A continuación se muestran los diagramas que describen la arquitectura del sistema.

### Diagrama del proyecto



### Diagrama de clases

![Diagrama_Clases.png](docs/Arquitectura-UML/Diagrama_Clases.png)

### Diagrama de Secuencia

![Diagrama_Secuencia.png](docs/Arquitectura-UML/Diagrama_Secuencia.png)

### Diagrama de Objetos

![Diagrama_Objetos.png](docs/Arquitectura-UML/Diagrama_Objetos.png)


### 1. Clonar el Repositorio
```sh
git clone [https://github.com/YoelUb/Actividad_2_Stark_Industries.git](https://github.com/YoelUb/Actividad_2_Stark_Industries.git)
cd Actividad_2_Stark_Industries
```

### 2. Configurar el Backend y Dependencias
Navega al directorio del backend, crea un entorno virtual e instala las dependencias.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configurar la Base de Datos

- Asegúrate de tener un servidor MySQL en ejecución.

- Accede a tu gestor de base de datos (phpMyAdmin, DBeaver, etc.).

- Crea una base de datos llamada Stark_Industries.

- Las tablas se crearán automáticamente cuando inicies la aplicación por primera vez gracias a SQLModel.


### 4. Configurar las Variables de Entorno

Dentro del directorio backend/, crea un archivo .env con tus credenciales. Puedes usar este comando para crearlo rápidamente:
```bash
cat <<EOF > .env
# Base de datos
DATABASE_URL=mysql+pymysql://root:tu_password@localhost:3306/Stark_Industries

# Correo (para notificaciones)
MAIL_USERNAME=tu_correo@gmail.com
MAIL_PASSWORD=tu_password_de_aplicacion
MAIL_FROM=tu_correo@gmail.com
MAIL_PORT=587
MAIL_SERVER=smtp.gmail.com
MAIL_STARTTLS=True
MAIL_SSL_TLS=False

# Secreto para JWT
JWT_SECRET=un_secreto_muy_largo_y_dificil_de_adivinar
EOF
```

### 5. Ejecución de la Aplicación

Con el entorno virtual activado y desde la carpeta backend/, ejecuta el servidor:
```bash
uvicorn main:app --reload #Actualiza el servidor con cualquier cambio
```

La API del backend estará disponible en http://127.0.0.1:8000.

Para usar la aplicación, simplemente abre el fichero frontend/index.html en tu navegador web.

## Uso de la aplicación

Puedes iniciar sesión con las siguientes credenciales de prueba:

### Administrador:

- Usuario: admin1@stark.com

- Contraseña: AdminPass123

### Observador:

- Usuario: observador@stark.com

- Contraseña: 123456

También puedes acceder como Invitado para obtener una vista de solo lectura del dashboard.

## Contacto

Si tienes preguntas o sugerencias, contacta con el desarrollador "yoelurquijo13@gmail.com" o abre un issue en el repositorio de GitHub.