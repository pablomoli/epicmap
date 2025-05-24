// Map Configuration
const INITIAL_CENTER = [28.5383, -81];
const INITIAL_ZOOM = 10;
const MAX_GEOCODE_CALLS = 10;

// Application State
const AppState = {
  map: null,
  markerCluster: null,
  lastFetchedJobs: [],
  selectedJobNumber: null,
  searchMarker: null,
};

// Job Creation State
let geocodeCallCount = 0;
const addressCache = new Map();
const geocodeCache = new Map();

// Company Color System - Epic Surveying & Mapping, LLC
const EPIC_COLORS = {
  "On Hold/Pending": "#C0C0C0",
  "Needs Fieldwork": "#FFA500",
  "Fieldwork Complete/Needs Office Work": "#8A2BE2",
  "To Be Printed/Packaged": "#1E90FF",
  "Survey Complete/Invoice Sent/Unpaid": "#FFFF00",
  "Set/Flag Pins": "#FF0000",
  "Completed/To Be Filed": "#9ACD32",
  "Ongoing Site Plan": "#FF69B4",
  "Estimate/Quote Available": "#607080",
};

// Status Icons Mapping (used for dropdown options)
const statusIcons = {
  "On Hold/Pending": "grey",
  "Needs Fieldwork": "orange",
  "Fieldwork Complete/Needs Office Work": "violet",
  "To Be Printed/Packaged": "blue",
  "Survey Complete/Invoice Sent/Unpaid": "yellow",
  "Set/Flag Pins": "red",
  "Completed/To Be Filed": "green",
  "Ongoing Site Plan": "pink",
  "Estimate/Quote Available": "gray",
};

// Utility Functions
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function showLoading(show) {
  const loadingEl = document.getElementById("loading-indicator");
  if (show) {
    loadingEl.classList.add("show");
  } else {
    loadingEl.classList.remove("show");
  }
}

// Modal Control Functions - Updated for spa-modal classes
function openModal(id) {
  // Handle special modal population
  if (id === "editJobModal") {
    populateEditJobModal();
  }

  const modal = document.getElementById(id);
  modal.style.display = "block";
  setTimeout(() => modal.classList.add("show"), 10);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("show");
  setTimeout(() => (modal.style.display = "none"), 300);
}

// Click outside to close modals - Updated for spa-modal
window.onclick = function (event) {
  const modals = document.querySelectorAll(".spa-modal");
  modals.forEach((m) => {
    if (event.target === m) {
      closeModal(m.id);
    }
  });
};

// SVG Marker Functions
function createEpicMarkerSVG(status) {
  const color = EPIC_COLORS[status] || EPIC_COLORS["To Be Printed/Packaged"];

  return `
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="1" dy="2" stdDeviation="1" flood-opacity="0.3"/>
        </filter>
      </defs>
      
      <!-- Drop shadow -->
      <ellipse cx="12.5" cy="38" rx="8" ry="3" fill="rgba(0,0,0,0.3)"/>
      
      <!-- Main marker shape -->
      <path d="M12.5 2C6.7 2 2 6.7 2 12.5c0 7.3 10.5 26.5 10.5 26.5s10.5-19.2 10.5-26.5C23 6.7 18.3 2 12.5 2z" 
            fill="${color}" 
            stroke="#333" 
            stroke-width="1.5"
            filter="url(#marker-shadow)"/>
      
      <!-- Inner circle -->
      <circle cx="12.5" cy="12.5" r="6" fill="white" stroke="#333" stroke-width="1"/>
      
      <!-- Inner dot -->
      <circle cx="12.5" cy="12.5" r="3" fill="${color}"/>
    </svg>
  `;
}

function getStatusIcon(status) {
  return L.divIcon({
    html: createEpicMarkerSVG(status),
    className: "epic-svg-marker",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
}

// Map Setup
const baseMaps = {
  "Esri Satellite": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri" },
  ),
  OpenStreetMap: L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "© OpenStreetMap contributors" },
  ),
};

const countiesLayer = L.geoJSON(null, {
  style: { color: "#f00", weight: 1, fillOpacity: 0 },
});

