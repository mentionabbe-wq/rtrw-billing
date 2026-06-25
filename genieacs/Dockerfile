# GenieACS 1.2 (TR-069 ACS) — menjalankan cwmp + nbi + fs + ui dalam satu image.
# node:20 (bukan slim) agar dependency native ter-compile bila perlu.
FROM node:20

RUN npm install -g genieacs@1.2.13 && npm cache clean --force

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV GENIEACS_EXT_DIR=/opt/genieacs/ext
RUN mkdir -p /opt/genieacs/ext

# 7547 CWMP (ONU konek ke sini) | 7557 NBI (REST, dipakai app billing)
# 7567 FS (firmware) | 3000 UI
EXPOSE 7547 7557 7567 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
