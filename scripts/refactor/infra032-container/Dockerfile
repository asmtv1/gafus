# AG4-INFRA-032: NONDEPLOY, prebuilt Vite static artifact context ONLY.
# Image reference/digest MUST be approved and pinned before any future build.
# The selected unprivileged nginx image is a proposed runtime, not pulled/tested.
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:stable-alpine
FROM ${NGINX_IMAGE}
# The *entire* build context must be a separately curated directory containing
# exactly index.html and assets/. No repository root, manifests or secrets.
COPY --chown=101:101 index.html /usr/share/nginx/html/index.html
COPY --chown=101:101 assets/ /usr/share/nginx/html/assets/
COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
# Inherited nginx-unprivileged entrypoint/CMD; no build tools or app services.
