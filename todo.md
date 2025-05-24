# 🗺️ EpicMap Project TODO List - Updated

## ✅ Recently Completed

- [x] Full CRUD for jobs and fieldwork from admin panel
- [x] Filter/search jobs by job number, client, status, and address
- [x] Add fieldwork toggle with expandable rows
- [x] Create new jobs and fieldwork entries via admin
- [x] Add job creation form (modal)
- [x] Add fieldwork creation form (modal)
- [x] Admin panel: view, edit, delete jobs and fieldwork
- [x] Add confirmation flash messages to admin panel
- [x] Add autocomplete for client and address fields
- [x] Convert admin jobs table to read-only with edit modals
- [x] Add pagination to jobs table for performance
- [x] Fix all model relationship issues and route bugs
- [x] Implement proper form validation and error handling
- [x] Add status dropdowns with predefined options
- [x] Prevent browser autofill in user creation forms

---

# 🚀 Major Refactor Plan - Performance & UX Overhaul

## 📋 Phase 1: Route Restructuring (1-2 hours)

- [ ] **Combine map and job creation**: Move form.html functionality into map.html as modal
- [ ] **Create admin dashboard**: New `/admin` route with overview metrics
- [ ] **Restructure admin routes**:
  - [ ] Move current `/admin` to `/admin/users`
  - [ ] Keep `/admin/jobs` unchanged
  - [ ] Add `/admin` as dashboard hub

## 📋 Phase 2: Admin SPA Implementation (2-3 hours)

- [ ] **Convert admin to single-page app** with AJAX navigation
- [ ] **Fast page transitions** (< 200ms target)
- [ ] **Shared navigation state** between admin sections
- [ ] **Progress indicators** for all loading states
- [ ] **No page reloads** within admin area

## 📋 Phase 3: Smart Caching System (1-2 hours)

- [ ] **Session-based job caching** (5-minute TTL)
- [ ] **Smart cache invalidation** on CRUD operations
- [ ] **Background cache refresh** at 80% TTL
- [ ] **Fieldwork cache** per job
- [ ] **Dashboard metrics cache** (10-minute TTL)
- [ ] **Manual refresh buttons** for power users

## 📋 Phase 4: Enhanced Job Creation Modal (1-2 hours)

- [ ] **Address autocomplete** with Google Maps integration
- [ ] **Geocoding result caching** (prevent API abuse)
- [ ] **Status dropdown** with predefined options
- [ ] **Crew validation** against user database
- [ ] **Quick add crew member** if not in system
- [ ] **Debounced address input** (300ms delay)
- [ ] **API call limiting** (max 10 per session)

## 📋 Phase 5: Performance Polish (1 hour)

- [ ] **Database indexing** for frequently queried fields
- [ ] **Query optimization** review
- [ ] **Preload critical data** on login
- [ ] **Skeleton screens** for loading states

---

# 🧭 Core Functional Features (Ongoing)

- [ ] **Scrub codebase for capitalization/key mismatches** due to schema changes
- [ ] **Input job via tax parcel number**
- [ ] **Add external resource links**:
  - [x] Property Appraiser Site (Brevard County implemented)
  - [ ] FEMA Map (via coordinates)
  - [ ] Subdivision plat download (low priority)
- [ ] **Routing from job to job** (via Google Maps or OpenRouteService)

## 📍 Location & Data Enhancements

- [ ] **Replace county geometries** with more detailed Florida file
- [ ] **Enhanced crew management**:
  - [ ] Crew scheduling and availability
  - [ ] Crew performance metrics

## 🎨 UI/UX Improvements

- [ ] **Use Tailwind CSS** for styling and animation
- [ ] **Apply company branding** (logo + color theme)
- [ ] **Add job tray for daily selection**:
  - [ ] Select jobs into tray
  - [ ] Optional: visualize route between selected jobs

## 📊 Admin Dashboard Features ⭐ _New Section_

- [ ] **Summary cards**: Total jobs, active jobs, completed jobs, total users
- [ ] **Recent activity feed**: Latest jobs created, recent fieldwork entries
- [ ] **Quick stats with charts**: Jobs by status, time spent metrics
- [ ] **Quick action buttons**: "Create Job", "Add User", "View Reports"
- [ ] **Performance metrics**: Cache hit rates, response times
- [ ] **Crew utilization charts**: Time spent by crew member
- [ ] **Weekly/monthly reports**: Automated insights

## ☁️ Deployment & Integration

- [ ] **Migrate project to company-owned infrastructure**
- [ ] **Integrate Outlook Calendar** for scheduling
- [ ] **Embed this tool** into the company's existing website

## 🧹 Codebase Organization & Maintenance

- [ ] **Full code review and cleanup** after refactor
- [ ] **Add comprehensive logging** for debugging
- [ ] **Unit tests** for critical functions
- [ ] **API documentation** for internal use
- [ ] **Add restore (undelete) route** for soft-deleted jobs

---

## 🎯 Performance Targets

- **Page transitions**: < 200ms
- **Map load**: < 1 second
- **Job creation**: < 500ms
- **Cache hit ratio**: > 90%
- **API calls reduced**: > 80%

## 🧠 Learning Focus Areas

- **Frontend Architecture**: SPA patterns, AJAX, DOM manipulation
- **Backend Performance**: Caching strategies, query optimization
- **System Design**: Internal tool architecture, user experience optimization
- **Database**: Indexing, relationship optimization, session management
