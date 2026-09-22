const SUPABASE_URL = 'https://ygjwtgrzufimpmyelofd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6bfXSQpvLXiq4T7W-FyTiw_4TlJ652y';

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);