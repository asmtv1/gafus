# Function archives over 3.5 MiB cannot be passed inline through the
# Yandex Terraform provider; store them in a separate private DEV bucket.
# This bucket is NOT the Terraform state bucket or the user-photo bucket.
resource "yandex_storage_bucket" "function_packages" {
  folder_id = var.folder_id
  bucket    = "${local.prefix}-function-code-${var.folder_id}"

  anonymous_access_flags {
    read        = false
    list        = false
    config_read = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "yandex_storage_bucket_iam_binding" "function_packages_reader" {
  bucket  = yandex_storage_bucket.function_packages.bucket
  role    = "storage.viewer"
  members = ["serviceAccount:${yandex_iam_service_account.gallery["worker"].id}"]
}

resource "yandex_storage_object" "function_packages" {
  for_each = toset(["process", "maintenance"])

  bucket       = yandex_storage_bucket.function_packages.bucket
  key          = "functions/${each.key}/${filesha256("${var.artifact_directory}/${each.key}.zip")}.zip"
  source       = "${var.artifact_directory}/${each.key}.zip"
  source_hash  = filesha256("${var.artifact_directory}/${each.key}.zip")
  content_type = "application/zip"
}
