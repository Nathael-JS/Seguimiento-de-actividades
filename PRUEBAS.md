# Pruebas manuales y lista para el deploy

Lista para probar la app en Render antes de abrirla a usuarios reales. Cómo usarla:
1. Haz cada prueba y marca **✅** (funciona) o **❌** (falla).
2. Cuando algo falle, anota en *Notas* qué hiciste y qué viste. Si el mensaje trae un **código** (por ejemplo `a1b2c3d4`), anótalo: con él se encuentra el error en el log de Render.
3. Pásame solo las ❌.

Inicio desde 0: la base no tiene usuarios ni departamentos, solo tus super administradores (`SUPERADMINS`). El orden para empezar:
1. **Super administrador:** entra (Gerencia, correo y contraseña, código de la app) → **Plantillas → Nuevo gerente** (nombre, número, correo, turno, departamento).
2. **Gerente:** Gerencia → **Registrarse** con ese número y correo → elige contraseña → entra y vincula su app.
3. **Gerente:** Ajustes → carga la plantilla de Excel con su gente.
4. **Cada persona de la plantilla:** Registrarse con su número y correo.

Para usar dos cuentas a la vez, abre una en ventana normal y la otra en **incógnito** (ver incidente [I-02](DOCUMENTACION.md#i-02-se-desactivó-la-cuenta-al-abrir-dos-cuentas-en-dos-pestañas)).

---

## A. Acceso

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| A0 | Nuevo gerente | Super administrador → Plantillas → Nuevo gerente → Dar de alta (pide tu contraseña) | Aparece en *Por registrar* con su departamento | | |
| A1 | Portada | Abrir la app | Presentación, luego elegir Gerencia o Jr / Técnico | | |
| A2 | Entrar como gerente | Gerencia → su número y contraseña → código de la app | Entra al Inicio del gerente y dice "Bienvenido, Laura: asistencia checada a las …" (solo la primera vez del día) | | |
| A3 | Acceso equivocado | Gerencia → `10482` | "Esta cuenta es de Jr / Técnico: entra por ese acceso." | | |
| A4 | Contraseña mala ×10 | 10 intentos con contraseña mala | El 11.º dice "Demasiados intentos. Espera 15 minutos." | | |
| A9 | Registro rechazado | Jr / Técnico → Registrarse con un número de la plantilla y un correo equivocado | "Tus datos no coinciden con la plantilla… Comunícate con los administradores" | | |
| A10 | Registro aceptado | Registrarse con el número y el correo de la plantilla → elegir contraseña → entrar | Pide vincular la app autenticadora y entra | | |
| A5 | Recuperar sin código | ¿Olvidaste tu contraseña? con una cuenta real (no de prueba) sin el código | Pide el código de la app | | |
| A6 | Recargar la página | Dentro de la app, F5 | Sigue dentro (no pide entrar otra vez) | | |
| A7 | Cerrar sesión con otra pestaña abierta | Abrir 2 pestañas y cerrar sesión en una | La otra vuelve al login con "Se cerró la sesión en otra pestaña" | | |
| A8 | Idioma y tema | Botones ES/EN y luna/sol | Cambian textos y colores, y se recuerdan | | |

## B. Gerente / encargado

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| B1 | Inicio sin paneles encimados | Ver el Inicio a distintos anchos de ventana | Ningún panel encima de otro | | |
| B2 | Minimizar paneles | Flecha de "Notificaciones recientes" y recargar | Queda solo la barra con su nombre, también tras recargar | | |
| B3 | Crear en el Kanban | Kanban → + (Pendiente) → empleado, 2 renglones → Crear 2 | Aparecen 2 tarjetas en Pendiente con la etiqueta "Por clasificar"; al empleado le llega el aviso | | |
| B23 | Mover de estado | Arrastrar una tarjeta a En proceso (o ⋯ → Mover a) | Queda en En proceso; al empleado le llega el aviso | | |
| B24 | Filtro de criticidad | Desplegable Criticidad arriba del Kanban → Alta | Solo las de criticidad Alta | | |
| B35 | Nuevas actividades | Kanban → + → crear → ⋯ → Criticidad → Alta | Nace en Nuevas actividades; al clasificarla pasa a Pendiente | | |
| B25 | Asignarse una tarea | Kanban → + → elegirse a sí mismo | Se crea; no llega aviso a sí mismo | | |
| B26 | Eliminar con motivo | ⋯ → Eliminar → escribir el motivo → Sí, eliminar | Al empleado le llega "… eliminó «…»: motivo" | | |
| B27 | Ayudantes | Inicio → Avance por líder → Asignar ayudante → marcar un técnico → Guardar | El botón dice "1 ayudante"; el líder lo ve en Monitoreo y le puede asignar; al técnico le llega el aviso | | |
| B4 | Criticidad al crear | Mismo formulario, Criticidad = Alta | La tarjeta nace en Alta | | |
| B5 | Repetir | Crear con Repetir → Cada semana | La tarjeta muestra "Cada semana" | | |
| B6 | Mover | Arrastrar una tarjeta a Crítica (o menú ⋯ → Mover a) | Se mueve con animación | | |
| B7 | Urgente | Mover a Urgente | Queda Urgente; si se repetía, deja de repetirse | | |
| B8 | Editar | ⋯ → Editar: texto, turno, quitar Repetir → Guardar | Cambios guardados; al empleado le llega "editó" | | |
| B9 | Guardar como tarea | ⋯ → Guardar como tarea → Crítica | Aparece en "Tareas guardadas" | | |
| B10 | Usar guardada | Tareas guardadas → Usar | Se abre Por clasificar lleno con texto, criticidad y repetición | | |
| B11 | Fijar / eliminar | ⋯ → Fijar arriba; ⋯ → Eliminar → Sí | Sube arriba; desaparece | | |
| B12 | Aprobar solicitud | (después de C4) en la tarjeta con borde ámbar → Aprobar | Se mueve a la columna pedida; al Jr le llega el aviso | | |
| B13 | Herencias | Herencias → proponer una pendiente a alguien del turno siguiente | Queda por validar (o entra directo si eres su encargado) | | |
| B14 | Monitoreo | Monitoreo → lista y % de realizadas; filtro de puesto → Técnico | Datos del equipo, detalle desplegable; con el filtro, solo técnicos | | |
| B15 | Reportes | Reportes → fechas → Exportar Excel; Exportar PDF | CSV correcto; el PDF abre **vista previa** (en celular se descarga) y *Descargar PDF* baja el archivo con logo, resumen, comparativo y detalle | | |
| B16 | Matriz y Jerarquía | Abrir ambas | Cargan sin error | | |
| B28 | Agregar persona | Ajustes → Plantilla del departamento → Agregar persona → datos → Agregar a la plantilla | Aparece "Por registrar" en la tabla; ya puede crear su cuenta | | |
| B29 | Editar plantilla | Ajustes → Plantilla → Editar → cambiar turno → Guardar cambios | Se actualiza en la tabla | | |
| B17 | Ajustes (solo gerente) | Descargar ejemplo (.xlsx), cambiar `10001` por tu número y cargarlo | Vista previa con "Turno 1 · Matutino" … "Turno 4 · Administrativo"; al cargar, las personas nuevas quedan **por registrar** (ver D7) | | |
| B19 | Turnos | Ver Perfil, Monitoreo y el selector de turno al crear | "Turno 1 · Matutino 07:00–15:00" … "Turno 4 · Administrativo 08:00–17:30" | | |
| B20 | Editar / borrar departamento | Ajustes → lápiz → nuevo nombre → Guardar; papelera en uno vacío | Se renombra; uno con personas no se puede borrar | | |
| B21 | Foto de perfil | Perfil → Cambiar foto | Sale en el menú, en Perfil y en las listas del equipo | | |
| B22 | Matriz | Matriz de seguimiento; tocar el encabezado *Tiempo extra* | Yield, tiempo extra ("1:00 h · de 1:00 h registradas") y asistencia; se ordena de mayor a menor (otro toque, al revés). En celular, una tarjeta por persona | | |
| B30 | Aviso emergente | Con dos cuentas: el gerente asigna algo; en la otra cuenta esperar hasta 30 s o cambiar de pantalla | Aparece "Nueva notificación" arriba a la derecha (en celular, arriba); al tocarla abre la actividad | | |
| B31 | Árbol: mover | Jerarquía → arrastrar a un técnico sobre otro Full | Se marca dónde se puede soltar; queda bajo el nuevo Full; al técnico le llega el aviso | | |
| B32 | Árbol: ayudante | Arrastrar a un técnico sobre un Ing. Jr | Aparece con borde punteado bajo el Jr, con la etiqueta Ayudante | | |
| B33 | Árbol: no válido | Arrastrar a un Full sobre otro Full | Ese destino se ve atenuado y no se acepta | | |
| B36 | Árbol: revertir | Mover a alguien → Revertir | Vuelve con su encargado anterior; la barra desaparece | | |
| B37 | Organigrama | Jerarquía en una pantalla ancha; tocar "N directos" | De arriba abajo con conectores; la rama se pliega y despliega | | |
| B38 | Pantalla ancha | Abrir Inicio, Kanban y Monitoreo en un monitor ancho | Las páginas llenan el ancho, sin franja vacía a la derecha | | |
| B39 | Crear urgente | Kanban → + → Criticidad: Urgente | Aparece la nota de cómo funcionan; sin Repetir; la tarjeta sale con la etiqueta Urgente | | |
| B40 | Revisar urgente vencida | Con 80001: tarjeta "Reparar fuga en la válvula V-3" en Incompleta → motivo → Reabrir / Dejar cerrada / Eliminar | Reabrir: vuelve a Pendiente y le llega el aviso al técnico. Eliminar: sale del tablero y aparece tachada en Historial | | |
| B41 | Historial | Monitoreo → Historial | Realizadas, cerradas y eliminadas de los últimos 30 días | | |
| B42 | Conversación | Monitoreo → Lista → tocar el título de una actividad → escribir y Ctrl + Enter | El mensaje queda a la derecha; al técnico y a su encargado les llega el aviso | | |
| B43 | Ayudantes cruzados | Jerarquía: soltar al técnico sobre el junior y luego al junior sobre el técnico | El segundo no se permite (no se marca como destino) | | |
| B34 | Árbol: ficha y celular | Pasar el cursor sobre alguien; en celular, botón ⇄ → Mover a… | Ficha con encargado, líder y actividades; en celular, solo destinos válidos | | |
| B18 | Buzón | Marcar todo como leído; Borrar historial → Sí | Contador en 0; Buzón vacío | | |

## C. Jr / Técnico (`10482` o `10490`)

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| C1 | Menú | Ver el menú | Inicio, Kanban, Actividades asignadas, Buzón, Perfil | | |
| C2 | Actividades asignadas | Cambiar el estado de una a En proceso / Realizada | Se guarda; al encargado le llega el aviso | | |
| C3 | Agregar en el Kanban | Kanban → + → 3 renglones → Crear 3 | 3 tarjetas en Pendiente (Por clasificar); el encargado recibe **un** aviso | | |
| C4 | Pedir criticidad | ⋯ → Pedir criticidad → Alta | No cambia; dice "Solicitud enviada a tu encargado: mover a Alta" | | |
| C5 | Editar la suya | ⋯ → Editar en una que agregó | Puede cambiar texto, fecha y Repetir (no turno ni comentario) | | |
| C6 | No edita las asignadas | ⋯ en una que le asignaron | No aparece Editar | | |
| C8 | Límite de cambios de estado | Cambiar el estado de una misma actividad 6 veces | La 6.ª: "Ya cambiaste el estado de esta actividad 5 veces. Espera 10 min…" | | |
| C9 | Tiempo extra y salida | 30 min antes del fin de tu turno: arriba **Tiempo extra** → 1:00 h → Registrar; después del fin del turno + 15 min, **Marcar salida** | "Tiempo extra registrado…"; al salir: "Salida marcada a las … Tiempo extra: 1:00 h." (si sales antes de 15 min: "no cuenta"). Al día siguiente aparece en la Matriz del encargado | | |
| C10 | Salida sin tiempo extra | Marcar salida sin registrar tiempo extra | "Salida marcada a las …"; el botón desaparece y no vuelve ese día | | |
| C7 | Tarea urgente | Actividades asignadas → Nueva tarea → Urgente | Se crea; se cierra al terminar el turno | | |

## D. Super administrador (cuentas de `SUPERADMINS`)

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| D1 | Entrar | Gerencia → correo y contraseña → código de la app | Menú: Usuarios, Registros, Perfil | | |
| D2 | Confirmación | Cambiar el turno de alguien | Pide tu contraseña (vale 5 min) | | |
| D3 | Contraseña temporal | Ficha → restablecer contraseña | Se muestra una vez; al entrar, esa persona debe cambiarla | | |
| D4 | Quitar acceso | Ficha → quitar acceso | Esa persona ya no entra y su sesión se cierra | | |
| D5 | Registros | Registros → filtrar y exportar CSV | Aparecen los inicios de sesión de las pruebas | | |
| D7 | Plantillas | Plantillas → Por registrar | Aparecen las personas de la plantilla que faltan; las registradas en su pestaña | | |
| D8 | Intento rechazado | (después de A9) Plantillas → Intentos rechazados | Fila con número y correo escritos y la coincidencia ("El número es de…; en la plantilla su correo es…") | | |
| D9 | Corregir plantilla | Corregir el correo de esa persona → Guardar (pide tu contraseña) | Ya puede registrarse con el correo corregido | | |
| D10 | Errores en Registros | Registros → filtro "Error del servidor" / "Error en el navegador" | Si hubo errores, aparecen con su código | | |
| D11 | Cuentas de prueba | Usuarios → Cuentas de prueba (pide tu contraseña) | Aviso con 80001, 80004, 80002 y 80003 (el Full a cargo del técnico y el junior, con actividades de muestra); entran con `demo1234` sin código. Con `CUENTAS_PRUEBA=no`: "Las cuentas de prueba están apagadas…" | | |
| D6 | Respaldo | Usuarios → Descargar respaldo | Descarga un JSON; queda en Registros | | |

## E. Producción (Render y Neon)

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| E1 | Salud | Abrir `https://<tu-app>.onrender.com/api/salud` | `{"ok":true}` | | |
| E2 | Datos guardados | Hacer un cambio → Render: Manual Deploy → Restart → recargar | El cambio sigue ahí | | |
| E3 | Respaldo diario | GitHub → Actions → Respaldo | Ejecución de hoy en verde | | |
| E4 | Velocidad | Abrir la app con la caché vacía (DevTools → Network → Disable cache) | El JS principal pesa unos 70 kB (`content-encoding: br`) | | |
| E5 | Errores | Si algo falla, buscar el código en Render → Logs | Aparece la línea con ese código | | |

---

## F. Servidor de planta (Rocky Linux 10)

Ver [DESPLIEGUE_PLANTA.md](DESPLIEGUE_PLANTA.md), sección 8.

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| F1 | Salud | `curl -k https://<nombre interno>/api/salud` | `{"ok":true}` | | |
| F2 | Redirección | Abrir `http://<nombre interno>` | Pasa a `https://` | | |
| F3 | Certificado | Abrir la app desde un celular en el wifi de planta | Sin aviso de certificado | | |
| F4 | Entrar | Gerente y técnico con contraseña y código | Ven sus actividades; la sesión sigue tras recargar | | |
| F5 | IP real | Super administrador → Registros | La IP del celular, no `127.0.0.1` | | |
| F6 | App cerrada a la red | Desde otra PC: `http://<servidor>:3000` | No responde | | |
| F7 | Respaldo | `sudo systemctl start seguimiento-respaldo` | Archivo nuevo en la carpeta de red | | |
| F8 | Sin internet | Navegador → DevTools → Network al abrir la app | Ninguna petición fuera del servidor (ni Google Fonts) | | |
| F9 | Volver atrás | Instalar un paquete nuevo y apuntar `actual` a la versión anterior | La app vuelve a la versión anterior al reiniciar | | |

## Lista para el deploy completo (usuarios reales)

Hazlo en este orden cuando todas las pruebas estén en ✅:

1. [ ] **Super administradores:** `SUPERADMINS` en Render con las cuentas reales; entrar y vincular la app autenticadora.
2. [ ] **Inicio desde 0:** GitHub → Actions → **Vaciar datos** → Run workflow → escribir `VACIAR`. Respalda y deja solo a los super administradores. Después: Render → Manual Deploy → **Restart service**.
3. [ ] **Primer gerente:** Plantillas → Nuevo gerente; el gerente se registra y vincula su app.
4. [ ] **Departamentos y personas:** el gerente crea o renombra departamentos (Ajustes) y carga la plantilla de Excel; cada persona se registra sola.
5. [ ] **Build de Render:** *Settings → Build Command* = `npm ci && npm run build`, si el servicio no se creó como Blueprint.
6. [ ] **Revisar las variables:** `DATABASE_URL` con `sslmode=verify-full` y `SUPERADMINS`.
7. [ ] **Respaldo antes de abrir:** Actions → Respaldo → Run workflow, y comprobar que se abre ([I-08](DOCUMENTACION.md#i-08-errores-al-revisar-un-respaldo-en-windows)).
8. [x] **Plan de Render:** se queda en el plan gratis (decidido). Se duerme tras 15 min sin uso y la primera visita tarda hasta un minuto; si eso estorba en planta, pasar a Starter.
9. [ ] **Registro:** solo se registra quien viene en la plantilla. Revisar en **Plantillas** que no queden intentos rechazados sin atender.
10. [ ] **Dominio propio** (opcional): Render → Settings → Custom Domains.

