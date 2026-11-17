import { LABELS } from "@/modules/orders/state";
import { Badge } from "@/components/ui/misc";

const TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  CONFIRMED: "success", PAID: "success", DELIVERED: "success", AUTHORIZED: "success", SHIPPED: "success",
  AWAITING_QUOTE: "warning", AWAITING_PAYMENT: "warning", PREPARING: "warning", ISSUING: "warning",
  CANCELED: "danger", FAILED: "danger", REJECTED: "danger", REFUNDED: "danger",
};
export function StatusBadge({ dim, value }: { dim: keyof typeof LABELS; value: string }) {
  return <Badge tone={TONE[value] ?? "neutral"}>{(LABELS[dim] as Record<string, string>)[value] ?? value}</Badge>;
}
