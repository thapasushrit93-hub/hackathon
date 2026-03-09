import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { 
    doc, getDoc, collection, query, where, onSnapshot, 
    addDoc, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

let currentUser = null;
let userWard = "N/A";
let userMunicipality = "N/A";

// 1. Auth State & User Data Loading
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    currentUser = user;
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            const data = snap.data();
            document.getElementById("uNameMain").innerText = data.fullName || "User";
            document.getElementById("uNameTop").innerText = data.fullName || "User";
            userWard = data.wardNumber || "N/A";
            userMunicipality = data.municipality || "N/A";
            document.getElementById("uWard").innerText = `Ward ${userWard}, ${userMunicipality}`;
        }
        listenToComplaints();
    } catch (err) { console.error("User load error:", err); }
});

// 2. Real-time Listener for User's Complaints
function listenToComplaints() {
    if (!currentUser) return;
    const q = query(collection(db, "complaints"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("complaintsList");
        if (!container) return;
        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = `<div class="alert alert-info">No complaints submitted yet.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const date = data.createdAt?.toDate?.() || new Date();
            container.innerHTML += `
                <div class="complaint-card shadow-sm p-3 mb-3 bg-white" style="border-radius:12px; border-left: 5px solid #2A4B79">
                    <div class="d-flex justify-content-between">
                        <h4 class="fw-bold text-primary">${data.title}</h4>
                        <span class="badge ${getStatusClass(data.status)}">${data.status}</span>
                    </div>
                    <p class="mb-1">${data.description}</p>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <small class="text-muted">
                            <i class="bi bi-geo-fill text-danger"></i> GPS: ${data.lat.toFixed(4)}, ${data.lng.toFixed(4)} 
                            <span class="mx-2">|</span> 
                            <i class="bi bi-calendar3"></i> ${date.toLocaleDateString()}
                        </small>
                    </div>
                </div>
            `;
        });
    });
}

function getStatusClass(status) {
    if (status === "Resolved") return "bg-success";
    if (status === "InProgress") return "bg-warning text-dark";
    return "bg-primary";
}

// 3. Submit Logic with Real-Time Device Location
document.getElementById("submitComplaintBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("complaintTitle").value.trim();
    const category = document.getElementById("complaintCategory").value;
    const description = document.getElementById("complaintDescription").value.trim();
    const btn = document.getElementById("submitComplaintBtn");

    if (!title || !category || !description) return alert("Please fill in all fields");

    // Change button state to show it is working
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Getting Precise Location...`;

    // Fetch GPS coordinates at the exact time of upload
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const deviceLat = position.coords.latitude;
            const deviceLng = position.coords.longitude;

            try {
                await addDoc(collection(db, "complaints"), {
                    title,
                    category,
                    description,
                    lat: deviceLat,         // Precise Device Lat
                    lng: deviceLng,         // Precise Device Lng
                    location: "Captured via GPS", // Fallback text
                    userId: currentUser.uid,
                    userName: document.getElementById("uNameTop").innerText,
                    status: "Submitted",
                    wardNumber: userWard,
                    municipality: userMunicipality,
                    createdAt: serverTimestamp()
                });

                document.getElementById("complaintForm").reset();
                alert("Success! Your issue has been pinned to the map at your current location.");
            } catch (e) {
                alert("Upload failed: " + e.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-send-fill me-2"></i>Submit & Map Complaint`;
            }
        }, (error) => {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-send-fill me-2"></i>Submit & Map Complaint`;
            alert("Error: To submit a complaint, you must allow location access so we can pin the issue to the map.");
        }, {
            enableHighAccuracy: true, // Forces device to use GPS instead of just IP
            timeout: 10000
        });
    } else {
        alert("Geolocation is not supported by your browser.");
        btn.disabled = false;
    }
});