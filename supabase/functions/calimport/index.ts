// Reads a rebbi's own Apple / Google / Outlook calendar link and returns its events for the planner. Signed-in users only.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import ical from 'npm:node-ical@0.27.6';
import { handleImport } from '../_shared/calcore.js';

const auth = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))!, { auth: { persistSession: false } });

Deno.serve((req) => handleImport(req, {
  ical,
  fetch: (u: string, o: RequestInit) => fetch(u, o),
  verify: async (token: string) => {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) throw new Error('not signed in');
    return data.user;
  },
}));
