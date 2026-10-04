import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Database,
  Download,
  KeyRound,
  LogOut,
  MessageSquare,
  Palette,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, SUPER_ADMIN_EMAIL } from "@/lib/ledger";
import { appearanceOptions, applyAppearance, readAppearance, type Appearance } from "@/lib/appearance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Ledger Management" },
      { name: "description", content: "Master PIN, WhatsApp sending and ledger backups." },
      { property: "og:title", content: "Settings — Ledger Management" },
      { property: "og:description", content: "Manage security, WhatsApp and your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const profile = profileQuery.data;

  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [loginPasswordOpen, setLoginPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newLoginPassword, setNewLoginPassword] = useState("");
  const [confirmLoginPassword, setConfirmLoginPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [twilioOpen, setTwilioOpen] = useState(false);
  const [twilioSaving, setTwilioSaving] = useState(false);
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");
  const [smsPhone, setSmsPhone] = useState("");
  const [appearance, setAppearance] = useState<Appearance>("emerald");

  useEffect(() => setAppearance(readAppearance()), []);

  useEffect(() => {
    if (profile) {
      setSid(profile.twilio_account_sid ?? "");
      setToken(profile.twilio_auth_token ?? "");
      setTwilioPhone(profile.twilio_phone_number ?? "");
      setSmsPhone(profile.twilio_sms_number ?? "");
    }
  }, [profile]);

  async function savePin() {
    if (!profile) return;
    if (oldPin !== profile.master_pin) { toast.error("Old PIN is incorrect"); return; }
    if (newPin.trim().length < 3) { toast.error("New PIN must be at least 3 characters"); return; }
    if (newPin !== confirmPin) { toast.error("New PIN and confirmation do not match"); return; }
    const { error } = await supabase
      .from("profiles")
      .update({ master_pin: newPin.trim() })
      .eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    setOldPin("");
    setNewPin("");
    setConfirmPin("");
    setPinOpen(false);
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Master PIN updated");
  }

  async function saveLoginPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newLoginPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (newLoginPassword !== confirmLoginPassword) { toast.error("Passwords do not match"); return; }
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newLoginPassword, current_password: currentPassword });
      if (error) { toast.error(error.message); return; }
      setCurrentPassword("");
      setNewLoginPassword("");
      setConfirmLoginPassword("");
      setLoginPasswordOpen(false);
      toast.success("Login password updated");
    } finally { setPasswordSaving(false); }
  }

  async function saveTwilio() {
    if (!profile) return;
    setTwilioSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        twilio_account_sid: sid.trim() || null,
        twilio_auth_token: token.trim() || null,
        twilio_phone_number: twilioPhone.trim() || null,
        twilio_sms_number: smsPhone.trim() || null,
      })
      .eq("id", profile.id);
    setTwilioSaving(false);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    setTwilioOpen(false);
    toast.success("Messaging details saved");
  }

  async function backup() {
    const [customers, transactions] = await Promise.all([
      supabase.from("customers").select("*"),
      supabase.from("transactions").select("*"),
    ]);
    if (customers.error || transactions.error) {
      { toast.error("Could not build the backup file"); return; }
    }
    const payload = {
      exported_at: new Date().toISOString(),
      shop_name: profile?.shop_name ?? "",
      customers: customers.data,
      transactions: transactions.data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  }

  async function restore(file: File) {
    if (!profile) return;
    const confirmed = window.confirm(
      "Restoring will permanently DELETE all current customers and entries and replace them with the backup file. Continue?",
    );
    if (!confirmed) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        customers?: Record<string, unknown>[];
        transactions?: Record<string, unknown>[];
      };
      if (!Array.isArray(parsed.customers) || !Array.isArray(parsed.transactions)) {
        { toast.error("This file is not a valid ledger backup"); return; }
      }
      await supabase.from("transactions").delete().eq("user_id", profile.id);
      await supabase.from("customers").delete().eq("user_id", profile.id);

      if (parsed.customers.length) {
        const rows = parsed.customers.map((c) => ({ ...c, user_id: profile.id }));
        const { error } = await supabase.from("customers").insert(rows as never);
        if (error) throw error;
      }
      if (parsed.transactions.length) {
        const rows = parsed.transactions.map((t) => ({ ...t, user_id: profile.id }));
        const { error } = await supabase.from("transactions").insert(rows as never);
        if (error) throw error;
      }
      queryClient.invalidateQueries();
      toast.success("Ledger restored from backup");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    }
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="app-shell flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/customers" })}>
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
      </header>

      <main className="app-shell space-y-4 px-5 py-5">
         <section className="border-b border-border pb-5">
           <h2 className="flex items-center gap-2 text-sm font-semibold"><Palette className="size-4 text-primary" /> Appearance</h2>
           <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Choose appearance">
             {appearanceOptions.map((option) => (
               <Button
                 key={option.id}
                 type="button"
                 variant="outline"
                 aria-pressed={appearance === option.id}
                 onClick={() => { setAppearance(option.id); applyAppearance(option.id); }}
                 className={`h-14 justify-start gap-3 px-3 ${appearance === option.id ? "ring-2 ring-primary" : ""}`}
               >
                 <span className="appearance-swatch size-6 shrink-0 rounded-full border border-border" data-preview={option.id} aria-hidden="true" />
                 <span className="truncate">{option.label}</span>
               </Button>
             ))}
           </div>
         </section>
        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4 text-primary" /> Master password
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Required before deleting any customer or entry. Default is "admin".
          </p>
           <Button className="mt-4 w-full" variant="secondary" onClick={() => setPinOpen(true)}>Change master password</Button>
        </section>

         <Dialog open={pinOpen} onOpenChange={setPinOpen}>
           <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Change master password</DialogTitle></DialogHeader>
             <div className="space-y-3">
               <div><Label htmlFor="oldPin">Old password</Label><Input id="oldPin" type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} /></div>
               <div><Label htmlFor="newPin">New password</Label><Input id="newPin" type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} /></div>
               <div><Label htmlFor="confirmPin">Confirm new password</Label><Input id="confirmPin" type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} /></div>
             </div>
             <DialogFooter><Button className="w-full" onClick={savePin}>Save password</Button></DialogFooter>
           </DialogContent>
         </Dialog>

        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-primary" /> Login password</h2>
          <Button className="mt-4 w-full" variant="secondary" onClick={() => setLoginPasswordOpen(true)}>Change login password</Button>
        </section>

        <Dialog open={loginPasswordOpen} onOpenChange={setLoginPasswordOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Change login password</DialogTitle></DialogHeader>
            <form onSubmit={saveLoginPassword} className="space-y-3">
              <div><Label htmlFor="currentPassword">Current login password</Label><Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
              <div><Label htmlFor="newLoginPassword">New login password</Label><Input id="newLoginPassword" type="password" autoComplete="new-password" value={newLoginPassword} onChange={(e) => setNewLoginPassword(e.target.value)} required /></div>
              <div><Label htmlFor="confirmLoginPassword">Confirm new password</Label><Input id="confirmLoginPassword" type="password" autoComplete="new-password" value={confirmLoginPassword} onChange={(e) => setConfirmLoginPassword(e.target.value)} required /></div>
              <DialogFooter><Button type="submit" className="w-full" disabled={passwordSaving}>{passwordSaving ? "Saving…" : "Save login password"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
             <MessageSquare className="size-4 text-primary" /> Twilio messaging settings
          </h2>
          <Button className="mt-4 w-full" variant="secondary" onClick={() => setTwilioOpen(true)}>Set up Twilio</Button>
        </section>

        <Dialog open={twilioOpen} onOpenChange={setTwilioOpen}>
          <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
            <DialogHeader><DialogTitle>Twilio messaging settings</DialogTitle></DialogHeader>
            <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sid">Account SID</Label>
              <Input id="sid" value={sid} onChange={(e) => setSid(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token">Auth token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tphone">Twilio WhatsApp number</Label>
              <Input
                id="tphone"
                value={twilioPhone}
                onChange={(e) => setTwilioPhone(e.target.value)}
                placeholder="+14155238886"
              />
            </div>
            <div className="space-y-1.5"><Label htmlFor="smsPhone">Twilio SMS number</Label><Input id="smsPhone" value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} placeholder="+1234567890" /></div>
          </div>
            <DialogFooter><Button className="w-full" onClick={saveTwilio} disabled={twilioSaving}>{twilioSaving ? "Saving…" : "Save messaging settings"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-primary" /> Data management
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={backup}>
              <Download className="size-4" /> Backup
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Restore
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void restore(file);
                e.target.value = "";
              }}
            />
          </div>
        </section>

        {profile?.email === SUPER_ADMIN_EMAIL ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate({ to: "/admin" })}
          >
            <ShieldCheck className="size-4" /> Super Admin Panel
          </Button>
        ) : null}

        <Button variant="destructive" className="w-full" onClick={signOut}>
          <LogOut className="size-4" /> Log out
        </Button>
      </main>
    </div>
  );
}
