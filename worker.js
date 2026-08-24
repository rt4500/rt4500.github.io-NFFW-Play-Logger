/* Flag Stats live relay — Cloudflare Worker
   Deploy once; bake the URL into index.html LIVE_CONFIG. Tablets need zero setup.

   Routes:
     PUT /g/:deviceId   store that device's live game state (JSON body)
     GET /g             list all devices' latest states (viewer polling)
     GET /g/:deviceId   one device's latest state

   Setup (one time, ~10 min):
   1. dash.cloudflare.com → Workers & Pages → Create Worker → paste this file.
   2. Storage & Databases → KV → create a namespace (e.g. "flagstats-live").
   3. In the Worker: Settings → Bindings → add KV binding, variable name LIVE,
      pointing at that namespace.
   4. (Recommended) Settings → Variables → add plain-text variable TOKEN with a
      random string. Put the same string in LIVE_CONFIG.token in index.html.
   5. Deploy, copy the workers.dev URL into LIVE_CONFIG.url in index.html, push.
*/
// In-memory cache (per warm isolate). The Cloudflare Cache API is a no-op on
// workers.dev domains, so this is the cache that actually works there.
let memCache = { t: 0, body: null };

async function readIndex(env) {
  const raw = await env.LIVE.get('idx');
  if (raw) { try { return JSON.parse(raw); } catch {} }
  // self-heal: rebuild the index once via list() if it's missing
  const l = await env.LIVE.list({ prefix: 'g:', limit: 1000 });
  const ids = l.keys.map((k) => k.name);
  await env.LIVE.put('idx', JSON.stringify(ids));
  return ids;
}

