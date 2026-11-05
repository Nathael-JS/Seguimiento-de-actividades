# Despliegue en planta (Rocky Linux 10, sin internet)

Guía para instalar Seguimiento de Actividades en el servidor de planta. Se usa NGINX con HTTPS hacia la red, la app (Node 22) escuchando solo en el propio servidor y PostgreSQL local.

| Componente | Versión |
|---|---|
| Rocky Linux | 10.2 |
| PostgreSQL | 16.15 |
| NGINX | 1.26.3 |
| Node.js | 22 (el de los repositorios de Rocky 10) |

En Rocky 10 ya no hay módulos de AppStream: Node, PostgreSQL y NGINX se instalan directo con `dnf install`.

Archivos de esta carpeta del repositorio:

| Archivo | Va en el servidor como |
|---|---|
| `deploy/nginx-seguimiento.conf` | `/etc/nginx/conf.d/seguimiento.conf` |
| `deploy/seguimiento.env.ejemplo` | `/etc/seguimiento.env` |
| `deploy/seguimiento.service` | `/etc/systemd/system/` (lo copia `instalar.sh`) |
| `deploy/seguimiento-respaldo.service` y `.timer` | `/etc/systemd/system/` (lo copia `instalar.sh`) |
| `deploy/respaldo.sh` | dentro del paquete, `/opt/seguimiento/actual/deploy/` |
| `deploy/instalar.sh` | se corre desde donde se copie el paquete |

---

## 0. Armar el paquete (en una PC con internet)

En la carpeta del proyecto (Git Bash o Linux), con Node 22:

```bash
git pull origin main
npm run paquete
```

Sale `seguimiento-AAAAMMDD-commit.tar.gz`: la app compilada con sus dependencias exactas. Se copia al servidor junto con `deploy/instalar.sh`, por la red interna (`scp`, carpeta compartida o USB).

## 1. Paquetes del sistema

Desde los repositorios internos de Rocky:

```bash
sudo dnf install -y nginx postgresql-server nodejs openssl tar gzip
node --version   # v22.x
```

## 2. PostgreSQL

```bash
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "create role seguimiento login password 'CONTRASEÑA-LARGA'" -c "create database seguimiento owner seguimiento"
```

Rocky deja las conexiones por `127.0.0.1` con `ident`. Para que la app entre con contraseña, en `/var/lib/pgsql/data/pg_hba.conf` hay que cambiar `ident` por `scram-sha-256` en estas dos líneas:

```
host    all    all    127.0.0.1/32    scram-sha-256
host    all    all    ::1/128         scram-sha-256
```

```bash
sudo systemctl restart postgresql
```

PostgreSQL escucha solo en `localhost` (lo trae así de fábrica). No se abre el puerto 5432.

## 3. Usuario, configuración y carpeta de respaldos

```bash
sudo useradd --system --home-dir /opt/seguimiento --shell /sbin/nologin seguimiento
sudo install -m 600 -o root -g root seguimiento.env.ejemplo /etc/seguimiento.env
sudo vi /etc/seguimiento.env
```

En `/etc/seguimiento.env` se llenan:
- `DATABASE_URL`: la contraseña del paso 2.
- `SUPERADMINS`: las cuentas reales de los super administradores.
- `BACKUP_PASSWORD`: una contraseña larga para cifrar los respaldos. Se guarda también fuera del servidor: sin ella un respaldo no se puede abrir.
- `RESPALDOS_DIR`: la carpeta de red.

La carpeta de red (NFS o SMB) la monta IT, por ejemplo en `/mnt/respaldos`, y el usuario `seguimiento` debe poder escribir en ella.

## 4. Instalar la app

```bash
sudo ./instalar.sh seguimiento-AAAAMMDD-commit.tar.gz
```

Deja la versión en `/opt/seguimiento/versiones/` y apunta `/opt/seguimiento/actual` a ella. Copia los servicios de systemd, activa el respaldo diario, arranca la app y espera a que `/api/salud` responda. Si termina con "en marcha", la app ya corre en `127.0.0.1:3000`.

## 5. NGINX y el certificado

