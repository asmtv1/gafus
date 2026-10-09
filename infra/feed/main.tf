locals { prefix = "feed-prod" }
resource "yandex_iam_service_account" "feed" {
  for_each  = toset(["web", "worker", "origin", "dispatch", "queue-writer", "trigger", "gateway"])
  name      = "feed-${each.key}"
  folder_id = var.folder_id
}
resource "yandex_iam_service_account_static_access_key" "storage" {
  for_each           = toset(["web", "worker", "origin"])
  service_account_id = yandex_iam_service_account.feed[each.key].id
  description        = "Private feed scoped bucket access"
}
resource "yandex_iam_service_account_static_access_key" "queue" {
  service_account_id = yandex_iam_service_account.feed["queue-writer"].id
  description        = "Gallery processing queue producer"
}
resource "yandex_resourcemanager_folder_iam_member" "queue_writer" {
  folder_id = var.folder_id
  role      = "ymq.writer"
  member    = "serviceAccount:${yandex_iam_service_account.feed["queue-writer"].id}"
}
resource "yandex_resourcemanager_folder_iam_member" "trigger_queue" {
  for_each  = toset(["ymq.reader", "ymq.writer"])
  folder_id = var.folder_id
  role      = each.key
  member    = "serviceAccount:${yandex_iam_service_account.feed["trigger"].id}"
}
resource "yandex_storage_bucket" "feed" {
  folder_id = var.folder_id
  bucket    = var.bucket
  # Provider default ACL is private; no public ACL grants are created.
  # No runtime storage.* folder roles: policy scopes each static key to object paths.
  anonymous_access_flags {
    read        = false
    list        = false
    config_read = false
  }
  cors_rule {
    allowed_origins = ["https://gafus.ru", "https://www.gafus.ru"]
    allowed_methods = ["POST"]
    allowed_headers = ["content-type"]
    expose_headers  = ["ETag"]
    max_age_seconds = 600
  }
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "TlsOnly", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = ["arn:aws:s3:::${var.bucket}", "arn:aws:s3:::${var.bucket}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } },
    { Sid = "SourceUpload", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.feed["web"].id }, Action = ["s3:PutObject"], Resource = ["arn:aws:s3:::${var.bucket}/posts/*/*/incoming/*/source.*"] },
    { Sid = "CoreRead", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.feed["web"].id }, Action = ["s3:GetObject"], Resource = ["arn:aws:s3:::${var.bucket}/posts/*"] },
    { Sid = "WorkerObjects", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.feed["worker"].id }, Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = ["arn:aws:s3:::${var.bucket}/posts/*"] },
    { Sid = "FinalOrigin", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.feed["origin"].id }, Action = ["s3:GetObject"], Resource = ["arn:aws:s3:::${var.bucket}/posts/*/*/attachments/*/*.webp", "arn:aws:s3:::${var.bucket}/posts/*/*/attachments/*/hls/*.ts"] },
    { Sid = "TerraformProvisioner", Effect = "Allow", Principal = { CanonicalUser = var.provisioner_service_account_id }, Action = ["s3:*"], Resource = ["arn:aws:s3:::${var.bucket}", "arn:aws:s3:::${var.bucket}/*"] }
  ] })
  lifecycle { prevent_destroy = true }
}
