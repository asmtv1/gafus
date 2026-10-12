resource "yandex_api_gateway" "origin" {
  name              = "${local.prefix}-origin"
  folder_id         = var.folder_id
  execution_timeout = "4"
  log_options { disabled = true }
  spec = yamlencode({
    openapi = "3.0.0"
    info    = { title = "Private feed CDN origin", version = "1.0.0" }
    paths = { "/{path+}" = {
      for method in ["get", "head"] : method => {
        operationId = "feedOrigin${title(method)}"
        parameters  = [{ name = "path", in = "path", required = true, schema = { type = "string" } }]
        responses   = { "200" = { description = "WebP final object" } }
        x-yc-apigateway-integration = {
          type               = "cloud_functions"
          function_id        = yandex_function.origin.id
          service_account_id = yandex_iam_service_account.feed["gateway"].id
          tag                = "$latest"
          # v1 uses actual path. v0.1 path is the route template and fails origin checks.
          payload_format_version = "1.0"
        }
      }
    } }
  })
  depends_on = [yandex_function_iam_binding.origin]
}
resource "yandex_cdn_origin_group" "feed" {
  name      = "${local.prefix}-origin"
  folder_id = var.folder_id
  origin {
    source  = var.cloudru_origin_hostname != "" ? var.cloudru_origin_hostname : yandex_api_gateway.origin.domain
    enabled = true
  }
}
# Existing Yandex CDN was created on 2026-10-12 as bc8ru2x6mcqxwcl6a7vj.
# DO NOT set deploy_cdn=true in Terraform before importing that existing ID
# into yandex_cdn_resource.feed[0] and reconciling the live config. Creating
# a second resource with the same primary CNAME feed.gafus.ru is invalid.
resource "yandex_cdn_resource" "feed" {
  # The provider requires the API Gateway domain to be known during planning.
  # First deploy the origin infrastructure; enable the CDN in a second plan.
  count           = var.deploy_cdn ? 1 : 0
  folder_id       = var.folder_id
  cname           = var.cdn_hostname
  active          = true
  origin_group_id = yandex_cdn_origin_group.feed.id
  origin_protocol = "https"
  options {
    secure_key            = var.cdn_secret
    enable_ip_url_signing = false
    allowed_http_methods  = ["GET", "HEAD"]
    ignore_query_params   = true
    ignore_cookie         = true
    # Host must match TLS SNI of the chosen HTTPS origin; the CDN secure-key stays untouched.
    custom_host_header     = var.cloudru_origin_hostname != "" ? var.cloudru_origin_hostname : yandex_api_gateway.origin.domain
    static_request_headers = { "x-feed-origin-secret" = var.origin_secret }
    static_response_headers = {
      "cache-control"               = "private, no-store, max-age=0"
      "pragma"                      = "no-cache"
      "x-content-type-options"      = "nosniff"
      "access-control-allow-origin" = "*"
    }
    browser_cache_settings = 0
    # Custom edge TTL independent of viewer headers; verify HIT + expired token in smoke.
    edge_cache_settings_codes {
      value         = 86400
      custom_values = { "200" = 86400 }
    }
  }
  ssl_certificate {
    type                   = "certificate_manager"
    certificate_manager_id = yandex_cm_certificate.feed.id
  }
}
output "origin_base_url" { value = "https://${yandex_api_gateway.origin.domain}" }
output "cdn_base_url" { value = var.deploy_cdn ? "https://${var.cdn_hostname}" : null }
output "cdn_resource_id" { value = var.deploy_cdn ? yandex_cdn_resource.feed[0].id : null }
output "web_lockbox_secret_id" { value = yandex_lockbox_secret.runtime["web"].id }
output "web_lockbox_version_id" { value = yandex_lockbox_secret_version.runtime["web"].id }
output "registry_id" { value = yandex_container_registry.feed.id }
resource "yandex_cm_certificate" "feed" {
  name      = "feed-prod"
  folder_id = var.folder_id
  domains   = [var.cdn_hostname]
  managed { challenge_type = "DNS_CNAME" }
  deletion_protection = true
}
output "certificate_id" { value = yandex_cm_certificate.feed.id }
output "certificate_challenges" { value = yandex_cm_certificate.feed.challenges }
