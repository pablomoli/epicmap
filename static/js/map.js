const INITIAL_CENTER = [28.5383, -81];
const INITIAL_ZOOM = 10;

const AppState = {
  map: null,
  markerCluster: null,
  lastFetchedJobs: [],
  selectedJobNumber: null,
  searchMarker: null,
};

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

const statusIcons = {
  "On Hold/Pending": "grey",
  "Needs Fieldwork": "orange",
  "Fieldwork Complete/Needs Office Work": "violet",
  "To Be Printed/Packaged": "blue",
  "Survey Complete/Invoice Sent/Unpaid": "yellow",
  "Set/Flag Pins": "red",
  "Completed/To Be Filed": "green",
  "Ongoing Site Plan": "pink",
};

function getStatusIcon(status) {
  const color = statusIcons[status] || "blue";
  return new L.Icon({
    iconUrl: `/static/icons/marker-icon-${color}.png`,
    shadowUrl: "/static/icons/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

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
  style: {
    color: "#f00",
    weight: 1,
    fillOpacity: 0,
  },
});

const countyLabelsLayer = L.layerGroup();

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

function editJob(job_number) {
  const job = AppState.lastFetchedJobs.find((j) => j.job_number === job_number);
  if (!job) return;

  const content = document.getElementById("info-content");
  content.innerHTML = `
    <div id="job-edit-form">
      <h3>Edit Job #${job.job_number}</h3>
      <form id="edit-form">
        <label>Client: <input name="client" value="${job.client || ""}" /></label><br />
        <label>Address: <input name="address" value="${job.address || ""}" /></label><br />
        <label>Status:
          <select name="status">
            ${Object.keys(statusIcons)
              .map(
                (status) =>
                  `<option value="${status}" ${
                    status === job.status ? "selected" : ""
                  }>${status}</option>`,
              )
              .join("")}
          </select>
        </label><br />
        <button type="submit">Save</button>
        <button type="button" id="cancel-edit">Cancel</button>
      </form>
    </div>
  `;

  document.getElementById("edit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const form = this;
    const updated = {};
    if (form.client.value.trim()) updated.client = form.client.value.trim();
    if (form.status.value.trim()) updated.status = form.status.value.trim();

    const newaddress = form.address.value.trim();
    const oldaddress = job.address || job.address;

    if (newaddress && newaddress !== oldaddress) {
      updated.address = newaddress;
      fetch(`/geocode?address=${encodeURIComponent(newaddress)}`)
        .then((res) => res.json())
        .then((geo) => {
          if (!geo.lat || !geo.lon) {
            alert("Geocoding failed. address not updated.");
            return;
          }
          updated.address = geo.formatted_address;
          updated.latitude = geo.lat;
          updated.longitude = geo.lon;
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

function showJobDetails(job) {
  AppState.selectedJobNumber = job.job_number;
  document.getElementById("visited-count").textContent = job.visited || 0;
  document.getElementById("total-time-spent").textContent = Number(
    job.total_time_spent || 0,
  ).toFixed(2);

  const panel = document.getElementById("info-panel");
  const content = document.getElementById("info-content");

  content.innerHTML = `
    <h3>Job #${job.job_number}</h3>
    <p><strong>client:</strong> ${job.client}</p>
    <p><strong>address:</strong> ${job.address}</p>
    <p><strong>Status:</strong> ${job.status || ""}</p>
    ${job.county ? `<p><strong>County:</strong> ${job.county}</p>` : ""}
    ${job.prop_appr_link ? `<p><a href="${job.prop_appr_link}" target="_blank">View Property Appraiser</a></p>` : ""}
    <button onclick="editJob('${job.job_number}')">Edit Job</button>
  `;
  fetch(`/jobs/${job.job_number}/fieldwork`)
    .then((res) => res.json())
    .then((entries) => {
      const list = document.getElementById("fieldwork-list");
      if (!entries.length) {
        list.innerHTML = "<li>No entries yet.</li>";
        return;
      }
      list.innerHTML = entries
        .map(
          (entry) => `
      <li id="fieldwork-entry-${entry.id}">
        ${entry.work_date} | ${entry.start_time}–${entry.end_time}
        ${entry.crew ? ` | Crew: ${entry.crew}` : ""}
        ${entry.drone_card ? ` | Drone: ${entry.drone_card}` : ""}
        <button onclick="toggleEditFieldwork(${entry.id})">✏️ Edit</button>
        <div id="fieldwork-edit-${entry.id}" style="display:none;">
          <form onsubmit="submitFieldworkEdit(event, ${entry.id})">
            <input type="date" name="work_date" value="${entry.work_date}" required />
            <input type="time" name="start_time" value="${entry.start_time}" required />
            <input type="time" name="end_time" value="${entry.end_time}" required />
            <input type="text" name="crew" placeholder="Crew" value="${entry.crew || ""}" />
            <input type="text" name="drone_card" placeholder="Drone Card" value="${entry.drone_card || ""}" />
            <button type="submit">Save</button>
          </form>
        </div>
      </li>
    `,
        )
        .join("");
    });

  panel.classList.add("visible");
}
function toggleFieldWorkForm() {
  const form = document.getElementById("fieldwork-form");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

function toggleEditFieldwork(id) {
  const el = document.getElementById(`fieldwork-edit-${id}`);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function submitFieldworkEdit(event, id) {
  event.preventDefault();
  const form = event.target;

  const updated = {
    work_date: form.work_date.value,
    start_time: form.start_time.value,
    end_time: form.end_time.value,
    crew: form.crew.value,
    drone_card: form.drone_card.value,
  };

  fetch(`/fieldwork/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  })
    .then((res) => res.json())
    .then((data) => {
      alert("Field work updated.");
      refreshSidebarJob(AppState.selectedJobNumber);
    })
    .catch((err) => {
      console.error("Update failed", err);
      alert("Failed to update field work.");
    });
}

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("info-panel").classList.remove("visible");
});

function fetchJobs(params = {}) {
  if (AppState.markerCluster) {
    AppState.map.removeLayer(AppState.markerCluster);
  }

  const query = new URLSearchParams(params).toString();
  return fetch(`/jobs?${query}`)
    .then((res) => res.json())
    .then((data) => {
      // console.log("Fetched jobs:", data);
      AppState.lastFetchedJobs = data;
      const cluster = renderMarkers(data);
      AppState.markerCluster = cluster;
      AppState.map.addLayer(cluster);
    });
}

const filterFormHandler = debounce(function (e) {
  e.preventDefault();
  const client = document.getElementById("client").value;
  const job_number = document.getElementById("job_number").value;
  const status = document.getElementById("status").value;

  fetchJobs({ client, job_number, status });
}, 300); // 300ms debounce

document
  .getElementById("filterForm")
  .addEventListener("submit", filterFormHandler);

function clearFilters() {
  document.getElementById("filterForm").reset();
  fetchJobs();
}

const searchFormHandler = debounce(function (e) {
  e.preventDefault();
  const address = document.getElementById("search").value.trim();
  if (!address) return;

  // Check cache first
  if (geocodeCache.has(address)) {
    processGeocodeResult(geocodeCache.get(address));
    return;
  }

  showLoading(true);

  fetch(`/geocode?address=${encodeURIComponent(address)}`)
    .then((res) => res.json())
    .then((data) => {
      showLoading(false);

      if (data.error) {
        alert(data.error);
        return;
      }

      // Save in cache
      geocodeCache.set(address, data);
      processGeocodeResult(data);
    })
    .catch((err) => {
      showLoading(false);
      console.error("Geocoding error:", err);
      alert("Could not geocode address.");
    });
}, 300); // 300ms debounce delay

document
  .getElementById("searchForm")
  .addEventListener("submit", searchFormHandler);

document
  .getElementById("new-fieldwork")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!AppState.selectedJobNumber) {
      alert("Select a job first.");
      return;
    }

    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch(`/jobs/${AppState.selectedJobNumber}/fieldwork`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (res.ok) {
        alert("Field work added!");

        // Refetch the latest job info and show the sidebar again
        refreshSidebarJob(AppState.selectedJobNumber);

        e.target.reset();
      } else {
        alert(result.error || "Failed to save field work.");
      }
    } catch (err) {
      console.error(err);
      alert("Server error.");
    }
  });
document.getElementById("reset-map").addEventListener("click", () => {
  AppState.map.flyTo(INITIAL_CENTER, INITIAL_ZOOM);
});
function renderMarkers(jobs) {
  const cluster = L.markerClusterGroup();
  jobs.forEach((job) => {
    if (job.latitude && job.longitude) {
      const marker = L.marker([job.latitude, job.longitude], {
        icon: getStatusIcon(job.Status),
      });
      marker.on("click", () => showJobDetails(job));
      cluster.addLayer(marker);
    }
  });
  return cluster;
}
async function loadJobsWithMarkers(params = {}) {
  const data = await fetchJobs(params);
  renderMarkers(data);
}
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}
const geocodeCache = new Map();

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

  AppState.map.setView([data.lat, data.lon], 18);
}

function showLoading(show) {
  document.getElementById("loading-indicator").style.display = show
    ? "block"
    : "none";
}

fetchJobs();
