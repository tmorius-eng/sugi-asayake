import { Redirect } from "wouter";

// Order history now lives inside the profile account shell (Захиалга tab —
// timeline + Buy Again), which replaced this page's standalone content.
// Kept as a redirect, not deleted outright, so any bookmarked/shared
// "/orders" link still lands somewhere correct instead of 404ing.
export default function MyOrders() {
  return <Redirect to="/profile?tab=orders" />;
}
