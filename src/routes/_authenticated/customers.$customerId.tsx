import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MessageCircle, Phone, Send, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buildStatementMessage,
  buildFullStatement,
  balanceTone,
  fetchCustomer,
  fetchProfile,
  fetchTransactions,
  formatDate,
  formatMoney,
  netBalance,
  whatsappLink,
  type Transaction,
} from "@/lib/ledger";
import { sendTwilioWhatsApp } from "@/lib/twilio.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PinGate } from "@/components/PinGate";
import { DatewiseEntries } from "@/components/DatewiseEntries";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer ledger — Ledger Management" },
      { name: "description", content: "Every Take and Paid entry for this customer." },
      { property: "og:title", content: "Customer ledger — Ledger Management" },
      { property: "og:description", content: "Record entries, view reports and share statements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerLedger,
});

function CustomerLedger() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sendWhatsApp = useServerFn(sendTwilioWhatsApp);

  const [entryType, setEntryType] = useState<"give" | "take" | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [cooldownOpen, setCooldownOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [month, setMonth] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const customerQuery = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => fetchCustomer(customerId),
  });
  const txnsQuery = useQuery({
    queryKey: ["transactions", customerId],
    queryFn: () => fetchTransactions(customerId),
  });

  const transactions = txnsQuery.data ?? [];
  const balance = useMemo(() => netBalance(transactions), [transactions]);
  const customer = customerQuery.data;
  const shopName = profileQuery.data?.shop_name || "My Shop";

  const statement = customer
    ? buildStatementMessage(shopName, customer.name, balance, transactions[0])
    : "";
  const fullStatement = customer ? buildFullStatement(shopName, customer.name, transactions) : "";
  const visibleEntries = month ? transactions.filter((txn) => txn.txn_date.startsWith(month)) : transactions;
  const reportEntries = [...visibleEntries].sort((a, b) => b.txn_date.localeCompare(a.txn_date) || b.created_at.localeCompare(a.created_at));
  const reportTake = reportEntries.filter((t) => t.type === "take").reduce((sum, t) => sum + Number(t.amount), 0);
  const reportPaid = reportEntries.filter((t) => t.type === "give").reduce((sum, t) => sum + Number(t.amount), 0);

  const addEntry = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid amount");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { error } = await supabase.from("transactions").insert({
        user_id: userData.user.id,
        customer_id: customerId,
        amount: value,
        type: entryType ?? "take",
        txn_date: date,
        description: description.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setEntryType(null);
      setAmount("");
      setDescription("");
      setDate(new Date().toISOString().slice(0, 10));
      toast.success("Entry added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Entry deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function isInCooldown() {
    const last = customer?.last_whatsapp_sent_at;
    if (!last) return false;
    const lastTime = new Date(last).getTime();
    if (Date.now() - lastTime > 10 * 60 * 1000) return false;
    const newerEntry = transactions.some((t) => new Date(t.created_at).getTime() > lastTime);
    return !newerEntry;
  }

  async function doTwilioSend(channel: "whatsapp" | "sms" = "whatsapp") {
    if (!customer) return;
    setSending(true);
    try {
      const result = await sendWhatsApp({ data: { customerId, message: statement, channel } });
      if (result.ok) {
        toast.success(channel === "sms" ? "SMS sent" : "WhatsApp message sent");
        queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Could not send the message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleTwilioClick() {
    if (isInCooldown()) setCooldownOpen(true);
    else void doTwilioSend();
  }

  return (
    <div className="min-h-screen pb-36">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="app-shell flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/customers" })}>
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{customer?.name ?? "Customer"}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {customer?.phone || "No phone"}
              {customer?.address ? ` · ${customer.address}` : ""}
            </p>
          </div>
        </div>
      </header>

      <main className="app-shell px-5">
        <div className="border-b border-border py-6 text-center" aria-label="Customer balance">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {balance < 0 ? "Advance" : balance === 0 ? "Settled" : "Amount to pay"}
          </p>
          <p className={`mt-1 text-3xl font-semibold ${balanceTone(balance)}`}>
            {formatMoney(balance)}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <a
            href={`tel:${customer?.phone ?? ""}`}
            className="surface-card flex flex-col items-center gap-1 p-3 text-xs"
          >
            <Phone className="size-5 text-primary" />
            Call
          </a>
          <a
            href={customer?.phone && customer.twilio_opt_in ? whatsappLink(customer.phone, fullStatement) : undefined}
            target="_blank"
            rel="noreferrer"
            className={`surface-card flex flex-col items-center gap-1 p-3 text-xs ${!customer?.twilio_opt_in ? "pointer-events-none opacity-50" : ""}`}
          >
            <MessageCircle className="size-5 text-success" />
            WhatsApp
          </a>
          <Button variant="outline"
            onClick={handleTwilioClick}
            disabled={sending || !customer?.twilio_opt_in || !customer?.phone}
            title={!customer?.twilio_opt_in ? "Customer consent required" : "Send WhatsApp via Twilio"}
            className="h-auto min-h-16 flex-col gap-1 text-xs"
          >
            <Send className="size-5 text-primary" />
            Direct send
          </Button>
          <Button variant="outline" className="h-auto min-h-16 flex-col gap-1 text-xs" onClick={() => setStatementOpen(true)}><FileText className="size-5" /> Statement</Button>
        </div>

        <div className="mt-3 flex gap-2">
          <a className={`surface-card flex flex-1 items-center justify-center gap-2 p-3 text-sm ${!customer?.sms_opt_in ? "pointer-events-none opacity-50" : ""}`} href={customer?.phone && customer.sms_opt_in ? `sms:${customer.phone}?body=${encodeURIComponent(statement)}` : undefined} aria-disabled={!customer?.sms_opt_in} title={!customer?.sms_opt_in ? "Customer consent required" : "Open SMS app"}><MessageCircle className="size-4" /> SMS app</a>
          <Button variant="secondary" className="flex-1" onClick={() => void doTwilioSend("sms")} disabled={sending || !customer?.sms_opt_in || !customer?.phone} title={!customer?.sms_opt_in ? "Customer consent required" : "Send via Twilio"}>Twilio SMS</Button>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <Input aria-label="Filter by month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="min-w-0 flex-1" />
          <Button variant="secondary" onClick={() => setReportOpen(true)}>Datewise report</Button>
        </div>
        {month && <Button variant="ghost" size="sm" onClick={() => setMonth("")}>All months</Button>}

        <ul className="mt-5 space-y-3">
          {visibleEntries.map((txn) => (
            <li key={txn.id} className="fade-up surface-card flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{formatDate(txn.txn_date)}</p>
                <p
                   className={`text-lg font-semibold ${txn.type === "take" ? "text-destructive" : "text-success"}`}
                >
                  {txn.type === "take" ? "+" : "−"} {formatMoney(Number(txn.amount))}
                </p>
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  {txn.type === "take" ? "Take (credit given)" : "Paid (payment / advance)"}
                </p>
                {txn.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {txn.description}
                  </p>
                ) : null}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPendingDelete(txn)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>

        {!txnsQuery.isLoading && visibleEntries.length === 0 ? (
          <div className="surface-card mt-6 p-8 text-center text-sm text-muted-foreground">
            No entries for this month. Use Take or Paid below to add one.
          </div>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="app-shell grid grid-cols-2 gap-3 px-5 py-4">
           <Button
             className="h-14 bg-success text-base text-success-foreground hover:bg-success/90"
            onClick={() => setEntryType("give")}
          >
             Paid
          </Button>
           <Button variant="destructive" className="h-14 text-base" onClick={() => setEntryType("take")}>
             Take
          </Button>
        </div>
      </div>

      <Dialog open={entryType !== null} onOpenChange={(open) => (!open ? setEntryType(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {entryType === "give" ? "Paid entry (payment / advance)" : "Take entry (credit given)"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Items / description</Label>
              <Textarea
                id="desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={"2 x Thali\n1 x Lassi"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => addEntry.mutate()}
              disabled={addEntry.isPending}
            >
              Save entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cooldownOpen} onOpenChange={setCooldownOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reminder already sent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You messaged this customer less than 10 minutes ago and nothing has changed in their
            ledger since. Sending again may annoy them.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="secondary" onClick={() => setCooldownOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setCooldownOpen(false);
                void doTwilioSend();
              }}
            >
              Send anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto"><DialogHeader><DialogTitle>Full statement</DialogTitle></DialogHeader>
          <pre className="whitespace-pre-wrap break-words text-sm leading-6">{fullStatement}</pre>
          <DialogFooter><Button variant="secondary" onClick={() => navigator.clipboard.writeText(fullStatement).then(() => toast.success("Statement copied"))}>Copy statement</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto"><DialogHeader><DialogTitle>Datewise report {month && `· ${month}`}</DialogTitle></DialogHeader>
           <div className="flex justify-between text-sm"><span className="text-destructive">Take: {formatMoney(reportTake)}</span><span className="text-success">Paid: {formatMoney(reportPaid)}</span></div>
           <DatewiseEntries entries={reportEntries} />
          {!reportEntries.length && <p className="text-sm text-muted-foreground">No entries in this period.</p>}
        </DialogContent>
      </Dialog>

      <PinGate
        open={Boolean(pendingDelete)}
        description="Enter the master PIN to delete this ledger entry."
        expectedPin={profileQuery.data?.master_pin ?? "admin"}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteEntry.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
