# Object Storage evaluates bucket IAM/ACL before its path policy.
# Keep base grants on this bucket, never at folder scope.
resource "yandex_storage_bucket_iam_binding" "readers" {
  bucket = yandex_storage_bucket.feed.bucket
  role = "storage.viewer"
  members = [for name in ["web", "origin"] : "serviceAccount:${yandex_iam_service_account.feed[name].id}"]
}
resource "yandex_storage_bucket_iam_binding" "uploads" {
  bucket = yandex_storage_bucket.feed.bucket
  role = "storage.uploader"
  members = ["serviceAccount:${yandex_iam_service_account.feed["web"].id}"]
}
resource "yandex_storage_bucket_iam_binding" "worker" {
  bucket = yandex_storage_bucket.feed.bucket
  role = "storage.editor"
  members = ["serviceAccount:${yandex_iam_service_account.feed["worker"].id}"]
}
