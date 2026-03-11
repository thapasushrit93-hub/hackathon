import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { translateBroadcast } from "./translator.js";

//Only allow ward users to access this dashboard

// ================= TRANSLATIONS (UI labels) =================
const translations = {
  en: {
    searchPlaceholder: "Search...",
    dashboardNav: "Dashboard",
    myComplaintsNav: "My Complaints",
    documentsNav: "Documents",
    broadcastNav: "Broadcast Channel",
    roadNav: "Road",
    chatbotNav: "Guidance Chatbot",
    settingsNav: "Settings",
    signOut: "Sign Out",
    welcome: "Welcome",
    submitComplaint: "Submit Complaint",
    reportIssues: "Report local issues!",
    createNew: "Create New",
    quickActions: "Quick Actions",
    noWater: "No Water",
    noElectricity: "No Electricity",
    roadDamage: "Road Damage",
    myComplaintsCard: "My Complaints",
    viewComplaint: "View Complaint",
    recentUpdates: "Recent Updates",
    emergencyAlerts: "Emergency Alerts",
    statusSubmitted: "Submitted",
    statusInProgress: "In Progress",
    statusResolved: "Resolved",
    alertLogin: "Please login first.",
    alertSubmitSuccess: "Complaint submitted successfully!",
    alertSubmitError: "Error submitting complaint.",
    noComplaints: "No complaints yet",
    noUpdates: "No updates available",
    noAlerts: "No alerts",
    updCatWater: "Water",
    updCatRoad: "Road",
    updCatWaste: "Waste",
    updCatGeneral: "General",
    updCatElectricity: "Electricity",
    catWater: "Water",
    catElectricity: "Electricity",
    catRoad: "Road",
    catWaste: "Waste",
    catOther: "Other",
    emergencyTag: "EMERGENCY",
    justNow: "Just now",
    labelStatus: "Status",
    labelCategory: "Category",
    labelLocation: "Location",
    translating: "Translating...",
    openComplaints: "Open Complaints",
    resolvedThisMonth: "Resolved This Month",
    inProgress: "In Progress",
    highPriority: "High Priority",
    statusDistribution: "Status Distribution",
  },
  np: {
    searchPlaceholder: "खोज्नुहोस्...",
    dashboardNav: "मुख्य विवरण",
    myComplaintsNav: "मेरा गुनासोहरू",
    documentsNav: "कागजातहरू",
    broadcastNav: "चौतारी",
    roadNav: "नक्सा",
    chatbotNav: "मार्गदर्शन चैटबोट",
    settingsNav: "सेटिङहरू",
    signOut: "साइन आऊट",
    welcome: "स्वागत छ",
    submitComplaint: "गुनासो पेश गर्नुहोस्",
    reportIssues: "स्थानीय समस्या रिपोर्ट गर्नुहोस्!",
    createNew: "नयाँ गुनासो दर्ता गर्नुहोस्",
    quickActions: "छिटो क्रियाहरू",
    noWater: "पानी छैन",
    noElectricity: "बिजुली छैन",
    roadDamage: "सडक क्षति",
    myComplaintsCard: "मेरा गुनासोहरू",
    viewComplaint: "गुनासो हेर्नुहोस्",
    recentUpdates: "हालका सूचनाहरू",
    emergencyAlerts: "आपत्कालीन चेतावनीहरू",
    statusSubmitted: "पेश गरियो",
    statusInProgress: "प्रगति हुँदैछ",
    statusResolved: "समाधान भएको",
    alertLogin: "कृपया पहिले लगइन गर्नुहोस्।",
    alertSubmitSuccess: "गुनासो सफलतापूर्वक पेश गरियो!",
    alertSubmitError: "गुनासो पेश गर्दा त्रुटि भयो।",
    noComplaints: "अहिलेसम्म कुनै गुनासो छैन",
    noUpdates: "कुनै अपडेट उपलब्ध छैन",
    noAlerts: "कुनै सूचना छैन",
    updCatWater: "पानी",
    updCatRoad: "सडक",
    updCatWaste: "फोहोर",
    updCatGeneral: "सामान्य",
    updCatElectricity: "बिजुली",
    catWater: "पानी",
    catElectricity: "बिजुली",
    catRoad: "सडक",
    catWaste: "फोहोर",
    catOther: "अन्य",
    emergencyTag: "आपत्कालीन",
    justNow: "भर्खरै",
    labelStatus: "स्थिति",
    labelCategory: "श्रेणी",
    labelLocation: "स्थान",
    translating: "अनुवाद हुँदैछ...",
    openComplaints: "खुला गुनासोहरू",
    resolvedThisMonth: "यस महिनामा समाधान भएको",
    inProgress: "प्रगति हुँदैछ",
    highPriority: "उच्च प्राथमिकता",
    statusDistribution: "स्थिति वितरण",
  },
};

