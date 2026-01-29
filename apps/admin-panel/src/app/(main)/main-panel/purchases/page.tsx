import PurchasesClient from "./PurchasesClient";

import { getAllPurchases } from "@/features/purchases/lib/getAllPurchases";

export default async function PurchasesPage() {
  const purchases = await getAllPurchases();

  return <PurchasesClient purchases={purchases} />;
}
