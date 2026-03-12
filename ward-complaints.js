import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  collection,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { translateComplaint, translateBatch, translateText,  } from "./translator.js"; // This is key!

let currentUserWard = "N/A";
let cachedDocs = []; // We store docs here so we can re-render when language changes

const translations = {
  en: {
    wardLabel: "Ward",
    noComplaints: "No complaints for this ward yet.",
    fromLabel: "From",
    locationLabel: "Location",
    updateStatusPlaceholder: "Update Status",
    statusSubmitted: "Submitted",
    statusInProgress: "In Progress",
    statusResolved: "Resolved",
    translating: "Translating...",
  },
  np: {
    wardLabel: "वार्ड",
    noComplaints: "यस वार्डका लागि अहिलेसम्म कुनै गुनासो छैन।",
    fromLabel: "बाट",
    locationLabel: "स्थान",
    updateStatusPlaceholder: "स्थिति अद्यावधिक गर्नुहोस्",
    statusSubmitted: "पेश गरियो",
    statusInProgress: "प्रगति हुँदैछ",
    statusResolved: "समाधान भएको",
    translating: "अनुवाद हुँदैछ...",
  },
};

function t(key) {
  const lang = localStorage.getItem("lang") || "en";
  return translations[lang]?.[key] || translations.en[key] || key;
}

function translateStatus(rawStatus) {
  const map = {
    Submitted: "statusSubmitted",
    InProgress: "statusInProgress",
    Resolved: "statusResolved",
  };
  return t(map[rawStatus] || "statusSubmitted");
}

// Separate Rendering from Data Fetching
async function renderComplaints() {
  const container = document.getElementById("complaintsContainer");
  if (!container) return;

  const lang = localStorage.getItem("lang") || "en";

  if (cachedDocs.length === 0) {
    container.innerHTML = `<p class='text-muted'>${t("noComplaints")}</p>`;
    return;
  }

  // Show a small loader if translating to Nepali
  if (lang === "np") {
    container.innerHTML = `<div class="col-12 text-center py-3"><em>${t("translating")}</em></div>`;
  }

  container.innerHTML = "";

  // Loop through cached docs and translate content if needed
  for (const data of cachedDocs) {
    let displayData = { ...data };

    // Use the API translator for the dynamic content (Title/Description)
    if (lang === "np") {
      displayData = await translateComplaint(data, "np");
    }

    const translatedStatus = translateStatus(data.status);

    container.innerHTML += `
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0" style="border-radius: 15px; border-left: 6px solid ${getStatusColor(data.status)} !important;">
                    <div class="card-body">
                        <h5 class="fw-bold text-primary">${displayData.title}</h5>
                        <div>
                            High Priority: <input type="checkbox" id="highPriority-${data.id}" ${data.isHighPriority ? "checked" : ""} onchange="updateHighPriority('${data.id}', this.checked)">
                        </div>
                        <p class="text-muted small mb-2">${t("fromLabel")}: ${data.userName || "Citizen"} | ${t("wardLabel")}: ${data.wardNumber}</p>
                        <p class="mb-1"><strong>${t("locationLabel")}:</strong> ${data.location}</p>
                        ${data.gpsLocation ? `<p class="mb-1"><small class="text-muted">GPS: ${data.gpsLocation.latitude.toFixed(6)}, ${data.gpsLocation.longitude.toFixed(6)}</small></p>` : ''}
                        <p class="card-text">${displayData.description}</p>
                        
                        ${data.photoUrls && data.photoUrls.length > 0 ? `
                        <div class="mb-3">
                            <button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="collapse" data-bs-target="#photos-${data.id}" aria-expanded="false">
                                <i class="bi bi-images me-1"></i> View Photos (${data.photoUrls.length})
                            </button>
                            <div class="collapse mt-2" id="photos-${data.id}">
                                <div class="d-flex flex-wrap gap-2">
                                    ${data.photoUrls.map((url, index) => `
                                        <img src="${url}" alt="Complaint photo ${index + 1}" 
                                             class="img-thumbnail" 
                                             style="max-width: 150px; max-height: 150px; cursor: pointer;"
                                             onclick="window.open('${url}', '_blank')">
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <hr>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="badge ${getStatusBadgeClass(data.status)}">${translatedStatus}</span>
                            <select class="form-select form-select-sm w-50" onchange="updateStatus('${data.id}', this.value)">
                                <option value="" disabled selected>${t("updateStatusPlaceholder")}</option>
                                <option value="Submitted">${t("statusSubmitted")}</option>
                                <option value="InProgress">${t("statusInProgress")}</option>
                                <option value="Resolved">${t("statusResolved")}</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
  `;
  }
}

function loadComplaints() {
  const q = query(
    collection(db, "complaints"),
    where("wardNumber", "==", currentUserWard),
  );

  onSnapshot(q, (snapshot) => {
    cachedDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort by date
    cachedDocs.sort(
      (a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0),
    );
    renderComplaints();
  });
}

// Helpers
function getStatusColor(s) {
  return s === "Resolved"
    ? "#198754"
    : s === "InProgress"
      ? "#ffc107"
      : "#0d6efd";
}
function getStatusBadgeClass(s) {
  return s === "Resolved"
    ? "bg-success"
    : s === "InProgress"
      ? "bg-warning text-dark"
      : "bg-primary";
}

// --- Initialization ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    const userData = snap.data();
    currentUserWard = userData.wardNumber || "N/A";
    document.getElementById("uWard").innerText = `Ward ${currentUserWard}`;
    document.getElementById("uNameTop").innerText = userData.fullName || "User";
    loadComplaints();
  }
});

// Language Switcher Fix
const langSelect = document.getElementById("languageSelect");
if (langSelect) {
  langSelect.value = localStorage.getItem("lang") || "en";
  langSelect.addEventListener("change", () => {
    localStorage.setItem("lang", langSelect.value);
    renderComplaints(); // Re-render without needing to re-fetch from Firebase
  });
}

// Search Logic
document.getElementById("searchInput")?.addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  document
    .querySelectorAll("#complaintsContainer .col-md-6")
    .forEach((card) => {
      card.style.display = card.innerText.toLowerCase().includes(term)
        ? ""
        : "none";
    });
});

window.updateStatus = async (id, status) => {
  await updateDoc(doc(db, "complaints", id), { status });
};

window.updateHighPriority = async (id, isHighPriority) => {
  await updateDoc(doc(db, "complaints", id), { isHighPriority });
};