const countyLabelsLayer = L.layerGroup();

// Initialize Map
AppState.map = L.map("map", {
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  layers: [baseMaps["Esri Satellite"]],
});

L.control
  .layers(baseMaps, {
    "Florida Counties": L.layerGroup([countiesLayer, countyLabelsLayer]),
  })
  .addTo(AppState.map);
const referenceLocations = [
  {
    id: "epic-office",
    name: "Epicenter",
    lat: 28.5401,
    lng: -81.3791,
  },
  {
    id: "it",
    name: "Island Title",
    lat: 28.5502,
    lng: -81.4004,
  },

  {
    id: "hubbard",
    name: "Hubbard",
    lat: 28.5502,
    lng: -81.4004,
  },
];

referenceLocations.forEach((loc) => {
  const marker = L.marker([loc.lat, loc.lng], {
    icon: getStatusIcon("Ongoing Site Plan"),
  }).addTo(AppState.map);
  marker.bindTooltip(loc.name, { permanent: false });

  marker.on("click", () => {
    toggleTraySelection(loc);
  });
});

// Load Counties
fetch("/static/data/florida_counties.geojson")
  .then((res) => res.json())
  .then((data) => {
    countiesLayer.addData(data);
    data.features.forEach((feature) => {
      const name = feature.properties.NAME;
      const center = turf.center(feature).geometry.coordinates;
      const label = L.marker([center[1], center[0]], {
        icon: L.divIcon({
          className: "county-label",
          html: name,
          iconSize: [100, 20],
          iconAnchor: [50, 10],
        }),
        interactive: false,
      });
      countyLabelsLayer.addLayer(label);
    });
  })
  .catch((err) => console.error("County load failed:", err));

// Job Management Functions
function fetchJobs(params = {}) {
  if (AppState.markerCluster) {
    AppState.map.removeLayer(AppState.markerCluster);
  }

  const query = new URLSearchParams(params).toString();
  return fetch(`/jobs?${query}`)
    .then((res) => res.json())
    .then((data) => {
      AppState.lastFetchedJobs = data;
      const cluster = renderMarkers(data);
      AppState.markerCluster = cluster;
      AppState.map.addLayer(cluster);
    });
}

function renderMarkers(jobs) {
  const cluster = L.markerClusterGroup();
  jobs.forEach((job) => {
    // Use correct field names from to_dict() method
    if (job.latitude && job.longitude) {
      const lat = parseFloat(job.latitude);
      const lng = parseFloat(job.longitude);

      // Validate coordinates
      if (!isNaN(lat) && !isNaN(lng)) {
        const marker = L.marker([lat, lng], {
          icon: getStatusIcon(job.status),
        });
        marker.on("click", () => showJobDetails(job));
        cluster.addLayer(marker);
      }
    }
  });
  return cluster;
}

function refreshSidebarJob(job_number) {
  fetch(`/jobs?job_number=${job_number}`)
    .then((res) => res.json())
    .then((data) => {
      const updatedJob = data[0];
      if (updatedJob) {
        AppState.lastFetchedJobs = AppState.lastFetchedJobs.map((j) =>
          j.job_number === job_number ? updatedJob : j,
        );
        showJobDetails(updatedJob);
      }
    });
}

