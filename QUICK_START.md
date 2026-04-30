# Quick Reference: Running the Verified Hazards Implementation

## Starting the Backend API

```bash
# In the project root directory, start the report_api.py server
python report_api.py

# You should see:
# Report API listening on http://127.0.0.1:8000
```

## Starting the Frontend

```bash
# In another terminal, start the dev server
npm run dev

# The app will be available at http://localhost:5173
```

## Testing the API Endpoint Directly

```bash
# Test the verified hazards endpoint
curl http://localhost:8000/api/verified-hazards

# Expected response:
{
  "status": "success",
  "count": 7,
  "incidents": [
    {
      "id": 1,
      "type": "Flooding",
      "lat": 43.6538,
      "lng": -79.3834,
      "conf": "high",
      "score": 87,
      "reports": 14,
      "hasImage": true,
      "sources": ["X", "Bluesky", "User"],
      "time": "4 min ago",
      "desc": "Multiple residents reporting basement flooding on Erb St...",
      "icon": "🌊"
    },
    ...more incidents
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

