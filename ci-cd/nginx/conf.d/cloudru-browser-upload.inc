# Exact-match endpoints, NOT a generic S3 proxy. Signed multipart form policies
# enforce the bucket, key, mime and length restrictions at the storage layer.
location = /__cloudru-upload/feed {
    if ($request_method != POST) { return 405; }
    if ($args != "") { return 400; }
    limit_req zone=cloudru_form_upload burst=20 nodelay;
    client_max_body_size 205m;
    client_body_timeout 900s;
    include /etc/nginx/conf.d/cloudru-browser-upload-proxy.inc;
    proxy_pass https://s3.cloud.ru/gafus-feed-private/;
}

location = /__cloudru-upload/gallery {
    if ($request_method != POST) { return 405; }
    if ($args != "") { return 400; }
    limit_req zone=cloudru_form_upload burst=20 nodelay;
    client_max_body_size 25m;
    client_body_timeout 180s;
    include /etc/nginx/conf.d/cloudru-browser-upload-proxy.inc;
    proxy_pass https://s3.cloud.ru/gafus-gallery-private/;
}