```bash
sudo install -m 644 seguimiento.crt /etc/pki/tls/certs/seguimiento.crt          # certificado + cadena intermedia
sudo install -m 600 seguimiento.key /etc/pki/tls/private/seguimiento.key
sudo restorecon -Rv /etc/pki/tls
sudo cp /opt/seguimiento/actual/deploy/nginx-seguimiento.conf /etc/nginx/conf.d/seguimiento.conf
sudo vi /etc/nginx/conf.d/seguimiento.conf      # server_name = el nombre interno
sudo setsebool -P httpd_can_network_connect 1   # SELinux: que NGINX pueda llegar a la app
sudo nginx -t
sudo systemctl enable --now nginx
```

SELinux se queda en *enforcing*; solo se activa ese permiso.

## 6. Firewall

```bash
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

El 80 solo redirige al 443. Los puertos 3000 y 5432 no se abren.

## 7. Migrar los datos de Render

Se usa el respaldo **JSON** del super administrador. No depende de la versión de PostgreSQL (Neon puede tener una más nueva que la 16 de planta).

1. Avisar a los usuarios. En Render: **Suspend** el servicio. Desde aquí nadie escribe en Neon.
   - Antes de suspenderlo, un super administrador entra a la app en Render y hace **Usuarios → Descargar respaldo** (pide su contraseña).
2. Copiar el archivo `respaldo_AAAA-MM-DD.json` al servidor y restaurarlo:
   ```bash
   sudo bash -c 'set -a; . /etc/seguimiento.env; set +a; cd /opt/seguimiento/actual && node server/restaurar.js /ruta/respaldo_AAAA-MM-DD.json'
   sudo systemctl restart seguimiento
   ```
3. Revisar (siguiente sección). Cada persona inicia sesión otra vez en la dirección nueva; su contraseña y su app autenticadora siguen sirviendo.
4. Render y Neon se quedan suspendidos una semana como plan B y después se borran.

El respaldo JSON trae contraseñas cifradas y secretos del MFA: se guarda en un lugar seguro y se borra del servidor después de restaurar.

## 8. Revisión

- [ ] `curl -k https://actividades.planta.local/api/salud` responde `{"ok":true}`.
- [ ] `http://actividades.planta.local` redirige a `https://`.
- [ ] Desde un celular en el wifi de planta, la app abre sin aviso de certificado (la CA está instalada en el celular).
- [ ] Un gerente y un técnico entran con su contraseña y su código, y ven sus actividades.
- [ ] Registros muestra la IP real del celular, no `127.0.0.1`.
- [ ] `sudo systemctl start seguimiento-respaldo` deja un archivo nuevo en la carpeta de red (`journalctl -u seguimiento-respaldo`).
- [ ] `systemctl list-timers seguimiento-respaldo` muestra la próxima corrida a las 02:30.
- [ ] Desde otra PC de la red, `http://SERVIDOR:3000` no responde (la app solo escucha en el servidor).

---

## Operación

| Tarea | Cómo |
|---|---|
| Ver el log | `journalctl -u seguimiento -f`. Cada error trae el mismo código que ve el usuario |
| Reiniciar | `sudo systemctl restart seguimiento` |
| Actualizar la app | Paquete nuevo (paso 0) y `sudo ./instalar.sh paquete-nuevo.tar.gz`. La versión anterior queda en `versiones/` |
| Volver a la versión anterior | `sudo ln -sfn /opt/seguimiento/versiones/<anterior> /opt/seguimiento/actual && sudo systemctl restart seguimiento` |
| Respaldo a mano | `sudo systemctl start seguimiento-respaldo` |
| Restaurar un respaldo diario | En una base vacía: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ARCHIVO \| gunzip \| psql "$DATABASE_URL"` (pide `BACKUP_PASSWORD`), y reiniciar la app |
| Vaciar datos (inicio desde 0) | Primero un respaldo a mano; luego `sudo bash -c 'set -a; . /etc/seguimiento.env; set +a; cd /opt/seguimiento/actual && node server/vaciar.js VACIAR'` y reiniciar |
| Renovar el certificado | Reemplazar los dos archivos del paso 5 y `sudo systemctl reload nginx` |

Para borrar versiones viejas de `/opt/seguimiento/versiones/`, conserva siempre la actual y la anterior.
