import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PinGate({
  open,
  title = "Master PIN required",
  description,
  expectedPin,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  description: string;
  expectedPin: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function close() {
    setPin("");
    setError("");
    onCancel();
  }

  function submit() {
    if (pin === expectedPin) {
      setPin("");
      setError("");
      onConfirm();
    } else {
      setError("Incorrect PIN. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          autoFocus
          value={pin}
          placeholder="Enter master PIN"
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit}>
            Confirm delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
