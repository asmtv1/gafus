terraform {
  required_version = ">= 1.6, < 2.0"
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "0.237.0"
    }
  }
}
provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
  # YC_TOKEN / YC_SERVICE_ACCOUNT_KEY_FILE; never put credentials in tfvars.
}
