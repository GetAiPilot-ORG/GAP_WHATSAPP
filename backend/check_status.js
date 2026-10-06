import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.rpc('get_status_constraint_or_something_idk');
  // Or just insert an invalid status and look at the detail error
  // But wait, it didn't give the allowed values in the detail.
  // Let's just try to read information_schema
  
  // Let's just fetch one record to see its status
  const { data: contacts } = await supabase.from('crm_contacts').select('status').limit(5);
  console.log(contacts);
}

check();