// Job Details & Editing - Updated for unified styling
function showJobDetails(job) {
  AppState.selectedJobNumber = job.job_number;
  document.getElementById("visited-count").textContent = job.visited || 0;
  document.getElementById("total-time-spent").textContent = Number(
    job.total_time_spent || 0,
  ).toFixed(2);

  const panel = document.getElementById("info-panel");
  const content = document.getElementById("info-content");

  // Enhanced content with better styling
  content.innerHTML = `
    <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 1rem; margin-bottom: 1rem;">
      <h3 style="margin: 0 0 0.5rem 0; color: #2196f3; font-size: 1.2rem;">Job #${job.job_number}</h3>
      <p style="margin: 0.25rem 0; color: #666;"><strong>Client:</strong> ${job.client}</p>
      <p style="margin: 0.25rem 0; color: #666;"><strong>Address:</strong> ${job.address}</p>
      ${job.status ? `<p style="margin: 0.25rem 0;"><strong>Status:</strong> <span style="padding: 2px 8px; background: #e3f2fd; color: #1976d2; border-radius: 4px; font-size: 0.8rem;">${job.status}</span></p>` : ""}
      ${job.county ? `<p style="margin: 0.25rem 0; color: #666;"><strong>County:</strong> ${job.county}</p>` : ""}
    </div>
    
    ${job.notes ? `<div style="margin: 1rem 0;"><strong>Notes:</strong><br><p style="color: #666; font-style: italic; margin: 0.5rem 0;">${job.notes}</p></div>` : ""}
    
    <div style="display: flex; gap: 8px; margin: 1rem 0; flex-wrap: wrap;">
      <button onclick="openModal('editJobModal')" class="spa-btn spa-btn-primary spa-btn-small">✏️ Edit Job</button>
      <button onclick="openModal('addFieldworkModal')" class="spa-btn spa-btn-success spa-btn-small">➕ Add Fieldwork</button>
    </div>
    
    ${
      job.prop_appr_link || job.plat_link || job.fema_link || job.document_url
        ? `
      <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 6px;">
        <strong style="color: #333;">Resources:</strong>
        <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 4px;">
          ${job.prop_appr_link ? `<a href="${job.prop_appr_link}" target="_blank" style="color: #2196f3; text-decoration: none; font-size: 0.9rem;">📄 Property Appraiser</a>` : ""}
          ${job.plat_link ? `<a href="${job.plat_link}" target="_blank" style="color: #2196f3; text-decoration: none; font-size: 0.9rem;">📋 Plat Document</a>` : ""}
          ${job.fema_link ? `<a href="${job.fema_link}" target="_blank" style="color: #2196f3; text-decoration: none; font-size: 0.9rem;">🗺️ FEMA Map</a>` : ""}
          ${job.document_url ? `<a href="${job.document_url}" target="_blank" style="color: #2196f3; text-decoration: none; font-size: 0.9rem;">📁 Document</a>` : ""}
        </div>
      </div>
    `
        : ""
    }
    
    ${job.created_at ? `<p style="font-size: 0.8rem; color: #999; margin-top: 1rem;"><strong>Created:</strong> ${new Date(job.created_at).toLocaleDateString()}</p>` : ""}
  `;

  // Load fieldwork entries with enhanced styling
  fetch(`/jobs/${job.job_number}/fieldwork`)
    .then((res) => res.json())
    .then((entries) => {
      const list = document.getElementById("fieldwork-list");
      if (!entries.length) {
        list.innerHTML =
          "<li style='color: #666; font-style: italic; padding: 0.5rem; text-align: center;'>No entries yet.</li>";
        return;
      }
      list.innerHTML = entries
        .map(
          (entry) => `
          <li style="
            padding: 0.75rem;
            margin: 0.5rem 0;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 3px solid #2196f3;
          ">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <strong style="color: #333;">${entry.work_date}</strong><br>
                <span style="color: #666; font-size: 0.9rem;">${entry.start_time}–${entry.end_time}</span>
                ${entry.crew ? `<br><span style="color: #666; font-size: 0.8rem;">Crew: ${entry.crew}</span>` : ""}
                ${entry.drone_card ? `<br><span style="color: #666; font-size: 0.8rem;">Drone: ${entry.drone_card}</span>` : ""}
              </div>
              <button onclick="openEditFieldworkModal(${entry.id}, '${entry.work_date}', '${entry.start_time}', '${entry.end_time}', '${entry.crew || ""}', '${entry.drone_card || ""}')" 
                      class="spa-btn spa-btn-primary spa-btn-small">
                ✏️
              </button>
            </div>
          </li>
        `,
        )
        .join("");
    });

  panel.classList.add("visible");
}

// Function to open edit fieldwork modal with data
function openEditFieldworkModal(
  id,
  workDate,
  startTime,
  endTime,
  crew,
  droneCard,
) {
  // Populate the edit fieldwork form
  document.getElementById("edit-fieldwork-id").value = id;
  document.getElementById("edit-work-date").value = workDate;
  document.getElementById("edit-start-time").value = startTime;
  document.getElementById("edit-end-time").value = endTime;
  document.getElementById("edit-crew").value = crew;
  document.getElementById("edit-drone-card").value = droneCard;

  openModal("editFieldworkModal");
}

