# New Monday · diferencias restantes frente a Monday · 2026-08-26

Regla absoluta: **Monday se consulta únicamente en modo lectura. Toda implementación nueva pertenece a New Monday.**

## Qué significa “paridad” en este proyecto

La paridad se mide contra el alcance operativo auditado para los tableros de producción y postproducción usados como referencia, no contra cada producto, módulo o integración existente en todo el ecosistema de monday.com.

Dentro de ese alcance auditado, los bloques funcionales principales ya están implementados: grupos, tabla/columnas dinámicas, tipos de columna priorizados, subitems, vistas, Gantt, navegación/tablero, elementos, Updates, archivos, relaciones/mirror, teclado, accesibilidad, undo/redo, virtualización y sincronización realtime.

## Diferencias operativas reales pendientes

1. **QA visual/comportamental integral en navegador real**
   - focus y teclado;
   - virtualización y scroll en tableros grandes;
   - Gantt y dependencias;
   - popovers/menús/modales;
   - Updates y adjuntos;
   - dos sesiones simultáneas y reconexión.

2. **Decisión de producto sobre critical path / baseline de Gantt**
   - pendiente de validar utilidad operativa;
   - no bloquea el uso actual de Gantt;
   - no debe implementarse solo por copiar una capacidad de Monday.

## Diferencias condicionadas por decisiones futuras

3. **Usuarios/roles/permisos locales**
   - solo aplica si New Monday adopta un modelo real de usuarios;
   - el acceso actual sigue protegido por sesión/contraseña.

4. **Realtime multi-instancia**
   - el hub SSE actual es en memoria y funciona correctamente dentro de una instancia;
   - si Render escala a varias instancias será necesario un bus compartido (Redis/pub-sub, MongoDB Change Streams u otra solución equivalente).

5. **Tuning extremo de tableros de varios miles de elementos**
   - la virtualización ya usa ventanas, alturas medidas e índice binario;
   - solo queda medir y ajustar umbrales/tamaños si esa escala aparece de forma habitual con datos reales.

## Fuera del alcance auditado

Una función de monday.com que nunca haya formado parte del flujo operativo auditado no se considera automáticamente una “carencia” de New Monday. Si se decide ampliar el alcance, debe abrirse como una nueva decisión de producto y auditarse antes de implementarla.

## Estado del corte actual

- PR #5: publicada anteriormente.
- PR #6 (`agent/post-publish-qa`): Draft, separada de producción.
- Monday: solo lectura.
- Producción: no se modifica desde esta rama hasta un nuevo corte autorizado.
