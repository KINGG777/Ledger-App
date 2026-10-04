import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BookOpenCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ledger & Credit Management — Shop Khata" },
      {
        name: "description",
        content:
          "Mobile-first credit ledger for shops and restaurants. Track who owes you, record daily entries and send WhatsApp reminders.",
      },
      { property: "og:title", content: "Ledger & Credit Management — Shop Khata" },
      {
        property: "og:description",
        content: "Track customer credit, record entries and send WhatsApp reminders in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      navigate({ to: data.user ? "/customers" : "/auth", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="fade-up text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/15">
          <BookOpenCheck className="size-8 text-primary" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Ledger Management</h1>
        <p className="mt-2 text-sm text-muted-foreground">Loading your shop…</p>
      </div>
    </div>
  );
}
