-- Updated Seeding Script for GAP public.pricing_plans table
-- Outdated 'whatsapp_premium' has been removed and replaced with the actual WhatsApp plans from the billing page.

INSERT INTO "public"."pricing_plans" (
  "id", "plan_name", "currency", "amount", "duration", "is_active", 
  "created_at", "updated_at", "plan_label", "category", "description", 
  "features", "color", "icon", "is_popular", "razorpay_plan_id"
) VALUES 
-- All-in-One Plans
('16e91d24-8632-44ee-824b-2f25b2ac6929', 'all_in_one_bundle_half_yearly', 'INR', 2399400, '6_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'GAP Max', 'all-in-one', 'The complete automation engine for your business', '["Telegram Automation","GAP CRM (15 Users Included)","Social Pilot Access","WhatsApp Pro Plan","Calling Agent Starter"]', 'purple', 'crown', true, null), 
('26e67259-c734-49de-ae9d-2c4c23aee1ad', 'all_in_one_bundle_monthly', 'INR', 499900, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'GAP Core', 'all-in-one', 'The complete automation engine for your business', '["Telegram Automation","GAP CRM (15 Users Included)","Social Pilot Access","WhatsApp Pro Plan","Calling Agent Starter"]', 'purple', 'crown', false, '{"live":"plan_Sx3X0944Dy2UO8"}'), 
('69aa5c44-aeb5-4ba9-ab09-d34464c37019', 'all_in_one_bundle_quarterly', 'INR', 1349700, '3_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'GAP Pro', 'all-in-one', 'The complete automation engine for your business', '["Telegram Automation","GAP CRM (15 Users Included)","Social Pilot Access","WhatsApp Pro Plan","Calling Agent Starter"]', 'purple', 'crown', false, 'plan_StzTZULYXdH4iY'),

-- Calling Plans
('33e486c3-f224-4b9b-b759-9f5503a01529', 'calling_ppm', 'INR', 0, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'Pay-per-minute', 'calling', 'Flexible usage', '["Zero Upfront Fees","Only Pay for Talk Time","Basic Support"]', 'amber', 'zap', false, null), 
('402e305c-220f-44e0-95a5-f87854a87c79', 'calling_enterprise', 'INR', 0, '6_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'Call Elite', 'calling', 'High volume automation', '["Dedicated Server","Custom Workflow Triggers","Whitelabel Interface","Account Manager"]', 'emerald', 'crown', false, null), 
('f82c90e1-158c-4508-bdec-aeca6fdecf42', 'calling_starter', 'INR', 0, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'Call Lite', 'calling', 'Testing / small leads', '["Custom AI Voice","Outbound Campaign Setup","Basic Lead Gen","Email Reporting"]', 'blue', 'phone', false, null), 
('f8f26a79-5a14-49b4-9e23-1e737039c5bc', 'calling_growth', 'INR', 0, '3_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'Call Pro', 'calling', 'Sales + marketing', '["Advanced AI Personalization","Live Call Transfers","CRM Auto-Updating","Real-time Dashboard"]', 'purple', 'award', true, null),

-- Telegram Plans
('741c3ac9-5c53-4e67-939d-32495f14ff00', 'telegram_half_yearly', 'INR', 479400, '6_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'TG Max', 'telegram', 'Full Telegram Automation', '["Priority High-Speed Servers","Unlimited Automated Forwards","Advanced Audience Analytics","Whitelabel Dashboard Access","Priority WhatsApp Support"]', 'emerald', 'zap', true, null), 
('8e0c3692-36d6-46c1-be53-1ef2df17b3e6', 'telegram_quarterly', 'INR', 269700, '3_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'TG Pro', 'telegram', 'Full Telegram Automation', '["Priority High-Speed Servers","Unlimited Automated Forwards","Advanced Audience Analytics","Whitelabel Dashboard Access","Priority WhatsApp Support"]', 'emerald', 'zap', false, 'plan_StxrpiHWcgWD3O'), 
('9cae7afb-73e7-4e13-b41f-ae05a20c2dbf', 'telegram_monthly', 'INR', 99900, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'TG Lite', 'telegram', 'Full Telegram Automation', '["Priority High-Speed Servers","Unlimited Automated Forwards","Advanced Audience Analytics","Whitelabel Dashboard Access","Priority WhatsApp Support"]', 'emerald', 'zap', false, 'plan_StyqlqVWQeZl98'),

-- Social Pilot Plans
('914f6481-8a50-4a0d-a750-fdedd1194fd5', 'social_pilot_half_yearly', 'INR', 479400, '6_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'SMax', 'social', 'Schedule & auto-publish across social platforms', '["Auto-Post to Facebook, Instagram & LinkedIn","Unlimited Post Scheduling","AI Caption Generator","Smart Hashtag Suggestions","Multi-Account Management","WhatsApp Support"]', 'amber', 'globe', true, 'plan_SvpMhj19igI7Hk'), 
('cb719495-5f0e-4c81-a32d-9d11d998bc21', 'social_pilot_starter', 'INR', 99900, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'SLite', 'social', 'Schedule & auto-publish across social platforms', '["Auto-Post to Facebook, Instagram & LinkedIn","Unlimited Post Scheduling","AI Caption Generator","Smart Hashtag Suggestions","Multi-Account Management","WhatsApp Support"]', 'amber', 'globe', false, 'plan_SwIlOb0ufTl6iG'), 
('e6936254-a69a-42b0-b32d-1256a7413f19', 'social_pilot_quarterly', 'INR', 269700, '3_month', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'SPro', 'social', 'Schedule & auto-publish across social platforms', '["Auto-Post to Facebook, Instagram & LinkedIn","Unlimited Post Scheduling","AI Caption Generator","Smart Hashtag Suggestions","Multi-Account Management","WhatsApp Support"]', 'amber', 'globe', false, null),

-- CRM Plans
('c3433aef-0abf-4ad8-a2b9-4c1b5f8c51e2', 'crm_standard', 'INR', 0, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'CRM Lite', 'custom-crm', 'Up to 5 active users included for free. Extra users @ ₹9/day', '["5 Users Included Free","Additional Users @ ₹9/day","Lead Management","Sales Pipeline","WhatsApp Integration","Basic Analytics"]', 'blue', 'zap', false, null),

-- NEW WhatsApp Plans
('a642e61c-8e4d-44a3-aa6a-e27efb99e71e', 'whatsapp_starter_monthly', 'INR', 99900, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'WA Starter', 'whatsapp', 'Simple WhatsApp workspace for small shops and service businesses.', '["1 WhatsApp number","1,000 contacts","5 automation flows","Manual broadcasts","Basic bot replies"]', 'blue', 'zap', false, null),
('2a9b3a37-0cfc-4bf0-a5c9-1c9f0a20e8b2', 'whatsapp_starter_yearly', 'INR', 999000, 'yearly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'WA Starter', 'whatsapp', 'Simple WhatsApp workspace for small shops and service businesses.', '["1 WhatsApp number","1,000 contacts","5 automation flows","Manual broadcasts","Basic bot replies"]', 'blue', 'zap', false, null),
('3bdfa67b-1cb2-4752-b5e1-5db0d603e5c9', 'whatsapp_growth_monthly', 'INR', 199900, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'WA Growth', 'whatsapp', 'Best plan for growing teams running campaigns and customer support.', '["10,000 contacts","5 agents included","Unlimited flows","Broadcast campaigns","Message spend dashboard"]', 'emerald', 'crown', true, null),
('1c6999b1-5e2a-4bc4-b778-9e5c6b4129bb', 'whatsapp_growth_yearly', 'INR', 1999000, 'yearly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'WA Growth', 'whatsapp', 'Best plan for growing teams running campaigns and customer support.', '["10,000 contacts","5 agents included","Unlimited flows","Broadcast campaigns","Message spend dashboard"]', 'emerald', 'crown', true, null),
('fa0c90e1-158c-4508-bdec-aeca6fdecf41', 'whatsapp_pro_monthly', 'INR', 349900, 'monthly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'WA Pro', 'whatsapp', 'Advanced automation, campaigns, AI agents, and reporting.', '["2 WhatsApp numbers","50,000 contacts","10 agents included","Campaign scheduler","API and webhooks"]', 'purple', 'award', false, null),
('2c8f82c9-a69a-42b0-b32d-1256a7413f19', 'whatsapp_pro_yearly', 'INR', 3499000, 'yearly', true, '2026-04-28 11:59:46.369013+00', '2026-04-28 11:59:46.369013+00', 'WA Pro', 'whatsapp', 'Advanced automation, campaigns, AI agents, and reporting.', '["2 WhatsApp numbers","50,000 contacts","10 agents included","Campaign scheduler","API and webhooks"]', 'purple', 'award', false, null)
ON CONFLICT ("id") DO UPDATE SET
  "plan_name" = EXCLUDED."plan_name",
  "currency" = EXCLUDED."currency",
  "amount" = EXCLUDED."amount",
  "duration" = EXCLUDED."duration",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = now(),
  "plan_label" = EXCLUDED."plan_label",
  "category" = EXCLUDED."category",
  "description" = EXCLUDED."description",
  "features" = EXCLUDED."features",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "is_popular" = EXCLUDED."is_popular",
  "razorpay_plan_id" = EXCLUDED."razorpay_plan_id";

DELETE FROM "public"."pricing_plans"
WHERE "category" = 'whatsapp'
  AND ("plan_name" = 'whatsapp_free' OR "plan_label" = 'WA Free');