// Function to populate edit job modal
function populateEditJobModal() {
  const job = AppState.lastFetchedJobs.find(
    (j) => j.job_number === AppState.selectedJobNumber,
  );
  if (!job) return;

  document.getElementById("edit-job-number").value = job.job_number;
  document.getElementById("edit-client").value = job.client || "";
  document.getElementById("edit-address").value = job.address || "";
  document.getElementById("edit-county").value = job.county || "";
  document.getElementById("edit-status").value = job.status || "";
  document.getElementById("edit-notes").value = job.notes || "";
  document.getElementById("edit-prop-appr-link").value =
    job.prop_appr_link || "";
  document.getElementById("edit-plat-link").value = job.plat_link || "";
  document.getElementById("edit-fema-link").value = job.fema_link || "";
  document.getElementById("edit-document-url").value = job.document_url || "";
}

// Legacy function for compatibility
function editJob(job_number) {
  const job = AppState.lastFetchedJobs.find((j) => j.job_number === job_number);
  if (!job) return;

  const content = document.getElementById("info-content");
  content.innerHTML = `
    <div id="job-edit-form">
      <h3>Edit Job #${job.job_number}</h3>
      <form id="edit-form" class="spa-form">
        <input name="client" value="${job.client || ""}" placeholder="Client" class="spa-input" />
        <input name="address" value="${job.address || ""}" placeholder="Address" class="spa-input" />
        <input name="county" value="${job.county || ""}" placeholder="County" class="spa-input" />
        <select name="status" class="spa-input">
          <option value="">Select Status</option>
          ${Object.keys(statusIcons)
            .map(
              (status) =>
                `<option value="${status}" ${status === job.status ? "selected" : ""}>${status}</option>`,
            )
            .join("")}
        </select>
        <textarea name="notes" rows="3" placeholder="Notes" class="spa-input">${job.notes || ""}</textarea>
        <input name="prop_appr_link" value="${job.prop_appr_link || ""}" placeholder="Property Appraiser Link" class="spa-input" />
        <input name="plat_link" value="${job.plat_link || ""}" placeholder="Plat Link" class="spa-input" />
        <input name="fema_link" value="${job.fema_link || ""}" placeholder="FEMA Link" class="spa-input" />
        <input name="document_url" value="${job.document_url || ""}" placeholder="Document URL" class="spa-input" />
        <div style="display: flex; gap: 10px; margin-top: 1rem;">
          <button type="submit" class="spa-btn spa-btn-success">Save</button>
          <button type="button" id="cancel-edit" class="spa-btn spa-btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById("edit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const form = this;
    const updated = {};

    // Collect all form fields
    if (form.client.value.trim()) updated.client = form.client.value.trim();
    if (form.county.value.trim()) updated.county = form.county.value.trim();
    if (form.status.value.trim()) updated.status = form.status.value.trim();
    if (form.notes.value.trim()) updated.notes = form.notes.value.trim();
    if (form.prop_appr_link.value.trim())
      updated.prop_appr_link = form.prop_appr_link.value.trim();
    if (form.plat_link.value.trim())
      updated.plat_link = form.plat_link.value.trim();
    if (form.fema_link.value.trim())
      updated.fema_link = form.fema_link.value.trim();
    if (form.document_url.value.trim())
      updated.document_url = form.document_url.value.trim();

    const newAddress = form.address.value.trim();
    const oldAddress = job.address;

    if (newAddress && newAddress !== oldAddress) {
      updated.address = newAddress;
      fetch(`/geocode?address=${encodeURIComponent(newAddress)}`)
        .then((res) => res.json())
        .then((geo) => {
          if (!geo.lat || !geo.lon) {
            alert("Geocoding failed. Address not updated.");
            return;
          }
          updated.address = geo.formatted_address;
          updated.lat = geo.lat.toString();
          updated.long = geo.lon.toString();
          updated.county = geo.county;
          submitUpdate(updated);
        })
        .catch((err) => {
          console.error("Geocode error:", err);
          alert("Could not geocode address.");
        });
    } else {
      submitUpdate(updated);
    }
  });

  document.getElementById("cancel-edit").addEventListener("click", () => {
    showJobDetails(job);
  });
}

function submitUpdate(updated) {
  fetch(`/jobs/${AppState.selectedJobNumber}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) {
        alert(data.error);
        return;
      }
      alert("Job updated!");
      fetchJobs();
      Object.assign(
        AppState.lastFetchedJobs.find(
          (j) => j.job_number === AppState.selectedJobNumber,
        ),
        data,
      );
      showJobDetails(data);
    });
}

