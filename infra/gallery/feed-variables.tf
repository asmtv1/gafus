variable "feed_origin_function_id" {
  type = string
  default = ""
  description = "Optional private Feed origin behind the existing gallery CDN."
}
variable "feed_origin_service_account_id" {
  type = string
  default = ""
  description = "Service account authorized to invoke the private Feed origin."
}
