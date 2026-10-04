-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name text NOT NULL DEFAULT '',
  shop_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  master_pin text NOT NULL DEFAULT 'admin',
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_phone_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((auth.jwt() ->> 'email') = 'pramod@kingg.in', false);
$$;

CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_super_admin());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- CUSTOMERS
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  last_whatsapp_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_user_id_idx ON public.customers(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own customers select" ON public.customers FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin());
CREATE POLICY "own customers insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own customers update" ON public.customers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own customers delete" ON public.customers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('give','take')),
  txn_date date NOT NULL DEFAULT current_date,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_customer_idx ON public.transactions(customer_id);
CREATE INDEX transactions_user_idx ON public.transactions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own txns select" ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "own txns insert" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own txns delete" ON public.transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, owner_name, shop_name, email)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data ->> 'owner_name', ''),
    coalesce(NEW.raw_user_meta_data ->> 'shop_name', 'My Shop'),
    coalesce(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Super admin overview
CREATE OR REPLACE FUNCTION public.super_admin_shops()
RETURNS TABLE (
  id uuid,
  shop_name text,
  owner_name text,
  email text,
  created_at timestamptz,
  customer_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.shop_name, p.owner_name, p.email, p.created_at,
         (SELECT count(*) FROM public.customers c WHERE c.user_id = p.id) AS customer_count
  FROM public.profiles p
  WHERE public.is_super_admin()
  ORDER BY p.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.super_admin_shops() TO authenticated;