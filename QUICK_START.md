# Quick Reference: Running the Verified Hazards Implementation

## ⚡ Quick Start (Recommended)

**Start BOTH the frontend and backend together in one command:**

```bash
npm run dev
```

This single command starts:
- **Frontend dev server** at `http://localhost:5173`
- **Report API backend** at `http://127.0.0.1:8001`

The frontend proxies requests to `/api/verified-hazards` → port 8001.

> ⚠️ **IMPORTANT:** If you only run `vite` or `npm run dev:client`, the Report API will NOT start, and the app will show only mock data with a red warning banner.

## Alternative: Starting Services Separately

If you prefer to run them in separate terminals:

**Terminal 1 — Backend API:**
```bash
.venv/Scripts/python.exe report_api.py
# You should see: Report API listening on http://127.0.0.1:8001
```

**Terminal 2 — Frontend:**
```bash
npm run dev:client
# The app will be available at http://localhost:5173
```

## Testing the API Endpoint Directly

```bash
# Test the verified hazards endpoint
curl http://127.0.0.1:8001/api/verified-hazards

# Expected response:
{
  "status": "success",
  "count": 4,
  "summary": {"totalRows": 7, "uniqueSignalIds": 4, "table": "THREE_ONE_ONE.RAW.VERIFIED_HAZARDS"},
  "incidents": [
    {
      "signalId": "5e5ffa02-fb54-49cc-8716-8a376133598b",
      "type": "Fallen Tree",
      "lat": 43.679,
      "lng": -79.373,
      "conf": "high",
      "score": 90,
      "reports": 1,
      "hasImage": false,
      "sources": ["user_report"],
      "time": "7 hours ago",
      "desc": "A large tree has fallen across a paved road...",
      "icon": "🌳"
    },
    ...more verified incidents from Snowflake database
  ]
}
```

## Verifying Duplicate Detection Works

### In the Frontend Console (F12)

Watch for these messages as the page loads:

```
[Map] Loaded 7 verified incidents from database
✓ No duplicates - all incidents have unique IDs
```

If duplicates exist:
```
[Map] Found 2 duplicate incident ID(s) in database: 1, 5
These duplicates have been removed and only the first occurrence of each ID was kept.
```

### In the Backend Console

If duplicates are found in the database:
```
WARNING: Found duplicate incident IDs in database: [1, 5]
```

## How to Test Duplicate Removal

1. **Add duplicate to database** (manually via Snowflake):
   ```sql
   INSERT INTO THREE_ONE_ONE.PROCESSED.VERIFIED_HAZARDS (ID, ...)
   VALUES (1, ...);  -- This creates a duplicate ID = 1
   ```

2. **Refresh the map page** in the browser

3. **Check console** for warning message about duplicate

4. **Verify** only one incident with ID=1 appears on map

## Configuration

### Backend (.env file)
```
SNOWFLAKE_ACCOUNT=<your-account>
SNOWFLAKE_USER=<your-user>
SNOWFLAKE_PASSWORD=<your-password>
SNOWFLAKE_WAREHOUSE=<your-warehouse>
REPORT_API_HOST=127.0.0.1
REPORT_API_PORT=8000
```

### Frontend
- No additional configuration needed
- Uses proxy: `/api/*` requests automatically route to `http://localhost:8000`

