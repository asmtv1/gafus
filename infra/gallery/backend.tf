# Isolated development gallery state. The bucket was provisioned out of band.
# Credentials are read from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
# The bucket is private, versioned, and encrypted using its configured KMS key.
terraform {
  backend "s3" {
    endpoints = {
      s3 = "https://storage.yandexcloud.net"
    }

    bucket       = "gafus-gallery-dev-tfstate-b1gjbsvfnd1fl68k43g6"
    key          = "gallery/dev/terraform.tfstate"
    region       = "ru-central1"
    use_lockfile = true

    # This is Yandex Object Storage, not AWS.
    use_path_style              = true
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
