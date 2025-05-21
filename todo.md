# 🗺️ EpicMap Project TODO List

## 🧭 Core Functional Features

- [ ] Cache job data to improve performance
- [ ] Scrub codebase for capitalization/key mismatches due to schema changes

<!-- Completed core functionality -->

- [x] Click to create job on map
- [x] Admin route to view jobs table
- [x] Full CRUD for jobs and fieldwork from admin panel
- [x] Filter/search jobs by job number, client, status, and address
- [x] Add fieldwork toggle with expandable rows
- [x] Create new jobs and fieldwork entries via admin
- [x] Add a notes field to each job
- [x] Enable document upload per job (if feasible)
- [x] Link related jobs (add a "related jobs" field)

## 📍 Location & Data Enhancements

- [ ] Replace county geometries with more detailed Florida file
- [ ] Input job via tax parcel number
- [ ] Add external resource links:
  - [ ] Property Appraiser Site
  - [ ] FEMA Map (via coordinates)
  - [ ] Subdivision plat download (low priority)
- [ ] Routing from job to job (via Google Maps or OpenRouteService)

## 🎨 UI/UX Improvements

- [ ] Convert all map-related forms to modals
- [ ] Add modal forms to admin panel (in progress)
- [ ] Convert all forms in map route to use modal forms
- [ ] Use Tailwind CSS for styling and animation
- [ ] Integrate Tailwind CSS
- [ ] Apply company branding (logo + color theme)
- [ ] Add job tray for daily selection
  - [ ] Select jobs into tray
  - [ ] Optional: visualize route between selected jobs

<!-- Completed UI/UX -->

- [x] Add confirmation flash messages to admin panel
- [x] Add autocomplete for client and address fields

## ☁️ Deployment & Integration

- [ ] Migrate project to company-owned infrastructure
- [ ] Integrate Outlook Calendar for scheduling
- [ ] Embed this tool into the company’s existing website

## 🧹 Codebase Organization & Maintenance

- [ ] Full code review and cleanup
- [ ] Refactor project for maintainability using Blueprints

## 📊 Admin Panel Enhancements

- [ ] Add weekly/daily stats display
- [ ] Add restore (undelete) route for soft-deleted jobs

<!-- Completed admin panel -->

- [x] Admin panel: view, edit, delete jobs and fieldwork
- [x] Add job creation form (modal)
- [x] Add fieldwork creation form (modal)
