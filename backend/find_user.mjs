import { createClient } from "@supabase/supabase-js";

const whatsappUrl = "https://uklxlappjcuvdqjvecfh.supabase.co";
const whatsappKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrbHhsYXBwamN1dmRxanZlY2ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODE0NzA4MywiZXhwIjoyMDgzNzIzMDgzfQ.8raDYx4BqeVELD691E720qBORhWEI4L68c_ED2JIt5w";

const wa = createClient(whatsappUrl, whatsappKey);

async function findUserOrg() {
  console.log("=== Finding getaipilot user in WhatsApp Hub ===");
  const { data: users, error: uErr } = await wa.auth.admin.listUsers();
  const targetUser = (users?.users || []).find((u) => u.email?.includes("getaipilot"));
  console.log("Found User:", targetUser?.id, targetUser?.email);

  if (targetUser) {
    const { data: mems } = await wa
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", targetUser.id);
    console.log("User Organization Memberships:", mems);

    if (mems && mems.length > 0) {
      for (const m of mems) {
        const { data: tpls } = await wa
          .from("w_template_submissions")
          .select("id, name, status, category, language")
          .eq("organization_id", m.organization_id);
        console.log(`Templates for org ${m.organization_id}:`, tpls);

        const { data: accounts } = await wa
          .from("w_wa_accounts")
          .select("*")
          .eq("organization_id", m.organization_id);
        console.log(`WhatsApp Accounts for org ${m.organization_id}:`, accounts);
      }
    }
  }

  // Also check organization ee54ef4c-8541-4271-ac2e-791a35ed8886 which had 20+ templates
  const { data: eeOrg } = await wa.from("organizations").select("*").eq("id", "ee54ef4c-8541-4271-ac2e-791a35ed8886");
  console.log("\nOrg ee54ef4c-8541-4271-ac2e-791a35ed8886 details:", eeOrg);

  const { data: eeMems } = await wa.from("organization_members").select("*").eq("organization_id", "ee54ef4c-8541-4271-ac2e-791a35ed8886");
  console.log("Members of ee54ef4c-8541-4271-ac2e-791a35ed8886:", eeMems);
}

findUserOrg();
