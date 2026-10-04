import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Reset password — Ledger & Credit Management" },
    { name: "description", content: "Set a new password for your shop account." },
    { property: "og:title", content: "Reset password — Ledger & Credit Management" },
    { property: "og:description", content: "Securely reset your shop account password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    const isRecovery = hash.get("type") === "recovery" || search.get("type") === "recovery" || search.has("code");
    if (!isRecovery) {
      setValid(false);
      return;
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setValid(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active) setValid(Boolean(data.session));
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { toast.error(error.message); return; }
      await supabase.auth.signOut();
      toast.success("Password updated. Sign in with your new password.");
      navigate({ to: "/auth", replace: true });
    } finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="surface-card app-shell max-w-sm p-6">
        <KeyRound className="size-7 text-primary" />
        <h1 className="mt-4 text-xl font-semibold">Reset login password</h1>
        {valid === null ? <p className="mt-4 text-sm text-muted-foreground">Checking your reset link…</p> : valid === false ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">This reset link is invalid or has expired. Request a new link from the sign-in page.</p>
            <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>Back to sign in</Button>
          </div>
        ) : (
          <form onSubmit={updatePassword} className="mt-5 space-y-4">
            <div className="space-y-1.5"><Label htmlFor="reset-new">New password</Label><Input id="reset-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="reset-confirm">Confirm new password</Label><Input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Saving…" : "Set new password"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}