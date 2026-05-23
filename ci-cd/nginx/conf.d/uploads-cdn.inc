location /uploads/ {
    resolver 8.8.8.8 1.1.1.1 ipv6=off valid=300s;

    set $storage_host storage.yandexcloud.net;
    proxy_pass https://$storage_host/gafus-media$request_uri;
    proxy_ssl_server_name on;
    proxy_ssl_name storage.yandexcloud.net;
    proxy_set_header Host storage.yandexcloud.net;

    # Включаем кэширование
    proxy_cache cdn_cache;
    proxy_cache_valid 200 1y;
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;
    proxy_cache_lock on;

    # Заголовки для кэширования
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header X-Cache-Status $upstream_cache_status;

    # Таймауты
    proxy_connect_timeout 3s;
    proxy_send_timeout 5s;
    proxy_read_timeout 5s;
}
