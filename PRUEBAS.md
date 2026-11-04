# Pruebas manuales y lista para el deploy

Lista para probar la app en Render antes de abrirla a usuarios reales. Cómo usarla:
1. Haz cada prueba y marca **✅** (funciona) o **❌** (falla).
2. Cuando algo falle, anota en *Notas* qué hiciste y qué viste. Si el mensaje trae un **código** (por ejemplo `a1b2c3d4`), anótalo: con él se encuentra el error en el log de Render.
3. Pásame solo las ❌.

Cuentas de prueba (contraseña `demo1234`, entran sin código mientras `CUENTAS_PRUEBA` no sea `no`):

| Cuenta | Rol |
|---|---|
| `10001` | Laura Méndez, Gerente |
| `10230` | Diego Herrera, Ing. Full (encargado de Jorge) |
| `10482` | Jorge Salinas, Técnico |
| `10490` | María López, Ing. Jr |

Para usar dos cuentas a la vez, abre una en ventana normal y la otra en **incógnito** (ver incidente [I-02](DOCUMENTACION.md#i-02-se-desactivó-la-cuenta-al-abrir-dos-cuentas-en-dos-pestañas)).

---

## A. Acceso

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| A1 | Portada | Abrir la app | Presentación, luego elegir Gerencia o Jr / Técnico | | |
| A2 | Entrar como gerente | Gerencia → `10001` / `demo1234` | Entra al Inicio del gerente | | |
| A3 | Acceso equivocado | Gerencia → `10482` | "Esta cuenta es de Jr / Técnico: entra por ese acceso." | | |
| A4 | Contraseña mala ×10 | 10 intentos con contraseña mala | El 11.º dice "Demasiados intentos. Espera 15 minutos." | | |
| A9 | Registro rechazado | Jr / Técnico → Registrarse con un número de la plantilla y un correo equivocado | "Tus datos no coinciden con la plantilla… Comunícate con los administradores" | | |
| A10 | Registro aceptado | Registrarse con el número y el correo de la plantilla → elegir contraseña → entrar | Pide vincular la app autenticadora y entra | | |
| A5 | Recuperar sin código | ¿Olvidaste tu contraseña? con una cuenta real (no de prueba) sin el código | Pide el código de la app | | |
| A6 | Recargar la página | Dentro de la app, F5 | Sigue dentro (no pide entrar otra vez) | | |
| A7 | Cerrar sesión con otra pestaña abierta | Abrir 2 pestañas y cerrar sesión en una | La otra vuelve al login con "Se cerró la sesión en otra pestaña" | | |
| A8 | Idioma y tema | Botones ES/EN y luna/sol | Cambian textos y colores, y se recuerdan | | |

## B. Gerente / encargado (`10001` o `10230`)

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| B1 | Inicio sin paneles encimados | Ver el Inicio a distintos anchos de ventana | Ningún panel encima de otro | | |
| B2 | Minimizar paneles | Flecha de "Notificaciones recientes" y recargar | Queda solo la barra con su nombre, también tras recargar | | |
| B3 | Crear en Por clasificar | Tablero → + → empleado, 2 renglones → Crear 2 | Aparecen 2 tarjetas; al empleado le llega el aviso | | |
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
| B14 | Monitoreo | Monitoreo → lista y % de realizadas | Datos del equipo, detalle desplegable | | |
| B15 | Reportes | Reportes → fechas → Exportar Excel; Exportar PDF | CSV correcto; el PDF abre **vista previa** (en celular se descarga) y *Descargar PDF* baja el archivo con logo, resumen, comparativo y detalle | | |
| B16 | Matriz y Jerarquía | Abrir ambas | Cargan sin error | | |
| B17 | Ajustes (solo gerente) | Cargar plantilla de ejemplo (.xlsx) | Vista previa; al cargar, las personas nuevas quedan **por registrar** (ver D7) | | |
| B18 | Buzón | Marcar todo como leído; Borrar historial → Sí | Contador en 0; Buzón vacío | | |

## C. Jr / Técnico (`10482` o `10490`)

| # | Prueba | Pasos | Esperado | ✅/❌ | Notas |
|---|---|---|---|---|---|
| C1 | Menú | Ver el menú | Inicio, Tablero, Actividades asignadas, Buzón, Perfil | | |
| C2 | Actividades asignadas | Cambiar el estado de una a En proceso / Realizada | Se guarda; al encargado le llega el aviso | | |
| C3 | Agregar en Tablero | Tablero → + → 3 renglones → Crear 3 | 3 tarjetas en Por clasificar; el encargado recibe **un** aviso | | |
| C4 | Pedir mover | Arrastrar una tarjeta a Alta | No se mueve; dice "Pediste mover a Alta" | | |
| C5 | Editar la suya | ⋯ → Editar en una que agregó | Puede cambiar texto, fecha y Repetir (no turno ni comentario) | | |
| C6 | No edita las asignadas | ⋯ en una que le asignaron | No aparece Editar | | |
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

## Lista para el deploy completo (usuarios reales)

Hazlo en este orden cuando todas las pruebas estén en ✅:

1. [ ] **Super administradores:** `SUPERADMINS` en Render con las cuentas reales; entrar y vincular la app autenticadora.
2. [ ] **Departamentos y personas:** el gerente crea los departamentos (Ajustes) y carga la plantilla de Excel; entrega las contraseñas temporales.
3. [ ] **Apagar las cuentas de prueba:** en Render, Environment → `CUENTAS_PRUEBA` = `no` → guardar. Desde ese momento `demo1234` deja de funcionar y el botón de revisión rápida desaparece.
4. [ ] **Revisar las variables:** `DATABASE_URL` con `sslmode=verify-full`, `SUPERADMINS`, `CUENTAS_PRUEBA=no`.
5. [ ] **Respaldo antes de abrir:** Actions → Respaldo → Run workflow, y comprobar que se abre ([I-08](DOCUMENTACION.md#i-08-errores-al-revisar-un-respaldo-en-windows)).
6. [ ] **Plan de Render:** el plan gratis se duerme tras 15 min sin uso (la primera visita tarda hasta un minuto). Para uso diario en planta, pasar a un plan de pago (Starter).
7. [ ] **Registro:** solo se registra quien viene en la plantilla. Revisar en **Plantillas** que no queden intentos rechazados sin atender.
8. [ ] **Dominio propio** (opcional): Render → Settings → Custom Domains.

Los datos de prueba (actividades de ejemplo de octubre) se quedan en la base. Si los quieres borrar antes de empezar, pídemelo y preparo una limpieza que conserve usuarios y departamentos.
