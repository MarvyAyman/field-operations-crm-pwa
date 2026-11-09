import { createClient } from '@supabase/supabase-js';

// Supabase is used ONLY for the "Sign in with Google" step.
// Right after sign-in we swap the Supabase session for our own long-lived app session
// (see auth.jsx), because that one keeps working offline.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('⚠️ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing in frontend/.env');
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    flowType: 'pkce',          // safe redirect flow: Google -> Supabase -> back here with ?code=
    detectSessionInUrl: true,  // finishes the sign-in when the page loads with ?code=
    persistSession: true,      // needed to survive the redirect (cleared right after login)
    autoRefreshToken: false,   // we never keep this session, so nothing to refresh
  },
});
