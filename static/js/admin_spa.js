// Admin SPA Controller - Complete Implementation
class AdminSPA {
  constructor() {
    this.currentSection = "dashboard";
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes

    this.init();
  }

  init() {
    // Set up navigation event listeners
    this.setupNavigation();

    // Handle browser back/forward
    window.addEventListener("popstate", (e) => {
      const section = e.state?.section || "dashboard";
      this.loadSection(section, false);
    });

    // Load initial section based on hash
    const initialSection = window.location.hash.replace("#", "") || "dashboard";
    this.loadSection(initialSection, true);
  }

  setupNavigation() {
    const navItems = document.querySelectorAll(".spa-nav-item");
    navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        this.loadSection(section, true);
      });
    });
  }

  async loadSection(section, updateHistory = true) {
    console.log(`Loading section: ${section}`);

    // Don't reload if already current
    if (section === this.currentSection && this.isCacheValid(section)) {
      return;
    }

    // Show loading
    this.showLoading();

    try {
      // Update navigation
      this.updateNavigation(section);

      // Load content
      await this.loadSectionContent(section);

      // Update browser history
      if (updateHistory) {
        const url = `/admin#${section}`;
        history.pushState({ section }, "", url);
      }

      // Update current section
      this.currentSection = section;
    } catch (error) {
      console.error("Error loading section:", error);
      this.showError(`Failed to load ${section}: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  async loadSectionContent(section) {
    // Check cache first
    if (this.isCacheValid(section)) {
      console.log(`Using cached data for ${section}`);
      const cachedData = this.cache.get(section);
      this.renderSection(section, cachedData);
      return;
    }

    // Fetch fresh data
    console.log(`Fetching fresh data for ${section}`);
    const data = await this.fetchSectionData(section);

    // Cache the data
    this.cache.set(section, data);
    this.cacheTimestamps.set(section, Date.now());

    // Render the section
    this.renderSection(section, data);
  }

  async fetchSectionData(section) {
    const endpoints = {
      dashboard: "/admin/api/dashboard",
      jobs: "/admin/api/jobs",
      users: "/admin/api/users",
    };

    const response = await fetch(endpoints[section]);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  renderSection(section, data) {
    // Hide all sections
    document.querySelectorAll(".content-section").forEach((s) => {
      s.classList.remove("active");
    });

    // Show target section
    const targetSection = document.getElementById(`${section}-section`);
    targetSection.classList.add("active");

    // Render content based on section
    switch (section) {
      case "dashboard":
        this.renderDashboard(data);
        break;
      case "jobs":
        this.renderJobs(data);
        break;
      case "users":
        this.renderUsers(data);
        break;
    }
  }

  renderDashboard(data) {
    const content = document.getElementById("dashboard-content");
    content.innerHTML = `
            <div class="dashboard-grid">
                <div class="metric-card">
                    <div class="metric-number">${data.total_jobs}</div>
                    <div>Total Active Jobs</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${data.total_users}</div>
                    <div>Total Users</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${Object.keys(data.status_counts).length}</div>
                    <div>Active Job Statuses</div>
                </div>
            </div>
            
            <h3>Recent Jobs</h3>
            <table class="spa-table">
                <thead>
                    <tr>
                        <th>Job #</th>
                        <th>Client</th>
                        <th>Status</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.recent_jobs
                      .map(
                        (job) => `
                        <tr>
                            <td>${job.job_number}</td>
                            <td>${job.client}</td>
                            <td>${job.status || "N/A"}</td>
                            <td>${job.created_at ? new Date(job.created_at).toLocaleDateString() : "N/A"}</td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
            
            <h3>Jobs by Status</h3>
            ${Object.entries(data.status_counts)
              .map(
                ([status, count]) => `
                <p><strong>${status}:</strong> ${count} jobs</p>
            `,
              )
              .join("")}
        `;
  }

  renderJobs(data) {
    const content = document.getElementById("jobs-content");
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <button onclick="adminSPA.showCreateJobModal()" class="spa-btn spa-btn-primary">
                + Create New Job
            </button>
        </div>
        
        <!-- Filters -->
        <form id="job-filters" style="margin-bottom: 20px; padding: 15px; background: #f0f0f0; border-radius: 4px;">
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <input type="text" id="filter-job-number" placeholder="Job #" style="padding: 8px;">
                <input type="text" id="filter-client" placeholder="Client" style="padding: 8px;">
                <select id="filter-status" style="padding: 8px;">
                    <option value="">All Statuses</option>
                    ${data.status_options.map((status) => `<option value="${status}">${status}</option>`).join("")}
                </select>
                <button type="button" onclick="adminSPA.applyJobFilters()" class="spa-btn spa-btn-secondary">Filter</button>
                <button type="button" onclick="adminSPA.clearJobFilters()" class="spa-btn spa-btn-secondary">Clear</button>
            </div>
        </form>
        
        <!-- Jobs Table -->
        <table class="spa-table">
            <thead>
                <tr>
                    <th>Job #</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Address</th>
                    <th>County</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${data.jobs
                  .map(
                    (job) => `
                    <tr>
                        <td>${job.job_number}</td>
                        <td>${job.client}</td>
                        <td>${job.status || "N/A"}</td>
                        <td>${job.address}</td>
                        <td>${job.county || "N/A"}</td>
                        <td>
                            <button onclick="adminSPA.editJob('${job.job_number}')" class="spa-btn spa-btn-small spa-btn-primary">Edit</button>
                            <button onclick="adminSPA.deleteJob('${job.job_number}')" class="spa-btn spa-btn-small spa-btn-danger">Delete</button>
                            <button onclick="adminSPA.toggleFieldwork('${job.job_number}')" class="spa-btn spa-btn-small spa-btn-secondary">Fieldwork</button>
                        </td>
                    </tr>
                    <!-- Fieldwork Row (initially hidden) -->
                    <tr id="fieldwork-${job.job_number}" style="display: none;">
                        <td colspan="6" style="padding: 20px; background: #f8f9fa;">
                            <div id="fieldwork-content-${job.job_number}">
                                <p>Loading fieldwork entries...</p>
                            </div>
                        </td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
        
        <!-- Pagination -->
        <div class="pagination">
            <div class="pagination-info">
                Showing ${data.jobs.length} of ${data.total_jobs} jobs
                (Page ${data.current_page} of ${data.total_pages})
            </div>
        </div>
        
        <!-- Job Creation Modal -->
        <div id="createJobModal" class="spa-modal" style="display: none;">
            <div class="spa-modal-content">
                <span class="spa-close" onclick="adminSPA.closeModal('createJobModal')">&times;</span>
                <h2>Create New Job</h2>
                <form id="createJobForm" class="spa-form">
                    <input type="text" id="new-job-number" placeholder="Job Number" required class="spa-input">
                    <input type="text" id="new-client" placeholder="Client" required class="spa-input">
                    <input type="text" id="new-address" placeholder="Address" required class="spa-input">
                    <select id="new-status" class="spa-input">
                        <option value="">Select Status</option>
                        ${data.status_options.map((status) => `<option value="${status}">${status}</option>`).join("")}
                    </select>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" onclick="adminSPA.createJob()" class="spa-btn spa-btn-primary">Create Job</button>
                        <button type="button" onclick="adminSPA.closeModal('createJobModal')" class="spa-btn spa-btn-secondary">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
        
        <!-- Job Edit Modal -->
        <div id="editJobModal" class="spa-modal" style="display: none;">
            <div class="spa-modal-content">
                <span class="spa-close" onclick="adminSPA.closeModal('editJobModal')">&times;</span>
                <h2>Edit Job</h2>
                <form id="editJobForm" class="spa-form">
                    <input type="hidden" id="edit-job-number-hidden">
                    <input type="text" id="edit-job-number" placeholder="Job Number" readonly class="spa-input">
                    <input type="text" id="edit-client" placeholder="Client" required class="spa-input">
                    <input type="text" id="edit-address" placeholder="Address" required class="spa-input">
                    <input type="text" id="edit-county" placeholder="County" class="spa-input">
                    <select id="edit-status" class="spa-input">
                        <option value="">Select Status</option>
                        ${data.status_options.map((status) => `<option value="${status}">${status}</option>`).join("")}
                    </select>
                    <textarea id="edit-notes" placeholder="Notes" rows="3" class="spa-input"></textarea>
                    <input type="url" id="edit-prop-appr-link" placeholder="Property Appraiser Link" class="spa-input">
                    <input type="url" id="edit-plat-link" placeholder="Plat Link" class="spa-input">
                    <input type="url" id="edit-fema-link" placeholder="FEMA Link" class="spa-input">
                    <input type="url" id="edit-document-url" placeholder="Document URL" class="spa-input">
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" onclick="adminSPA.updateJob()" class="spa-btn spa-btn-primary">Update Job</button>
                        <button type="button" onclick="adminSPA.closeModal('editJobModal')" class="spa-btn spa-btn-secondary">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
        
        <!-- Add Fieldwork Modal -->
        <div id="addFieldworkModal" class="spa-modal" style="display: none;">
            <div class="spa-modal-content">
                <span class="spa-close" onclick="adminSPA.closeModal('addFieldworkModal')">&times;</span>
                <h2>Add Fieldwork Entry</h2>
                <form id="addFieldworkForm" class="spa-form">
                    <input type="hidden" id="fieldwork-job-number">
                    <input type="date" id="fieldwork-date" required class="spa-input">
                    <input type="time" id="fieldwork-start" required class="spa-input">
                    <input type="time" id="fieldwork-end" required class="spa-input">
                    <input type="text" id="fieldwork-crew" placeholder="Crew" class="spa-input">
                    <input type="text" id="fieldwork-drone" placeholder="Drone Card" class="spa-input">
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" onclick="adminSPA.addFieldwork()" class="spa-btn spa-btn-primary">Add Entry</button>
                        <button type="button" onclick="adminSPA.closeModal('addFieldworkModal')" class="spa-btn spa-btn-secondary">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
        
        <!-- Edit Fieldwork Modal -->
        <div id="editFieldworkModal" class="spa-modal" style="display: none;">
            <div class="spa-modal-content">
                <span class="spa-close" onclick="adminSPA.closeModal('editFieldworkModal')">&times;</span>
                <h2>Edit Fieldwork Entry</h2>
                <form id="editFieldworkForm" class="spa-form">
                    <input type="hidden" id="edit-fieldwork-id">
                    <input type="date" id="edit-fieldwork-date" required class="spa-input">
                    <input type="time" id="edit-fieldwork-start" required class="spa-input">
                    <input type="time" id="edit-fieldwork-end" required class="spa-input">
                    <input type="text" id="edit-fieldwork-crew" placeholder="Crew" class="spa-input">
                    <input type="text" id="edit-fieldwork-drone" placeholder="Drone Card" class="spa-input">
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" onclick="adminSPA.updateFieldwork()" class="spa-btn spa-btn-primary">Update Entry</button>
                        <button type="button" onclick="adminSPA.closeModal('editFieldworkModal')" class="spa-btn spa-btn-secondary">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
  }
  renderUsers(data) {
    const content = document.getElementById("users-content");
    content.innerHTML = `
            <!-- Create User Form -->
            <div class="spa-form-card">
                <h3>Create New User</h3>
                <form id="create-user-form" class="spa-form">
                    <input type="text" id="user-name" placeholder="Full Name" required class="spa-input">
                    <input type="text" id="user-username" placeholder="Username" required class="spa-input">
                    <input type="password" id="user-password" placeholder="Password" required class="spa-input">
                    <select id="user-role" required class="spa-input">
                        <option value="">Select Role</option>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="button" onclick="adminSPA.createUser()" class="spa-btn spa-btn-primary">Create User</button>
                </form>
            </div>
            
            <!-- Users Table -->
            <table class="spa-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.users
                      .map(
                        (user) => `
                        <tr>
                            <td>${user.username}</td>
                            <td>${user.name}</td>
                            <td>${user.role}</td>
                            <td>${user.last_login || "Never"}</td>
                            <td>
                                <button onclick="adminSPA.resetUserPassword(${user.id})" class="spa-btn spa-btn-small spa-btn-secondary">
                                    Reset Password
                                </button>
                                <button onclick="adminSPA.toggleUserRole(${user.id})" class="spa-btn spa-btn-small spa-btn-warning">
                                    Make ${user.role === "user" ? "Admin" : "User"}
                                </button>
                                ${
                                  user.username !== "admin"
                                    ? `
                                    <button onclick="adminSPA.deleteUser(${user.id}, '${user.username}')" class="spa-btn spa-btn-small spa-btn-danger">
                                        Delete
                                    </button>
                                `
                                    : ""
                                }
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;
  }

  // CRUD Operations - Reusing existing logic patterns

  async createUser() {
    const name = document.getElementById("user-name").value.trim();
    const username = document.getElementById("user-username").value.trim();
    const password = document.getElementById("user-password").value.trim();
    const role = document.getElementById("user-role").value;

    if (!name || !username || !password || !role) {
      this.showError("All fields are required");
      return;
    }

    try {
      const response = await fetch("/admin/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password, role }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("User created successfully");
        document.getElementById("create-user-form").reset();
        this.invalidateCache("users");
        this.loadSection("users", false);
      } else {
        this.showError(result.error || "Failed to create user");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/admin/api/users/${userId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess(result.message);
        this.invalidateCache("users");
        this.loadSection("users", false);
      } else {
        this.showError(result.error || "Failed to delete user");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async deleteJob(jobNumber) {
    if (!confirm(`Are you sure you want to delete job "${jobNumber}"?`)) {
      return;
    }

    try {
      // First get the job to find its ID
      const getResponse = await fetch(
        `/admin/api/jobs?job_number=${jobNumber}`,
      );
      const getData = await getResponse.json();

      if (!getResponse.ok || !getData.jobs || getData.jobs.length === 0) {
        this.showError("Job not found");
        return;
      }

      const jobId = getData.jobs[0].id;

      // Now delete using the existing delete endpoint
      const response = await fetch(`/admin/delete_job/${jobId}`, {
        method: "POST",
      });

      if (response.ok) {
        this.showSuccess(`Job ${jobNumber} deleted successfully`);
        this.invalidateCache("jobs");
        this.invalidateCache("dashboard");
        this.loadSection("jobs", false);
      } else {
        this.showError("Failed to delete job");
      }
    } catch (error) {
      console.error("Delete job error:", error);
      this.showError("Network error: " + error.message);
    }
  }

  async resetUserPassword(userId) {
    const newPassword = prompt("Enter new password:");
    if (!newPassword) return;

    try {
      const response = await fetch(
        `/admin/api/users/${userId}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_password: newPassword }),
        },
      );

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Password reset successfully");
      } else {
        this.showError(result.error || "Failed to reset password");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async toggleUserRole(userId) {
    try {
      const response = await fetch(`/admin/api/users/${userId}/toggle-role`, {
        method: "POST",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess(result.message);
        this.invalidateCache("users");
        this.loadSection("users", false);
      } else {
        this.showError(result.error || "Failed to toggle role");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async applyJobFilters() {
    this.invalidateCache("jobs");

    const params = new URLSearchParams();
    const jobNumber = document.getElementById("filter-job-number").value;
    const client = document.getElementById("filter-client").value;
    const status = document.getElementById("filter-status").value;

    if (jobNumber) params.append("job_number", jobNumber);
    if (client) params.append("client", client);
    if (status) params.append("status", status);

    try {
      const response = await fetch(`/admin/api/jobs?${params}`);
      const data = await response.json();

      this.cache.set("jobs", data);
      this.cacheTimestamps.set("jobs", Date.now());
      this.renderJobs(data);
    } catch (error) {
      this.showError("Failed to filter jobs: " + error.message);
    }
  }

  async clearJobFilters() {
    document.getElementById("filter-job-number").value = "";
    document.getElementById("filter-client").value = "";
    document.getElementById("filter-status").value = "";

    this.invalidateCache("jobs");
    this.loadSection("jobs", false);
  }

  showCreateJobModal() {
    this.openModal("createJobModal");
  }
  async createJob() {
    const jobNumber = document.getElementById("new-job-number").value.trim();
    const client = document.getElementById("new-client").value.trim();
    const address = document.getElementById("new-address").value.trim();
    const status = document.getElementById("new-status").value;

    if (!jobNumber || !client || !address) {
      this.showError("Job number, client, and address are required");
      return;
    }

    try {
      const response = await fetch("/admin/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_number: jobNumber,
          client: client,
          address: address,
          status: status,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Job created successfully");
        this.closeModal("createJobModal");
        document.getElementById("createJobForm").reset();
        this.invalidateCache("jobs");
        this.invalidateCache("dashboard");
        this.loadSection("jobs", false);
      } else {
        this.showError(result.error || "Failed to create job");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async editJob(jobNumber) {
    try {
      // Fetch job details
      const response = await fetch(`/admin/api/jobs?job_number=${jobNumber}`);
      const data = await response.json();

      if (response.ok && data.jobs && data.jobs.length > 0) {
        const job = data.jobs[0]; // Get first job from array

        // Populate edit form
        document.getElementById("edit-job-number-hidden").value =
          job.job_number;
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
        document.getElementById("edit-document-url").value =
          job.document_url || "";

        this.openModal("editJobModal");
      } else {
        this.showError("Failed to load job details");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }
  async updateJob() {
    const jobNumber = document.getElementById("edit-job-number-hidden").value;
    const client = document.getElementById("edit-client").value.trim();
    const address = document.getElementById("edit-address").value.trim();
    const county = document.getElementById("edit-county").value.trim();
    const status = document.getElementById("edit-status").value;
    const notes = document.getElementById("edit-notes").value.trim();
    const propApprLink = document
      .getElementById("edit-prop-appr-link")
      .value.trim();
    const platLink = document.getElementById("edit-plat-link").value.trim();
    const femaLink = document.getElementById("edit-fema-link").value.trim();
    const documentUrl = document
      .getElementById("edit-document-url")
      .value.trim();

    if (!client || !address) {
      this.showError("Client and address are required");
      return;
    }

    try {
      const response = await fetch(`/jobs/${jobNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: client,
          address: address,
          county: county,
          status: status,
          notes: notes,
          prop_appr_link: propApprLink,
          plat_link: platLink,
          fema_link: femaLink,
          document_url: documentUrl,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Job updated successfully");
        this.closeModal("editJobModal");
        this.invalidateCache("jobs");
        this.invalidateCache("dashboard");
        this.loadSection("jobs", false);
      } else {
        this.showError(result.error || "Failed to update job");
      }
    } catch (error) {
      console.error("Update job error:", error);
      this.showError("Network error: " + error.message);
    }
  }
  async toggleFieldwork(jobNumber) {
    const row = document.getElementById(`fieldwork-${jobNumber}`);
    const content = document.getElementById(`fieldwork-content-${jobNumber}`);

    if (row.style.display === "none") {
      // Show and load fieldwork
      row.style.display = "table-row";
      await this.loadFieldwork(jobNumber);
    } else {
      // Hide fieldwork
      row.style.display = "none";
    }
  }

  async loadFieldwork(jobNumber) {
    const content = document.getElementById(`fieldwork-content-${jobNumber}`);
    content.innerHTML = "<p>Loading fieldwork entries...</p>";

    try {
      const response = await fetch(`/jobs/${jobNumber}/fieldwork`);
      const entries = await response.json();

      if (response.ok) {
        this.renderFieldwork(jobNumber, entries);
      } else {
        content.innerHTML = "<p>Failed to load fieldwork entries</p>";
      }
    } catch (error) {
      content.innerHTML = "<p>Error loading fieldwork entries</p>";
    }
  }

  renderFieldwork(jobNumber, entries) {
    const content = document.getElementById(`fieldwork-content-${jobNumber}`);

    let html = `
        <div style="margin-bottom: 15px;">
            <button onclick="adminSPA.showAddFieldworkModal('${jobNumber}')" class="spa-btn spa-btn-small spa-btn-primary">
                + Add Fieldwork
            </button>
        </div>
    `;

    if (entries.length === 0) {
      html += "<p>No fieldwork entries yet.</p>";
    } else {
      html += `
            <table class="spa-table" style="margin-top: 10px;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Crew</th>
                        <th>Drone</th>
                        <th>Total Time</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries
                      .map(
                        (entry) => `
                        <tr>
                            <td>${entry.work_date}</td>
                            <td>${entry.start_time}</td>
                            <td>${entry.end_time}</td>
                            <td>${entry.crew || "N/A"}</td>
                            <td>${entry.drone_card || "N/A"}</td>
                            <td>${entry.total_time || 0} hrs</td>
                            <td>
                                <button onclick="adminSPA.editFieldwork(${entry.id})" class="spa-btn spa-btn-small spa-btn-primary">Edit</button>
                                <button onclick="adminSPA.deleteFieldwork(${entry.id}, '${jobNumber}')" class="spa-btn spa-btn-small spa-btn-danger">Delete</button>
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;
    }

    content.innerHTML = html;
  }

  async showAddFieldworkModal(jobNumber) {
    document.getElementById("fieldwork-job-number").value = jobNumber;
    this.openModal("addFieldworkModal");
  }

  async addFieldwork() {
    const jobNumber = document.getElementById("fieldwork-job-number").value;
    const workDate = document.getElementById("fieldwork-date").value;
    const startTime = document.getElementById("fieldwork-start").value;
    const endTime = document.getElementById("fieldwork-end").value;
    const crew = document.getElementById("fieldwork-crew").value.trim();
    const droneCard = document.getElementById("fieldwork-drone").value.trim();

    if (!workDate || !startTime || !endTime) {
      this.showError("Date, start time, and end time are required");
      return;
    }

    try {
      const response = await fetch(`/jobs/${jobNumber}/fieldwork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          crew: crew,
          drone_card: droneCard,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Fieldwork entry added");
        this.closeModal("addFieldworkModal");
        document.getElementById("addFieldworkForm").reset();
        await this.loadFieldwork(jobNumber);
      } else {
        this.showError(result.error || "Failed to add fieldwork entry");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async editFieldwork(fieldworkId) {
    try {
      const response = await fetch(`/fieldwork/${fieldworkId}`);
      const entry = await response.json();

      if (response.ok) {
        document.getElementById("edit-fieldwork-id").value = entry.id;
        document.getElementById("edit-fieldwork-date").value = entry.work_date;
        document.getElementById("edit-fieldwork-start").value =
          entry.start_time;
        document.getElementById("edit-fieldwork-end").value = entry.end_time;
        document.getElementById("edit-fieldwork-crew").value = entry.crew || "";
        document.getElementById("edit-fieldwork-drone").value =
          entry.drone_card || "";

        this.openModal("editFieldworkModal");
      } else {
        this.showError("Failed to load fieldwork details");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async updateFieldwork() {
    const fieldworkId = document.getElementById("edit-fieldwork-id").value;
    const workDate = document.getElementById("edit-fieldwork-date").value;
    const startTime = document.getElementById("edit-fieldwork-start").value;
    const endTime = document.getElementById("edit-fieldwork-end").value;
    const crew = document.getElementById("edit-fieldwork-crew").value.trim();
    const droneCard = document
      .getElementById("edit-fieldwork-drone")
      .value.trim();

    if (!workDate || !startTime || !endTime) {
      this.showError("Date, start time, and end time are required");
      return;
    }

    try {
      const response = await fetch(`/fieldwork/${fieldworkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          crew: crew,
          drone_card: droneCard,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Fieldwork entry updated");
        this.closeModal("editFieldworkModal");
        // Reload the fieldwork for the job
        const jobNumber = result.job_id; // Assuming this is returned
        await this.loadFieldwork(jobNumber);
      } else {
        this.showError(result.error || "Failed to update fieldwork entry");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  async deleteFieldwork(fieldworkId, jobNumber) {
    if (!confirm("Are you sure you want to delete this fieldwork entry?")) {
      return;
    }

    try {
      const response = await fetch(`/fieldwork/${fieldworkId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        this.showSuccess("Fieldwork entry deleted");
        await this.loadFieldwork(jobNumber);
      } else {
        this.showError(result.error || "Failed to delete fieldwork entry");
      }
    } catch (error) {
      this.showError("Network error: " + error.message);
    }
  }

  // Modal utility methods
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = "block";
      setTimeout(() => modal.classList.add("show"), 10);
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("show");
      setTimeout(() => (modal.style.display = "none"), 300);
    }
  }
  // Utility Methods

  updateNavigation(activeSection) {
    document.querySelectorAll(".spa-nav-item").forEach((item) => {
      item.classList.remove("active");
      if (item.dataset.section === activeSection) {
        item.classList.add("active");
      }
    });
  }

  showLoading() {
    document.getElementById("loading-overlay").classList.add("show");
  }

  hideLoading() {
    document.getElementById("loading-overlay").classList.remove("show");
  }

  showError(message) {
    this.showFlashMessage(message, "error");
  }

  showSuccess(message) {
    this.showFlashMessage(message, "success");
  }

  showFlashMessage(message, type = "success") {
    const container = document.getElementById("flash-messages");
    const messageEl = document.createElement("div");
    messageEl.className = `flash-message ${type}`;
    messageEl.textContent = message;

    container.appendChild(messageEl);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      messageEl.remove();
    }, 5000);
  }

  isCacheValid(section) {
    if (!this.cache.has(section)) return false;

    const timestamp = this.cacheTimestamps.get(section);
    const age = Date.now() - timestamp;

    return age < this.cacheTTL;
  }

  invalidateCache(section) {
    this.cache.delete(section);
    this.cacheTimestamps.delete(section);
  }
}

// Initialize the SPA when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.adminSPA = new AdminSPA();
});
