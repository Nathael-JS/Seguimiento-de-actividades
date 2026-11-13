# Entorno local con PostgreSQL

Guía para levantar Seguimiento de Actividades desde cero en una máquina con PostgreSQL: crear la base, configurar el `.env`, arrancar, dar de alta a los super administradores, cargar las cuentas de prueba y dejar la base limpia otra vez.

> Los valores de esta guía son de ejemplo. Las contraseñas reales van solo en tu `.env` (o en `/etc/seguimiento.env` en el servidor de planta), nunca en el repositorio ni en un chat.

## Índice

1. [Cómo se conecta el proyecto a la base](#1-cómo-se-conecta-el-proyecto-a-la-base)
2. [Requisitos](#2-requisitos)
3. [Crear la base](#3-crear-la-base)
4. [Configurar el `.env`](#4-configurar-el-env)
5. [Compilar y arrancar](#5-compilar-y-arrancar)
6. [Super administradores](#6-super-administradores)
7. [Cuentas de prueba](#7-cuentas-de-prueba)
8. [Qué está separado y por qué no choca](#8-qué-está-separado-y-por-qué-no-choca)
9. [Entorno limpio: empezar desde cero](#9-entorno-limpio-empezar-desde-cero)
10. [Comprobaciones](#10-comprobaciones)
11. [Problemas comunes](#11-problemas-comunes)

---

## 1. Cómo se conecta el proyecto a la base

Solo `server/db.js` habla con PostgreSQL. Los demás archivos `.js` trabajan con los datos en memoria:

```
.env ──► server/index.js ──► server/db.js ──► PostgreSQL
              │                  ▲
              ▼                  │ guarda solo lo que cambió (en una transacción)
         server/app.js ──────────┘
         (API, reglas, datos en memoria)
              │
              ▼
         dist/ (el frontend compilado de src/)
```

Al arrancar:

1. `server/index.js` lee `DATABASE_URL` y `SUPERADMINS` del `.env`.
2. `conectar()` **crea las tablas** que falten y agrega las columnas nuevas. No hay migraciones que correr a mano. Son 10 tablas: `departamentos`, `usuarios`, `actividades`, `notificaciones`, `herencias`, `guardadas`, `sesiones`, `registros`, `checador` e `ids`.
3. `cargar()` lee todo a memoria. La primera vez la base está vacía y la app arranca sin usuarios ni departamentos. El log dice "PostgreSQL vacío".
4. Los super administradores de `SUPERADMINS` se agregan o actualizan en la tabla `usuarios`.
5. Después de cada petición se escribe **solo lo que cambió**. Los campos nuevos que no tienen columna van a `extra` (jsonb), así que no se pierde nada.

> **Una sola instancia por base.** Si arrancas una segunda contra la misma base, la primera deja de guardar y responde 503. Para cambiar de versión, detén la anterior.

## 2. Requisitos

| Qué | Versión |
|---|---|
| Node.js | 22 o más nuevo (trae `--env-file`) |
| PostgreSQL | 16 o más nuevo (planta: 16.15) |
| npm | el que trae Node |

```bash
git clone https://github.com/Nathael-JS/Seguimiento-de-actividades.git
```
```bash
cd Seguimiento-de-actividades
```
```bash
npm ci
```

## 3. Crear la base

Como usuario `postgres`, una sola vez. Cambia `CAMBIAR` por una contraseña larga:

```bash
sudo -u postgres psql -c "create role seguimiento login password 'CAMBIAR'" -c "create database seguimiento owner seguimiento"
```

- La app crea las tablas sola en el paso 5; no hace falta ningún script SQL.
- Si al conectar sale `Peer authentication failed` o `password authentication failed`, en `pg_hba.conf` cambia el método de las líneas `local` y `host 127.0.0.1/32` a `scram-sha-256`. Luego reinicia el servicio:
  ```bash
  sudo systemctl restart postgresql
  ```

## 4. Configurar el `.env`

```bash
cp .env.ejemplo .env
```

| Variable | Para qué | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Conexión: `postgresql://USUARIO:CLAVE@SERVIDOR:PUERTO/BASE` | `'postgresql://seguimiento:CAMBIAR@localhost:5432/seguimiento'` |
| `SUPERADMINS` | Lista JSON de super administradores, **en un solo renglón y entre comillas simples** | `'[{"name":"Ana Ruiz","email":"ana@empresa.com","password":"Clave#Larga2026"}]'` |
| `CUENTAS_PRUEBA` | `no` apaga las cuentas de prueba; cualquier otro valor las permite | `si` |
| `HOST` | `127.0.0.1`: solo esta máquina o detrás de NGINX. `0.0.0.0`: visible en la red | `127.0.0.1` |
| `PORT` | Puerto de la app | `3000` |

**Caracteres especiales en la contraseña de la base.** En `DATABASE_URL` hay que codificar `@ # / : % ? &`. Por ejemplo, `Clave@2026#` se escribe `Clave%402026%23`. Para codificarla sin que quede en el historial:

```bash
read -rs CLAVE; node -e 'console.log(encodeURIComponent(process.argv[1]))' "$CLAVE"; unset CLAVE
```

Las variables `PGUSER`, `PGPASSWORD` y similares **no** las usa la app; solo lee `DATABASE_URL`.

## 5. Compilar y arrancar

```bash
npm run build
```
```bash
npm run local
```

`npm run local` es igual que `node --env-file=.env server/index.js`. Abre `http://localhost:3000`.

> `--env-file` **no reemplaza** una variable que ya exista en la terminal. Si alguna vez corriste `export SUPERADMINS=…`, manda la vieja. Revisa con `env | grep SUPERADMINS` y bórrala con `unset SUPERADMINS`.

## 6. Super administradores

**De dónde salen.** Solo de `SUPERADMINS`. En cada arranque:

- un correo nuevo crea la cuenta, con número 90001, 90002…;
- un correo que ya existe actualiza nombre y contraseña, y conserva su app autenticadora vinculada;
- quien ya no esté en la variable **pierde el acceso**.

No se editan en la base ni desde la app: lo que cambies en la tabla `usuarios` se vuelve a escribir al arrancar.

**Cómo entran (acceso oculto).** El super administrador ya no entra por Gerencia:

1. En la portada o en el login, **toca tres veces seguidas** (en 1.5 s) el número de versión del pie, `V0.0.1.5`. Con teclado: Tab hasta la versión y Enter tres veces.
2. Se abre **Iniciar sesión · Administración**. No tiene "Registrarse" ni "¿Olvidaste tu contraseña?", porque la cuenta vive en el servidor.
3. Escribe el correo (o el número 90001) y la contraseña.
4. La primera vez pide vincular la app autenticadora (Google o Microsoft Authenticator) con el QR. Después pide el código de 6 dígitos en cada inicio de sesión.

Si alguien intenta entrar con una cuenta de super administrador por Gerencia o Jr / Técnico, la respuesta es la misma que con una contraseña mala: no se revela que la cuenta existe. El intento queda en **Registros** como `login-acceso`.

**Qué puede hacer.** Solo administrar: Usuarios, Registros, Plantillas, respaldos y su Perfil. Las funciones de gerencia (Kanban, Monitoreo, Matriz, Jerarquía, actividades, herencias…) le responden 403, aunque las llame directo a la API.

**En un departamento.** Un gerente puede ponerlo en la plantilla de su departamento (Ajustes → plantilla), con su número (90001…), su correo y el puesto `sr`. Ahí trabaja como **Senior** y sigue administrando. Solo el primer departamento que lo integra se lo queda. `server/vaciar.js` lo regresa a solo administración.

**Para cambiar la contraseña de un super administrador:** edita `SUPERADMINS` y reinicia la app.

### MFA (app autenticadora) en PostgreSQL

**Cómo se registra.**

1. En el primer inicio de sesión de una cuenta sin MFA, el servidor genera una clave secreta y la muestra como QR y como texto. En la app autenticadora aparece como "Seguimiento de Actividades: correo".
2. La clave **se guarda en la base solo cuando el primer código de 6 dígitos es correcto**. Si cierras la pantalla antes, no queda nada y la próxima vez sale un QR nuevo.
3. Desde ahí, cada inicio de sesión pide el código. Un código sirve una sola vez y el servidor acepta una diferencia de ±30 s con la hora del teléfono.
4. Las cuentas de prueba (80001-80004) no usan MFA.

**Dónde queda.** En la tabla `usuarios`, columnas `totp` (la clave) y `totp_paso` (el último código usado, para que no se repita). Para ver quién tiene MFA, sin mostrar las claves:

```bash
psql "postgresql://…/seguimiento" -c "select no, nombre, puesto, totp is not null as mfa from usuarios order by puesto, no"
```

> La columna `totp` es tan sensible como una contraseña: con ella se generan códigos válidos. No la copies ni la compartas. Los respaldos cifrados la incluyen; por eso están cifrados.

**Es por base.** El MFA vive en la base, no en el `.env`. Tu base local, la de Neon (Render) y la de planta tienen cada una su propio registro:
- un super administrador vincula la app **una vez por base**, aunque use el mismo correo;
- en el teléfono quedan varias entradas con el mismo nombre; conviene renombrarlas (por ejemplo "Seguimiento local" y "Seguimiento Render");
- si restauras un respaldo en otra base, el MFA viaja con él y sirve la misma entrada del teléfono;
- `server/vaciar.js` conserva el MFA de los super administradores.

**Reiniciar el MFA (teléfono perdido o cambiado).**

- **Empleados y gerentes:** un super administrador, en **Usuarios → ficha → Reiniciar MFA**. Se cierran sus sesiones y en el siguiente inicio de sesión vuelve a vincular la app.
- **Super administradores:** la app no los deja reiniciarse entre ellos (sus cuentas se manejan en el servidor). Se hace en la base, **con la app detenida**. Si sigue corriendo, conserva la clave vieja en memoria y la vuelve a escribir.

```bash
sudo systemctl stop seguimiento   # o Ctrl+C si la arrancaste con npm run local
```
```bash
psql "postgresql://…/seguimiento" -c "update usuarios set totp = null, totp_paso = null where correo = 'correo-del-super-admin@empresa.com'"
```
```bash
sudo systemctl start seguimiento  # o npm run local
```

El correo va en minúsculas, tal como lo guarda la app. En el siguiente inicio de sesión sale el QR para vincular de nuevo.

**Si el código no pasa:**
- revisa la hora del servidor con `timedatectl`: debe decir `System clock synchronized: yes`; si no, activa NTP con `sudo timedatectl set-ntp true`;
- revisa la hora del teléfono, que esté en automático;
- tras 5 códigos incorrectos, la verificación se cancela y hay que volver a escribir la contraseña;
- si usas la entrada del teléfono de otra base, el código nunca coincide; usa la de esta base o reinicia el MFA.

## 7. Cuentas de prueba

No van en el `.env`. Para crearlas:

1. Entra como super administrador y ve a **Usuarios → Cuentas de prueba**. Pide tu contraseña.
2. Se crean o reactivan estas cuentas, todas con la contraseña `demo1234` y sin código MFA:

| Número | Puesto | Acceso | Encargado |
|---|---|---|---|
| 80001 | Gerente | Gerencia | — |
| 80004 | Ing. Full | Gerencia | 80001 |
| 80002 | Técnico | Jr / Técnico | 80004 |
| 80003 | Ing. Jr | Jr / Técnico | 80004 |

- Todas quedan en el departamento **Pruebas**.
- Traen 9 actividades de muestra: pendientes, en proceso, realizadas, comentarios y una urgente vencida ("Reparar fuga en la válvula V-3") para probar Reabrir, Dejar cerrada y Eliminar.
- Volver a tocar el botón solo agrega lo que falte. No duplica cuentas ni actividades, y la jerarquía de prueba vuelve a quedar limpia.
- Con `CUENTAS_PRUEBA=no` no se pueden crear ni entrar. Ponlo así en producción con usuarios reales.

## 8. Qué está separado y por qué no choca

| Regla | Dónde se cumple |
|---|---|
| El super administrador entra solo por su acceso; por Gerencia o Jr / Técnico, "Usuario o contraseña incorrectos" | `POST /api/login` |
| El super administrador solo usa `/api/admin/*`, su sesión, su perfil, sus avisos y las fotos | hook de sesión (`RUTAS_SA`) |
| Un gerente no entra a `/api/admin/*` | hook de sesión |
| El super administrador no aparece en equipos, plantillas de departamento ni receptores de herencias | filtros por puesto (`sa`) |
| Una actividad real nunca se hereda a una cuenta de prueba (departamento Pruebas), ni al revés | `condiciones()` de herencias |
| Las cuentas de prueba no se crean si su número (80001-80004) o su correo ya es de una cuenta real | `POST /api/admin/cuentas-prueba` |
| `CUENTAS_PRUEBA=no` bloquea su entrada y sus sesiones abiertas | `apagada()` |

Todas estas reglas tienen su prueba en `server/app.test.js`.

## 9. Entorno limpio: empezar desde cero

**Opción A: vaciar los datos y conservar a los super administradores.** Es la recomendada. Deja la base sin usuarios ni departamentos; los super administradores se quedan con su app vinculada.

1. Detén la app.
2. Saca un respaldo antes de vaciar:
   ```bash
   pg_dump "postgresql://seguimiento:CAMBIAR@localhost:5432/seguimiento" | gzip > respaldo-$(date +%F).sql.gz
   ```
3. Vacía la base:
   ```bash
   node --env-file=.env server/vaciar.js VACIAR
   ```
4. Arranca otra vez con `npm run local`. Entra como super administrador y da de alta al primer gerente en **Plantillas → Nuevo gerente**, o vuelve a crear las cuentas de prueba.

**Opción B: borrar la base completa.** Se pierde todo, incluida la app vinculada de los super administradores.

```bash
sudo -u postgres psql -c "drop database seguimiento" -c "create database seguimiento owner seguimiento"
```

Al arrancar, la app vuelve a crear las tablas (paso 5).

**Para las pruebas automáticas** usa **otra** base, porque `npm test` borra sus tablas:

```bash
sudo -u postgres psql -c "create database seguimiento_pruebas owner seguimiento"
```
```bash
TEST_DATABASE_URL='postgresql://seguimiento:CAMBIAR@localhost:5432/seguimiento_pruebas' npm test
```

## 10. Comprobaciones

| Qué | Cómo | Resultado esperado |
|---|---|---|
| Node lee el `.env` | `node --env-file=.env -e 'console.log(JSON.parse(process.env.SUPERADMINS).map((s) => s.email))'` | los correos de tus super administradores |
| Tablas creadas | `psql "postgresql://…/seguimiento" -c "\dt"` | las 10 tablas |
| Super administradores en la base | `psql "postgresql://…/seguimiento" -c "select no, nombre, correo, activo from usuarios where puesto = 'sa'"` | 90001, 90002… con el nombre del `.env` |
| La app responde | `curl -s http://localhost:3000/api/salud` | `{"ok":true}` |
| Los datos se guardan | crear algo, reiniciar la app y volver a entrar | lo creado sigue ahí |

## 11. Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `TypeError: Invalid URL` al arrancar | La contraseña de `DATABASE_URL` tiene `@ # / : % ? &` | Codifícala (paso 4) |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está corriendo | `sudo systemctl start postgresql` |
| `password authentication failed` | Usuario o clave mal, o `pg_hba.conf` en `peer` | Paso 3 |
| `database "…" does not exist` | No se creó la base | Paso 3 |
| "SUPERADMINS no es un JSON válido" en el log | Comillas curvas, saltos de línea o una coma de más | Un solo renglón, comillas rectas |
| En la base el super administrador tiene otro nombre | La app arrancó con otra `SUPERADMINS` (variable vieja en la terminal o `/etc/seguimiento.env` del servicio) | `unset SUPERADMINS`, revisa qué proceso atiende con `ss -ltnp \| grep 3000` y reinicia |
| "Usuario o contraseña incorrectos" con el super administrador | Entró por Gerencia o Jr / Técnico | Acceso oculto: tres toques a la versión del pie |
| La página no carga desde otro equipo | `HOST=127.0.0.1` | `HOST=0.0.0.0` para probar, o NGINX en producción; firewall: `firewall-cmd --add-port=3000/tcp` |
| El código de 6 dígitos no pasa | Hora desfasada, o la entrada del teléfono es de otra base | [MFA en PostgreSQL](#mfa-app-autenticadora-en-postgresql) |
| "Demasiados intentos" | 10 contraseñas incorrectas | Espera 15 min o reinicia la app |
| La página sale en blanco | Falta compilar | `npm run build` |
| Responde 503 y recarga | Hay otra instancia usando la misma base | Deja una sola |

En el servidor de planta (systemd y NGINX) el equivalente del `.env` es `/etc/seguimiento.env`; ver [DESPLIEGUE_PLANTA.md](DESPLIEGUE_PLANTA.md).
