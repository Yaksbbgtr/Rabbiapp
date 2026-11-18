// Serves a rebbi's live calendar (.ics) to Google / Apple / Outlook Calendar. Public: the long random token is the secret.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleCalendar } from '../_shared/calcore.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve((req) => handleCalendar(req, async (token) => {
  const { data, error } = await db.from('calendars').select('ics').eq('token', token).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data ? data.ics : null;
}));
