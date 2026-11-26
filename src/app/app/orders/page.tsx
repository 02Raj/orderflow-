"use client";

import { ModifierPicker } from "@/components/modifier-picker";
import { modifierSelectionError } from "@/lib/modifiers";

import { EmptyState, PageHeader } from "@/components/ui";
import { ThermalPrintSheet } from "@/components/thermal-print-sheet";
import { api, formatElapsed, formatMoney } from "@/lib/api";
import { getToken, getUser } from "@/lib/session";
import { MenuItem, Order, OrderItem, Restaurant } from "@/lib/types";
import { elapsedFrom, ticketStatusLabel, useNow, useOrderStream } from "@/lib/use-order-stream";
import { useCallback, useEffect, useState } from "react";

export default function OrdersPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [edit, setEdit] = useState<{ order: Order; item: OrderItem } | null>(null);
  const [addition, setAddition] = useState<{ order: Order; id: string } | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuItemId, setMenuItemId] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const selectedMenuItem = menu.find((item) => item.id === menuItemId);
  const [payment, setPayment] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [canReverse, setCanReverse] = useState(false);
  const { orders, ready } = useOrderStream();
  const now = useNow();
  const finishPrinting = useCallback(() => setPrintOrder(null), []);
  const money = (minor: number) => formatMoney(minor, restaurant?.currency ?? "USD", restaurant?.locale);

  async function save(path: string, method: string, json: unknown) {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api(path, { method, token, json });
      setEdit(null);
      setAddition(null);
      setPayment(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save the ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function addTo(order: Order) {
    const token = getToken();
    if (!token) return;
    setActionError("");
    setMenuItemId("");
    setSelectedModifiers([]);
    setMenuLoading(true);
    setAddition({ order, id: crypto.randomUUID() });
    try {
      const result = await api<{ items: MenuItem[] }>("/menu", { token });
      setMenu(result.items.filter((item) => item.isAvailable));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not load the menu.");
    } finally {
      setMenuLoading(false);
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    import("@/lib/api").then(({ api }) =>
      api<Restaurant>("/restaurant", { token }).then((venue) => {
        setRestaurant(venue);
        const role = getUser()?.role;
        setCanReverse(role === "owner" || role === "manager");
      }).catch(() => setActionError("Could not load venue settings.")),
    );
  }, []);

  async function move(order: Order, status: string, rejectReason?: string) {
    const token = getToken();
    if (!token) return;
    setActionError("");
    try {
      const { api } = await import("@/lib/api");
      await api(`/orders/${order.id}/status`, {
        method: "PATCH",
        token,
        json: { status, reason: rejectReason },
      });
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update the ticket. Check its status and retry.");
      return false;
    }
  }

  return (
    <>
      <div className="p-5 md:p-8">
        <PageHeader
          kicker="Service"
          title="Tickets"
          copy="Accept, reject with a reason, or mark served. Updates land live from kitchen and floor."
        />
        {!rejecting && !edit && !addition && !payment && actionError ? <p role="alert" className="mt-4 rounded-xl bg-[#f3d0c8] p-3 text-sm">{actionError}</p> : null}
        {!ready ? (
          <div className="card mt-6 space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="No tickets yet"
            copy="When a guest orders from a table QR, tickets appear here."
            steps={["Print a table QR", "Send a test order from a phone"]}
          />
        ) : (
          <div className="card mt-6 overflow-x-auto p-2">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-[var(--ink-soft)]">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th>Destination</th>
                  <th>Items</th>
                  <th>Age</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-[var(--rule)] align-top">
                    <td className="px-3 py-3 font-semibold">{order.orderNumber}</td>
                    <td>{order.fulfillmentType === "takeaway" ? <><strong>Takeaway</strong><br /><span className="text-xs text-[var(--ink-soft)]">{order.customerLabel}</span></> : `Table ${order.tableNumber ?? "—"}`}</td>
                    <td>
                      {order.items.map((item) => (
                        <div key={item.id}>
                          {item.quantity}× {item.name}
                          {item.modifiers?.length ? (
                            <span className="text-[var(--ink-soft)]">
                              {" "}
                              ({item.modifiers.map((m) => m.name).join(", ")})
                            </span>
                          ) : null}
                          {!order.paidMinor && ["new", "accepted", "preparing", "ready"].includes(order.status) && (
                            <button className="ml-2 min-h-9 underline" onClick={() => { setActionError(""); setEdit({ order, item }); }}>Correct<span className="sr-only"> {item.name}</span></button>
                          )}
                        </div>
                      ))}
                    </td>
                    <td>{formatElapsed(elapsedFrom(order.createdAt, now))}</td>
                    <td>
                      {formatMoney(
                        order.totalMinor,
                        restaurant?.currency ?? "USD",
                        restaurant?.locale,
                      )}
                    </td>
                    <td>{ticketStatusLabel(order.status)}</td>
                    <td>{["cancelled", "void"].includes(order.status) ? "—" : order.paidMinor > 0 ? "Paid" : order.totalMinor > 0 ? "Unpaid" : "No charge"}</td>
                    <td className="space-x-2 whitespace-nowrap px-3 py-3">
                      {!["cancelled", "void"].includes(order.status) && <button className="underline" onClick={() => setPrintOrder(order)}>Print bill</button>}
                      {!order.paidMinor && order.totalMinor > 0 && !["new", "cancelled", "void"].includes(order.status) && (
                        <button className="underline" onClick={() => { setActionError(""); setPayment(order); }}>Record payment</button>
                      )}
                      {canReverse && order.paidMinor > 0 && (
                        <button className="underline" onClick={() => { setActionError(""); setPayment(order); }}>Reverse record</button>
                      )}
                      {order.status === "new" ? (
                        <>
                          <button className="underline" onClick={() => move(order, "accepted")}>
                            Accept for kitchen
                          </button>
                        </>
                      ) : null}
                      {!order.paidMinor && ["new", "accepted", "preparing", "ready"].includes(order.status) && (
                        <button className="underline" onClick={() => { setActionError(""); setRejecting(order); }}>{order.status === "new" ? "Reject" : "Cancel ticket"}</button>
                      )}
                      {!order.paidMinor && ["new", "accepted", "preparing", "ready"].includes(order.status) && (
                        <button className="underline" onClick={() => addTo(order)}>Add item</button>
                      )}
                      {order.status === "ready" ? (
                        <button className="underline" onClick={() => move(order, "served")}>
                          {order.fulfillmentType === "takeaway" ? "Handed over" : "Served"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div className="glass card max-w-md p-6">
            <h2 className="display text-2xl">{rejecting.status === "new" ? "Reject" : "Cancel"} ticket #{rejecting.orderNumber}</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              The kitchen and floor will see this reason on the cancelled ticket.
            </p>
            <textarea
              className="field mt-4 min-h-24"
              placeholder="Sold out, allergy risk, kitchen closed…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {actionError ? <p role="alert" className="mt-2 text-sm text-[var(--chili)]">{actionError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                className="btn btn-chili flex-1"
                disabled={!reason.trim()}
                onClick={async () => {
                  if (!(await move(rejecting, "cancelled", reason.trim()))) return;
                  setRejecting(null);
                  setReason("");
                  setActionError("");
                }}
              >
                {rejecting.status === "new" ? "Confirm rejection" : "Cancel ticket"}
              </button>
              <button
                className="btn btn-ghost flex-1"
                onClick={() => {
                  setRejecting(null);
                  setReason("");
                  setActionError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {edit && <dialog ref={(node) => { if (node && !node.open) node.showModal(); }} onClose={() => setEdit(null)}
        aria-label="Correct ticket item" className="card fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md p-5 backdrop:bg-black/50">
        <h2 className="display text-2xl">Correct {edit.item.name}</h2>
        <form method="post" className="mt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save(`/orders/${edit.order.id}/items/${edit.item.id}/correction`, "PATCH", {
            quantity: Number(form.get("quantity")), expectedQuantity: edit.item.quantity, reason: form.get("reason"),
          });
        }}>
          <label className="block text-sm">New quantity · enter 0 to remove this line
            <input name="quantity" type="number" required min={0} max={99} defaultValue={edit.item.quantity} className="field mt-1" />
          </label>
          <label className="block text-sm">Reason for the kitchen
            <input name="reason" required maxLength={160} className="field mt-1" />
          </label>
          {actionError && <p role="alert" className="text-sm text-[var(--chili-dark)]">{actionError}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className="btn btn-ink">Save correction</button>
            <button type="button" disabled={busy} onClick={() => { setEdit(null); setActionError(""); }} className="btn btn-ghost">Close</button>
          </div>
        </form>
      </dialog>}
      {addition && <dialog ref={(node) => { if (node && !node.open) node.showModal(); }} onClose={() => setAddition(null)}
        aria-label="Add an item to the ticket" className="card fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-auto p-5 backdrop:bg-black/50">
        <h2 className="display text-2xl">Add item to #{addition.order.orderNumber}</h2>
        <form method="post" className="mt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save(`/orders/${addition.order.id}/items`, "POST", {
            itemId: addition.id, reason: form.get("reason"),
            line: { menuItemId, quantity: Number(form.get("quantity")), modifierIds: selectedModifiers },
          });
        }}>
          <label className="block text-sm">Menu item
            <select className="field mt-1" required value={menuItemId} disabled={menuLoading} onChange={(event) => {
              setMenuItemId(event.target.value);
              setSelectedModifiers([]);
            }}>
              <option value="">{menuLoading ? "Loading menu…" : menu.length ? "Choose an item" : "No available items"}</option>
              {menu.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.priceMinor)}</option>)}
            </select>
          </label>
          {selectedMenuItem && <ModifierPicker item={selectedMenuItem} selected={selectedModifiers} onChange={setSelectedModifiers} money={money} />}
          <label className="block text-sm">Quantity
            <input name="quantity" type="number" required min={1} max={99} defaultValue={1} className="field mt-1" />
          </label>
          <label className="block text-sm">Reason for the kitchen
            <input name="reason" required maxLength={160} className="field mt-1" />
          </label>
          {actionError && <p role="alert" className="text-sm text-[var(--chili-dark)]">{actionError}</p>}
          <div className="flex gap-2">
            <button disabled={busy || menuLoading || !selectedMenuItem || !!modifierSelectionError(selectedMenuItem.modifierGroups ?? [], selectedMenuItem.modifiers, selectedModifiers)} className="btn btn-ink">Add to ticket</button>
            <button type="button" disabled={busy} onClick={() => { setAddition(null); setActionError(""); }} className="btn btn-ghost">Close</button>
          </div>
        </form>
      </dialog>}
      {payment && <dialog ref={(node) => { if (node && !node.open) node.showModal(); }} onClose={() => setPayment(null)}
        aria-label="Record external payment" className="card fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md p-5 backdrop:bg-black/50">
        <h2 className="display text-2xl">{payment.paidMinor > 0 ? "Reverse payment record" : `Record ${money(payment.totalMinor)} received`}</h2>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Ticket #{payment.orderNumber}. {payment.paidMinor > 0 ? "If a refund is due, complete it on your payment terminal or in cash before reversing this record." : "Confirm after the guest has paid."}
        </p>
        <form method="post" className="mt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (payment.paidMinor > 0) {
            void save(`/orders/${payment.id}/payment/reversal`, "POST", { reason: form.get("reason"), expectedUpdatedAt: payment.updatedAt });
          } else {
            void save(`/orders/${payment.id}/payment`, "POST", { method: form.get("method"), expectedTotal: payment.totalMinor });
          }
        }}>
          {payment.paidMinor > 0 ? <label className="block text-sm">Reason
            <input name="reason" required maxLength={160} className="field mt-1" />
          </label> : <label className="block text-sm">Payment method
            <select name="method" required defaultValue="" className="field mt-1">
              <option value="" disabled>Choose method</option>
              <option value="cash">Cash</option>
              <option value="card_terminal">Card terminal</option>
              <option value="upi">UPI</option>
            </select>
          </label>}
          {actionError && <p role="alert" className="text-sm text-[var(--chili-dark)]">{actionError}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className="btn btn-ink">{payment.paidMinor > 0 ? "Confirm reversal" : "Confirm payment"}</button>
            <button type="button" disabled={busy} onClick={() => { setPayment(null); setActionError(""); }} className="btn btn-ghost">Close</button>
          </div>
        </form>
      </dialog>}
      <ThermalPrintSheet order={printOrder} restaurant={restaurant} kind="bill" onDone={finishPrinting} />
    </>
  );
}
