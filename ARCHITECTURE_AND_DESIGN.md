# Architecture & Design Decisions

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser (Frontend)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Map.tsx                                                          │
│  ├─ useEffect: On mount                                           │
│  │  ├─ fetchVerifiedHazards()                                     │
│  │  ├─ HTTP GET /api/verified-hazards                             │
│  │  └─ validateAndDeduplicateIncidents()                          │
│  │                                                                │
│  └─ State: incidents[], isLoading                                │
│     └─ Renders incident list and map markers                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                    HTTP Request/Response
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API Server                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  report_api.py (Port 8000)                                       │
│  ├─ do_GET('/api/verified-hazards')                              │
│  │  ├─ fetch_verified_hazards(cursor)                            │
│  │  │  ├─ Query database                                         │
│  │  │  ├─ Transform rows                                         │
│  │  │  └─ Return Incident[]                                      │
│  │  │                                                             │
│  │  └─ Validate & deduplicate IDs                                │
│  │     └─ Remove duplicates, log warnings                        │
│  │                                                                │
│  └─ Return JSON response                                         │
│     └─ {status, count, incidents[]}                              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                    Database Connection
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Snowflake Database                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  THREE_ONE_ONE.PROCESSED.VERIFIED_HAZARDS                        │
│  ├─ ID (Primary Key)                                             │
│  ├─ HAZARD_TYPE (String)                                         │
│  ├─ LATITUDE / LONGITUDE (Float)                                 │
│  ├─ CONFIDENCE_SCORE (Float 0-1)                                 │
│  ├─ CONFIDENCE_TIER (HIGH/MEDIUM/LOW)                            │
│  ├─ REPORT_COUNT (Integer)                                       │
│  ├─ DESCRIPTION (String)                                         │
│  ├─ SOURCE (JSON/CSV)                                            │
│  ├─ HAS_IMAGE (Boolean)                                          │
│  └─ CREATED_AT (Timestamp)                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Design Decision Rationale

### 1. **API Endpoint Pattern (GET /api/verified-hazards)**

**Decision**: Create a dedicated read-only endpoint for fetching verified hazards

**Why**:
- **Separation of Concerns**: Report submission (POST) and data retrieval (GET) are separate concerns
- **Scalability**: Can add query parameters later (e.g., `/api/verified-hazards?lat=43.6&lng=-79.4&radius=5km`)
- **Caching**: GET endpoints can be cached by proxies/CDN more easily
- **RESTful**: Follows REST convention (GET = read, POST = write)

**Alternative Considered**: Reuse POST endpoint for both submission and retrieval
- **Rejected**: Confusing - POST typically means create/modify, not read
- **Less Scalable**: Harder to add query parameters to POST body later

---

### 2. **Duplicate ID Validation at TWO Levels**

**Decision**: Validate on both backend (report_api.py) and frontend (Map.tsx)

**Why**:
- **Defense in Depth**: Multiple layers catch more edge cases
  - Backend validation catches database integrity issues
  - Frontend validation protects against network/serialization issues
- **Robustness**: If one validation fails, the other still protects users
- **Debugging**: Can identify where duplicates originate (backend data vs network transmission)
- **Consistency**: Ensures data integrity regardless of how API is called

**How it works**:
```
Database → [Duplicates exist] → Backend validation → [Removed] → Frontend receives clean data
                                                                   ↓
                                                            Frontend validation → [Double-check]
```

**Example**:
- If database has IDs [1, 2, 1, 3]
- Backend removes one → [1, 2, 3]
- Frontend validates → [1, 2, 3] ✓
- Both log warnings so developer knows there was a problem

---

### 3. **Graceful Fallback to MOCK_INCIDENTS**

**Decision**: If API fails, use hardcoded data as fallback

**Why**:
- **User Experience**: App remains functional even if backend unavailable
- **Development**: Frontend can work even if backend not started
- **Testing**: Can test UI without running full backend stack
- **Resilience**: Temporary network issues don't break the app

**Alternative Considered**: Show error message and blank map
- **Rejected**: Poor UX - users can't see anything
- **App is not functional**: Map is the core feature

**Alternative Considered**: Remove MOCK_INCIDENTS entirely
- **Rejected**: Harder to develop frontend independently
- **No graceful degradation**: Any backend issue breaks entire feature

---

### 4. **Relative Time Format ("4 min ago")**

**Decision**: Format timestamps as relative time instead of showing raw ISO timestamps

**Why**:
- **User-Friendly**: "4 min ago" is more intuitive than "2026-04-29T14:23:45Z"
- **Consistency**: Matches common UI patterns (Twitter, Reddit, etc.)
- **Relevance**: Helps users understand incident recency at a glance

**Implementation**: Backend does formatting, not frontend
- **Why Backend**: 
  - Timezone-agnostic (backend has correct time)
  - Consistent across all clients
  - Reduces code in frontend
  - One source of truth for time formatting

---

### 5. **Source Data Normalization**

**Decision**: Backend normalizes source data to consistent array format

**Why**:
- **Flexibility**: Database can store sources as JSON, CSV, or single string
- **Robustness**: Graceful handling of different data formats
- **Frontend Simplicity**: Frontend always receives array, never null/undefined
- **Reusability**: parse_sources() function can be used elsewhere

**Example**:
```
Input formats:     → Output format:
["X","Bluesky"]    → ["X", "Bluesky"]
"X, Bluesky, User" → ["X", "Bluesky", "User"]  
"X"                → ["X"]
null               → []
```

---

### 6. **Error Handling Strategy**

**Decision**: Try → Catch → Log → Fallback

