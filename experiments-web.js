/*
 * experiments-web.js
 *
 * The tracker for a web app, rather than an extension. Same table, same
 * shape, no Chrome APIs.
 *
 * Records a short action name and nothing else. Not what anyone typed, not
 * what they chose, not who they are. A deck's slides and script are never sent.
 *
 *   import { track } from "./experiments-web.js";
 *   track("submitted");
 *
 * Both Supabase values are meant to be public, and the policies in the
 * experiments repository are what protect the data. The key can add rows to
 * one table and read nothing.
 *
 * Copying Stagehand for your own deck? Leave this as it is and your use counts
 * toward Stagehand on the catalog. Set slug to "" to switch counting off.
 */

const EXPERIMENTS = {
  supabaseUrl: 'https://anpdtpaozmblptqrqaam.supabase.co',
  supabaseAnonKey: 'sb_publishable_qDlGahllytUw1ZdvVgloyQ_wZ2b3IqN',

  // The folder name of this experiment in the experiments repository.
  slug: 'stagehand',

  // Optional. Shows up under "Versions people are running".
  version: '1.5.0',
};

/** A random id kept in this browser. Not a person, not an account. */
function visitorId() {
  const key = 'experiments-visitor';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    // Private browsing, or storage is blocked. Stay anonymous for this visit.
    return crypto.randomUUID();
  }
}

const seen = new Set();

/**
 * Records one use of a named feature.
 *
 * Pass once: true for something that should count a single time per visit.
 * Never throws and never blocks. Usage data is not worth interrupting the
 * thing someone is trying to do.
 */
export function track(action, { once = false } = {}) {
  const { supabaseUrl, supabaseAnonKey, slug, version } = EXPERIMENTS;
  if (!supabaseUrl || !supabaseAnonKey || !slug) return;
  if (typeof action !== 'string' || !action || action.length > 40) return;
  if (once) {
    if (seen.has(action)) return;
    seen.add(action);
  }

  const body = JSON.stringify({
    slug,
    visitor_id: visitorId(),
    action,
    version,
  });

  const url = `${supabaseUrl}/rest/v1/experiment_actions`;
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  try {
    void fetch(url, { method: 'POST', headers, body, keepalive: true }).catch(() => {});
  } catch {
    // Offline, or blocked. Nothing to do and nothing worth saying.
  }
}

/*
 * Tells the catalog you have seen this version. When the app is served from
 * the same address as the catalog, its experiment page and card say whether
 * anything has changed since you last opened it. Elsewhere this does nothing.
 */
(() => {
  const { slug } = EXPERIMENTS;
  if (!slug) return;
  try {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const on = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    localStorage.setItem(`experiments-tried:${slug}`, JSON.stringify({ on }));
  } catch {
    // Private browsing, or storage is blocked.
  }
})();
