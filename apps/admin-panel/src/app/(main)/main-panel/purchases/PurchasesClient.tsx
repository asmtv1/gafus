"use client";

import { useMemo, useState } from "react";

import PageLayout from "@/shared/components/PageLayout";
import PurchasesTable from "@/app/(main)/main-panel/purchases/PurchasesTable";
import type { PurchaseRow } from "@/features/purchases/lib/getAllPurchases";

type SortField = "createdAt" | "amountRub" | "status" | "user" | "course" | null;
type SortDirection = "asc" | "desc";

interface PurchasesClientProps {
  purchases: PurchaseRow[];
}

export default function PurchasesClient({ purchases }: PurchasesClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filteredAndSorted = useMemo(() => {
    let result = [...purchases];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.user.username.toLowerCase().includes(q) ||
          (p.user.profile?.fullName?.toLowerCase().includes(q) ?? false) ||
          (p.user.phone?.includes(q) ?? false) ||
          p.course.name.toLowerCase().includes(q) ||
          p.course.type.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.yookassaPaymentId?.toLowerCase().includes(q) ?? false)
      );
    }

    if (sortField) {
      result.sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortField) {
          case "createdAt":
            aVal = new Date(a.createdAt).getTime();
            bVal = new Date(b.createdAt).getTime();
            break;
          case "amountRub":
            aVal = a.amountRub;
            bVal = b.amountRub;
            break;
          case "status":
            aVal = a.status;
            bVal = b.status;
            break;
          case "user":
            aVal = (a.user.profile?.fullName ?? a.user.username).toLowerCase();
            bVal = (b.user.profile?.fullName ?? b.user.username).toLowerCase();
            break;
          case "course":
            aVal = a.course.name.toLowerCase();
            bVal = b.course.name.toLowerCase();
            break;
          default:
            return 0;
        }
        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [purchases, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return (
    <PageLayout
      title="Покупки курсов"
      subtitle="Кто купил, когда, сумма, статус и данные платежа"
    >
      <PurchasesTable
        purchases={filteredAndSorted}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
    </PageLayout>
  );
}
