"use strict";

window.SA = window.SA || {};
const SA = window.SA;

// Detect Page
const page = document.body.dataset.page || "setup";

// Firebase Init
(function initFirebase() {
  if (!window.firebase) return console.error("Firebase not loaded.");
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  SA.auth = firebase.auth();
  SA.db = firebase.firestore();
})();

// DOM Helper
const qs = (s, r = document) => r.querySelector(s);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

// ======== AUTH STATE LISTENER ==========
SA.auth.onAuthStateChanged(async (user) => {
  SA.currentUser = user || null;
  if (!user) {
    if (page === "setup") showAuthForms();
    return;
  }

  // Fetch user data
  const snap = await SA.db.collection("users").doc(user.uid).get();
  SA.currentUserDoc = snap.exists ? snap.data() : { username: user.email.split("@")[0] };

  if (page === "setup") showUserPanel(SA.currentUserDoc.username);
  if (page === "connect") SA.generateConnectKey();
  if (page === "chat") SA.loadContacts();
});

// ======== SETUP PAGE ==========
if (page === "setup") {
  const authWrap = qs("#authWrap");
  const userPanel = qs("#userPanel");
  const currentUsernameEl = qs("#currentUsername");
  const newUsernameEl = qs("#newUsername");
  const changeUsernameBtn = qs("#changeUsernameBtn");
  const logoutBtn = qs("#logoutBtn");

  const loginForm = qs("#loginForm");
  const registerForm = qs("#registerForm");
  const authModeLogin = qs("#authModeLogin");
  const authModeRegister = qs("#authModeRegister");
  const authStatusEl = qs("#authStatus");

  // Auth Mode
  on(authModeLogin, "click", () => setAuthMode("login"));
  on(authModeRegister, "click", () => setAuthMode("register"));

  function setAuthMode(mode) {
    loginForm.classList.toggle("hidden", mode !== "login");
    registerForm.classList.toggle("hidden", mode !== "register");
  }

  // Show/Hide UI
  function showAuthForms() {
    authWrap.classList.remove("hidden");
    userPanel.classList.add("hidden");
  }
  function showUserPanel(username) {
    currentUsernameEl.textContent = username;
    authWrap.classList.add("hidden");
    userPanel.classList.remove("hidden");
  }

  // Login
  on(loginForm, "submit", async (e) => {
    e.preventDefault();
    try {
      await SA.auth.signInWithEmailAndPassword(qs("#loginEmail").value, qs("#loginPassword").value);
    } catch (err) {
      authStatusEl.textContent = err.message;
    }
  });

  // Register
  on(registerForm, "submit", async (e) => {
    e.preventDefault();
    try {
      const cred = await SA.auth.createUserWithEmailAndPassword(qs("#regEmail").value, qs("#regPassword").value);
      await SA.db.collection("users").doc(cred.user.uid).set({
        username: qs("#regUsername").value,
        email: cred.user.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      authStatusEl.textContent = err.message;
    }
  });

  // Change Username
  on(changeUsernameBtn, "click", async () => {
    const newName = newUsernameEl.value.trim();
    if (!newName) return alert("Enter username");
    await SA.db.collection("users").doc(SA.currentUser.uid).update({
      username: newName,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    currentUsernameEl.textContent = newName;
    alert("Username changed.");
  });

  // Logout
  on(logoutBtn, "click", () => SA.auth.signOut());
}

// ======== CONNECT PAGE ==========
if (page === "connect") {
  const myKeyEl = qs("#myConnectKey");
  const regenBtn = qs("#regenKeyBtn");
  const copyBtn = qs("#copyKeyBtn");
  const partnerInput = qs("#partnerKeyInput");
  const connectBtn = qs("#connectBtn");

  SA.showMyConnectKey = (key) => (myKeyEl.textContent = key || "--");

  SA.generateConnectKey = async function () {
    if (!SA.currentUser) return;
    const key = SA.randKey(34);
    SA.cachedKeys = key;
    SA.showMyConnectKey(key);
    await SA.db.collection("connectCodes").doc(key).set({
      owner: SA.currentUser.uid,
      used: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  };

  on(regenBtn, "click", SA.generateConnectKey);
  on(copyBtn, "click", () => navigator.clipboard.writeText(SA.cachedKeys));
  on(connectBtn, "click", SA.connectWithKey);
}

// ======== CHAT PAGE ==========
if (page === "chat") {
  const chatListEl = qs("#chatList");
  const noChatsMsg = qs("#noChatsMsg");

  SA.loadContacts = function () {
    const uid = SA.currentUser.uid;
    return SA.db.collection("users").doc(uid).collection("contacts").onSnapshot((snap) => {
      chatListEl.innerHTML = "";
      if (snap.empty) {
        noChatsMsg.style.display = "block";
        return;
      }
      noChatsMsg.style.display = "none";
      snap.forEach((doc) => {
        const li = document.createElement("li");
        li.textContent = doc.data().username;
        chatListEl.appendChild(li);
      });
    });
  };
}

// ======== UTILS ==========
SA.randKey = (len = 34) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((n) => chars[n % chars.length])
    .join("");
};
