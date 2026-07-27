const fs = require('fs');

const raw = fs.readFileSync('extract_agents.ts', 'utf8');

// I'll parse it slightly. Let's just create the controller manually.
let controllerCode = `import { Response } from 'express';
import { supabase } from '../config/supabase.js';

export const getAgents = async (req: any, res: Response) => {
  const organization_id = req.organization_id;
  try {
    let query = supabase
      .from("bot_agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    const { data, error } = await query;
    if (error) {
      if (
        error.message?.includes("relation") &&
        error.message?.includes("does not exist")
      ) {
        return res.status(500).json({
          error:
            'Database table "bot_agents" not found. Please run the migration: supabase/migrations/20260127100000_add_bot_agents_and_conversation_bot_settings.sql',
        });
      }
      throw error;
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch agents" });
  }
};

export const createAgent = async (req: any, res: Response) => {
  const organization_id = req.organization_id;
  try {
    const {
      name,
      prompt,
      model,
      temperature,
      is_active,
      handoff_message,
      timezone,
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Agent name is required" });
    }

    const { data, error } = await supabase
      .from("bot_agents")
      .insert({
        organization_id,
        name,
        prompt: prompt || "",
        model: model || "gpt-3.5-turbo",
        temperature: temperature ?? 0.7,
        is_active: is_active ?? true,
        handoff_message: handoff_message || "",
        timezone: timezone || "UTC",
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create agent" });
  }
};

export const updateAgent = async (req: any, res: Response) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    
    const { data, error } = await supabase
      .from("bot_agents")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organization_id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Agent not found" });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update agent" });
  }
};

export const deleteAgent = async (req: any, res: Response) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    const { error } = await supabase
      .from("bot_agents")
      .delete()
      .eq("id", id)
      .eq("organization_id", organization_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete agent" });
  }
};

export const updateConversationBot = async (req: any, res: Response) => {
    const { id } = req.params;
    const organization_id = req.organization_id;
  
    try {
      const { bot_active, bot_agent_id } = req.body;
      const updates: any = {};
      
      if (bot_active !== undefined) updates.bot_active = bot_active;
      if (bot_agent_id !== undefined) updates.bot_agent_id = bot_agent_id;
  
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
  
      const { data, error } = await supabase
        .from("w_conversations")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", organization_id)
        .select()
        .single();
  
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Conversation not found" });
  
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update bot settings" });
    }
};
`;

fs.writeFileSync('src/controllers/agents.controller.ts', controllerCode);

let routesCode = `import { Router } from 'express';
import { getAgents, createAgent, updateAgent, deleteAgent } from '../controllers/agents.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authMiddleware, getAgents);
router.post('/', authMiddleware, createAgent);
router.patch('/:id', authMiddleware, updateAgent);
router.delete('/:id', authMiddleware, deleteAgent);

export default router;
`;

fs.writeFileSync('src/routes/agents.routes.ts', routesCode);

console.log('agents.controller.ts and agents.routes.ts created');
