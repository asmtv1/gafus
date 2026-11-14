/** Single-purpose exports: do not initialize unrelated analytics adapters. */
export { getAdminMailDashboard, getAdminMailAlertCount } from "./infra/mailAdminMonitoring.js";
export { getMailDeliveryHealth, monitorMailDelivery,
  renderMailDeliveryMetricsPrometheus } from "./infra/mailDeliveryMonitor.js";
