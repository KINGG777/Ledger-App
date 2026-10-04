import { supabase } from "@/integrations/supabase/client";

export const SUPER_ADMIN_EMAIL = "pramod@kingg.in";

export type Customer = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  address: string;
  last_whatsapp_sent_at: string | null;
  created_at: string;
  sms_opt_in: boolean;
  twilio_opt_in: boolean;
};

export type Transaction = {
  id: string;
  user_id: string;
  customer_id: string;
  amount: number;
  type: "give" | "take";
  txn_date: string;
  description: string;
  created_at: string;
};

export type Profile = {
  id: string;
  owner_name: string;
  shop_name: string;
  email: string;
  master_pin: string;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  twilio_sms_number: string | null;
  created_at: string;
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

export function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Net balance: positive = customer owes you (take), negative = you owe / advance (give). */
export function netBalance(txns: Pick<Transaction, "amount" | "type">[]) {
  return txns.reduce((sum, t) => sum + (t.type === "take" ? Number(t.amount) : -Number(t.amount)), 0);
}

export function balanceTone(balance: number) {
  return balance <= 0 ? "text-success" : balance > 500 ? "text-destructive" : "text-warning";
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function fetchCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function fetchAllTransactions() {
  const result: Transaction[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    result.push(...((data ?? []) as Transaction[]));
    if (!data || data.length < 1000) return result;
  }
}

export async function fetchCustomer(id: string) {
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Customer | null;
}

export async function fetchTransactions(customerId: string) {
  const result: Transaction[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customerId)
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    result.push(...((data ?? []) as Transaction[]));
    if (!data || data.length < 1000) return result;
  }
}

export function buildStatementMessage(
  shopName: string,
  customerName: string,
  balance: number,
  latest?: Transaction,
) {
  const lines: string[] = [];
  lines.push(`*${shopName}* — Ledger Statement`);
  lines.push(`Customer: ${customerName}`);
  if (latest) {
    lines.push("");
    lines.push(`Last entry: ${formatDate(latest.txn_date)}`);
    lines.push(
      `${latest.type === "take" ? "Credit given" : "Payment / advance"}: ${formatMoney(Number(latest.amount))}`,
    );
    if (latest.description.trim()) {
      lines.push(`Note: ${latest.description.trim()}`);
    }
  }
  lines.push("");
  if (balance > 0) lines.push(`*Outstanding balance: ${formatMoney(balance)}* (to be paid)`);
  else if (balance < 0) lines.push(`*Advance with us: ${formatMoney(balance)}*`);
  else lines.push("*Balance settled. Thank you!*");
  return lines.join("\n");
}

export function buildFullStatement(shopName: string, customerName: string, transactions: Transaction[]) {
  const ordered = [...transactions].sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.created_at.localeCompare(b.created_at));
  const lines = [`*${shopName}* — Full statement`, `Customer: ${customerName}`, ""];
  for (const txn of ordered) {
    lines.push(`${formatDate(txn.txn_date)} · ${txn.type === "take" ? "Take" : "Paid"} · ${formatMoney(Number(txn.amount))}${txn.description.trim() ? ` · ${txn.description.trim()}` : ""}`);
  }
  const balance = netBalance(ordered);
  lines.push("", `Balance: ${formatMoney(balance)}${balance < 0 ? " (advance)" : balance === 0 ? " (settled)" : " (to pay)"}`);
  return lines.join("\n");
}

export function whatsappLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
