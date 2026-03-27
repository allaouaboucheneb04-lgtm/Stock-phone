import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

window.login = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  await signInWithEmailAndPassword(auth, email, password);
  window.location.href = "dashboard.html";
};

onAuthStateChanged(auth, user => {
  if (user) loadPhones();
});

window.addPhone = async function () {
  const imei = document.getElementById("imei").value;
  if (!/^\d{15}$/.test(imei)) {
    alert("IMEI invalide");
    return;
  }

  await addDoc(collection(db, "phones"), {
    brand: brand.value,
    model: model.value,
    imei: imei,
    buyPrice: Number(buyPrice.value),
    sellPrice: Number(sellPrice.value),
    status: "stock"
  });

  loadPhones();
};

async function loadPhones() {
  const snap = await getDocs(collection(db, "phones"));
  let html = "";

  snap.forEach(d => {
    const p = d.data();
    const profit = (p.sellPrice || 0) - (p.buyPrice || 0);

    html += `<div class="card">
      <b>${p.brand} ${p.model}</b><br>
      IMEI: ${p.imei}<br>
      Achat: ${p.buyPrice}$<br>
      Vente: ${p.sellPrice}$<br>
      Profit: ${profit}$<br>
    </div>`;
  });

  document.getElementById("list").innerHTML = html;
}
