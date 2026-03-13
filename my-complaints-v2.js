import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { storage } from "./firebase-config.js";
import { translateComplaint } from "./translator.js";

// ===== ImgBB Photo Upload Service =====
class ImgBBUploader {
    constructor(apiKey, albumId = null) {
        this.apiKey = apiKey;
        this.albumId = albumId;
        this.baseUrl = 'https://api.imgbb.com/1/upload';
    }

    async uploadImage(file, complaintId = null) {
        try {
            // Convert file to base64 first
            const base64 = await this.fileToBase64(file);
            
            const formData = new FormData();
            formData.append('image', base64);
            formData.append('key', this.apiKey);
            
            // Add to CivicSewa album if specified
            if (this.albumId) {
                formData.append('album', this.albumId);
            }
            
            // Add metadata for organization
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const imageName = complaintId 
                ? `complaint_${complaintId}_${timestamp}`
                : `civicsewa_${timestamp}`;
            
            formData.append('name', imageName);
            formData.append('expiration', ''); // No expiration
            
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('ImgBB API Error:', errorText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                return {
                    url: result.data.url,
                    thumbnailUrl: result.data.thumb?.url,
                    displayUrl: result.data.display_url,
                    deleteUrl: result.data.delete_url,
                    filename: result.data.filename,
                    size: result.data.size
                };
            } else {
                throw new Error(result.error?.message || 'Upload failed');
            }
        } catch (error) {
            console.error('ImgBB upload error:', error);
            throw error;
        }
    }

