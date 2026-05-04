# Working — Queue Deployment

## Current Objective
Get the app running end-to-end: Electron → Supabase → Railway dispatcher → launchd daemon → Claude Code.

---

## Deployment Status

| Step | Status |
|---|---|
| Supabase migration SQL (`001_initial_schema.sql`) | ✅ Done |
| `description` column on `projects` table | ⚠️ Run manually in Supabase SQL editor (see below) |
| `.env` filled (Supabase URL + keys) | ✅ Done |
| Daemon compiled + registered with launchd | ✅ Running (PID confirmed) |
| Daemon Realtime subscription | ✅ Working (CHANNEL_ERROR = normal WS reconnect) |
| Anthropic API key set in app | ⏳ Not done |
| Chrome extension built | ✅ Built (`background.js`, `content.js`, `popup/popup.js` exist) |
| Chrome extension loaded in browser | ⏳ Load unpacked from `chrome://extensions` |
| Railway dispatcher deployed | ⏳ Not done — `railway.toml` created |

---

## Pending: description column

Run this once in the Supabase SQL editor:
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
```

---

## Next Steps

1. **Set Anthropic key** — with app running, open DevTools (`Cmd+Option+I`) and run:
   ```js
   window.electronAPI.setAnthropicKey('sk-ant-...')
   ```
2. **Load Chrome extension** — go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", select the `extension/` folder
3. **Deploy dispatcher to Railway**:
   - Push repo to GitHub (or connect Railway to local git)
   - Railway → New Project → deploy from repo
   - Set env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the JWT starting with `eyJ...` from `.env`)
   - `railway.toml` already sets `npm run dispatcher` as start command
4. **End-to-end smoke test** — add a task in the app → Supabase `tasks` table shows `status='dispatching'` → daemon error log (`/tmp/com.queue.daemon.out.log`) shows it picked up → `claude -p` runs

---

## Open Questions

- **Voice**: `setPermissionRequestHandler` + `setPermissionCheckHandler` are wired. If clicking the mic button shows nothing or errors, grant macOS mic permission: System Settings → Privacy & Security → Microphone.
- **Device ID**: daemon plist already has `bfc45950-291f-4d7c-ae6b-d97b8812ad2d`. Verify it matches Electron app: DevTools → Application → Local Storage → `queue:device_id`.
- **Recompile daemon after code changes**: launchd runs `out/daemon/ccBridge.js`. After any changes to `daemon/ccBridge.ts`, re-run esbuild and restart: `launchctl kickstart -k gui/$(id -u)/com.queue.daemon`.