let currentUser = null;
let userWard = "N/A";
let userMunicipality = "N/A";
let modalMap;
let selectionMarker;

// ================= HELPERS =================
function t(key) {
  const lang = localStorage.getItem("lang") || "en";
  return translations[lang]?.[key] || translations.en[key] || key;
}

function translateCategory(rawCategory) {
  const map = {
    Water: "catWater",
    Electricity: "catElectricity",
    Road: "catRoad",
    Waste: "catWaste",
    Other: "catOther",
    General: "updCatGeneral",
  };
  return t(map[rawCategory] || "catOther");
}

const categoryMap = {
  Water: { color: "0d6efd", bgColor: "primary", key: "updCatWater" },
  Road: { color: "dc3545", bgColor: "danger", key: "updCatRoad" },
  Waste: { color: "198754", bgColor: "success", key: "updCatWaste" },
  General: { color: "6f42c1", bgColor: "secondary", key: "updCatGeneral" },
  Electricity: {
    color: "ffc107",
    bgColor: "warning",
    key: "updCatElectricity",
  },
};

// ================= CACHING =================
let cachedBroadcasts = [];

// ================= LOAD BROADCASTS (Firestore listener) =================
function loadBroadcasts() {
  const q = query(collection(db, "broadcasts"), orderBy("createdAt", "desc"));

  onSnapshot(q, async (snapshot) => {
    cachedBroadcasts = [];
    snapshot.forEach((docSnap) => {
      const raw = docSnap.data();
      cachedBroadcasts.push({
        title: raw.title || "",
        content: raw.content || "",
        category: raw.category || "General",
        emergency: raw.emergency || false,
        createdAt: raw.createdAt,
      });
    });
    await renderBroadcasts();
  });
}

// ================= RENDER BROADCASTS =================
// Translates titles via API in parallel; badge labels via local lookup.
async function renderBroadcasts() {
  const updatesList = document.getElementById("updatesList");
  const emergencyList = document.getElementById("emergencyList");
  if (!updatesList || !emergencyList) return;

  const lang = localStorage.getItem("lang") || "en";
  updatesList.innerHTML = emergencyList.innerHTML = "";

  if (cachedBroadcasts.length === 0) {
    updatesList.innerHTML = `<li class="list-group-item text-muted small">${t("noUpdates")}</li>`;
    emergencyList.innerHTML = `<li class="list-group-item text-muted small">${t("noAlerts")}</li>`;
    return;
  }

  // Spinner while API calls are in-flight
  if (lang === "np") {
    updatesList.innerHTML = `
      <li class="list-group-item text-muted small">
        <span class="spinner-border spinner-border-sm me-1"></span>${t("translating")}
      </li>`;
  }

  // Translate all broadcast titles in parallel (cached after first call)
  const translatedList = await Promise.all(
    cachedBroadcasts.map(async (data) => {
      if (lang !== "np") return data;
      const { title } = await translateBroadcast(data, lang);
      return { ...data, title };
    }),
  );

  updatesList.innerHTML = emergencyList.innerHTML = "";
  let hasRegular = false,
    hasEmergency = false;

  translatedList.forEach((data) => {
    const catStyle = categoryMap[data.category] || categoryMap["General"];
    const dateString = data.createdAt?.toDate
      ? data.createdAt.toDate().toLocaleDateString()
      : t("justNow");

    const item = document.createElement("li");
    item.className = "list-group-item" + (data.emergency ? " emergency" : "");
    item.style.cssText = data.emergency
      ? "border: 1px solid #dc3545; border-left: 4px solid #dc3545;"
      : `border-left: 4px solid #${catStyle.color};`;

    item.innerHTML = `
      <span class="badge bg-${data.emergency ? "danger" : catStyle.bgColor} me-2">
        ${data.emergency ? t("emergencyTag") : t(catStyle.key)}
      </span>
      <span class="fw-bold">${data.title}</span><br>
      <small class="text-muted d-block mt-1">${dateString}</small>`;

    item.onclick = () => alert(data.title + "\n\n" + data.content);

    if (data.emergency) {
      emergencyList.appendChild(item);
      hasEmergency = true;
    } else {
      updatesList.appendChild(item);
      hasRegular = true;
    }
  });

  if (!hasRegular)
    updatesList.innerHTML = `<li class="list-group-item text-muted small">${t("noUpdates")}</li>`;
  if (!hasEmergency)
    emergencyList.innerHTML = `<li class="list-group-item text-muted small">${t("noAlerts")}</li>`;
}

