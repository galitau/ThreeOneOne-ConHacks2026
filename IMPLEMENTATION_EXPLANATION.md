# Implementation: Replace Hardcoded Incidents with Database-Driven Data

## Overview
This implementation removes hardcoded hazard data and instead fetches all incidents from the `VERIFIED_HAZARDS` database table. Both the backend and frontend include duplicate ID detection and removal to ensure data integrity.

---

## WHY These Changes?

### Problem
- Previously, the map displayed 7 hardcoded incidents from `MOCK_INCIDENTS` in `src/data/incidents.ts`
- Any changes to incident data required code updates
- New verified hazards in the database weren't automatically shown on the map
- No validation to prevent duplicate IDs

### Solution
- Create a new API endpoint `/api/verified-hazards` that queries the database
- Have the frontend fetch from this endpoint on component mount
- Implement duplicate ID validation at both backend and frontend
- Provide graceful fallback to mock data if the API fails

---

## WHAT Changed?

### 1. Backend: `report_api.py`

#### New Functions:

**`fetch_verified_hazards(cursor)`**
```python
# WHY: Queries the VERIFIED_HAZARDS table and transforms database records into Incident objects
# This ensures we get fresh data from the database every time the API is called

# HOW: 
# 1. Queries THREE_ONE_ONE.PROCESSED.VERIFIED_HAZARDS for all verified incidents
# 2. Transforms each database row into an Incident format:
#    - ID → unique identifier from database
#    - HAZARD_TYPE → incident type (Flooding, Fallen Tree, etc.)
#    - LATITUDE/LONGITUDE → incident location
#    - CONFIDENCE_TIER → converted to 0-100 score
#    - REPORT_COUNT → number of reports
#    - HAS_IMAGE → whether incident has photo evidence
#    - Created_at → formatted as relative time ("4 min ago")
#    - SOURCE → parsed into array of sources (X, Bluesky, User, etc.)
```

**`format_relative_time(timestamp)`**
```python
# WHY: Converts database timestamps to user-friendly relative times
# Examples: "4 min ago", "2 hours ago", "1 day ago"

# HOW: Calculates difference between current time and timestamp, then formats appropriately
```

**`get_hazard_icon(hazard_type)`**
```python
# WHY: Maps hazard type names to emoji icons
# This ensures consistent iconography between database and frontend

# HOW: Simple dictionary lookup that returns appropriate emoji for each hazard type
# Example: "Flooding" → "🌊", "Fallen Tree" → "🌳"
```

**`parse_sources(source_data)`**
```python
# WHY: Normalizes source data which may be stored as JSON, CSV, or plain string
# This ensures the frontend always gets a consistent list of source strings

# HOW: 
# 1. Try parsing as JSON array first
# 2. If that fails, try splitting by comma
# 3. Otherwise, return as single-item list
```

#### Modified Endpoints:

**`do_OPTIONS()` handler**
```python
# WHY: Handles CORS preflight requests from the browser
# WHAT CHANGED: Added "/api/verified-hazards" to accepted paths

# HOW: Allows both GET and POST methods for CORS compatibility
```

**`do_GET()` handler (NEW)**
```python
# WHY: Fetches all verified hazards from the database
# WHAT CHANGED: Added new GET handler for /api/verified-hazards endpoint

# HOW:
# 1. Checks if request path is "/api/verified-hazards"
# 2. Calls fetch_verified_hazards() to query database
# 3. VALIDATES: Checks for duplicate IDs
# 4. If duplicates found:
#    - Logs warning message
#    - Removes duplicates by keeping first occurrence of each ID
# 5. Returns JSON response with status, count, and incidents array
```

---

### 2. Frontend: `src/pages/Map.tsx`

#### New Functions:

