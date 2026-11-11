import { supabase } from "./config/supabase.js";

async function run() {
  // 1. Fetch organization settings / knowledge base documents
  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, settings");

  if (orgErr) {
    console.error("Error fetching organizations:", orgErr);
    return;
  }

  console.log("--- Organizations Settings ---");
  for (const org of orgs || []) {
    console.log(`Org: ${org.name} (${org.id})`);
    if (org.settings?.knowledge_base_documents) {
      console.log("Knowledge Base Documents:");
      console.log(JSON.stringify(org.settings.knowledge_base_documents, null, 2));
    }
  }

  // 2. Fetch active bot agents system prompt & description
  const { data: agents, error: agentErr } = await supabase
    .from("bot_agents")
    .select("id, name, description, system_prompt, trigger_keywords, knowledge_base_content");

  if (agentErr) {
    console.error("Error fetching bot agents:", agentErr);
    return;
  }

  console.log("\n--- Bot Agents ---");
  for (const agent of agents || []) {
    console.log(`Agent: ${agent.name}`);
    console.log(`Description: ${agent.description}`);
    console.log(`System Prompt: ${agent.system_prompt}`);
    console.log(`Keywords: ${JSON.stringify(agent.trigger_keywords)}`);
    console.log(`KB Content: ${JSON.stringify(agent.knowledge_base_content, null, 2)}`);
    console.log("--------------------------------------");
  }
}

run();
