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
window.lastFetchedJobs = []; // add this at top

// Fetch and add counties + labels
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

// ==========================
// 🗺️ Map Initialization
// ==========================
let map = L.map("map", {
  center: [28.5383, -81.3792],
  zoom: 9,
  layers: [baseMaps["Esri Satellite"]],
});

L.control
  .layers(baseMaps, {
    "Florida Counties": L.layerGroup([countiesLayer, countyLabelsLayer]),
  })
  .addTo(map);

// ==========================
// 📍 Marker + Side Panel
// ==========================
let markers = [];
function editJob(jobNumber) {
  const job = window.lastFetchedJobs.find((j) => j.JobNumber === jobNumber);
  if (!job) return;

  const content = document.getElementById("info-content");
  content.innerHTML = `
    <h3>Edit Job #${job.JobNumber}</h3>
    <form id="edit-form">
      <label>Crew: <input name="crew" value="${job.Crew}" /></label><br />
      <label>Client: <input name="client" value="${job.Client}" /></label><br />
      <label>Address: <input name="address" value="${job.Address}" /></label><br />
      <label>Date: <input name="date" type="date" value="${job.Date.slice(0, 10)}" /></label><br />
      <button type="submit">Save</button>
      <button type="button" onclick="fetchJobs()">Cancel</button>
    </form>
  `;

  document.getElementById("edit-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const updated = {
      crew: this.crew.value,
      client: this.client.value,
      address: this.address.value,
      date: this.date.value,
    };

    fetch(`/jobs/${job.JobNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error); // Or render it in the sidebar if you prefer
          return;
        }
        alert("Job updated!");
        fetchJobs();
        document.getElementById("info-panel").classList.remove("visible");
      });
  });
}

function showJobDetails(job) {
  const panel = document.getElementById("info-panel");
  const content = document.getElementById("info-content");
  content.innerHTML = `
  <h3>Job #${job.JobNumber}</h3>
  <p><strong>Client:</strong> ${job.Client}</p>
  <p><strong>Address:</strong> ${job.Address}</p>
  <p><strong>Crew:</strong> ${job.Crew}</p>
  <p><strong>Date:</strong> ${new Date(job.Date).toLocaleDateString()}</p>
  ${job.County ? `<p><strong>County:</strong> ${job.County}</p>` : ""}
  ${job.PropertyLink ? `<p><a href="${job.PropertyLink}" target="_blank">View Property Appraiser</a></p>` : ""}
  <button onclick="editJob('${job.JobNumber}')">Edit Job</button>
`;
  panel.classList.add("visible");
}

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("info-panel").classList.remove("visible");
});

// ==========================
// 🚚 Load Jobs (With Filters)
// ==========================
function fetchJobs(params = {}) {
  if (window.markerCluster) {
    map.removeLayer(window.markerCluster);
  }

  const query = new URLSearchParams(params).toString();
  fetch(`/jobs?${query}`)
    .then((res) => res.json())
    .then((data) => {
      console.log("Fetched jobs:", data); // ✅ Check this in browser dev tools
      window.lastFetchedJobs = data;
      const cluster = L.markerClusterGroup();
      data.forEach((job) => {
        if (job.Latitude && job.Longitude) {
          console.log(
            "Adding marker:",
            job.JobNumber,
            job.Latitude,
            job.Longitude,
          ); // ✅ Log per marker
          const marker = L.marker([job.Latitude, job.Longitude]);
          marker.on("click", () => showJobDetails(job));
          cluster.addLayer(marker);
        }
      });
      map.addLayer(cluster); // ✅ required to display markers
    });
}

// ==========================
// 🎯 Filter Form
// ==========================
document.getElementById("filterForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const crew = document.getElementById("crew").value;
  const client = document.getElementById("client").value;
  const start_date = document.getElementById("start_date").value;
  const end_date = document.getElementById("end_date").value;

  fetchJobs({ crew, client, start_date, end_date });
});

function clearFilters() {
  document.getElementById("filterForm").reset();
  fetchJobs();
}

// ==========================
// 🔍 Address Search Form
// ==========================
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

// ==========================
// 🚀 Initial Load
// ==========================
fetchJobs();