    async uploadMultipleImages(files, complaintId = null) {
        const uploadPromises = Array.from(files).map(file => 
            this.uploadImage(file, complaintId)
        );
        
        try {
            const results = await Promise.all(uploadPromises);
            return results;
        } catch (error) {
            console.error('Multiple upload error:', error);
            throw error;
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove data URL prefix to get pure base64
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}

// ImgBB Configuration
const IMG_BB_CONFIG = {
    API_KEY: '9518c1dc7b1699ec13712fa05379dd94', // Working ImgBB API key
    ALBUM_ID: 'SRvypj', 
    ALBUM_NAME: 'CivicSewa'
};

// Get ImgBB uploader instance
function getImgBBUploader() {
    return new ImgBBUploader(IMG_BB_CONFIG.API_KEY, IMG_BB_CONFIG.ALBUM_ID);
}

// Helper function to create CivicSewa album (run once)
async function createCivicSewaAlbum() {
    try {
        const formData = new FormData();
        formData.append('key', IMG_BB_CONFIG.API_KEY);
        formData.append('name', IMG_BB_CONFIG.ALBUM_NAME);
        formData.append('description', 'CivicSewa complaint photos album');
        
        const response = await fetch('https://api.imgbb.com/1/album', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.success) {
            IMG_BB_CONFIG.ALBUM_ID = result.data.id;
            console.log('CivicSewa album created:', result.data.id);
            return result.data.id;
        }
    } catch (error) {
        console.error('Failed to create album:', error);
    }
    return null;
}

let currentUser = null;
let userWard = "N/A";
let userMunicipality = "N/A";
let capturedLocation = null;

let cachedComplaints = [];

// ===== TRANSLATIONS =====
// Covers: UI labels, form labels, form placeholders, category options,
// ward label, "Your Submitted Complaints" heading, status badges.
const translations = {
  en: {
    // Navbar
    wardLabel: "Ward",
    // Form headings
    formHeading: "Submit a New Complaint",
    submittedHeading: "Your Submitted Complaints",
    // Form labels
    formTitleLabel: "Title *",
    formCategoryLabel: "Category *",
    formLocationLabel: "Location *",
    formDescLabel: "Description *",
    // Form placeholders
    formTitlePlaceholder: "Brief title of the complaint",
    formLocationPlaceholder: "Where is the issue located?",
    formDescPlaceholder: "Describe the issue in detail...",
    // Form select options
    formCategorySelect: "Select Category",
    // Submit / clear buttons
    formSubmitBtn: "Submit Complaint",
    formClearBtn: "Clear Form",
    // Category values (used both in form options and complaint cards)
    catRoadDamage: "Road Damage",
    catWaterSupply: "Water Supply",
    catElectricity: "Electricity",
    catSanitation: "Sanitation",
    catOther: "Other",
    // Complaint card labels
    noComplaints: "No complaints submitted yet.",
    labelLocation: "Location",
    labelSubmitted: "Submitted on",
    labelViewComplaint: "View Complaint",
    // Status badges
    statusSubmitted: "Submitted",
    statusInProgress: "In Progress",
    statusResolved: "Resolved",
    statusRejected: "Rejected",
    // Alert messages
    alertFillFields: "Please fill all fields.",
    alertNotLoggedIn: "Not logged in.",
    alertSubmitSuccess: "Complaint submitted successfully!",
    // View complaint popup labels
    alertViewTitle: "Title",
    alertViewCategory: "Category",
    alertViewStatus: "Status",
    alertViewLocation: "Location",
    alertViewMunicipality: "Municipality",
    alertViewWard: "Ward",
    // Loading
    translating: "Translating...",
  },
  np: {
    // Navbar
    wardLabel: "वार्ड",
    // Form headings
    formHeading: "नयाँ गुनासो पेश गर्नुहोस्",
    submittedHeading: "तपाईंका पेश गरिएका गुनासोहरू",
    // Form labels
    formTitleLabel: "शीर्षक *",
    formCategoryLabel: "श्रेणी *",
    formLocationLabel: "स्थान *",
    formDescLabel: "विवरण *",
    // Form placeholders
    formTitlePlaceholder: "गुनासोको संक्षिप्त शीर्षक",
    formLocationPlaceholder: "समस्या कहाँ छ?",
    formDescPlaceholder: "समस्याको विस्तृत विवरण लेख्नुहोस्...",
    // Form select options
    formCategorySelect: "श्रेणी छान्नुहोस्",
    // Submit / clear buttons
    formSubmitBtn: "गुनासो पेश गर्नुहोस्",
    formClearBtn: "फारम खाली गर्नुहोस्",
    // Category values
    catRoadDamage: "सडक क्षति",
    catWaterSupply: "पानी आपूर्ति",
    catElectricity: "बिजुली",
    catSanitation: "सरसफाई",
    catOther: "अन्य",
    // Complaint card labels
    noComplaints: "अहिलेसम्म कुनै गुनासो पेश गरिएको छैन।",
    labelLocation: "स्थान",
    labelSubmitted: "पेश गरिएको",
    labelViewComplaint: "गुनासो हेर्नुहोस्",
    // Status badges
    statusSubmitted: "पेश गरियो",
    statusInProgress: "प्रगति हुँदैछ",
    statusResolved: "समाधान भएको",
    statusRejected: "अस्वीकृत",
    // Alert messages
    alertFillFields: "कृपया सबै क्षेत्र भर्नुहोस्।",
    alertNotLoggedIn: "लगइन गरिएको छैन।",
    alertSubmitSuccess: "गुनासो सफलतापूर्वक पेश गरियो!",
    // View complaint popup labels
    alertViewTitle: "शीर्षक",
    alertViewCategory: "श्रेणी",
    alertViewStatus: "स्थिति",
    alertViewLocation: "स्थान",
    alertViewMunicipality: "नगरपालिका",
    alertViewWard: "वार्ड",
    // Loading
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
    "In Progress": "statusInProgress",
    Resolved: "statusResolved",
    Rejected: "statusRejected",
  };
  return t(map[rawStatus] || "statusSubmitted");
}

function translateCategory(rawCategory) {
  const map = {
    "Road Damage": "catRoadDamage",
    "Water Supply": "catWaterSupply",
    Electricity: "catElectricity",
    Sanitation: "catSanitation",
    Other: "catOther",
  };
  return t(map[rawCategory] || "catOther");
}

// ===== UPDATE STATIC UI LABELS =====
// Translates every data-i18n element, every data-i18n-placeholder input/textarea,
// and the ward badge in the navbar.
function updateStaticLabels() {
  const lang = localStorage.getItem("lang") || "en";
  const data = translations[lang] || translations.en;

  // [data-i18n] elements — innerText
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = data[key];
    if (text !== undefined) el.innerText = text;
  });

  // [data-i18n-placeholder] inputs and textareas
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const text = data[key];
    if (text !== undefined) el.placeholder = text;
  });

  // Ward badge: "Ward 5, Kathmandu" → "वार्ड ५, Kathmandu"
  // We keep the number and municipality name as-is (proper nouns / numbers)
  // but translate the word "Ward" itself.
  const wardEl = document.getElementById("uWard");
  if (wardEl && userWard !== "N/A") {
    wardEl.innerText = `${t("wardLabel")} ${userWard}, ${userMunicipality}`;
  }
}

// ===== AUTH =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      const el = (id) => document.getElementById(id);
      if (el("uNameMain")) el("uNameMain").innerText = data.fullName || "User";
      if (el("uNameTop")) el("uNameTop").innerText = data.fullName || "User";
      userWard = data.wardNumber || "N/A";
      userMunicipality = data.municipality || "N/A";
      // Set ward badge with correct translated label
      updateStaticLabels();
    }
    await loadComplaints();
  } catch (err) {
    console.error("User load error:", err);
  }
});

// ===== LOGOUT =====
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  signOut(auth).then(() => (window.location.href = "login.html"));
});

