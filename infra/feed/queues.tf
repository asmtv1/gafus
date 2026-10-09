resource "yandex_message_queue" "dlq" {
  for_each                  = toset(["photo", "video"])
  name                      = "feed-prod-${each.key}-dlq"
  access_key                = var.provisioner_ymq_access_key
  secret_key                = var.provisioner_ymq_secret_key
  message_retention_seconds = 1209600
  max_message_size          = 1024
}
resource "yandex_message_queue" "work" {
  for_each                   = toset(["photo", "video"])
  name                       = "feed-prod-${each.key}"
  access_key                 = var.provisioner_ymq_access_key
  secret_key                 = var.provisioner_ymq_secret_key
  visibility_timeout_seconds = 660
  message_retention_seconds  = 345600
  max_message_size           = 1024
  redrive_policy             = jsonencode({ deadLetterTargetArn = yandex_message_queue.dlq[each.key].arn, maxReceiveCount = 5 })
}
resource "yandex_function" "dispatch" {
  name               = "feed-prod-dispatch"
  folder_id          = var.folder_id
  runtime            = "nodejs22"
  entrypoint         = "index.handler"
  memory             = 128
  execution_timeout  = "15"
  concurrency        = 1
  service_account_id = yandex_iam_service_account.feed["dispatch"].id
  user_hash          = filesha256("${var.artifact_directory}/feed-dispatch.zip")
  content { zip_filename = "${var.artifact_directory}/feed-dispatch.zip" }
  environment = { FEED_BUCKET = var.bucket, FEED_PHOTO_QUEUE_URL = yandex_message_queue.work["photo"].id, FEED_VIDEO_QUEUE_URL = yandex_message_queue.work["video"].id }
  dynamic "secrets" {
    for_each = nonsensitive(toset(keys(local.payloads.dispatch)))
    content {
      environment_variable = secrets.value
      key                  = secrets.value
      id                   = yandex_lockbox_secret.runtime["dispatch"].id
      version_id           = yandex_lockbox_secret_version.runtime["dispatch"].id
    }
  }
  log_options { disabled = true }
  depends_on = [yandex_lockbox_secret_iam_binding.runtime, yandex_resourcemanager_folder_iam_member.queue_writer]
}
resource "yandex_function_iam_binding" "dispatch" {
  function_id = yandex_function.dispatch.id
  role        = "functions.functionInvoker"
  members     = ["serviceAccount:${yandex_iam_service_account.feed["trigger"].id}"]
}
resource "yandex_function_scaling_policy" "dispatch" {
  function_id = yandex_function.dispatch.id
  policy {
    tag                  = "$latest"
    zone_instances_limit = 1
    zone_requests_limit  = 1
  }
}
resource "yandex_function_trigger" "objects" {
  for_each  = toset(["jpg", "jpeg", "png", "webp", "mp4", "mov", "webm"])
  name      = "feed-prod-source-${each.key}"
  folder_id = var.folder_id
  object_storage {
    bucket_id    = yandex_storage_bucket.feed.bucket
    prefix       = "posts/"
    suffix       = "source.${each.key}"
    create       = true
    update       = true
    batch_size   = "1"
    batch_cutoff = "1"
  }
  function {
    id                 = yandex_function.dispatch.id
    service_account_id = yandex_iam_service_account.feed["trigger"].id
    tag                = "$latest"
    retry_attempts     = "3"
    retry_interval     = "10"
  }
  depends_on = [yandex_function_iam_binding.dispatch]
}
resource "yandex_function_trigger" "maintenance" {
  count     = var.deploy_workers && var.enable_triggers ? 1 : 0
  name      = "feed-prod-maintenance"
  folder_id = var.folder_id
  timer {
    cron_expression = "* * * * ? *"
    payload         = "{}"
  }
  function {
    id                 = yandex_function.dispatch.id
    service_account_id = yandex_iam_service_account.feed["trigger"].id
    tag                = "$latest"
  }
  depends_on = [yandex_function_iam_binding.dispatch]
}
resource "yandex_function_trigger" "work" {
  for_each  = var.enable_triggers ? yandex_serverless_container.worker : {}
  name      = "feed-prod-${each.key}"
  folder_id = var.folder_id
  message_queue {
    queue_id           = yandex_message_queue.work[each.key].arn
    service_account_id = yandex_iam_service_account.feed["trigger"].id
    batch_size         = "1"
    batch_cutoff       = "1"
    visibility_timeout = "660"
  }
  container {
    id                 = each.value.id
    path               = "/"
    service_account_id = yandex_iam_service_account.feed["trigger"].id
  }
  depends_on = [yandex_serverless_container_iam_binding.worker, yandex_resourcemanager_folder_iam_member.trigger_queue]
}
