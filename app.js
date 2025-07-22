"use strict";

// Global Namespace
window.SA = window.SA || {};
const SA = window.SA;

// Firebase Initialization (guard)
(function initFirebase() {
  if (!window.firebase) {
    console.error("[StringAlgebra] Firebase SDK not loaded.");
    return;
  }
  if (!window.firebase.apps.length) {
    if (!window.firebaseConfig) {
      console.warn("[StringAlgebra] firebaseConfig missing. Define window.firebaseConfig BEFORE app.js loads.");
      window.firebase.initializeApp({ apiKey: "noop", projectId: "noop" });
    } else {
      window.firebase.initializeApp(window.firebaseConfig);
    }
  }
  SA.auth = window.firebase.auth();
  SA.db = window.firebase.firestore();
})();

// DOM Shortcuts
const qs  = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const on  = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

// Boot Screen & Geek Menu
(function initBootScreen() {
  const bootScreen = qs("#bootScreen");
  const bootTextEl = qs("#bootText");
  const geekMenu = qs("#geekMenu");
  const bootLines = [
    ">>> Initializing StringAlgebra...",
    ">>> Loading modules [auth, firestore, chat]...",
    ">>> Establishing secure terminal...",
    ">>> Boot complete.",
    ">>> Press ENTER or tap to continue."
  ];
  let lineIndex = 0;

  function typeLine() {
    if (lineIndex < bootLines.length) {
      const line = document.createElement("div");
      line.textContent = bootLines[lineIndex++];
      bootTextEl.appendChild(line);
      setTimeout(typeLine, 500);
    } else {
      bootScreen.addEventListener("click", endBoot);
      window.addEventListener("keydown", (e) => { if (e.key === "Enter") endBoot(); });
    }
  }

  function endBoot() {
    bootScreen.style.display = "none";
    geekMenu.style.display = "flex";
  }

  // Geek menu buttons switch tabs
  qsa("#geekMenu .geek-btn").forEach(btn => {
    on(btn, "click", () => {
      geekMenu.style.display = "none";
      SA.switchTab(btn.dataset.tab);
    });
  });

  typeLine();
})();

// Tab panels + buttons
const tabPanels = {
  setup: qs("#setupTab"),
  connect: qs("#connectTab"),
  chat: qs("#chatTab"),
};
const tabBtns = {
  setup: qs("#tabBtn-setup"),
  connect: qs("#tabBtn-connect"),
  chat: qs("#tabBtn-chat"),
};

// Tab Switching Logic
SA.switchTab = function (tabName) {
  // Hide all panels
  Object.values(tabPanels).forEach(panel => panel && panel.classList.remove("active"));
  // Deselect all tab buttons
  Object.values(tabBtns).forEach(btn => btn && btn.setAttribute("aria-selected", "false"));

  // Activate selected tab
  if (tabPanels[tabName]) tabPanels[tabName].classList.add("active");
  if (tabBtns[tabName]) tabBtns[tabName].setAttribute("aria-selected", "true");

  // Close thread view if leaving chat tab
  if (tabName !== "chat") SA.hideThread();
};

// Attach click events to tab buttons
Object.entries(tabBtns).forEach(([name, btn]) => {
  on(btn, "click", () => SA.switchTab(name));
});

// Auth UI
const authModeLoginBtn    = qs("#authModeLogin");
const authModeRegisterBtn = qs("#authModeRegister");
const loginForm           = qs("#loginForm");
const loginEmailEl        = qs("#loginEmail");
const loginPasswordEl     = qs("#loginPassword");
const registerForm        = qs("#registerForm");
const regEmailEl          = qs("#regEmail");
const regPasswordEl       = qs("#regPassword");
const regUsernameEl       = qs("#regUsername");
const authStatusEl        = qs("#authStatus");

// Connect Tab
const myConnectKeyEl  = qs("#myConnectKey");
const regenKeyBtn     = qs("#regenKeyBtn");
const copyKeyBtn      = qs("#copyKeyBtn");
const partnerKeyInput = qs("#partnerKeyInput");
const connectBtn      = qs("#connectBtn");
const connectStatusEl = qs("#connectStatus");

// Chat Tab
const chatListEl   = qs("#chatList");
const noChatsMsgEl = qs("#noChatsMsg");

// Thread View
const threadViewEl      = qs("#threadView");
const threadBackBtnEl   = qs("#threadBackBtn");
const threadUserNameEl  = qs("#threadUserName");
const threadMessagesEl  = qs("#threadMessages");
const typingIndicatorEl = qs("#typingIndicator");
const threadInputBarEl  = qs("#threadInputBar");
const threadInputEl     = qs("#threadInput");
const threadSendBtnEl   = qs("#threadSendBtn");

// Toast container
const toastContainerEl = qs("#toastContainer");

