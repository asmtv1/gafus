resource "yandex_api_gateway" "origin" {
  name              = "${local.prefix}-origin"
  folder_id         = var.folder_id
  execution_timeout = "4"
  log_options { disabled = true }
  spec = yamlencode({
    openapi = "3.0.0"
    info    = { title = "Private gallery CDN origin", version = "1.0.0" }
    paths = merge({ "/{path+}" = {
      for method in ["get", "head"] : method => {
        operationId = "galleryOrigin${title(method)}"
        parameters  = [{ name = "path", in = "path", required = true, schema = { type = "string" } }]
        responses   = { "200" = { description = "WebP final object" } }
        x-yc-apigateway-integration = {
          type               = "cloud_functions"
          function_id        = yandex_function.gallery["origin"].id
          service_account_id = yandex_iam_service_account.gallery["gateway"].id
          tag                = "$latest"
          # v1 uses actual path. v0.1 path is the route template and fails origin checks.
          payload_format_version = "1.0"
        }
      }
    } }, var.feed_origin_function_id != "" && var.feed_origin_service_account_id != "" ? {
      "/posts/{path+}" = {
        for method in ["get", "head"] : method => {
          operationId = "feedOrigin${title(method)}"
          parameters = [{ name = "path", in = "path", required = true, schema = { type = "string" } }]
          responses = { "200" = { description = "Feed media" }, "206" = { description = "Feed media range" } }
          x-yc-apigateway-integration = {
            type = "cloud_functions"
            function_id = var.feed_origin_function_id
            service_account_id = var.feed_origin_service_account_id
            tag = "$latest"
            payload_format_version = "1.0"
          }
        }
      }
    } : {})
  })
  depends_on = [yandex_function_iam_binding.private_invokers]
}
resource "yandex_cdn_origin_group" "gallery" {
  name      = "${local.prefix}-origin"
  folder_id = var.folder_id
  origin {
    source  = yandex_api_gateway.origin.domain
    enabled = true
  }
}
resource "yandex_cdn_resource" "gallery" {
  # The provider requires the API Gateway domain to be known during planning.
  # First deploy the origin infrastructure; enable the CDN in a second plan.
  count           = var.deploy_cdn ? 1 : 0
  folder_id       = var.folder_id
  cname           = var.cdn_hostname
  active          = true
  origin_group_id = yandex_cdn_origin_group.gallery.id
  origin_protocol = "https"
  options {
    secure_key             = var.cdn_secret
    enable_ip_url_signing  = false
    allowed_http_methods   = ["GET", "HEAD"]
    ignore_query_params    = true
    ignore_cookie          = true
    custom_host_header     = yandex_api_gateway.origin.domain
    static_request_headers = { "x-gallery-origin-secret" = var.origin_secret }
    static_response_headers = {
      "cache-control"          = "private, no-store, max-age=0"
      "pragma"                 = "no-cache"
      "x-content-type-options" = "nosniff"
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
    certificate_manager_id = var.cdn_certificate_id
  }
}
output "origin_base_url" { value = "https://${yandex_api_gateway.origin.domain}" }
output "cdn_base_url" { value = var.deploy_cdn ? "https://${var.cdn_hostname}" : null }
output "cdn_resource_id" { value = var.deploy_cdn ? yandex_cdn_resource.gallery[0].id : null }
output "queue_url" { value = yandex_message_queue.process.id }
output "dlq_url" { value = yandex_message_queue.dlq.id }
output "function_ids" { value = { for name, function in yandex_function.gallery : name => function.id } }
output "web_lockbox_secret_id" { value = yandex_lockbox_secret.runtime["web"].id }
output "web_lockbox_version_id" { value = yandex_lockbox_secret_version.runtime["web"].id }
