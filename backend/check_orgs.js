import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
dotenv.config({ path: '../../bot-dashboard/getaipilot.online/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('organizations').select('id, name, plan_id, plan_status');
  console.log("Organizations:", data);
  if (error) console.error("Error:", error);
}

check();