**`validateAndDeduplicateIncidents(incidents)`**
```typescript
// WHY: Validates that all incidents have unique IDs
// Protects against data integrity issues in the database

// HOW:
// 1. Uses Map to track seen IDs (IDs must be unique across all incidents)
// 2. Identifies any duplicate IDs
// 3. If duplicates found:
//    - Logs warning to console for developer visibility
//    - Keeps only first occurrence of each ID
//    - Returns deduplicated array
// 4. Returns array of incidents with unique IDs

// EXAMPLE:
// Input: [{id: 1, type: 'Flooding'}, {id: 1, type: 'Fire'}, {id: 2, type: 'Pothole'}]
// Output: [{id: 1, type: 'Flooding'}, {id: 2, type: 'Pothole'}]
// Console: "Found 1 duplicate incident ID(s) in database: 1"
```

**`fetchVerifiedHazards()`**
```typescript
// WHY: Fetches verified hazards from backend API
// This is the main data source for the map, replacing hardcoded MOCK_INCIDENTS

// HOW:
// 1. Makes fetch() request to /api/verified-hazards
// 2. If successful:
//    a. Parses JSON response
//    b. Extracts incidents array from response
//    c. Validates and deduplicates incidents
//    d. Logs how many incidents loaded
//    e. Returns deduplicated array
// 3. If failed:
//    a. Logs error to console
//    b. Falls back to MOCK_INCIDENTS for graceful degradation
//    c. Returns mock data so app still works

// WHY FALLBACK: The backend might be down during development/testing
// Having fallback ensures the frontend remains functional
```

#### Modified State & Hooks:

**State Changes**
```typescript
// BEFORE: Hardcoded initial state
const [incidents, setIncidents] = useState<TrackedIncident[]>(() => (
  MOCK_INCIDENTS.map(...) // Started with hardcoded data
));

// AFTER: Dynamic fetching from API
const [incidents, setIncidents] = useState<TrackedIncident[]>([]); // Start empty
const [isLoading, setIsLoading] = useState(true); // Track if still fetching

// WHY: Allows us to fetch data from API instead of hardcoding it
```

**New useEffect Hook**
```typescript
useEffect(() => {
  // WHY: Runs once on component mount to fetch verified hazards from database

  // HOW:
  // 1. Creates isMounted flag (prevents updating state after unmount)
  // 2. Defines async loadHazards() function that:
  //    - Sets isLoading = true
  //    - Calls fetchVerifiedHazards() to get incidents
  //    - Converts Incidents to TrackedIncidents (adds "active" status)
  //    - Only updates state if component still mounted
  //    - Sets isLoading = false
  // 3. Calls loadHazards()
  // 4. Returns cleanup function that sets isMounted = false

  // WHY CLEANUP: Prevents memory leaks if component unmounts before fetch completes
  // If fetch finishes after unmount, we won't try to update unmounted component
}, []); // Empty dependency array = runs only on mount
```

**Updated `getActiveFilter()`**
```typescript
// BEFORE: Searched MOCK_INCIDENTS for matching type
const incidentForType = MOCK_INCIDENTS.find(...);

// AFTER: Searches current incidents state for matching type
const incidentForType = incidents.find(...);

// WHY: No longer depends on hardcoded data
// The incidents state now contains live data from the database
```

---

## HOW It Works: Data Flow

```
1. INITIAL LOAD
   ├─ Component mounts
   ├─ useEffect triggers fetchVerifiedHazards()
   │  ├─ fetch('/api/verified-hazards') is called
   │  └─ Request goes to backend API
   │
   └─ Backend processes request:
      ├─ report_api.do_GET() receives request
      ├─ fetch_verified_hazards() queries database
      │  ├─ SELECT FROM THREE_ONE_ONE.PROCESSED.VERIFIED_HAZARDS
      │  ├─ Transform each row to Incident format
      │  └─ Return array of incidents
      │
      ├─ Validate & deduplicate:
      │  ├─ Check for duplicate IDs
      │  └─ Remove duplicates if found
      │
      └─ Send JSON response:
         ├─ status: "success"
         ├─ count: number of incidents
         └─ incidents: [Array of Incident objects]

2. FRONTEND RECEIVES RESPONSE
   ├─ JSON parsed: incidents array extracted
   ├─ validateAndDeduplicateIncidents() called:
   │  ├─ Check for duplicates again (defense in depth)
   │  └─ Remove if found
   │
   ├─ Convert Incidents to TrackedIncidents (add status field)
   ├─ Update state: setIncidents(trackedIncidents)
   ├─ Set loading: setIsLoading(false)
   │
   └─ Map renders with real database data

3. IF API FAILS
   ├─ fetchVerifiedHazards() catches error
   ├─ Logs error message to console
   ├─ Returns MOCK_INCIDENTS as fallback
   └─ Map renders with mock data (graceful degradation)
```

