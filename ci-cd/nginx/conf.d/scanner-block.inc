# Common bot/scanner probes for leaked secrets, database dumps, PHP configs and archives.
# Keep this include inside server blocks so the request is rejected before it reaches upstream apps.
location ~* (^|/)(\.env([._-]?[[:alnum:]-]*)?|wp-config\.php([._-]?[[:alnum:]-]*)?|config/mail\.php|composer\.(json|lock)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$ {
    limit_req zone=suspicious_scan burst=5 nodelay;
    access_log off;
    log_not_found off;
    try_files /__scanner_blocked_missing =404;
}

location ~* (^|/)(db|database|dump|backup|mysqldump|storage|app)\.(sql|sqlite|sqlite3|db)$ {
    limit_req zone=suspicious_scan burst=5 nodelay;
    access_log off;
    log_not_found off;
    try_files /__scanner_blocked_missing =404;
}

location ~* \.(sql|sqlite|sqlite3|db|bak|backup|old|orig|save|swp|zip|tar|tgz|gz|7z|rar)$ {
    limit_req zone=suspicious_scan burst=5 nodelay;
    access_log off;
    log_not_found off;
    try_files /__scanner_blocked_missing =404;
}
