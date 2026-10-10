locals {
  prefix = "${var.name}-${var.environment}"
  functions = {
    process     = { memory = 1024, timeout = "60", runtime_sa = "worker" }
    maintenance = { memory = 1024, timeout = "60", runtime_sa = "worker" }
    origin      = { memory = 256, timeout = "4", runtime_sa = "origin" }
    dispatch    = { memory = 128, timeout = "15", runtime_sa = "dispatch" }
  }
}
resource "yandex_iam_service_account" "gallery" {
  for_each  = toset(["web", "worker", "origin", "dispatch", "queue-writer", "trigger", "gateway"])
  name      = "${local.prefix}-${each.key}"
  folder_id = var.folder_id
}
resource "yandex_iam_service_account_static_access_key" "storage" {
  for_each           = toset(["web", "worker", "origin"])
  service_account_id = yandex_iam_service_account.gallery[each.key].id
  description        = "Private gallery scoped bucket access"
}
resource "yandex_iam_service_account_static_access_key" "queue" {
  service_account_id = yandex_iam_service_account.gallery["queue-writer"].id
  description        = "Gallery processing queue producer"
}
resource "yandex_resourcemanager_folder_iam_member" "queue_writer" {
  folder_id = var.folder_id
  role      = "ymq.writer"
  member    = "serviceAccount:${yandex_iam_service_account.gallery["queue-writer"].id}"
}
resource "yandex_resourcemanager_folder_iam_member" "trigger_queue" {
  for_each  = toset(["ymq.reader", "ymq.writer"])
  folder_id = var.folder_id
  role      = each.key
  member    = "serviceAccount:${yandex_iam_service_account.gallery["trigger"].id}"
}
resource "yandex_storage_bucket" "gallery" {
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
    allowed_origins = sort(tolist(var.web_origins))
    allowed_methods = ["POST"]
    allowed_headers = ["content-type"]
    expose_headers  = ["ETag"]
    max_age_seconds = 600
  }
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "TlsOnly", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = ["arn:aws:s3:::${var.bucket}", "arn:aws:s3:::${var.bucket}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } },
    { Sid = "RegisteredSources", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["web"].id }, Action = ["s3:PutObject"], Resource = [for ext in ["jpg", "png", "webp"] : "arn:aws:s3:::${var.bucket}/albums/*/*/incoming/*/source.${ext}"] },
    { Sid = "VetVisitOriginals", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["web"].id }, Action = ["s3:PutObject", "s3:GetObject"], Resource = [for ext in ["jpg", "png", "webp", "pdf"] : "arn:aws:s3:::${var.bucket}/users/*/pets/*/vet-visits/*/*/original.${ext}"] },
    { Sid = "VetVisitPreviews", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["web"].id }, Action = ["s3:PutObject"], Resource = ["arn:aws:s3:::${var.bucket}/users/*/pets/*/vet-visits/*/*/thumb.webp"] },
    { Sid = "VetVisitCleanup", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["worker"].id }, Action = ["s3:GetObject", "s3:DeleteObject"], Resource = concat([for ext in ["jpg", "png", "webp", "pdf"] : "arn:aws:s3:::${var.bucket}/users/*/pets/*/vet-visits/*/*/original.${ext}"], ["arn:aws:s3:::${var.bucket}/users/*/pets/*/vet-visits/*/*/thumb.webp"]) },
    { Sid = "VetVisitOrigin", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["origin"].id }, Action = ["s3:GetObject"], Resource = ["arn:aws:s3:::${var.bucket}/users/*/pets/*/vet-visits/*/*/thumb.webp"] },
    { Sid = "CoreHead", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["web"].id }, Action = ["s3:GetObject"], Resource = ["arn:aws:s3:::${var.bucket}/albums/*"] },
    { Sid = "WorkerObjects", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["worker"].id }, Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = ["arn:aws:s3:::${var.bucket}/albums/*"] },
    { Sid = "FinalOrigin", Effect = "Allow", Principal = { CanonicalUser = yandex_iam_service_account.gallery["origin"].id }, Action = ["s3:GetObject"], Resource = [for variant in ["thumb", "full"] : "arn:aws:s3:::${var.bucket}/albums/*/*/photos/*/${variant}.webp"] },
    # Keep Terraform's S3 administration on the DEV provisioner account only.
    { Sid = "TerraformProvisioner", Effect = "Allow", Principal = { CanonicalUser = var.provisioner_service_account_id }, Action = ["s3:*"], Resource = ["arn:aws:s3:::${var.bucket}", "arn:aws:s3:::${var.bucket}/*"] }
  ] })
  lifecycle { prevent_destroy = true }
}
# Bucket policy is a second access check, not a replacement for IAM/ACL.
# The origin needs base read permission before FinalOrigin can restrict it
# to final photo keys. Keep this role on this bucket, never on the folder.
resource "yandex_storage_bucket_iam_binding" "photo_origin_reader" {
  bucket  = yandex_storage_bucket.gallery.bucket
  role    = "storage.viewer"
  members = ["serviceAccount:${yandex_iam_service_account.gallery["origin"].id}"]
}

