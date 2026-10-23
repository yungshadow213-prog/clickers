/*
 * Configure these public values for the Clickers author dashboard.
 * The Supabase publishable key is safe for browser use when database access is locked down.
 * NEVER put a Supabase secret/service-role key in this file.
 */
window.CLICKERS_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabasePublishableKey: "sb_publishable_REPLACE_ME",
  apiUrl: "https://YOUR-CLICKERS-WORKER.workers.dev"
};