// State
SA.currentUser    = null;
SA.currentUserDoc = null;
SA.contacts       = {};
SA.activeThread   = null;
SA.cachedKeys     = null;

// Toast
SA.toast = function (msg, tone = "info", timeout = 4000) {
  if (!toastContainerEl) return alert(msg);
  const id = "toast-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const div = document.createElement("div");
  div.className = `toast toast-${tone}`;
  div.id = id;
  div.textContent = msg;
  toastContainerEl.appendChild(div);
  setTimeout(() => div.classList.add("show"), 10);
  setTimeout(() => {
    div.classList.remove("show");
    setTimeout(() => div.remove(), 250);
  }, timeout);
};

// Copy to clipboard
SA.copyText = async function (str) {
  try {
    await navigator.clipboard.writeText(str);
    SA.toast("Copied!", "success");
    return true;
  } catch (err) {
    try {
      const tmp = document.createElement("textarea");
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      tmp.value = str;
      document.body.appendChild(tmp);
      tmp.focus();
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
      SA.toast("Copied.", "success");
      return true;
    } catch (err2) {
      console.error("Copy failed", err2);
      SA.toast("Copy failed", "error");
      return false;
    }
  }
};

// Sorted Thread ID
SA.threadIdFor = function (uidA, uidB) {
  return [uidA, uidB].sort().join("_");
};

// Auth Mode Toggle
function setAuthMode(mode) {
  const isLogin = mode === "login";
  authModeLoginBtn.classList.toggle("is-active", isLogin);
  authModeRegisterBtn.classList.toggle("is-active", !isLogin);
  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);
  authStatusEl.textContent = "";
}
on(authModeLoginBtn, "click", () => setAuthMode("login"));
on(authModeRegisterBtn, "click", () => setAuthMode("register"));

