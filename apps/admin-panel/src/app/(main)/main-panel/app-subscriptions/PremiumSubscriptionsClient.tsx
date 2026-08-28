"use client";

import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";

import type {
  AppSubscriptionPaymentHistoryPage,
  AppSubscriptionPromoCodeAdminItem,
} from "@gafus/core/services/appSubscription";
import type { AppSubscriptionDashboard } from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";

import AppSubscriptionsClient from "./AppSubscriptionsClient";
import PaymentHistory from "./PaymentHistory";
import PromoCodesPanel from "./PromoCodesPanel";
import NpdReceiptsPanel from "./NpdReceiptsPanel";
import type { NpdAdminPage } from "@gafus/core/services/appSubscription";

interface PremiumSubscriptionsClientProps {
  activeTab: "payments" | "promo-codes" | "npd";
  role: "ADMIN" | "MODERATOR";
  dashboard: AppSubscriptionDashboard | null;
  paymentHistory: AppSubscriptionPaymentHistoryPage | null;
  promoCodes: AppSubscriptionPromoCodeAdminItem[] | null;
  paymentStatus: string;
  paymentSearch: string;
  includeArchived: boolean;
  npd: NpdAdminPage | null;
  npdStatus: string; npdSearch: string; npdFrom: string; npdTo: string;
}

export default function PremiumSubscriptionsClient(props: PremiumSubscriptionsClientProps) {
  const router = useRouter();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={props.activeTab}
          onChange={(_event, value: "payments" | "promo-codes") => {
            router.replace(`/main-panel/app-subscriptions?tab=${value}`);
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Разделы Premium"
        >
          <Tab value="payments" label="Оплаты" />
          <Tab value="promo-codes" label="Промокоды" />
          <Tab value="npd" label="Чеки НПД" />
        </Tabs>
      </Box>

      {props.activeTab === "payments" && props.dashboard && props.paymentHistory ? (
        <>
          <AppSubscriptionsClient dashboard={props.dashboard} />
          <PaymentHistory
            history={props.paymentHistory}
            status={props.paymentStatus}
            search={props.paymentSearch}
          />
        </>
      ) : null}

      {props.activeTab === "promo-codes" && props.promoCodes ? (
        <PromoCodesPanel
          promoCodes={props.promoCodes}
          canManage={props.role === "ADMIN"}
          includeArchived={props.includeArchived}
        />
      ) : null}
      {props.activeTab === "npd" && props.npd ? <NpdReceiptsPanel data={props.npd} role={props.role} status={props.npdStatus} search={props.npdSearch} from={props.npdFrom} to={props.npdTo} /> : null}
    </Box>
  );
}
