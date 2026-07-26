"use client";

import { useMemo, useState } from "react";

import PageLayout from "@/shared/components/PageLayout";
import type { AppSubscriptionDashboard } from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";
import { getAppSubscriptionStatusLabel } from "@/features/app-subscriptions/lib/statusPresentation";

import AppSubscriptionsTable, { type AppSubscriptionFilter } from "./AppSubscriptionsTable";

type SortField = "boughtAt" | "activeUntil" | "lastPaymentAt" | "totalPaidRub" | "status" | "user";
type SortDirection = "asc" | "desc";

interface AppSubscriptionsClientProps {
  dashboard: AppSubscriptionDashboard;
}

function rowMatchesFilter(
  row: AppSubscriptionDashboard["rows"][number],
  filter: AppSubscriptionFilter,
) {
  switch (filter) {
    case "active":
      return row.isActiveNow;
    case "not_renewed":
      return row.attention === "not_renewed";
    case "past_due":
      return row.attention === "past_due";
    case "all":
    default:
      return true;
  }
}

function dateValue(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}

export default function AppSubscriptionsClient({ dashboard }: AppSubscriptionsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<AppSubscriptionFilter>("all");
  const [sortField, setSortField] = useState<SortField>("activeUntil");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const rows = useMemo(() => {
    let result = dashboard.rows.filter((row) => rowMatchesFilter(row, filter));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((row) =>
        [
          row.user.username,
          row.user.fullName,
          row.user.email,
          row.user.phone,
          row.id,
          row.provider,
          row.status,
          getAppSubscriptionStatusLabel(row),
          row.paymentMethod,
          row.appleProductId,
          row.manualReason,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      );
    }

    result = [...result].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;
      switch (sortField) {
        case "boughtAt":
          aValue = dateValue(a.boughtAt);
          bValue = dateValue(b.boughtAt);
          break;
        case "activeUntil":
          aValue = a.isLifetime ? Number.MAX_SAFE_INTEGER : dateValue(a.activeUntil);
          bValue = b.isLifetime ? Number.MAX_SAFE_INTEGER : dateValue(b.activeUntil);
          break;
        case "lastPaymentAt":
          aValue = dateValue(a.lastPaymentAt);
          bValue = dateValue(b.lastPaymentAt);
          break;
        case "totalPaidRub":
          aValue = a.totalPaidRub;
          bValue = b.totalPaidRub;
          break;
        case "status":
          aValue = getAppSubscriptionStatusLabel(a);
          bValue = getAppSubscriptionStatusLabel(b);
          break;
        case "user":
          aValue = (a.user.fullName ?? a.user.username).toLowerCase();
          bValue = (b.user.fullName ?? b.user.username).toLowerCase();
          break;
        default:
          return 0;
      }
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [dashboard.rows, filter, searchQuery, sortDirection, sortField]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  };

  return (
    <PageLayout
      title="Подписки Gafus Premium"
      subtitle="Что происходит с подписками сегодня и у кого сейчас есть доступ"
    >
      <AppSubscriptionsTable
        metrics={dashboard.metrics}
        todayNotPaid={dashboard.todayNotPaid}
        rows={rows}
        totalRows={dashboard.rows.length}
        filter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
    </PageLayout>
  );
}
