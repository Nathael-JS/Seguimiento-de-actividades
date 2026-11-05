#!/bin/bash
# Respaldo de la base: pg_dump comprimido y cifrado (igual que el de GitHub Actions) en la carpeta de red.
# Variables de /etc/seguimiento.env: DATABASE_URL, BACKUP_PASSWORD, RESPALDOS_DIR y RESPALDOS_DIAS (opcional, 30)
# Restaurar: openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ARCHIVO | gunzip | psql "$DATABASE_URL"
set -euo pipefail
destino="${RESPALDOS_DIR:?falta RESPALDOS_DIR en /etc/seguimiento.env}"
archivo="$destino/respaldo_$(date +%F_%H%M).sql.gz.enc"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSWORD -out "$archivo.tmp"
# Un respaldo vacío o cortado no reemplaza a nadie: se queda como .tmp y el servicio marca error
test "$(stat -c %s "$archivo.tmp")" -gt 1000
mv "$archivo.tmp" "$archivo"
find "$destino" -name 'respaldo_*.sql.gz.enc' -mtime +"${RESPALDOS_DIAS:-30}" -delete
echo "Respaldo listo: $archivo"