**Why**:
- **Transparency**: Developers can see errors in console
- **Functionality**: App doesn't break on errors
- **Debuggability**: Full error messages help troubleshooting

**Code Pattern**:
```typescript
try {
  // Try to fetch from API
  const response = await fetch('/api/verified-hazards');
  const data = await response.json();
  // Use fresh database data
} catch (error) {
  // Log error for debugging
  console.error('[Map] Failed:', error);
  // Fall back to mock data
  return MOCK_INCIDENTS;
}
```

---

### 7. **Component Cleanup Pattern (isMounted)**

**Decision**: Use `isMounted` flag to prevent state updates after unmount

**Why**:
- **Prevents Memory Leaks**: If component unmounts during async fetch, we don't update state
- **Prevents Error**: React warns if you try to update unmounted component state
- **Clean Lifecycle**: Proper async handling in React

**Example**:
```typescript
useEffect(() => {
  let isMounted = true;  // Track if component is mounted
  
  async function loadData() {
    const data = await fetch(...);
    if (isMounted) {  // Only update if still mounted
      setState(data);
    }
  }
  
  loadData();
  
  return () => {
    isMounted = false;  // Cleanup: mark as unmounted
  };
}, []);
```

---

### 8. **Single Endpoint vs Multiple Endpoints**

**Decision**: Single GET /api/verified-hazards endpoint returns all incidents

**Why**:
- **Simplicity**: One endpoint to manage
- **Sufficient**: Current requirements don't need filtering
- **Efficient**: Single database query faster than multiple queries

**Future Enhancement**: Could add query parameters:
```
GET /api/verified-hazards?hazard_type=Flooding
GET /api/verified-hazards?confidence=high
GET /api/verified-hazards?lat=43.6&lng=-79.4&radius=5km
```

---

### 9. **State Initialization Pattern**

**Decision**: Initialize state as empty, populate via useEffect

**Why**:
```typescript
// Before (wrong for async data)
useState(() => MOCK_INCIDENTS.map(...))  // Synchronous

// After (right for async data)
useState([])  // Empty initially
useEffect(() => {
  fetchData()  // Populate asynchronously
}, [])
```

**Benefits**:
- React best practice for async operations
- Cleaner separation of initialization and data fetching
- Easier to understand: constructor sets initial state, effect fetches data
- Better for performance: doesn't block render

---

### 10. **Why Keep Hardcoded MOCK_INCIDENTS?**

**Decision**: Don't delete MOCK_INCIDENTS, keep as fallback

**Why Delete BEFORE**:
- Seems cleaner
- One less file to maintain
- Real data should always be available

**Why Keep AFTER**:
- Fallback ensures functionality if backend unavailable
- Helps during development (no need for full backend to test UI)
- Can be removed later once reliability is proven
- Good practice: graceful degradation over total failure

---

## Dependency Graph

```
Map.tsx
├─ MOCK_INCIDENTS (fallback only)
├─ fetchVerifiedHazards()
│  ├─ fetch() API call
│  └─ validateAndDeduplicateIncidents()
└─ useEffect (on mount)

report_api.py
├─ fetch_verified_hazards()
│  ├─ Database query
│  ├─ format_relative_time()
│  ├─ get_hazard_icon()
│  └─ parse_sources()
└─ HTTP endpoints
   ├─ GET /api/verified-hazards
   └─ POST /api/reports

Database
└─ VERIFIED_HAZARDS table
```

---

## Performance Considerations

### Current Implementation
- **API Call**: On page load only (not on every re-render)
- **Deduplication**: O(n) time, O(n) space - acceptable for typical dataset size
- **Validation**: Done twice (backend + frontend) - negligible performance impact
- **No Caching**: Fresh data on every page load

### Future Optimizations
1. **Server-Side Caching**: Cache query results for 5-10 minutes
2. **Client-Side Caching**: Use localStorage or IndexedDB
3. **Pagination**: Load incidents in chunks for large datasets
4. **WebSocket**: Push updates instead of pull
5. **Compression**: Gzip response for faster transmission
6. **Lazy Loading**: Load incidents as user scrolls

---

## Security Considerations

### Current Implementation
- **Read-Only**: Verified hazards are read-only (no modification risk)
- **Public API**: No authentication required (data is not sensitive)
- **CORS Enabled**: Allows requests from frontend

### Future Hardening (if needed)
- Add rate limiting to prevent abuse
- Add authentication for audit trail
- Validate all inputs on backend
- Log all API calls for monitoring

---

## Testing Strategy

### Unit Tests
- `validateAndDeduplicateIncidents()`: Test with various duplicate scenarios
- `format_relative_time()`: Test with different timestamps
- `get_hazard_icon()`: Test icon mapping for each type
- `parse_sources()`: Test different input formats

### Integration Tests
- API endpoint returns valid JSON
- Incident data matches database schema
- Duplicate detection works end-to-end
- Fallback mechanism works when API fails

### E2E Tests
- Page loads and displays map with incidents
- Incidents match database data
- Filters work correctly
- Search works correctly

---

## Maintenance Notes

### If Duplicates Appear
1. Check database VERIFIED_HAZARDS table for duplicate IDs
2. Delete duplicate rows (keep first occurrence)
3. Refresh map page to see if warning disappears
4. Review incident pipeline to prevent recurrence

### If API Fails
1. Check backend console for errors
2. Verify Snowflake connection details in .env
3. Check database credentials
4. Verify VERIFIED_HAZARDS table exists

### If Data Not Updating
1. Refresh browser page (clears frontend cache)
2. Check if data was actually updated in database
3. Check if API endpoint is returning new data
4. Look in browser console for fetch errors
