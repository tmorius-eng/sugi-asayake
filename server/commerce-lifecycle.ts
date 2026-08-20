export type InventoryLine = { name: string; quantity: number; stockQuantity: number };
export type OrderLifecycleStatus = "pending" | "confirmed" | "packed" | "out_for_delivery" | "completed" | "cancelled";

export function getInventoryReservationFailure(items: InventoryLine[]) {
  const unavailable = items.find(item => item.quantity > item.stockQuantity);
  return unavailable ? `${unavailable.name} is no longer available in the requested quantity. Please refresh your cart.` : null;
}

export function shouldRestoreStock(currentStatus: OrderLifecycleStatus, nextStatus: OrderLifecycleStatus | undefined) {
  return nextStatus === "cancelled" && currentStatus !== "cancelled" && currentStatus !== "completed";
}
