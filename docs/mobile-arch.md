# Mobile Sync — Architectural Amendment

## What changes
- Queue state moves from SQLite to Supabase Postgres
- Dispatch loop moves from electron/main.ts to a hosted Node backend (Railway)
- Claude Code bridge becomes a local launchd daemon (separate from Electron)
- Phone client: Expo React Native app, same Supabase subscriptions
- Browser extension posts annotations to server API instead of localhost WS

## What stays the same
- Electron overlay shell and all UI components
- All data models in shared/types.ts (unchanged)
- Browser extension capture logic
- Voice input

## Migration order
1. Add Supabase — replace db.ts with supabase client, migrate schema
2. Extract dispatch loop from main.ts → backend/dispatcher.ts (deploy to Railway)
3. Extract CC bridge from electron/ → daemon/ccBridge.ts (register as launchd service)
4. Electron becomes a thin client — reads/writes Supabase instead of SQLite
5. Build Expo app last, once server is stable

## Do not start Phase 2 until this migration is complete