# New Monday - Herramienta de Gestión de Postproducción

Aplicación web para la gestión de proyectos de postproducción audiovisual, similar a Monday.com.

## Características

- **Tableros de Proyecto**: Gestiona múltiples tableros para diferentes fases de postproducción
- **Vista de Tabla**: Visualiza items organizados por grupos
- **Vista de Cronograma (Gantt)**: Planifica líneas de tiempo con fechas de inicio y fin
- **Gestión de Equipo**: Administra miembros del equipo con roles y contactos
- **API REST**: Backend con Express.js y MongoDB

## Stack Técnico

- **Frontend**: HTML5, CSS3, JavaScript Vanilla
- **Backend**: Node.js + Express.js
- **Base de Datos**: MongoDB + Mongoose
- **Despliegue**: Render (configurado para auto-deploy desde GitHub)

## Instalación

1. Clonar el repositorio
2. Instalar dependencias: `npm install`
3. Configurar variables de entorno (MongoDB URI)
4. Iniciar servidor: `npm start`

## API Endpoints

### Tableros
- `GET /api/boards` - Listar todos los tableros
- `POST /api/boards` - Crear nuevo tablero

### Items
- `GET /api/items` - Listar todos los items
- `POST /api/items` - Crear nuevo item
- `PATCH /api/items/:id` - Actualizar item
- `DELETE /api/items/:id` - Eliminar item

### Equipo
- `GET /api/crew` - Listar miembros del equipo
- `POST /api/crew` - Agregar miembro
- `PATCH /api/crew/:id` - Actualizar miembro
- `DELETE /api/crew/:id` - Eliminar miembro

### Inicialización
- `POST /api/seed` - Poblar base de datos con datos de prueba

## Estructura de Carpetas

```
new-monday/
├── models/              # Esquemas MongoDB
│   ├── Board.js
│   ├── Item.js
│   └── CrewMember.js
├── routes/              # Rutas API
│   ├── boards.js
│   ├── items.js
│   ├── crew.js
│   └── seed.js
├── public/              # Archivos frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js            # Servidor principal
└── package.json         # Dependencias
```

## Autor

Anuska Baute - Coordinadora de Postproducción GY_GUAYOTA