// ===== SUBMIT =====
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("submitComplaintBtn")
    ?.addEventListener("click", handleSubmitComplaint);

  // GPS Location Capture
  document.getElementById("getLocationBtn")?.addEventListener("click", captureLocation);
});

function captureLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        capturedLocation = { latitude, longitude };
        const locationInput = document.getElementById("complaintLocation");
        const coordsDisplay = document.getElementById("locationCoords");

        // Update location field with coordinates
        locationInput.value = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
        coordsDisplay.textContent = `GPS Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      },
      (error) => {
        console.error("GPS Error:", error);
        alert("Unable to get GPS location. Please enter location manually.");
      }
    );
  } else {
    alert("Geolocation is not supported by this browser.");
  }
}

async function handleSubmitComplaint(e) {
  e.preventDefault();
  const title = document.getElementById("complaintTitle")?.value?.trim() || "";
  const category = document.getElementById("complaintCategory")?.value || "";
  const description =
    document.getElementById("complaintDescription")?.value?.trim() || "";
  const location =
    document.getElementById("complaintLocation")?.value?.trim() || "";
  const photoFiles = document.getElementById("complaintPhoto")?.files || [];

  if (!title || !category || !description || !location) {
    alert(t("alertFillFields"));
    return;
  }
  if (!currentUser) {
    alert(t("alertNotLoggedIn"));
    return;
  }

  try {
    // Generate complaint ID for photo organization
    const complaintId = `complaint_${Date.now()}_${currentUser.uid.substring(0, 8)}`;
    
    // Upload photos to ImgBB API with CivicSewa album
    const photoUrls = [];
    if (photoFiles.length > 0) {
      try {
        const uploader = getImgBBUploader();
        const uploadResults = await uploader.uploadMultipleImages(photoFiles, complaintId);
        
        // Extract URLs from upload results
        uploadResults.forEach(result => {
          photoUrls.push({
            url: result.url || "",
            thumbnailUrl: result.thumbnailUrl || result.url || "",
            filename: result.filename || "unknown",
            size: result.size || 0
          });
        });
        
        console.log(`Uploaded ${photoUrls.length} photos to ImgBB CivicSewa album`);
      } catch (imgbbError) {
        console.warn("ImgBB upload failed, using fallback:", imgbbError);
        
        // Fallback: convert to base64 and store in Firestore
        for (let i = 0; i < photoFiles.length; i++) {
          try {
            const file = photoFiles[i];
            const reader = new FileReader();
            const base64Promise = new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            const base64 = await base64Promise;
            photoUrls.push({
              url: base64,
              thumbnailUrl: base64,
              filename: file.name,
              size: file.size,
              isBase64: true
            });
          } catch (base64Error) {
            console.error("Base64 conversion failed:", base64Error);
          }
        }
      }
    }

    // Debug: Log all values before saving to Firestore
    console.log("About to save complaint with data:", {
      title: title || "Untitled Complaint",
      category: category || "Other",
      description: description || "No description provided",
      location: location || "Location not specified",
      photoUrls: photoUrls || [],
      gpsLocation: capturedLocation || null,
      userId: currentUser.uid,
      userName: document.getElementById("uNameMain")?.innerText || "Citizen",
      status: "Submitted",
      wardNumber: userWard || "N/A",
      municipality: userMunicipality || "N/A",
    });

    await addDoc(collection(db, "complaints"), {
      title: title || "Untitled Complaint",
      category: category || "Other",
      description: description || "No description provided",
      location: location || "Location not specified",
      photoUrls: photoUrls || [],
      gpsLocation: capturedLocation || null,
      userId: currentUser.uid,
      userName: document.getElementById("uNameMain")?.innerText || "Citizen",
      status: "Submitted",
      createdAt: serverTimestamp(),
      wardNumber: userWard || "N/A",
      municipality: userMunicipality || "N/A",
    });

    // Reset form
    document.getElementById("complaintForm")?.reset();
    document.getElementById("locationCoords").textContent = "";
    capturedLocation = null;

    let successMessage = t("alertSubmitSuccess");
    if (photoFiles.length > 0 && photoUrls.length === 0) {
      successMessage += " (Note: Photos could not be uploaded. The complaint was submitted without photos.)";
    } else if (photoUrls.length < photoFiles.length) {
      successMessage += ` (${photoUrls.length} of ${photoFiles.length} photos uploaded successfully)`;
    } else if (photoUrls.length > 0) {
      successMessage += ` (${photoUrls.length} photos uploaded successfully)`;
    }
    alert(successMessage);
    
    await loadComplaints();
  } catch (error) {
    console.error("Submit error:", error);
    alert("Error submitting complaint: " + error.message);
  }
}

// ===== LOAD =====
async function loadComplaints() {
  if (!currentUser) return;
  try {
    const q = query(
      collection(db, "complaints"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);
    cachedComplaints = [];
    snapshot.forEach((docSnap) =>
      cachedComplaints.push({ id: docSnap.id, ...docSnap.data() }),
    );
    await renderComplaints();
  } catch (error) {
    console.error("Load error:", error);
  }
}

// ===== RENDER =====
async function renderComplaints() {
  const container = document.getElementById("complaintsList");
  if (!container) return;
  const lang = localStorage.getItem("lang") || "en";

  if (cachedComplaints.length === 0) {
    container.innerHTML = `<div class="alert alert-info">${t("noComplaints")}</div>`;
    return;
  }

  if (lang === "np") {
    container.innerHTML = `
      <div class="text-center py-4 text-muted">
        <div class="spinner-border spinner-border-sm me-2"></div>${t("translating")}
      </div>`;
  }

  // Translate user-written title + description via Lingva (cached after first call)
  const translatedList = await Promise.all(
    cachedComplaints.map(async (data) => {
      if (lang !== "np") return data;
      const { title, description } = await translateComplaint(data, lang);
      return { ...data, title, description };
    }),
  );

  container.innerHTML = "";
  translatedList.forEach((data) => {
    const createdDate = data.createdAt?.toDate?.() || new Date();
    const formattedDate =
      createdDate.toLocaleDateString() + " " + createdDate.toLocaleTimeString();
    const statusClass = data.status.replace(/\s+/g, "");

    let photosHtml = '';
    if (data.photoUrls && data.photoUrls.length > 0) {
      photosHtml = `
        <div class="mt-3">
          <button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="collapse" data-bs-target="#photos-${data.id}" aria-expanded="false">
            <i class="bi bi-images"></i> View Photos (${data.photoUrls.length})
          </button>
          <div class="collapse mt-2" id="photos-${data.id}">
            <div class="card card-body">
              <div class="row g-2">
                ${data.photoUrls.map((photoObj, index) => {
                  const url = typeof photoObj === 'object' ? photoObj.url : photoObj;
                  const thumbnailUrl = typeof photoObj === 'object' ? photoObj.thumbnailUrl : url;
                  return `
                    <div class="col-md-4 col-sm-6">
                      <img src="${thumbnailUrl}" class="img-thumbnail" style="width: 100%; height: 150px; object-fit: cover; cursor: pointer;" 
                           onclick="window.open('${url}', '_blank')" alt="Complaint photo ${index + 1}">
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    let gpsHtml = '';
    if (data.gpsLocation && data.gpsLocation.latitude && data.gpsLocation.longitude) {
      gpsHtml = `<p class="mb-1"><strong>GPS:</strong> ${data.gpsLocation.latitude.toFixed(6)}, ${data.gpsLocation.longitude.toFixed(6)}</p>`;
    }

    container.innerHTML += `
      <div class="complaint-card">
        <h4>${data.title}</h4>
        <p class="text-muted mb-2">${data.description}</p>
        <p class="mb-1"><strong>${t("labelLocation")}:</strong> ${data.location}</p>
        ${gpsHtml}
        <p class="mb-1"><strong>${translateCategory(data.category)}</strong></p>
        <p class="text-muted small">${t("labelSubmitted")}: ${formattedDate}</p>
        <span class="status ${statusClass}">${translateStatus(data.status)}</span>
        ${photosHtml}
        <br><br>
        <button onclick="viewComplaint('${data.id}')">${t("labelViewComplaint")}</button>
      </div>`;
  });
}

// ===== VIEW COMPLAINT =====
window.viewComplaint = async function (id) {
  try {
    const snap = await getDoc(doc(db, "complaints", id));
    if (!snap.exists()) return;
    const data = snap.data();
    const lang = localStorage.getItem("lang") || "en";
    let { title, description } = data;
    if (lang === "np") {
      const translated = await translateComplaint(data, lang);
      title = translated.title;
      description = translated.description;
    }
    alert(
      `${t("alertViewTitle")}: ${title}\n` +
        `${t("alertViewCategory")}: ${translateCategory(data.category)}\n` +
        `${t("alertViewStatus")}: ${translateStatus(data.status)}\n` +
        `${t("alertViewLocation")}: ${data.location}\n` +
        `${t("alertViewMunicipality")}: ${data.municipality}\n` +
        `${t("alertViewWard")}: ${data.wardNumber}`,
    );
  } catch (error) {
    console.error("View error:", error);
  }
};

// ===== LANGUAGE SELECTOR =====
const langSelect = document.getElementById("languageSelect");
if (langSelect) {
  const stored = localStorage.getItem("lang") || "en";
  langSelect.value = stored;
  // Apply on first load
  updateStaticLabels();

  langSelect.addEventListener("change", async () => {
    localStorage.setItem("lang", langSelect.value);
    updateStaticLabels(); // instant — no API needed for form labels
    await renderComplaints(); // async — translates complaint text via API
  });
}