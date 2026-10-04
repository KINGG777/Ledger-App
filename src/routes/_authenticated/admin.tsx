import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/ledger";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Super Admin — Ledger Management" },
      { name: "description", content: "Every shop registered on the platform." },
      { property: "og:title", content: "Super Admin — Ledger Management" },
      { property: "og:description", content: "Platform-wide overview of registered shops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Shop = {
  id: string;
  shop_name: string;
  owner_name: string;
  email: string;
  created_at: string;
  customer_count: number;
};

function AdminPage() {
  const navigate = useNavigate();
  const shopsQuery = useQuery({
    queryKey: ["admin", "shops"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("super_admin_shops");
      if (error) throw error;
      return (data ?? []) as Shop[];
    },
  });

  const shops = shopsQuery.data ?? [];

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="app-shell flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/settings" })}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-base font-semibold">Super Admin</h1>
            <p className="text-xs text-muted-foreground">
              {shops.length} registered {shops.length === 1 ? "shop" : "shops"}
            </p>
          </div>
        </div>
      </header>

      <main className="app-shell space-y-3 px-5 py-5">
        {shops.map((shop) => (
          <article key={shop.id} className="fade-up surface-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <Store className="size-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{shop.shop_name}</p>
                <p className="truncate text-xs text-muted-foreground">{shop.owner_name}</p>
                <p className="truncate text-xs text-muted-foreground">{shop.email}</p>
                <div className="mt-2 flex gap-4 text-xs">
                  <span className="text-primary">{shop.customer_count} customers</span>
                  <span className="text-muted-foreground">
                    Joined {formatDate(shop.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </article>
        ))}

        {!shopsQuery.isLoading && shops.length === 0 ? (
          <p className="surface-card p-8 text-center text-sm text-muted-foreground">
            No shops registered yet.
          </p>
        ) : null}
      </main>
    </div>
  );
}
