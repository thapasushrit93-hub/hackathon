import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const broadcastContainer = document.querySelector('.row.g-4'); // Targets the grid in Code B

// Listen for updates
const q = query(collection(db, "broadcasts"), orderBy("createdAt", "desc"));

onSnapshot(q, (snapshot) => {
    broadcastContainer.innerHTML = ''; // Clear static placeholder cards

    snapshot.forEach((doc) => {
        const data = doc.data();
        const cardHtml = `
            <div class="col-md-6 col-lg-4">
                <div class="card broadcast-card shadow-sm ${data.emergency ? 'emergency' : ''}">
                    <div class="card-body">
                        <h5 class="card-title ${data.emergency ? 'text-danger' : ''}">
                            ${data.emergency ? '⚠️ ' : ''}${data.title}
                        </h5>
                        <p class="text-muted small">${data.createdAt?.toDate().toLocaleString() || 'Just now'}</p>
                        <p class="card-text">${data.content}</p>
                    </div>
                </div>
            </div>
        `;
        broadcastContainer.innerHTML += cardHtml;
    });
});