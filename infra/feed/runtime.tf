locals {
  payloads = {
    web = {
      FEED_S3_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.storage["web"].access_key
      FEED_S3_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.storage["web"].secret_key
      FEED_CDN_SECRET           = var.cdn_secret
      FEED_INTERNAL_HMAC_SECRET = var.internal_hmac_secret
    }
    worker = {
      FEED_S3_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.storage["worker"].access_key
      FEED_S3_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.storage["worker"].secret_key
      FEED_INTERNAL_HMAC_SECRET = var.internal_hmac_secret
    }
    dispatch = {
      FEED_QUEUE_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.queue.access_key
      FEED_QUEUE_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.queue.secret_key
    }
    origin = {
      FEED_S3_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.storage["origin"].access_key
      FEED_S3_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.storage["origin"].secret_key
      FEED_ORIGIN_SECRET        = var.origin_secret
    }
  }
}
resource "yandex_lockbox_secret" "runtime" {
  for_each  = toset(["web", "worker", "dispatch", "origin"])
  name      = "feed-prod-${each.key}"
  folder_id = var.folder_id
}
resource "yandex_lockbox_secret_version" "runtime" {
  for_each  = yandex_lockbox_secret.runtime
  secret_id = each.value.id
  dynamic "entries" {
    for_each = nonsensitive(toset(keys(local.payloads[each.key])))
    content {
      key        = entries.value
      text_value = local.payloads[each.key][entries.value]
    }
  }
}
resource "yandex_lockbox_secret_iam_binding" "runtime" {
  for_each  = yandex_lockbox_secret.runtime
  secret_id = each.value.id
  role      = "lockbox.payloadViewer"
  members   = ["serviceAccount:${yandex_iam_service_account.feed[each.key].id}"]
}
resource "yandex_lockbox_secret_iam_member" "album_read" {
  secret_id = var.album_secret_id
  role      = "lockbox.payloadViewer"
  member    = "serviceAccount:${yandex_iam_service_account.feed["worker"].id}"
}
resource "yandex_function" "origin" {
  name               = "feed-prod-origin"
  folder_id          = var.folder_id
  runtime            = "nodejs22"
  entrypoint         = "index.handler"
  memory             = 256
  execution_timeout  = "5"
  concurrency        = 1
  service_account_id = yandex_iam_service_account.feed["origin"].id
  user_hash          = filesha256("${var.artifact_directory}/feed-origin.zip")
  content { zip_filename = "${var.artifact_directory}/feed-origin.zip" }
  environment = { FEED_BUCKET = var.bucket, FEED_ORIGIN_HEADER = "x-gallery-origin-secret" }
  dynamic "secrets" {
    for_each = nonsensitive(toset(keys(local.payloads.origin)))
    content {
      environment_variable = secrets.value
      key                  = secrets.value
      id                   = yandex_lockbox_secret.runtime["origin"].id
      version_id           = yandex_lockbox_secret_version.runtime["origin"].id
    }
  }
  log_options { disabled = true }
  depends_on = [yandex_lockbox_secret_iam_binding.runtime]
}
resource "yandex_function_iam_binding" "origin" {
  function_id = yandex_function.origin.id
  role        = "functions.functionInvoker"
  members     = ["serviceAccount:${yandex_iam_service_account.feed["gateway"].id}"]
}
resource "yandex_container_registry" "feed" {
  name      = "feed-prod"
  folder_id = var.folder_id
}
resource "yandex_container_registry_iam_binding" "pull" {
  registry_id = yandex_container_registry.feed.id
  role        = "container-registry.images.puller"
  members     = ["serviceAccount:${yandex_iam_service_account.feed["worker"].id}"]
}
resource "yandex_serverless_container" "worker" {
  for_each           = var.deploy_workers ? toset(["photo", "video"]) : toset([])
  name               = "feed-prod-${each.key}"
  folder_id          = var.folder_id
  memory             = each.key == "video" ? 2048 : 1024
  cores              = 1
  core_fraction      = 100
  concurrency        = 1
  execution_timeout  = "600s"
  service_account_id = yandex_iam_service_account.feed["worker"].id
  image {
    url = var.worker_image
    environment = {
      FEED_BUCKET            = var.bucket
      FEED_ALBUM_BUCKET      = var.album_bucket
      FEED_INTERNAL_BASE_URL = var.internal_base_url
      FEED_WORKER_TYPE       = each.key
    }
  }
  dynamic "secrets" {
    for_each = nonsensitive(toset(keys(local.payloads.worker)))
    content {
      environment_variable = secrets.value
      key                  = secrets.value
      id                   = yandex_lockbox_secret.runtime["worker"].id
      version_id           = yandex_lockbox_secret_version.runtime["worker"].id
    }
  }
  dynamic "secrets" {
    for_each = toset(["GALLERY_S3_ACCESS_KEY_ID", "GALLERY_S3_SECRET_ACCESS_KEY"])
    content {
      environment_variable = secrets.value
      key                  = secrets.value
      id                   = var.album_secret_id
      version_id           = var.album_secret_version_id
    }
  }
  log_options { disabled = true }
  depends_on = [yandex_lockbox_secret_iam_binding.runtime, yandex_lockbox_secret_iam_member.album_read, yandex_container_registry_iam_binding.pull]
}
resource "yandex_serverless_container_iam_binding" "worker" {
  for_each     = yandex_serverless_container.worker
  container_id = each.value.id
  role         = "serverless-containers.containerInvoker"
  members      = ["serviceAccount:${yandex_iam_service_account.feed["trigger"].id}"]
}
resource "yandex_iam_service_account" "build" {
  name      = "feed-prod-build"
  folder_id = var.folder_id
}
resource "yandex_container_registry_iam_binding" "push" {
  registry_id = yandex_container_registry.feed.id
  role        = "container-registry.images.pusher"
  members     = ["serviceAccount:${yandex_iam_service_account.build.id}"]
}
resource "yandex_iam_service_account_key" "build" {
  service_account_id = yandex_iam_service_account.build.id
  description        = "Feed worker image build in GitHub Actions"
}
output "build_service_account_key" {
  sensitive = true
  value = jsonencode({
    id                 = yandex_iam_service_account_key.build.id
    service_account_id = yandex_iam_service_account.build.id
    created_at         = yandex_iam_service_account_key.build.created_at
    key_algorithm      = yandex_iam_service_account_key.build.key_algorithm
    public_key         = yandex_iam_service_account_key.build.public_key
    private_key        = yandex_iam_service_account_key.build.private_key
  })
}

output "origin_function_id" { value = yandex_function.origin.id }
output "origin_gateway_service_account_id" { value = yandex_iam_service_account.feed["gateway"].id }
