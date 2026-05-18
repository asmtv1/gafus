"use client";

import { useMemo, useState } from "react";

import PageLayout from "@/shared/components/PageLayout";
import type { AppSubscriptionDashboard } from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";

import AppSubscriptionsTable, { type AppSubscriptionFilter } from "./AppSubscriptionsTable";

type SortField = "boughtAt" | "activeUntil" | "lastPaymentAt" | "totalPaidRub" | "status" | "user";
type SortDirection = "asc" | "desc";

interface AppSubscriptionsClientProps {
  dashboard: AppSubscriptionDashboard;
}

function rowMatchesFilter(row: AppSubscriptionDashboard["rows"][number], filter: AppSubscriptionFilter) {
  switch (filter) {
    case "active":
      return row.isActiveNow;
    case "not_renewed":
      return row.attention === "not_renewed";
    case "cancel_at_period_end":
      return row.attention === "cancel_at_period_end";
    case "past_due":
      return row.attention === "past_due";
    case "yookassa":
      return row.provider === "YOOKASSA";
    case "apple":
      return row.provider === "APPLE";
    case "manual":
      return row.provider === "MANUAL";
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
          aValue = a.status;
          bValue = b.status;
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
      subtitle="Кто купил подписку, когда заканчивается доступ, кто отменил продление и кто не продлил"
    >
      <AppSubscriptionsTable
        metrics={dashboard.metrics}
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
