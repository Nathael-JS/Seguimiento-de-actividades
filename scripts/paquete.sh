#!/bin/bash
# Arma el paquete para el servidor de planta (que no tiene internet): app compilada + dependencias de producción
# exactas del package-lock.json. Se corre en una PC con internet (Linux o Git Bash):
#   npm run paquete   →   seguimiento-AAAAMMDD-commit.tar.gz   (se copia al servidor y se instala con deploy/instalar.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
version="$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
nombre="seguimiento-$version"
npm ci
npm run build
tmp="$(mktemp -d)"
mkdir "$tmp/$nombre"
cp -r dist server deploy package.json package-lock.json .npmrc "$tmp/$nombre/"
rm -f "$tmp/$nombre"/server/*.test.js
(cd "$tmp/$nombre" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
tar -czf "$nombre.tar.gz" -C "$tmp" "$nombre"
rm -rf "$tmp"
echo "Listo: $nombre.tar.gz"
