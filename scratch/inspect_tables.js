import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTables() {
  const { data: sessionSample, error: sErr } = await supabase
    .from("w_flow_sessions")
    .select("*")
    .limit(3);
  console.log("w_flow_sessions sample:", JSON.stringify(sessionSample, null, 2), sErr);

  const { data: contactSample, error: cErr } = await supabase
    .from("w_contacts")
    .select("*")
    .limit(3);
  console.log("w_contacts sample:", JSON.stringify(contactSample, null, 2), cErr);

  const { data: convSample, error: convErr } = await supabase
    .from("w_conversations")
    .select("*")
    .limit(3);
  console.log("w_conversations sample:", JSON.stringify(convSample, null, 2), convErr);
}

inspectTables();
