variable "cloud_id" { type = string }
# Service account running this module; must retain private-bucket S3 access.
variable "provisioner_service_account_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9]{20}$", var.provisioner_service_account_id))
    error_message = "Provide the folder-scoped Terraform provisioner service account ID."
  }
}
variable "folder_id" { type = string }
variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "staging"], var.environment)
    error_message = "This module is gated to isolated nonproduction environments."
  }
}
variable "name" {
  type    = string
  default = "gallery"
}
variable "bucket" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{2,62}$", var.bucket)) && !contains(["gafus-media", "gafus-public"], var.bucket)
    error_message = "Use a dedicated private gallery bucket."
  }
}
variable "web_origins" {
  type = set(string)
  validation {
    condition     = length(var.web_origins) > 0 && alltrue([for origin in var.web_origins : can(regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?$", origin))])
    error_message = "CORS must list explicit HTTPS origins without paths or wildcards."
  }
}
variable "internal_base_url" {
  type = string
  validation {
    condition     = can(regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$", var.internal_base_url))
    error_message = "Use the HTTPS root of the authenticated core transport."
  }
}
variable "internal_hmac_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.internal_hmac_secret) >= 32
    error_message = "HMAC requires at least 32 bytes of random secret material."
  }
}
variable "origin_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{32,128}$", var.origin_secret))
    error_message = "Use at least 32 random ASCII characters."
  }
}
variable "cdn_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{24,32}$", var.cdn_secret))
    error_message = "CDN secure-token key must be 24..32 random ASCII characters."
  }
}
variable "cdn_hostname" { type = string }
variable "cdn_certificate_id" { type = string }
# CDN must be created in a second apply: the Yandex provider needs a known
# API Gateway hostname during CDN resource planning (custom_host_header).
variable "deploy_cdn" {
  type    = bool
  default = false
}
variable "enabled" {
  type    = bool
  default = false
}
# Temporary Cloud Logging for DEV dispatch/process/maintenance only. Turn off
# after diagnosing failures; the image-serving origin is always unlogged.
variable "diagnostic_logging" {
  type    = bool
  default = false
}
variable "artifact_directory" {
  type    = string
  default = "../../apps/gallery-cloud/artifacts"
}
# Queue creation credentials belong to the provisioner (ymq.admin), never a function.
variable "provisioner_ymq_access_key" {
  type      = string
  sensitive = true
}
variable "provisioner_ymq_secret_key" {
  type      = string
  sensitive = true
}

# Prepared only: never set on production until separately approved and CDN HIT auth verified.
variable "cloudru_origin_hostname" {
  type    = string
  default = ""
  validation {
    condition = var.cloudru_origin_hostname == "" || (
      can(regex("^[a-zA-Z0-9][a-zA-Z0-9.-]{3,252}[a-zA-Z0-9]$", var.cloudru_origin_hostname)) &&
      !can(regex("(^|\\.)(localhost|yandexcloud\\.net)$", var.cloudru_origin_hostname))
    )
    error_message = "Cloud.ru origin must be an audited hostname without scheme, port or path."
  }
}