// ================= UPDATE LANGUAGE =================
async function updateLanguage(lang) {
  // 1. Static [data-i18n] labels
  const data = translations[lang] || translations.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key || data[key] === undefined) return;
    if (el.tagName === "INPUT") el.placeholder = data[key];
    else el.innerText = data[key];
  });

  // 2. Update KPI labels
  const kpiCards = document.querySelectorAll('.kpi-card');
  if (kpiCards.length >= 4) {
    const p0 = kpiCards[0].querySelector('p');
    if (p0) p0.textContent = t("openComplaints");
    const p1 = kpiCards[1].querySelector('p');
    if (p1) p1.textContent = t("resolvedThisMonth");
    const p2 = kpiCards[2].querySelector('p');
    if (p2) p2.textContent = t("inProgress");
    const p3 = kpiCards[3].querySelector('p');
    if (p3) p3.textContent = t("highPriority");
  }
  const h5 = document.querySelector('.card-custom h5');
  if (h5) h5.textContent = t("statusDistribution");

  // 3. Update pie chart labels
  if (window.pieChart && window.pieChart.data) {
    window.pieChart.data.labels = [t("statusSubmitted"), t("statusInProgress"), t("statusResolved")];
    window.pieChart.update();
  }

  // 4. Re-render dynamic sections from cache (with live translation)
  await renderBroadcasts();
}

