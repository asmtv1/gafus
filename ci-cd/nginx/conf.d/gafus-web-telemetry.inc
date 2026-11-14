# Public browser-only telemetry, exact same-origin POST; safe server-side grant.
# Include ONLY in user-facing HTTPS server blocks (Web/Admin/Trainer/Bull Board).
# No DSN, no auth/session cookies, no client-supplied proxy identity forwarded.
location ^~ /api/v1/telemetry/web {
    limit_except POST { deny all; }
    client_max_body_size 128k;
    client_body_timeout 10s;
    proxy_request_buffering on;
    proxy_pass http://gafus-api;
    proxy_http_version 1.1;
    proxy_pass_request_headers off;
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_set_header Sec-Fetch-Site $http_sec_fetch_site;
    proxy_set_header Content-Type $content_type;
    proxy_set_header Content-Length $content_length;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header Cookie "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Real-IP "";
    proxy_set_header CF-Connecting-IP "";
    proxy_connect_timeout 3s;
    proxy_send_timeout 5s;
    proxy_read_timeout 5s;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options "nosniff" always;
}
