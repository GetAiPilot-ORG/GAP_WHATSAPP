import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
dotenv.config({ path: '../../bot-dashboard/getaipilot.online/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('crm_contacts').update({status: 'lead'}).in('status', ['prospect', 'churned']);
  console.log("Reset complete:", data, error);
}

check();
