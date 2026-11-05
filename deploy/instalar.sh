#!/bin/bash
# Instala o actualiza la app en el servidor de planta desde un paquete (npm run paquete):
#   sudo ./instalar.sh seguimiento-AAAAMMDD-commit.tar.gz
# Cada versión queda en /opt/seguimiento/versiones y "actual" apunta a la que corre.
# Volver a la anterior: sudo ln -sfn /opt/seguimiento/versiones/<anterior> /opt/seguimiento/actual && sudo systemctl restart seguimiento
set -euo pipefail
paquete="${1:?Uso: sudo ./instalar.sh seguimiento-<versión>.tar.gz}"
base=/opt/seguimiento
nombre="$(tar -tzf "$paquete" | awk -F/ 'NR == 1 { print $1 }')" # awk lee todo: con head, tar se corta y pipefail aborta
mkdir -p "$base/versiones"
tar -xzf "$paquete" -C "$base/versiones"
chown -R root:root "$base/versiones/$nombre" # la app solo lee su código
ln -sfn "$base/versiones/$nombre" "$base/actual"
install -m 644 "$base/actual/deploy/seguimiento.service" "$base/actual/deploy/seguimiento-respaldo.service" \
  "$base/actual/deploy/seguimiento-respaldo.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now seguimiento-respaldo.timer
systemctl enable seguimiento
systemctl restart seguimiento
for _ in $(seq 20); do
  curl -fsS http://127.0.0.1:3000/api/salud >/dev/null 2>&1 && { echo "$nombre en marcha"; exit 0; }
  sleep 1
done
echo "La app no respondió en 20 s: revisar con  journalctl -u seguimiento -n 50" >&2
exit 1
