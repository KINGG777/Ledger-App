import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  customerId: z.string().uuid(),
  message: z.string().min(1).max(3000),
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
});

export const sendTwilioWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number, twilio_sms_number")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const sid = profile?.twilio_account_sid?.trim();
    const token = profile?.twilio_auth_token?.trim();
    const from = (data.channel === "sms" ? profile?.twilio_sms_number : profile?.twilio_phone_number)?.trim();
    if (!sid || !token || !from) {
      return { ok: false as const, error: "Twilio is not configured for this channel. Add your details in Settings." };
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, phone, sms_opt_in, twilio_opt_in")
      .eq("id", data.customerId)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer) return { ok: false as const, error: "Customer not found." };
    if ((data.channel === "sms" && !customer.sms_opt_in) || (data.channel === "whatsapp" && !customer.twilio_opt_in)) {
      return { ok: false as const, error: "This customer has not opted in to this message channel." };
    }

    const digits = (customer.phone ?? "").replace(/\D/g, "");
    if (digits.length < 10) return { ok: false as const, error: "This customer has no valid phone number." };
    const to = `+${digits.length === 10 ? `91${digits}` : digits}`;
    const fromDigits = from.replace(/\D/g, "");

    const body = new URLSearchParams({
      To: data.channel === "sms" ? to : `whatsapp:${to}`,
      From: data.channel === "sms" ? `+${fromDigits}` : `whatsapp:+${fromDigits}`,
      Body: data.message,
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { message?: string } | null;
      console.error("Twilio send failed", response.status, detail);
      return {
        ok: false as const,
        error: detail?.message ?? "Message could not be sent. Check your Twilio details.",
      };
    }

    if (data.channel === "whatsapp") {
      await supabase.from("customers").update({ last_whatsapp_sent_at: new Date().toISOString() }).eq("id", data.customerId);
    }

    return { ok: true as const };
  });