// Address Search & Geocoding
function processGeocodeResult(data) {
  if (!data.lat || !data.lon) {
    alert("Address not found.");
    return;
  }

  if (AppState.searchMarker) AppState.map.removeLayer(AppState.searchMarker);
  AppState.searchMarker = L.marker([data.lat, data.lon])
    .addTo(AppState.map)
    .bindPopup(`<b>Result</b><br>${data.formatted_address}`)
    .openPopup();

  AppState.map.flyTo([data.lat, data.lon], 18, {
    animate: true,
    duration: 1.5,
  });
}

function setupAddressAutocomplete() {
  const addressInput = document.getElementById("job-address");
  const suggestionsDiv = document.getElementById("address-suggestions");

  if (!addressInput) return;

  const debouncedGeocode = debounce(async (address) => {
    if (address.length < 5) {
      suggestionsDiv.style.display = "none";
      return;
    }

    // Check cache first
    if (addressCache.has(address)) {
      const cached = addressCache.get(address);
      showAddressSuggestion(cached, suggestionsDiv);
      return;
    }

    // Limit API calls
    if (geocodeCallCount >= MAX_GEOCODE_CALLS) {
      console.log("Geocoding limit reached for this session");
      return;
    }

    try {
      geocodeCallCount++;
      const response = await fetch(
        `/geocode?address=${encodeURIComponent(address)}`,
      );
      const data = await response.json();

      if (data.error) {
        console.log("Geocoding error:", data.error);
        return;
      }

      addressCache.set(address, data);
      showAddressSuggestion(data, suggestionsDiv);
    } catch (error) {
      console.error("Geocoding failed:", error);
    }
  }, 300);

  addressInput.addEventListener("input", (e) => {
    debouncedGeocode(e.target.value);
  });
}

function showAddressSuggestion(geocodeData, container) {
  if (!geocodeData.formatted_address) return;

  container.innerHTML = `
    <div style="padding: 8px; background: #f0f0f0; border: 1px solid #ccc; cursor: pointer;" 
         onclick="selectSuggestedAddress('${geocodeData.formatted_address}')">
      📍 ${geocodeData.formatted_address}
      ${geocodeData.county ? ` (${geocodeData.county} County)` : ""}
    </div>
  `;
  container.style.display = "block";
}

function selectSuggestedAddress(address) {
  document.getElementById("job-address").value = address;
  document.getElementById("address-suggestions").style.display = "none";
}

// Event Handlers
const filterFormHandler = debounce(function (e) {
  e.preventDefault();
  const client = document.getElementById("client").value;
  const job_number = document.getElementById("job_number").value;
  const status = document.getElementById("status").value;
  fetchJobs({ client, job_number, status });
}, 300);

const searchFormHandler = function (e) {
  e.preventDefault();
  console.log("Search form submitted - handler working!");

  const address = document.getElementById("search").value.trim();
  console.log("Searching for:", address);

  if (!address) {
    alert("Please enter an address to search");
    return;
  }

  // Check cache first
  if (geocodeCache.has(address)) {
    console.log("Using cached result");
    processGeocodeResult(geocodeCache.get(address));
    return;
  }

  console.log("Making geocoding request...");
  showLoading(true);

  fetch(`/geocode?address=${encodeURIComponent(address)}`)
    .then((res) => {
      console.log("Geocode response received, status:", res.status);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json();
    })
    .then((data) => {
      console.log("Geocode data:", data);
      showLoading(false);

      if (data.error) {
        alert(`Geocoding error: ${data.error}`);
        return;
      }

      geocodeCache.set(address, data);
      processGeocodeResult(data);
    })
    .catch((err) => {
      showLoading(false);
      console.error("Geocoding error:", err);
      alert(`Could not geocode address: ${err.message}`);
    });
};

