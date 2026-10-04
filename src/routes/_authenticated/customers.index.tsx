import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, CalendarIcon, Eye, EyeOff, FileText, Pencil, Plus, Search, Settings, Trash2, Users, ListPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllTransactions,
  fetchCustomers,
  fetchProfile,
  balanceTone,
  formatMoney,
  netBalance,
  type Customer,
} from "@/lib/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PinGate } from "@/components/PinGate";
import { DatewiseEntries } from "@/components/DatewiseEntries";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BatchRow = { id: number; customerId: string; amount: string };

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Ledger Management" },
      { name: "description", content: "All your credit customers and their running balances." },
      { property: "og:title", content: "Customers — Ledger Management" },
      { property: "og:description", content: "See who owes you and who has an advance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [masked, setMasked] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [twilioOptIn, setTwilioOptIn] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDate, setBatchDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [batchRows, setBatchRows] = useState<BatchRow[]>([{ id: 1, customerId: "", amount: "" }]);
  const [nextBatchId, setNextBatchId] = useState(2);
  const [batchSaving, setBatchSaving] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "az" | "credit">("recent");

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const txnsQuery = useQuery({ queryKey: ["transactions", "all"], queryFn: fetchAllTransactions });

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txnsQuery.data ?? []) {
      map.set(t.customer_id, (map.get(t.customer_id) ?? 0) + (t.type === "take" ? Number(t.amount) : -Number(t.amount)));
    }
    return map;
  }, [txnsQuery.data]);

  const total = useMemo(() => netBalance(txnsQuery.data ?? []), [txnsQuery.data]);

  const recentEntries = useMemo(() => {
    const map = new Map<string, number>();
    for (const txn of txnsQuery.data ?? []) map.set(txn.customer_id, Math.max(map.get(txn.customer_id) ?? 0, new Date(txn.created_at).getTime()));
    return map;
  }, [txnsQuery.data]);

  const customersAtoZ = useMemo(
    () => [...(customersQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [customersQuery.data],
  );

  const filtered = useMemo(() => {
    const list = (customersQuery.data ?? []).filter((c) =>
      c.name.toLowerCase().includes(search.trim().toLowerCase()),
    );
    if (sortMode === "az") return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    if (sortMode === "credit") return list.sort((a, b) => (balances.get(b.id) ?? 0) - (balances.get(a.id) ?? 0));
    return list.sort((a, b) => (recentEntries.get(b.id) ?? new Date(b.created_at).getTime()) - (recentEntries.get(a.id) ?? new Date(a.created_at).getTime()));
  }, [customersQuery.data, search, sortMode, balances, recentEntries]);
  const reportEntries = (txnsQuery.data ?? []).filter((txn) => !reportMonth || txn.txn_date.startsWith(reportMonth))
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date) || b.created_at.localeCompare(a.created_at));
  const reportTotals = reportEntries.reduce((sum, txn) => {
    sum[txn.type] += Number(txn.amount);
    return sum;
  }, { take: 0, give: 0 });
  const customerNames = new Map((customersQuery.data ?? []).map((customer) => [customer.id, customer.name]));

  const saveCustomer = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new Error("Enter a customer name");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      if (editing) {
        const { error } = await supabase
          .from("customers")
          .update({ name: trimmed, phone: phone.trim(), address: address.trim(), sms_opt_in: smsOptIn, twilio_opt_in: twilioOptIn })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert({
          user_id: userData.user.id,
          name: trimmed,
          phone: phone.trim(),
          address: address.trim(),
          sms_opt_in: smsOptIn,
          twilio_opt_in: twilioOptIn,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setFormOpen(false);
      toast.success(editing ? "Customer updated" : "Customer added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["transactions", "all"] });
      toast.success("Customer deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openAdd() {
    setEditing(null);
    setName("");
    setPhone("");
    setAddress("");
    setSmsOptIn(false);
    setTwilioOptIn(false);
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setSmsOptIn(customer.sms_opt_in);
    setTwilioOptIn(customer.twilio_opt_in);
    setFormOpen(true);
  }

  async function saveBatch() {
    if (!batchRows.length) { toast.error("Add at least one entry"); return; }
    if (!batchDate) { toast.error("Choose a date"); return; }
    if (batchRows.some((row) => !row.customerId)) { toast.error("Select a customer for each entry"); return; }
    if (batchRows.some((row) => !row.amount.trim() || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0)) {
      toast.error("All amounts must be greater than zero"); return;
    }
    setBatchSaving(true);
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error("Not signed in");
      const validCustomers = new Set((customersQuery.data ?? []).map((customer) => customer.id));
      if (batchRows.some((row) => !validCustomers.has(row.customerId))) throw new Error("Customer list changed. Please reopen Batch Add.");
      const { error } = await supabase.from("transactions").insert(batchRows.map((row) => ({
        user_id: userData.user.id,
        customer_id: row.customerId,
        amount: Number(row.amount),
        type: "take",
        txn_date: batchDate,
        description: "",
      })));
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setBatchRows([{ id: nextBatchId, customerId: "", amount: "" }]);
      setNextBatchId((id) => id + 1);
      setBatchOpen(false);
      toast.success(`${batchRows.length} ${batchRows.length === 1 ? "Take entry" : "Take entries"} added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add entries");
    } finally {
      setBatchSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="app-shell flex items-center justify-between px-5 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {profileQuery.data?.shop_name || "My Shop"}
            </h1>
            <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
              Ledger Management
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/settings" })}>
            <Settings className="size-5" />
          </Button>
        </div>
      </header>

      <main className="app-shell px-5">
        <section className="hero-gradient fade-up mt-5 rounded-3xl border border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Total outstanding market credit
            </p>
            <Button
              variant="ghost" size="icon"
              onClick={() => setMasked((m) => !m)}
              className="rounded-full bg-background/40 p-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={masked ? "Show total" : "Hide total"}
            >
              {masked ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <p
             className={`mt-3 text-3xl font-semibold ${total < 0 ? "text-success" : "text-primary"}`}
          >
            {masked ? "*****" : formatMoney(total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {total >= 0 ? "To collect from customers" : "Advance held from customers"}
          </p>
        </section>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer by name"
            className="pl-9"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" />
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as "recent" | "az" | "credit")}>
            <SelectTrigger className="h-9 flex-1" aria-label="Sort customers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Last modified</SelectItem>
              <SelectItem value="az">A to Z</SelectItem>
              <SelectItem value="credit">Highest credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" className="min-w-0 px-2 text-xs sm:text-sm" onClick={() => setBatchOpen(true)}><ListPlus className="size-4 shrink-0" /> Batch Add</Button>
          <Button variant="secondary" className="min-w-0 px-2 text-xs sm:text-sm" onClick={() => setReportOpen(true)}><FileText className="size-4 shrink-0" /> Datewise Report</Button>
        </div>

        <ul className="mt-4 space-y-3">
          {filtered.map((customer) => {
            const balance = balances.get(customer.id) ?? 0;
            return (
              <li key={customer.id} className="fade-up surface-card">
                <div className="flex items-center gap-3 p-4">
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: customer.id }}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate font-medium">{customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {customer.phone || "No phone"}
                    </p>
                  </Link>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${balanceTone(balance)}`}
                    >
                      {masked ? "*****" : formatMoney(balance)}
                    </p>
                    <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      {balance < 0 ? "Advance" : balance === 0 ? "Settled" : "To pay"}
                    </p>
                  </div>
                  {editMode ? (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(customer)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(customer)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {!customersQuery.isLoading && filtered.length === 0 ? (
          <div className="surface-card mt-6 p-8 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No customers yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the + button to add your first credit customer.
            </p>
          </div>
        ) : null}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30">
        <div className="app-shell flex justify-end gap-3 px-5">
          <Button
            variant={editMode ? "default" : "secondary"}
            size="icon"
            className="pointer-events-auto size-12 rounded-full shadow-lg"
            onClick={() => setEditMode((m) => !m)}
            aria-label="Toggle edit mode"
          >
            <Pencil className="size-5" />
          </Button>
          <Button
            size="icon"
            className="pointer-events-auto size-16 rounded-full shadow-xl"
            onClick={openAdd}
            aria-label="Add customer"
          >
            <Plus className="size-7" />
          </Button>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone number</Label>
              <Input
                id="c-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-address">Address</Label>
              <Textarea
                id="c-address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} /> Customer agreed to SMS (app and Twilio)</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={twilioOptIn} onChange={(e) => setTwilioOptIn(e.target.checked)} /> Customer agreed to WhatsApp (app and Twilio)</label>
          </div>
          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => saveCustomer.mutate()}
              disabled={saveCustomer.isPending}
            >
              {editing ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>Datewise report</DialogTitle></DialogHeader>
          <div className="flex items-center gap-2"><Input aria-label="Report month" type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />{reportMonth && <Button variant="ghost" onClick={() => setReportMonth("")}>All</Button>}</div>
           <div className="flex justify-between text-sm"><span className="text-destructive">Take: {formatMoney(reportTotals.take)}</span><span className="text-success">Paid: {formatMoney(reportTotals.give)}</span></div>
           <DatewiseEntries entries={reportEntries} customerNames={customerNames} />
          {!txnsQuery.isLoading && !reportEntries.length && <p className="text-sm text-muted-foreground">No entries in this period.</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Batch Add</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Date</Label>
            <Popover modal>
              <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start font-normal"><CalendarIcon className="size-4" /> {format(parseISO(batchDate), "dd/MM/yyyy")}</Button></PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={parseISO(batchDate)} onSelect={(day) => day && setBatchDate(format(day, "yyyy-MM-dd"))} disabled={{ after: new Date() }} initialFocus className="pointer-events-auto p-3" /></PopoverContent>
            </Popover>
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            {batchRows.map((row, index) => <div key={row.id} className="space-y-2 border-b border-border pb-3">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">Entry #{index + 1}</p><Button variant="ghost" size="sm" aria-label={`Remove entry ${index + 1}`} onClick={() => setBatchRows((rows) => rows.filter((item) => item.id !== row.id))}><X className="size-4" /> Remove</Button></div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <Select value={row.customerId} onValueChange={(customerId) => setBatchRows((rows) => rows.map((item) => item.id === row.id ? { ...item, customerId } : item))}>
                  <SelectTrigger className="min-w-0" aria-label={`Customer for entry ${index + 1}`}><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customersAtoZ.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min="0.01" step="any" inputMode="decimal" placeholder="Amount (₹)" aria-label={`Amount for entry ${index + 1}`} className="min-w-0" value={row.amount} onChange={(e) => setBatchRows((rows) => rows.map((item) => item.id === row.id ? { ...item, amount: e.target.value } : item))} />
              </div>
            </div>)}
            {!customersQuery.isLoading && !customersQuery.data?.length && <p className="text-sm text-muted-foreground">Add a customer first.</p>}
          </div>
          <Button variant="secondary" className="w-full shrink-0" onClick={() => { setBatchRows((rows) => [...rows, { id: nextBatchId, customerId: "", amount: "" }]); setNextBatchId((id) => id + 1); }} disabled={!customersQuery.data?.length}><Plus className="size-4" /> Add Another Customer</Button>
          <DialogFooter className="flex-row gap-2 sm:justify-stretch"><Button className="flex-1" onClick={() => void saveBatch()} disabled={batchSaving || !customersQuery.data?.length}>{batchSaving ? "Saving…" : "Save All"}</Button><Button variant="secondary" className="flex-1" onClick={() => setBatchOpen(false)} disabled={batchSaving}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <PinGate
        open={Boolean(pendingDelete)}
        description={`Enter the master PIN to delete ${pendingDelete?.name ?? ""} and all their entries.`}
        expectedPin={profileQuery.data?.master_pin ?? "admin"}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteCustomer.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
