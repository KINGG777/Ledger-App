import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpenCheck, Loader2, MailCheck } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: z.object({ verify: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Ledger & Credit Management" },
      {
        name: "description",
        content: "Sign in or create your shop account to manage customer credit and payments.",
      },
      { property: "og:title", content: "Sign in — Ledger & Credit Management" },
      {
        property: "og:description",
        content: "Secure shop accounts with verified email, private to each owner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const signupSchema = z.object({
  ownerName: z.string().trim().min(2, "Enter the owner name").max(80),
  shopName: z.string().trim().min(2, "Enter your shop name").max(80),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

const verificationReturnUrl = "https://pinu.lovable.app/auth";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [ownerName, setOwnerName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVerify, setPendingVerify] = useState(Boolean(search.verify));
  const [forgotOpen, setForgotOpen] = useState(false);
  const [existingOpen, setExistingOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user?.email_confirmed_at) navigate({ to: "/customers", replace: true });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "SIGNED_IN" && session?.user.email_confirmed_at) {
        navigate({ to: "/customers", replace: true });
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signupSchema.safeParse({ ownerName, shopName, email, password });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: verificationReturnUrl,
            data: { owner_name: parsed.data.ownerName, shop_name: parsed.data.shopName },
          },
        });
        if (error) {
          if (/already registered|already exists|user already/i.test(error.message)) setExistingOpen(true);
          else toast.error(error.message);
          return;
        }
        // Some auth configurations return a disguised account instead of an explicit duplicate error.
        if (data.user?.identities?.length === 0) {
          setExistingOpen(true);
          return;
        }
        await supabase.auth.signOut();
        setPendingVerify(true);
        toast.success("Account created. Please verify your email to continue.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        if (!data.user?.email_confirmed_at) {
          await supabase.auth.signOut();
          setPendingVerify(true);
          toast.error("Please verify your email before signing in.");
          return;
        }
        navigate({ to: "/customers", replace: true });
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: verificationReturnUrl },
    });
    if (error) toast.error(error.message);
    else toast.success("Verification email sent again.");
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast.error("Enter your email first"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) { toast.error(error.message); return; }
      setForgotOpen(false);
      toast.success("If this email has an account, a password reset link is on its way.");
    } finally { setLoading(false); }
  }

  if (pendingVerify) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="fade-up surface-card app-shell max-w-sm p-7 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15">
            <MailCheck className="size-7 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Verify your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to your inbox. Click it, then come back and sign in.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={resendVerification} variant="secondary">
              Resend email
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingVerify(false);
                setMode("login");
              }}
            >
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-5 py-10">
      <div className="app-shell max-w-sm">
        <div className="fade-up text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15">
            <BookOpenCheck className="size-7 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Ledger Management</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Credit book for your shop
          </p>
        </div>

        <div className="fade-up surface-card mt-7 p-6">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
            {(["login", "signup"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-full py-2 text-sm font-medium transition-colors ${
                  mode === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {value === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ownerName">Owner name</Label>
                  <Input
                    id="ownerName"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Ramesh Kumar"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shopName">Shop name</Label>
                  <Input
                    id="shopName"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="Sri Balaji Hotel"
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {mode === "login" && <Button variant="link" className="mt-3 w-full" onClick={() => setForgotOpen(true)}>Forgot password?</Button>}
        </div>
      </div>
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset your login password</DialogTitle></DialogHeader>
          <form onSubmit={requestReset} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <DialogFooter><Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={existingOpen} onOpenChange={setExistingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Account already exists</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This email already has an account. Log in with your email instead.</p>
          <DialogFooter><Button className="w-full" onClick={() => { setExistingOpen(false); setMode("login"); }}>Go to login</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