function clearFilters() {
  document.getElementById("filterForm").reset();
  fetchJobs();
}

// Initialize Event Listeners
document.addEventListener("DOMContentLoaded", function () {
  setupAddressAutocomplete();

  // Filter form
  document
    .getElementById("filterForm")
    .addEventListener("submit", filterFormHandler);

  // Search form
  const searchForm = document.getElementById("searchForm");
  if (searchForm) {
    console.log("Attaching search form listener");
    searchForm.addEventListener("submit", searchFormHandler);
  } else {
    console.error("Search form not found!");
  }

  // Close panel
  document.getElementById("close-panel").addEventListener("click", () => {
    document.getElementById("info-panel").classList.remove("visible");
  });

  // Reset map
  document.getElementById("reset-map").addEventListener("click", () => {
    AppState.map.flyTo(INITIAL_CENTER, INITIAL_ZOOM);
  });

  // Job creation form
  const createJobForm = document.getElementById("createJobForm");
  if (createJobForm) {
    createJobForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const submitButton = this.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = "Creating...";
      submitButton.disabled = true;

      try {
        const response = await fetch("/", {
          method: "POST",
          body: formData,
        });
        const result = await response.json();

        if (result.success) {
          alert("Job created successfully!");
          closeModal("createJobModal");
          this.reset();
          fetchJobs();
          geocodeCallCount = 0;
        } else {
          alert(result.error || "Failed to create job");
        }
      } catch (error) {
        console.error("Error creating job:", error);
        alert("Failed to create job. Please try again.");
      } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      }
    });
  }

  // Edit job form
  const editJobForm = document.getElementById("editJobForm");
  if (editJobForm) {
    editJobForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const updated = Object.fromEntries(formData.entries());

      try {
        const response = await fetch(`/jobs/${AppState.selectedJobNumber}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });

        const result = await response.json();
        if (result.error) {
          alert(result.error);
          return;
        }

        alert("Job updated!");
        closeModal("editJobModal");
        fetchJobs();
        refreshSidebarJob(AppState.selectedJobNumber);
      } catch (error) {
        console.error("Error updating job:", error);
        alert("Failed to update job. Please try again.");
      }
    });
  }

  // Add fieldwork form
  const addFieldworkForm = document.getElementById("addFieldworkForm");
  if (addFieldworkForm) {
    addFieldworkForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!AppState.selectedJobNumber) {
        alert("Select a job first.");
        return;
      }

      const formData = new FormData(this);
      const payload = Object.fromEntries(formData.entries());

      try {
        const res = await fetch(
          `/jobs/${AppState.selectedJobNumber}/fieldwork`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

        const result = await res.json();
        if (res.ok) {
          alert("Field work added!");
          closeModal("addFieldworkModal");
          this.reset();
          refreshSidebarJob(AppState.selectedJobNumber);
        } else {
          alert(result.error || "Failed to save field work.");
        }
      } catch (err) {
        console.error(err);
        alert("Server error.");
      }
    });
  }

  // Edit fieldwork form
  const editFieldworkForm = document.getElementById("editFieldworkForm");
  if (editFieldworkForm) {
    editFieldworkForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const updated = Object.fromEntries(formData.entries());
      const fieldworkId = document.getElementById("edit-fieldwork-id").value;

      try {
        const response = await fetch(`/fieldwork/${fieldworkId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });

        const result = await response.json();
        if (response.ok) {
          alert("Field work updated!");
          closeModal("editFieldworkModal");
          refreshSidebarJob(AppState.selectedJobNumber);
        } else {
          alert(result.error || "Failed to update field work.");
        }
      } catch (error) {
        console.error("Error updating fieldwork:", error);
        alert("Failed to update field work. Please try again.");
      }
    });
  }
});

// Load initial jobs
fetchJobs();
