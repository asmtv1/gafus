# IDs are placeholders. Secrets are supplied via TF_VAR_* by a secure runner.
cloud_id                       = "replace-cloud-id"
folder_id                      = "replace-isolated-nonproduction-folder-id"
provisioner_service_account_id = "replace-provisioner-service-account-id"
environment                    = "dev"
bucket                         = "replace-private-gallery-dev"
web_origins                    = ["https://dev.example.org"]
internal_base_url              = "https://api-dev.example.org"
cdn_hostname                   = "images-dev.example.org"
cdn_certificate_id             = "replace-validated-certificate-id"
enabled                        = false