// Register
async function handleRegister(e) {
  e.preventDefault();
  authStatusEl.textContent = "Creating account...";
  const email = regEmailEl.value.trim();
  const password = regPasswordEl.value;
  const username = regUsernameEl.value.trim();
  if (!email || !password || !username) {
    authStatusEl.textContent = "All fields required.";
    return;
  }
  try {
    const cred = await SA.auth.createUserWithEmailAndPassword(email, password);
    await SA.db.collection("users").doc(cred.user.uid).set({
      username,
      email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    authStatusEl.textContent = "Account created. Signed in.";
    SA.toast("Welcome " + username + "!", "success");
    setAuthMode("login");
  } catch (err) {
    authStatusEl.textContent = err.message || "Register failed.";
    SA.toast("Register failed", "error");
  }
}
on(registerForm, "submit", handleRegister);

// Login
async function handleLogin(e) {
  e.preventDefault();
  authStatusEl.textContent = "Signing in...";
  const email = loginEmailEl.value.trim();
  const password = loginPasswordEl.value;
  if (!email || !password) {
    authStatusEl.textContent = "Email & password required.";
    return;
  }
  try {
    await SA.auth.signInWithEmailAndPassword(email, password);
    authStatusEl.textContent = "Signed in.";
  } catch (err) {
    authStatusEl.textContent = err.message || "Login failed.";
    SA.toast("Login failed", "error");
  }
}
on(loginForm, "submit", handleLogin);

// Auth State Listener
SA.unsubscribeAuth = SA.auth.onAuthStateChanged(async (user) => {
  SA.currentUser = user || null;
  if (!user) {
    SA.currentUserDoc = null;
    SA.switchTab("setup");
    authStatusEl.textContent = "Signed out.";
    return;
  }
  const uid = user.uid;
  try {
    const snap = await SA.db.collection("users").doc(uid).get();
    SA.currentUserDoc = snap.exists ? snap.data() : { username: user.email.split("@")[0], email: user.email };
    authStatusEl.textContent = `Signed in as ${SA.currentUserDoc.username}.`;
    SA.toast("Signed in", "success");
    if (SA.loadContacts) SA.loadContacts();
    SA.switchTab(SA.currentUserDoc.username ? "chat" : "setup");
  } catch (err) {
    SA.toast("Profile load failed", "error");
  }
});

// Thread View
SA.showThread = function () {
  threadViewEl.classList.remove("hidden");
  threadViewEl.classList.add("active");
};
SA.hideThread = function () {
  threadViewEl.classList.add("hidden");
  threadViewEl.classList.remove("active");
  if (SA.activeThread && SA.activeThread.unsubMsgs) SA.activeThread.unsubMsgs();
  if (SA.activeThread && SA.activeThread.unsubTyping) SA.activeThread.unsubTyping();
  SA.activeThread = null;
};
on(threadBackBtnEl, "click", SA.hideThread);

// Auto-resize input
function autoResizeThreadInput() {
  threadInputEl.style.height = "auto";
  threadInputEl.style.height = Math.min(threadInputEl.scrollHeight, 120) + "px";
}
on(threadInputEl, "input", autoResizeThreadInput);

// Random Connect Key Generator
SA.randKey = function (len = 34) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_*#@";
  const arr = new Uint32Array(len);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  return Array.from(arr, n => chars[n % chars.length]).join("");
};

// Show My Key
SA.showMyConnectKey = function (str) {
  if (myConnectKeyEl) myConnectKeyEl.textContent = str || "--";
};

// Generate Key
SA.generateConnectKey = async function () {
  if (!SA.currentUser) return SA.toast("Sign in first.", "warn");
  const uid = SA.currentUser.uid;
  const username = SA.currentUserDoc?.username || "User";
  const key = SA.randKey(34);

  SA.cachedKeys = key;
  SA.showMyConnectKey(key);

  try {
    await SA.db.collection("connectCodes").doc(key).set({
      owner: uid,
      ownerUsername: username,
      used: false,
      consumedBy: null,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      consumedAt: null,
    });
    SA.toast("Key generated.", "success");
  } catch (err) {
    console.error("generateConnectKey failed", err);
    SA.toast("Key save failed", "error");
    SA.showMyConnectKey("--");
    SA.cachedKeys = null;
  }
};

// Copy Key
SA.copyMyConnectKey = function () {
  if (!SA.cachedKeys) return SA.toast("No key. Generate one.", "warn");
  SA.copyText(SA.cachedKeys);
};

// Connect With Partner Key
SA.connectWithKey = async function () {
  if (!SA.currentUser) {
    SA.toast("Sign in first.", "warn");
    connectStatusEl.textContent = "Sign in required.";
    return;
  }
  const uid = SA.currentUser.uid;
  const myUsername = SA.currentUserDoc?.username || "User";
  const entered = (partnerKeyInput.value || "").trim();
  if (!entered) return (connectStatusEl.textContent = "Enter a key.");

  connectStatusEl.textContent = "Checking key...";
  const codeRef = SA.db.collection("connectCodes").doc(entered);
  let codeSnap;

  try {
    codeSnap = await codeRef.get();
  } catch (err) {
    console.error("connectWithKey get error", err);
    connectStatusEl.textContent = "Network error.";
    SA.toast("Network error", "error");
    return;
  }
  if (!codeSnap.exists) return (connectStatusEl.textContent = "Invalid key.", SA.toast("Key not found", "error"));

  const codeData = codeSnap.data();
  if (codeData.used) return (connectStatusEl.textContent = "Key already used.", SA.toast("Key used", "warn"));
  if (codeData.owner === uid) return (connectStatusEl.textContent = "That's your own key.", SA.toast("Cannot connect to self", "warn"));

  // Fetch owner username
  let ownerUsername = codeData.ownerUsername;
  try {
    const ownerSnap = await SA.db.collection("users").doc(codeData.owner).get();
    if (ownerSnap.exists) ownerUsername = ownerSnap.data().username || ownerUsername || "User";
  } catch (err) {
    console.warn("Failed to fetch owner user doc; using cached username.", err);
  }

  // Check if already contacts
  const myContactRef = SA.db.collection("users").doc(uid).collection("contacts").doc(codeData.owner);
  try {
    if ((await myContactRef.get()).exists) {
      connectStatusEl.textContent = "Already connected.";
      SA.toast("Already contacts", "info");
      try {
        await codeRef.update({
          used: true,
          consumedBy: uid,
          consumedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (_) {}
      return;
    }
  } catch (err) {
    console.warn("Contact existence check failed", err);
  }

  // Write symmetric contacts
  const otherUid = codeData.owner;
  const otherContactRef = SA.db.collection("users").doc(otherUid).collection("contacts").doc(uid);
  const batch = SA.db.batch();
  const ts = window.firebase.firestore.FieldValue.serverTimestamp();
  batch.set(myContactRef, { username: ownerUsername, addedAt: ts }, { merge: true });
  batch.set(otherContactRef, { username: myUsername, addedAt: ts }, { merge: true });
  batch.update(codeRef, { used: true, consumedBy: uid, consumedAt: ts });

  connectStatusEl.textContent = "Connecting...";
  try {
    await batch.commit();
    connectStatusEl.textContent = "Connected!";
    SA.toast("Users connected", "success");
    partnerKeyInput.value = "";
    if (SA.loadContacts) SA.loadContacts();
  } catch (err) {
    console.error("Contact connect batch failed", err);
    connectStatusEl.textContent = "Connect failed.";
    SA.toast("Connect failed", "error");
  }
};

// Event Listeners
on(regenKeyBtn, "click", SA.generateConnectKey);
on(copyKeyBtn,  "click", SA.copyMyConnectKey);
on(connectBtn,  "click", SA.connectWithKey);
on(partnerKeyInput, "keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    SA.connectWithKey();
  }
});

// ====== CONTACTS SNAPSHOT ======
SA.contactsUnsub = null;
SA.loadContacts = function () {
  if (!SA.currentUser) return;
  if (SA.contactsUnsub) SA.contactsUnsub();
  const uid = SA.currentUser.uid;
  const contactsRef = SA.db.collection("users").doc(uid).collection("contacts").orderBy("addedAt", "desc");

  SA.contactsUnsub = contactsRef.onSnapshot(
    (snap) => {
      SA.contacts = {};
      snap.forEach((doc) => (SA.contacts[doc.id] = doc.data()));
      SA.renderChatList();
    },
    (err) => {
      console.error("Contacts snapshot error", err);
      SA.toast("Failed to load contacts", "error");
    }
  );
};

// ====== CHAT LIST RENDERING ======
SA.renderChatList = function () {
  chatListEl.innerHTML = "";
  const keys = Object.keys(SA.contacts);
  if (!keys.length) {
    noChatsMsgEl.style.display = "block";
    return;
  }
  noChatsMsgEl.style.display = "none";
  keys.forEach((uid) => {
    const data = SA.contacts[uid];
    const li = document.createElement("li");
    li.className = "chat-item";
    li.dataset.uid = uid;
    li.textContent = data.username || "User";
    chatListEl.appendChild(li);
  });
};

// ====== OPEN THREAD ======
SA.openThread = function (uid) {
  if (!uid || !SA.currentUser) return;
  const name = SA.contacts[uid]?.username || "User";
  threadUserNameEl.textContent = name;
  SA.showThread();
  if (SA.loadThread) SA.loadThread(uid);
};

// ====== CHAT LIST CLICK ======
on(chatListEl, "click", (e) => {
  const li = e.target.closest(".chat-item");
  if (li) SA.openThread(li.dataset.uid);
});

// ====== LOAD THREAD ======
SA.loadThread = function (otherUid) {
  SA.hideThread();
  SA.activeThread = { otherUid, threadId: SA.threadIdFor(SA.currentUser.uid, otherUid) };
  const threadId = SA.activeThread.threadId;

  SA.showThread();
  threadMessagesEl.innerHTML = "<div class='loading'>Loading...</div>";

  if (SA.activeThread.unsubMsgs) SA.activeThread.unsubMsgs();

  const msgsRef = SA.db.collection("threads").doc(threadId).collection("messages").orderBy("createdAt", "asc");
  SA.activeThread.unsubMsgs = msgsRef.onSnapshot(
    (snap) => {
      threadMessagesEl.innerHTML = "";
      snap.forEach((doc) => SA.renderMessage(doc.data(), doc.id));
      threadMessagesEl.scrollTop = threadMessagesEl.scrollHeight;
    },
    (err) => {
      console.error("Thread msgs error", err);
      SA.toast("Failed to load messages", "error");
    }
  );
};

// ====== RENDER MESSAGE ======
SA.renderMessage = function (data) {
  const isOwn = data.from === SA.currentUser.uid;
  const wrap = document.createElement("div");
  wrap.className = "msg-row " + (isOwn ? "own" : "other");

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  const textSpan = document.createElement("span");
  textSpan.className = "msg-text";
  textSpan.textContent = data.text || "";

  const timeSpan = document.createElement("span");
  timeSpan.className = "msg-time";
  if (data.createdAt?.toDate) {
    const d = data.createdAt.toDate();
    timeSpan.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } else {
    timeSpan.textContent = "--:--";
  }

  bubble.append(textSpan, timeSpan);
  wrap.appendChild(bubble);
  threadMessagesEl.appendChild(wrap);
};

// ====== SEND MESSAGE ======
SA.sendThreadMessage = async function (e) {
  e.preventDefault();
  if (!SA.activeThread?.otherUid) return;
  const txt = threadInputEl.value.trim();
  if (!txt) return;

  threadInputEl.value = "";
  threadInputEl.focus();
  autoResizeThreadInput();

  try {
    await SA.db.collection("threads").doc(SA.activeThread.threadId).collection("messages").add({
      from: SA.currentUser.uid,
      text: txt,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("Send message failed", err);
    SA.toast("Send failed", "error");
  }
};
on(threadInputBarEl, "submit", SA.sendThreadMessage);

// ====== TYPING INDICATOR ======
let typingTimeout = null;
function showTyping() {
  typingIndicatorEl.classList.remove("hidden");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => typingIndicatorEl.classList.add("hidden"), 1500);
}
on(threadInputEl, "input", showTyping);

// ====== DEBUG EXPORT ======
SA.debug = { SA };
