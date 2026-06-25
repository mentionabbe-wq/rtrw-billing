#!/bin/bash
set -e

: "${GENIEACS_MONGODB_CONNECTION_URL:?GENIEACS_MONGODB_CONNECTION_URL belum diset}"
export GENIEACS_UI_JWT_SECRET="${GENIEACS_UI_JWT_SECRET:-please-change-this-jwt-secret}"
export GENIEACS_EXT_DIR="${GENIEACS_EXT_DIR:-/opt/genieacs/ext}"
mkdir -p "$GENIEACS_EXT_DIR"

echo "[genieacs] starting cwmp(7547) nbi(7557) fs(7567) ui(3000)..."
genieacs-cwmp &
genieacs-nbi &
genieacs-fs &
genieacs-ui &

# Bila salah satu service mati, keluar agar container di-restart oleh Docker.
wait -n
exit $?
