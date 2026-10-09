variable "cloud_id" { type = string }
variable "folder_id" { type = string }
variable "provisioner_service_account_id" { type = string }
variable "bucket" { type = string }
variable "internal_base_url" { type = string }
variable "worker_image" { type = string }
variable "deploy_workers" { default = false }
variable "deploy_cdn" { default = false }
variable "cdn_hostname" { type = string }
variable "cdn_certificate_id" { type = string }
variable "album_bucket" { type = string }
variable "album_secret_id" { type = string }
variable "album_secret_version_id" { type = string }
variable "artifact_directory" { default = "../../apps/feed-cloud/artifacts" }
variable "internal_hmac_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.internal_hmac_secret) >= 32
    error_message = "HMAC must contain at least 32 bytes."
  }
}
variable "origin_secret" {
  type      = string
  sensitive = true
}
variable "cdn_secret" {
  type      = string
  sensitive = true
}
variable "provisioner_ymq_access_key" {
  type      = string
  sensitive = true
}
variable "provisioner_ymq_secret_key" {
  type      = string
  sensitive = true
}
variable "enable_triggers" { default = false }
