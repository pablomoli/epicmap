const INITIAL_CENTER = [28.5383, -81];
const INITIAL_ZOOM = 10;

function refreshSidebarJob(jobNumber) {
  fetch(`/jobs?job_number=${jobNumber}`)
    .then((res) => res.json())
    .then((data) => {
      const updatedJob = data[0];
      if (updatedJob) {
        Object.assign(
          window.lastFetchedJobs.find((j) => j.JobNumber === jobNumber),
          updatedJob,
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

// ==========================
// 🌐 Base & Overlay Layers
// ==========================
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
window.lastFetchedJobs = [];
let selectedJobNumber = null;

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

let map = L.map("map", {
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  layers: [baseMaps["Esri Satellite"]],
});

L.control
  .layers(baseMaps, {
    "Florida Counties": L.layerGroup([countiesLayer, countyLabelsLayer]),
  })
  .addTo(map);

function editJob(jobNumber) {
  const job = window.lastFetchedJobs.find((j) => j.JobNumber === jobNumber);
  if (!job) return;

  const content = document.getElementById("info-content");
  content.innerHTML = `
    <div id="job-edit-form">
      <h3>Edit Job #${job.JobNumber}</h3>
      <form id="edit-form">
        <label>Client: <input name="client" value="${job.Client || ""}" /></label><br />
        <label>Address: <input name="address" value="${job.Address || ""}" /></label><br />
        <label>Status:
          <select name="status">
            ${Object.keys(statusIcons)
              .map(
                (status) =>
                  `<option value="${status}" ${
                    status === job.Status ? "selected" : ""
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

    const newAddress = form.address.value.trim();
    const oldAddress = job.Address || job.address;

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

  // ✅ NEW: Cancel just restores the job details view
  document.getElementById("cancel-edit").addEventListener("click", () => {
    showJobDetails(job);
  });
}

function submitUpdate(updated) {
  fetch(`/jobs/${selectedJobNumber}`, {
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
        window.lastFetchedJobs.find((j) => j.JobNumber === selectedJobNumber),
        data,
      );
      showJobDetails(data);
    });
}

function showJobDetails(job) {
  selectedJobNumber = job.JobNumber;
  document.getElementById("visited-count").textContent = job.Visited || 0;
  document.getElementById("total-time-spent").textContent = Number(
    job.TotalTimeSpent || 0,
  ).toFixed(2);

  const panel = document.getElementById("info-panel");
  const content = document.getElementById("info-content");

  content.innerHTML = `
    <h3>Job #${job.JobNumber}</h3>
    <p><strong>Client:</strong> ${job.Client}</p>
    <p><strong>Address:</strong> ${job.Address}</p>
    <p><strong>Status:</strong> ${job.Status || ""}</p>
    ${job.County ? `<p><strong>County:</strong> ${job.County}</p>` : ""}
    ${job.PropertyLink ? `<p><a href="${job.PropertyLink}" target="_blank">View Property Appraiser</a></p>` : ""}
    <button onclick="editJob('${job.JobNumber}')">Edit Job</button>
  `;
  fetch(`/jobs/${job.JobNumber}/fieldwork`)
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
      refreshSidebarJob(data.job_number);
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
  if (window.markerCluster) {
    map.removeLayer(window.markerCluster);
  }

  const query = new URLSearchParams(params).toString();
  fetch(`/jobs?${query}`)
    .then((res) => res.json())
    .then((data) => {
      console.log("Fetched jobs:", data);
      window.lastFetchedJobs = data;
      const cluster = L.markerClusterGroup();
      data.forEach((job) => {
        if (job.Latitude && job.Longitude) {
          const marker = L.marker([job.Latitude, job.Longitude], {
            icon: getStatusIcon(job.Status),
          });
          marker.on("click", () => showJobDetails(job));
          cluster.addLayer(marker);
        }
      });
      window.markerCluster = cluster;
      map.addLayer(cluster);
    });
}

document.getElementById("filterForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const client = document.getElementById("client").value;
  const job_number = document.getElementById("job_number").value;
  const status = document.getElementById("status").value;
  console.log({ client, job_number });
  fetchJobs({ client, job_number, status });
});

function clearFilters() {
  document.getElementById("filterForm").reset();
  fetchJobs();
}

let searchMarker = null;

document.getElementById("searchForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const address = document.getElementById("search").value;
  if (!address) return;

  fetch(`/geocode?address=${encodeURIComponent(address)}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data.lat || !data.lon) {
        alert("Address not found.");
        return;
      }

      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([data.lat, data.lon], { draggable: false })
        .addTo(map)
        .bindPopup(`<b>Result</b><br>${data.formatted_address}`)
        .openPopup();

      map.setView([data.lat, data.lon], 18);
    })
    .catch((err) => {
      console.error("Geocoding error:", err);
      alert("Error finding address.");
    });
});

document
  .getElementById("new-fieldwork")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedJobNumber) {
      alert("Select a job first.");
      return;
    }

    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch(`/jobs/${selectedJobNumber}/fieldwork`, {
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
        refreshSidebarJob(selectedJobNumber);

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
  map.setView(INITIAL_CENTER, INITIAL_ZOOM);
});

fetchJobs();