export default {
  async fetch(req, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(req.url);

    // Health/key check: GET /ping[?k=...] -> {ok, role} — no KV ops, stores nothing
    if (url.pathname === '/ping') {
      let keys = null;
      try { keys = env.KEYS ? JSON.parse(env.KEYS) : null; } catch {}
      const provided = url.searchParams.get('k') || url.searchParams.get('t') || '';
      let role = null;
      if (keys) role = keys[provided] || null;
      else if (env.TOKEN) role = provided === env.TOKEN ? 'legacy' : null;
      else role = 'open';
      return new Response(JSON.stringify({ ok: !!role, role }),
        { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const m = url.pathname.match(/^\/g(?:\/([\w-]{4,64}))?\/?$/);
    if (!m) return new Response('not found', { status: 404, headers: cors });
    const id = m[1];

    // Auth model: READS are public (scores are public data).
    // WRITES require a keeper key from the KEYS variable — a JSON map of
    //   { "key-string": "device-name" }, e.g.
    //   {"f1-7kq2m9x4":"field1","f2-3vp8n5t1":"field2","hub-9rw4c6z8":"hub"}
    // Each key can only write inside its own device namespace, so a leaked
    // Field 1 key can never touch Field 2's games.
    // Legacy fallback: if KEYS is not set, the old single TOKEN variable is used.
    if (req.method === 'PUT' && id && url.searchParams.get('override') === '1') {
      // Admin result correction: merge an override into an EXISTING record, any namespace.
      let keys = null;
      try { keys = env.KEYS ? JSON.parse(env.KEYS) : null; } catch {}
      const provided = url.searchParams.get('k') || '';
      const role = keys ? (keys[provided] || null) : null;
      if (role !== 'admin') return new Response('forbidden', { status: 403, headers: cors });
      const slot = url.searchParams.get('slot') || '';
      if (!/^g:[\w:-]{1,120}$/.test(slot)) return new Response('bad slot', { status: 400, headers: cors });
      const cur = await env.LIVE.get(slot);
      if (!cur) return new Response('not found', { status: 404, headers: cors });
      let patch; try { patch = JSON.parse(await req.text()); } catch { return new Response('bad json', { status: 400, headers: cors }); }
      let rec; try { rec = JSON.parse(cur); } catch { return new Response('corrupt slot', { status: 500, headers: cors }); }
      if (patch && patch.override) {
        rec.override = { home: Math.max(0, Math.min(199, (+patch.override.home) || 0)),
                         away: Math.max(0, Math.min(199, (+patch.override.away) || 0)),
                         finished: !!patch.override.finished };
      } else { delete rec.override; }  // empty body clears the override
      await env.LIVE.put(slot, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 7 });
      memCache = { t: 0, body: null };
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'PUT' && id) {
      let keys = null;
      try { keys = env.KEYS ? JSON.parse(env.KEYS) : null; } catch {}
      const provided = url.searchParams.get('k') || url.searchParams.get('t') || '';
      let ns = '';
      if (keys) {
        const name = keys[provided];
        if (!name) return new Response('forbidden', { status: 403, headers: cors });
        ns = String(name).replace(/[^\w-]/g, '') + ':';
      } else if (env.TOKEN) {
        if (provided !== env.TOKEN) return new Response('forbidden', { status: 403, headers: cors });
      }
      const body = await req.text();
      if (body.length > 250000) return new Response('too big', { status: 413, headers: cors });
      try { JSON.parse(body); } catch { return new Response('bad json', { status: 400, headers: cors }); }
      const storeKey = 'g:' + ns + id;
      // cap total stored games: updates to existing slots always allowed,
      // new slots rejected past 200 (prevents storage-exhaustion abuse)
      const existing = await env.LIVE.get(storeKey);
      if (!existing) {
        const ids = await readIndex(env);
        if (ids.length >= 200) return new Response('storage full', { status: 429, headers: cors });
        // per-device cap: one leaked key can fill only its own namespace, never the whole store
        if (ns && ids.filter((k) => k.startsWith('g:' + ns)).length >= 60)
          return new Response('device storage full', { status: 429, headers: cors });
        if (!ids.includes(storeKey)) { ids.push(storeKey); await env.LIVE.put('idx', JSON.stringify(ids)); }
      }
      await env.LIVE.put(storeKey, body, { expirationTtl: 60 * 60 * 24 * 7 });
      memCache = { t: 0, body: null }; // fresh data invalidates the cache
      return new Response('ok', { headers: cors });
    }
    if (req.method === 'DELETE' && id) {
      let keys = null;
      try { keys = env.KEYS ? JSON.parse(env.KEYS) : null; } catch {}
      const provided = url.searchParams.get('k') || url.searchParams.get('t') || '';
      let ns = '';
      if (keys) {
        const name = keys[provided];
        if (!name) return new Response('forbidden', { status: 403, headers: cors });
        ns = String(name).replace(/[^\w-]/g, '') + ':';
      } else if (env.TOKEN) {
        if (provided !== env.TOKEN) return new Response('forbidden', { status: 403, headers: cors });
      }
      let storeKey = 'g:' + ns + id;   // a key can only delete inside its own namespace
      // admin role: may target any slot verbatim (for tournament-director cleanup)
      const role = (() => { try { return env.KEYS ? (JSON.parse(env.KEYS)[provided] || null) : null; } catch { return null; } })();
      const slotParam = url.searchParams.get('slot');
      if (role === 'admin' && slotParam && /^g:[\w:-]{1,120}$/.test(slotParam)) storeKey = slotParam;
      await env.LIVE.delete(storeKey);
      const ids = await readIndex(env);
      const alive = ids.filter((k) => k !== storeKey);
      if (alive.length !== ids.length) await env.LIVE.put('idx', JSON.stringify(alive));
      memCache = { t: 0, body: null };
      return new Response('deleted', { headers: cors });
    }

    if (req.method === 'GET' && id) {
      const v = await env.LIVE.get('g:' + id);
      return new Response(v || 'null', { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (req.method === 'GET') {
      // 10 s in-memory cache: repeated polls in a warm isolate cost zero KV ops.
      // (The Cache API is a no-op on workers.dev, so this replaces it.)
      if (memCache.body && Date.now() - memCache.t < 10000) {
        return new Response(memCache.body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5' } });
      }
      const ids = await readIndex(env);      // 1 KV read — no list operation
      const out = []; const dead = [];
      for (const key of ids) {
        const v = await env.LIVE.get(key);
        if (v) { try { const rec = JSON.parse(v); rec._slot = key; out.push(rec); } catch {} }
        else dead.push(key);                  // slot expired (7-day TTL)
      }
      if (dead.length) { const alive = ids.filter((k) => !dead.includes(k));
        ctx.waitUntil(env.LIVE.put('idx', JSON.stringify(alive))); }
      const body = JSON.stringify(out);
      memCache = { t: Date.now(), body };
      return new Response(body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5' } });
    }
    return new Response('bad request', { status: 400, headers: cors });
  },
};