---

## Duplicate ID Handling

### Why Check for Duplicates?
- Database integrity issues could create duplicate IDs
- Duplicate IDs could cause UI bugs (e.g., selecting one incident affects multiple)
- Better to detect and fix than to silently fail

### Where We Check:
1. **Backend (`report_api.do_GET`)**: First validation point
   - Creates set of IDs and identifies duplicates
   - Removes duplicates before sending to frontend
   - Logs warning for developers

2. **Frontend (`validateAndDeduplicateIncidents`)**: Defense in depth
   - Secondary validation in case backend misses any
   - Ensures frontend data integrity
   - Logs to browser console for debugging

### Example Duplicate Scenario:
```javascript
// Database returns these 5 incidents:
[
  { id: 1, type: 'Flooding' },     ← First occurrence, kept
  { id: 2, type: 'Fire' },         ← Unique, kept
  { id: 1, type: 'Tree Down' },    ← DUPLICATE! Removed
  { id: 3, type: 'Pothole' },      ← Unique, kept
  { id: 2, type: 'Hazard' },       ← DUPLICATE! Removed
]

// After deduplication:
[
  { id: 1, type: 'Flooding' },     ← First occurrence kept
  { id: 2, type: 'Fire' },         ← First occurrence kept
  { id: 3, type: 'Pothole' },
]

// Console warnings:
// Backend: "WARNING: Found duplicate incident IDs in database: [1, 2]"
// Frontend: "[Map] Found 2 duplicate incident ID(s): 1, 2"
```

---

## Testing the Implementation

### Test 1: API Endpoint
```bash
# Start the report_api.py server
python report_api.py

# In another terminal, test the endpoint
curl http://localhost:8000/api/verified-hazards
```

### Test 2: Map Loading
1. Start the dev server: `npm run dev`
2. Open browser to http://localhost:5173
3. Open Developer Console (F12)
4. Look for messages like:
   - `"[Map] Loaded 15 verified incidents from database"` ✓ Success
   - `"[Map] Failed to fetch verified hazards from API..."` ✓ Fallback triggered
   - `"[Map] Found 2 duplicate incident ID(s)..."` ✓ Duplicates detected

### Test 3: Duplicate Detection
1. Manually add duplicate incidents to VERIFIED_HAZARDS table
2. Refresh the map page
3. Should see warning messages and duplicates removed

---

## Comments Throughout Code

Both files have been thoroughly commented to explain:
- **WHY** each function exists
- **HOW** it works step-by-step
- **WHAT** data transformations occur
- **WHERE** validation happens

Look for comments that start with:
- `// WHY:` - Explains the purpose
- `// HOW:` - Explains the mechanism
- `// WHAT:` - Explains transformations
- `// WHERE:` - Explains location/context

---

## Key Benefits of This Approach

1. **Data Freshness**: Shows latest verified hazards from database
2. **Scalability**: Can add/remove incidents without code changes
3. **Robustness**: Validates at multiple points (backend & frontend)
4. **Reliability**: Graceful fallback ensures app works if backend unavailable
5. **Maintainability**: Clear separation of concerns (API vs UI)
6. **Debuggability**: Console logs help troubleshoot issues

---

## Next Steps (Optional Enhancements)

1. Add real-time updates (WebSocket) for live incident data
2. Add pagination for large numbers of incidents
3. Add caching strategy to reduce API calls
4. Add refresh button to manually reload incidents
5. Add loading spinner while fetching
6. Add error messages displayed to user (not just console)
