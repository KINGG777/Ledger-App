import { formatDate, formatMoney, type Transaction } from "@/lib/ledger";

type Props = {
  entries: Transaction[];
  customerNames?: Map<string, string>;
};

export function DatewiseEntries({ entries, customerNames }: Props) {
  const groups = new Map<string, Transaction[]>();
  for (const entry of entries) {
    const group = groups.get(entry.txn_date) ?? [];
    group.push(entry);
    groups.set(entry.txn_date, group);
  }

  return (
    <div className="space-y-5">
      {Array.from(groups, ([date, rows]) => (
        <section key={date} aria-label={formatDate(date)}>
          <h3 className="sticky top-0 border-b border-border bg-popover py-2 text-sm font-semibold text-foreground">
            {formatDate(date)}
          </h3>
          <div className="divide-y divide-border">
            {rows.map((txn) => (
              <div key={txn.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  {customerNames && <p className="font-medium">{customerNames.get(txn.customer_id) ?? "Customer"}</p>}
                  <p className={txn.type === "take" ? "text-destructive" : "text-success"}>
                    {txn.type === "take" ? "Take" : "Paid"}
                  </p>
                  {txn.description && <p className="whitespace-pre-wrap text-muted-foreground">{txn.description}</p>}
                </div>
                <strong className={`shrink-0 ${txn.type === "take" ? "text-destructive" : "text-success"}`}>
                  {formatMoney(Number(txn.amount))}
                </strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}