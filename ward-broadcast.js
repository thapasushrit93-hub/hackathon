import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("broadcastContainer");
  const postBtn = document.getElementById("postBtn");

  if (!container || !postBtn) {
    console.error("Required elements not found in HTML.");
    return;
  }

  // ================= MAP PICKER LOGIC =================
  let modalMap;
  let selectionMarker;
  const createModalEl = document.getElementById('createModal');

  // Initialize map on Modal Open
  createModalEl.addEventListener('shown.bs.modal', () => {
    if (!modalMap) {
      // Set initial view (e.g., Kathmandu)
      modalMap = L.map('modalMap').setView([27.7172, 85.3240], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(modalMap);

      // Click listener to pick location
      modalMap.on('click', (e) => {
        const { lat, lng } = e.latlng;
        
        // Update input fields
        document.getElementById('latInput').value = lat.toFixed(6);
        document.getElementById('lngInput').value = lng.toFixed(6);

        // Place or move the marker
        if (selectionMarker) {
          selectionMarker.setLatLng(e.latlng);
        } else {
          selectionMarker = L.marker(e.latlng).addTo(modalMap);
        }
      });
    } else {
      // Recalculate size to fix grey tiles issue in Bootstrap modals
      modalMap.invalidateSize();
    }
  });

  // ================= REAL-TIME LISTENER =================
  const q = query(collection(db, "broadcasts"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    container.innerHTML = ""; 

    if (snapshot.empty) {
      container.innerHTML = '<div class="col-12 text-center mt-5"><h5>No active broadcasts.</h5></div>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const post = docSnap.data();
      const docId = docSnap.id;
      
      const dateString = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : "Syncing...";

      const cardWrapper = document.createElement("div");
      cardWrapper.className = "col-md-4 mb-4";
      
      // Dynamic styling based on Strike or Emergency status
      const borderColor = post.isStrike ? '#dc3545' : (post.emergency ? '#dc3545' : '#2A4B79');
      const cardClass = (post.isStrike || post.emergency) ? "emergency border-danger" : "";

      cardWrapper.innerHTML = `
        <div class="broadcast-card shadow-sm p-3 ${cardClass}" 
             style="background: white; border-radius: 15px; position: relative; border-left: 5px solid ${borderColor}">
          
          <button class="btn btn-sm btn-outline-danger delete-btn" 
                  style="position: absolute; top: 10px; right: 10px;">
            <i class="bi bi-trash"></i>
          </button>

          ${post.isStrike ? `<span class="badge bg-danger mb-2 me-1">Strike/Roadblock</span>` : ""}
          ${post.emergency ? `<span class="badge bg-warning text-dark mb-2">Emergency</span>` : ""}

          <h5 class="fw-bold">${post.title}</h5>
          <p class="text-muted small mb-1">${dateString}</p>
          <p class="card-text mb-2">${post.content}</p>
          
          ${post.lat ? `
            <div class="small text-primary border-top pt-2">
              <i class="bi bi-geo-alt-fill"></i> Location: ${post.lat.toFixed(4)}, ${post.lng.toFixed(4)}
            </div>
          ` : ''}
        </div>
      `;

      cardWrapper.querySelector(".delete-btn").addEventListener("click", async () => {
        if (confirm("Delete this broadcast for everyone?")) {
          try {
            await deleteDoc(doc(db, "broadcasts", docId));
          } catch (error) {
            console.error("Error deleting:", error);
          }
        }
      });

      container.appendChild(cardWrapper);
    });
  });

  // ================= CREATE BROADCAST =================
  postBtn.addEventListener("click", async () => {
    const titleField = document.getElementById("title");
    const contentField = document.getElementById("content");
    const emergencyField = document.getElementById("emergency");
    const strikeField = document.getElementById("isStrike"); // Added isStrike field
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
    postBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Posting...';

    try {
      await addDoc(collection(db, "broadcasts"), {
        title,
        content,
        emergency,
        isStrike,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
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
          modalMap.removeLayer(selectionMarker);
          selectionMarker = null;
      }

      // Close Bootstrap Modal
      const modal = bootstrap.Modal.getInstance(createModalEl);
      if (modal) modal.hide();

    } catch (error) {
      console.error("Error creating broadcast:", error);
      alert("Failed to post. Check Firestore Rules.");
    } finally {
      postBtn.disabled = false;
      postBtn.innerText = "Post";
    }
  });
});