resource "yandex_message_queue" "dlq" {
  name                      = "${local.prefix}-dlq"
  access_key                = var.provisioner_ymq_access_key
  secret_key                = var.provisioner_ymq_secret_key
  message_retention_seconds = 1209600
  max_message_size          = 262144
}
resource "yandex_message_queue" "process" {
  name                       = "${local.prefix}-process"
  access_key                 = var.provisioner_ymq_access_key
  secret_key                 = var.provisioner_ymq_secret_key
  visibility_timeout_seconds = 120
  message_retention_seconds  = 345600
  max_message_size           = 1024
  redrive_policy             = jsonencode({ deadLetterTargetArn = yandex_message_queue.dlq.arn, maxReceiveCount = 5 })
}
locals {
  payloads = {
    web = {
      GALLERY_S3_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.storage["web"].access_key
      GALLERY_S3_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.storage["web"].secret_key
      GALLERY_CDN_SECRET           = var.cdn_secret
      GALLERY_INTERNAL_HMAC_SECRET = var.internal_hmac_secret
    }
    worker = {
      GALLERY_S3_ACCESS_KEY_ID        = yandex_iam_service_account_static_access_key.storage["worker"].access_key
      GALLERY_S3_SECRET_ACCESS_KEY    = yandex_iam_service_account_static_access_key.storage["worker"].secret_key
      GALLERY_QUEUE_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.queue.access_key
      GALLERY_QUEUE_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.queue.secret_key
      GALLERY_INTERNAL_HMAC_SECRET    = var.internal_hmac_secret
    }
    dispatch = {
      GALLERY_QUEUE_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.queue.access_key
      GALLERY_QUEUE_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.queue.secret_key
    }
    origin = {
      GALLERY_S3_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.storage["origin"].access_key
      GALLERY_S3_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.storage["origin"].secret_key
      GALLERY_ORIGIN_SECRET        = var.origin_secret
    }
  }
}
resource "yandex_lockbox_secret" "runtime" {
  for_each  = toset(["web", "worker", "dispatch", "origin"])
  name      = "${local.prefix}-${each.key}"
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
  members   = ["serviceAccount:${yandex_iam_service_account.gallery[each.key].id}"]
}
resource "yandex_function" "gallery" {
  for_each           = local.functions
  name               = "${local.prefix}-${each.key}"
  folder_id          = var.folder_id
  runtime            = "nodejs22"
  entrypoint         = "index.handler"
  memory             = each.value.memory
  execution_timeout  = each.value.timeout
  concurrency        = 1
  service_account_id = yandex_iam_service_account.gallery[each.value.runtime_sa].id
  user_hash          = filesha256("${var.artifact_directory}/${each.key}.zip")
  environment = {
    GALLERY_ENABLED             = tostring(var.enabled)
    GALLERY_BUCKET              = var.bucket
    GALLERY_QUEUE_URL           = yandex_message_queue.process.id
    GALLERY_INTERNAL_BASE_URL   = var.internal_base_url
    GALLERY_ORIGIN_VERIFY_TOKEN = "false"
  }
  # The provider's inline code limit is ~3.5 MiB, so large Linux/Sharp
  # archives are loaded from a private deployment bucket.
  dynamic "content" {
    for_each = contains(["origin", "dispatch"], each.key) ? [1] : []
    content {
      zip_filename = "${var.artifact_directory}/${each.key}.zip"
    }
  }
  dynamic "package" {
    for_each = contains(["process", "maintenance"], each.key) ? [1] : []
    content {
      bucket_name = yandex_storage_bucket.function_packages.bucket
      object_name = yandex_storage_object.function_packages[each.key].key
    }
  }
  dynamic "secrets" {
    for_each = nonsensitive(toset(keys(local.payloads[each.value.runtime_sa])))
    content {
      environment_variable = secrets.value
      key                  = secrets.value
      id                   = yandex_lockbox_secret.runtime[each.value.runtime_sa].id
      version_id           = yandex_lockbox_secret_version.runtime[each.value.runtime_sa].id
    }
  }
  # Temporary diagnostics for dispatch/process/maintenance only. Origin handles
  # signed private images and MUST remain unlogged. Disable after diagnosis.
  # No request headers, object keys, payloads or credentials are logged by app code.
  log_options { disabled = each.key == "origin" || !var.diagnostic_logging }
  depends_on = [yandex_lockbox_secret_iam_binding.runtime, yandex_resourcemanager_folder_iam_member.queue_writer, yandex_storage_bucket_iam_binding.function_packages_reader, yandex_storage_bucket_iam_binding.photo_origin_reader]
}
resource "yandex_function_scaling_policy" "bounded" {
  for_each    = yandex_function.gallery
  function_id = each.value.id
  policy {
    tag = "$latest"
    # Limits are PER ZONE. One concurrent invocation per zone, <=3 across current zones.
    # This deliberately stays below the requested global ceiling of five.
    zone_instances_limit = 1
    zone_requests_limit  = 1
  }
}
resource "yandex_function_iam_binding" "private_invokers" {
  for_each    = yandex_function.gallery
  function_id = each.value.id
  role        = "functions.functionInvoker"
  members     = ["serviceAccount:${yandex_iam_service_account.gallery[each.key == "origin" ? "gateway" : "trigger"].id}"]
}
resource "yandex_function_trigger" "incoming" {
  for_each  = toset(["jpg", "png", "webp"])
  name      = "${local.prefix}-source-${each.key}"
  folder_id = var.folder_id
  object_storage {
    bucket_id    = yandex_storage_bucket.gallery.id
    prefix       = "albums/"
    suffix       = "source.${each.key}"
    create       = true
    update       = true
    batch_size   = "1"
    batch_cutoff = "1"
  }
  function {
    id                 = yandex_function.gallery["dispatch"].id
    service_account_id = yandex_iam_service_account.gallery["trigger"].id
    tag                = "$latest"
    retry_attempts     = "3"
    retry_interval     = "10"
  }
  dlq {
    queue_id           = yandex_message_queue.dlq.arn
    service_account_id = yandex_iam_service_account.gallery["trigger"].id
  }
  depends_on = [yandex_function_iam_binding.private_invokers, yandex_resourcemanager_folder_iam_member.trigger_queue]
}
resource "yandex_function_trigger" "process" {
  name      = "${local.prefix}-process"
  folder_id = var.folder_id
  message_queue {
    queue_id           = yandex_message_queue.process.arn
    service_account_id = yandex_iam_service_account.gallery["trigger"].id
    batch_size         = "1"
    batch_cutoff       = "1"
    visibility_timeout = "120"
  }
  function {
    id                 = yandex_function.gallery["process"].id
    service_account_id = yandex_iam_service_account.gallery["trigger"].id
    tag                = "$latest"
  }
  depends_on = [yandex_function_iam_binding.private_invokers, yandex_resourcemanager_folder_iam_member.trigger_queue]
}
resource "yandex_function_trigger" "maintenance" {
  name      = "${local.prefix}-maintenance"
  folder_id = var.folder_id
  timer {
    cron_expression = "*/5 * * * ? *"
    payload         = "{}"
  }
  function {
    id                 = yandex_function.gallery["maintenance"].id
    service_account_id = yandex_iam_service_account.gallery["trigger"].id
    tag                = "$latest"
    retry_attempts     = "3"
    retry_interval     = "10"
  }
  dlq {
    queue_id           = yandex_message_queue.dlq.arn
    service_account_id = yandex_iam_service_account.gallery["trigger"].id
  }
  # Deliberately independent of enabled: disabled gallery must continue cleanup.
  depends_on = [yandex_function_iam_binding.private_invokers, yandex_resourcemanager_folder_iam_member.trigger_queue]
}
