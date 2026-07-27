import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function test() {
  const { data: settings } = await supabase
    .from("openai_settings")
    .select("api_key_encrypted")
    .eq("organization_id", "847e859b-9bd7-4407-93c7-84e6b7a499f2")
    .single();

  const apiKey = settings?.api_key_encrypted || process.env.OPENAI_API_KEY || "";
  console.log("API Key length:", apiKey.length);
  console.log("API Key preview:", apiKey.substring(0, 10));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{role: "user", content: "test"}],
      }),
    });
  console.log(response.status);
  console.log(await response.json());
}
test();
