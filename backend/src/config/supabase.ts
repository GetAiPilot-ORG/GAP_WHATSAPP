import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const SUPABASE_KEY_ROLE = process.env.SUPABASE_KEY_ROLE;
export const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'wa-media';

export let supabase: any;

try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.log("❌ MISSING KEYS, SKIPPING SUPABASE (DEBUG MODE)");
    } else {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        console.log("✅ Supabase client created");
        ensureMediaBucket().catch(() => undefined);
    }
} catch (err) {
    console.log("❌ Failed to create Supabase client:", err);
}

export async function ensureMediaBucket() {
    if (!supabase) return;

    if (SUPABASE_KEY_ROLE && SUPABASE_KEY_ROLE !== 'service_role') {
        console.warn(
            `⚠️ Supabase Storage bucket auto-create skipped (KEY_ROLE=${SUPABASE_KEY_ROLE}). ` +
            `Fix: set SUPABASE_SERVICE_ROLE_KEY to your project's Service Role key (server-side only), ` +
            `or create the bucket '${MEDIA_BUCKET}' manually in Supabase Dashboard.`
        );
        return;
    }

    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const exists = Array.isArray(buckets) && buckets.some((b: any) => b?.name === MEDIA_BUCKET);
        if (exists) return;
        const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
        if (error) console.warn('⚠️ Failed to create media bucket:', error.message);
        else console.log(`✅ Created Supabase storage bucket: ${MEDIA_BUCKET}`);
    } catch (err) {
        console.warn('⚠️ ensureMediaBucket failed:', err);
    }
}
