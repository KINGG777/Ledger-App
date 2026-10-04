ALTER TABLE public.customers ADD COLUMN sms_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.customers ADD COLUMN twilio_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN twilio_sms_number text;