// ================= LOAD WARD STATS =================
async function loadWardStats() {
  const q = query(collection(db, "complaints"), where("wardNumber", "==", userWard), where("municipality", "==", userMunicipality));
  const snapshot = await getDocs(q);

  let open = 0, inProgress = 0, resolved = 0, resolvedThisMonth = 0;
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  snapshot.forEach(doc => {
    const data = doc.data();
    const status = data.status;
    if (status === "Submitted") open++;
    else if (status === "In Progress") inProgress++;
    else if (status === "Resolved") {
      resolved++;
      const created = data.createdAt?.toDate();
      if (created && created.getMonth() === currentMonth && created.getFullYear() === currentYear) {
        resolvedThisMonth++;
      }
    }
  });

  // Update KPI cards
  const kpiCards = document.querySelectorAll('.kpi-card');
  if (kpiCards.length >= 4) {
    kpiCards[0].querySelector('h2').textContent = open;
    kpiCards[1].querySelector('h2').textContent = resolvedThisMonth;
    kpiCards[2].querySelector('h2').textContent = inProgress;
    kpiCards[3].querySelector('h2').textContent = open; // High Priority as open
  }

  // Pie chart
  if (window.pieChart && window.pieChart.data && window.pieChart.data.datasets) {
    window.pieChart.data.datasets[0].data = [open, inProgress, resolved];
    window.pieChart.update();
  } else {
    window.pieChart = new Chart(document.getElementById('pieChart'), {
      type: 'pie',
      data: {
        labels: [t("statusSubmitted"), t("statusInProgress"), t("statusResolved")],
        datasets: [{
          data: [open, inProgress, resolved],
          backgroundColor: ['#1E63D5', '#F4B400', '#1FA463']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }
}

// ================= AUTH LISTENER =================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    const data = snap.data();
    if (data.role !== "ward") {
      alert("Access denied. This dashboard is only for ward users.");
      signOut(auth);
      return;
    }
    const uNameMainEl = document.getElementById("uNameMain");
    if (uNameMainEl) uNameMainEl.innerText = data.fullName;
    const uNameTopEl = document.getElementById("uNameTop");
    if (uNameTopEl) uNameTopEl.innerText = data.fullName;
    userWard = data.wardNumber || "N/A";
    userMunicipality = data.municipality || "N/A";
    const uWardEl = document.getElementById("uWard");
    if (uWardEl) uWardEl.innerText = `Ward ${userWard}, ${userMunicipality}`;
  }
  // ===== LOAD LATEST COMPLAINT =====
  const q = query(
    collection(db, "complaints"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const latest = snapshot.docs[0].data();
    const latestTitleEl = document.getElementById("latestTitle");
    if (latestTitleEl) latestTitleEl.innerText = latest.title;
    const latestStatusEl = document.getElementById("latestStatus");
    if (latestStatusEl) latestStatusEl.innerText = latest.status;
    const latestCategoryEl = document.getElementById("latestCategory");
    if (latestCategoryEl) latestCategoryEl.innerText = latest.category;
  } else {
    const latestTitleEl = document.getElementById("latestTitle");
    if (latestTitleEl) latestTitleEl.innerText = "No complaints yet.";
    const latestStatusEl = document.getElementById("latestStatus");
    if (latestStatusEl) latestStatusEl.innerText = "-";
    const latestCategoryEl = document.getElementById("latestCategory");
    if (latestCategoryEl) latestCategoryEl.innerText = "-";
  }
  // Load all complaints on dashboard
  loadComplaints();
  // Setup alert button after auth is complete
  setupAlertButton();
  // Load broadcasts
  loadBroadcasts();
  // Load ward stats
  loadWardStats();

  // Initialize map for send alert
  modalMap = L.map('modalMap').setView([27.7172, 85.3240], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'OpenStreetMap contributors'
  }).addTo(modalMap);

  modalMap.on('click', function(e) {
    const { lat, lng } = e.latlng;
    if (selectionMarker) {
      modalMap.removeLayer(selectionMarker);
    }
    selectionMarker = L.marker([lat, lng]).addTo(modalMap);
    document.getElementById('latInput').value = lat.toFixed(4);
    document.getElementById('lngInput').value = lng.toFixed(4);
  });
});

// ================= SETUP ALERT BUTTON =================
function setupAlertButton() {
  const postBtn = document.getElementById("postBtn");
  if (postBtn) {
    postBtn.addEventListener("click", async () => {
      const titleField = document.getElementById("title");
      const contentField = document.getElementById("content");
      const emergencyField = document.getElementById("emergency");
      const strikeField = document.getElementById("isStrike");
      const latField = document.getElementById("latInput");
      const lngField = document.getElementById("lngInput");

      const title = titleField.value.trim();
      const content = contentField.value.trim();
      const emergency = emergencyField.checked;
      const isStrike = strikeField ? strikeField.checked : false;
      const lat = latField.value;
      const lng = lngField.value;

      // Validation
      if (!title || !content || !lat) {
        alert("Please fill all fields and pick a location on the map!");
        return;
      }

      // UI Feedback
      postBtn.disabled = true;
      postBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

      try {
        await addDoc(collection(db, "broadcasts"), {
          title,
          content,
          emergency,
          isStrike,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          ward: userWard,
          municipality: userMunicipality,
          userId: currentUser.uid,
          createdAt: serverTimestamp(),
        });

        // Clear form and reset marker
        titleField.value = "";
        contentField.value = "";
        latField.value = "";
        lngField.value = "";
        emergencyField.checked = false;
        if (strikeField) strikeField.checked = false;

        if (selectionMarker) {
          const modal = bootstrap.Modal.getInstance(document.getElementById('createModal'));
          if (modal) modal.hide();
          modalMap.removeLayer(selectionMarker);
          selectionMarker = null;
        }

      } catch (error) {
        console.error("Error creating broadcast:", error);
        alert("Failed to send. Check Firestore Rules.");
      } finally {
        postBtn.disabled = false;
        postBtn.innerText = "Post Alert";
      }
    });
  } else {
    console.error("Post button not found!");
  }
}

// ================= LOAD COMPLAINTS =================
async function loadComplaints() {
  const container = document.getElementById("complaintsContainer");
  if (!container) return;
  container.innerHTML = "";
  const q = query(
    collection(db, "complaints"),
    where("userId", "==", currentUser.uid),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    container.innerHTML = "<p class='text-muted'>No complaints yet.</p>";
    return;
  }
  snapshot.forEach((docSnap) => {
    const complaint = docSnap.data();
    const statusBg =
      complaint.status === "Submitted"
        ? "status-open text-white"
        : complaint.status === "In Progress"
          ? "status-progress"
          : "status-resolved text-white";
    container.innerHTML += `
        <div class="d-flex justify-content-between">
            <div>
                <div class="fw-semibold">${complaint.title}</div>
                <small class="text-muted">${complaint.createdAt ? complaint.createdAt.toDate().toLocaleString() : ""}</small>
            </div>
            <span class="badge ${statusBg}">${complaint.status}</span>
        </div>
        <hr>
        `;
  });
}

// LOGOUT
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth);
  window.location.href = "login.html";
});

// ================= LANGUAGE SELECTOR =================
const langSelect = document.getElementById("languageSelect");
if (langSelect) {
  const stored = localStorage.getItem("lang") || "en";
  langSelect.value = stored;
  updateLanguage(stored);
  langSelect.addEventListener("change", async () => {
    localStorage.setItem("lang", langSelect.value);
    await updateLanguage(langSelect.value);
  });
}