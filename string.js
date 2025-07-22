/* =========================================================
 * StringAlgebra v0.1 Terminal Chat MVP
 * ---------------------------------------------------------
 * PART 1 of 4
 * ---------------------------------------------------------
 * Paste PART 1 at the TOP of your app.js file.
 * Do NOT duplicate `"use strict"` across parts—it's here once.
 *
 * Contents (Part 1):
 *   - Strict mode, namespace, config guard
 *   - DOM grabs
 *   - Small helpers (qs, on, toast, copy, uid sort)
 *   - Tab switching
 *   - Auth mode toggle (login/register)
 *   - Firebase Auth: register + create user doc; login; state listener
 *   - Basic signed-in UI state
 *
 * After you paste this, tell me and I’ll send PART 2 (Connect Keys logic).
 * ======================================================= */
"use strict";

/* ---------------------------------------------------------
 * GLOBAL NAMESPACE
 * ------------------------------------------------------- */
window.SA = window.SA || {};
const SA = window.SA;

/* ---------------------------------------------------------
 * FIREBASE GUARD
 * Expect firebase SDKs loaded in HTML and firebaseConfig defined.
 * ------------------------------------------------------- */
(function initFirebase() {
  if (!window.firebase) {
    console.error("[StringAlgebra] Firebase SDK not loaded.");
    return;
  }
  if (!window.firebase.apps.length) {
    if (!window.firebaseConfig) {
      console.warn("[StringAlgebra] firebaseConfig missing. Define window.firebaseConfig BEFORE app.js loads.");
      // Prevent crash; create a dummy app so code paths don't explode (no network).
      window.firebase.initializeApp({ apiKey:"noop", projectId:"noop" });
    } else {
      window.firebase.initializeApp(window.firebaseConfig);
    }
  }
  SA.auth = window.firebase.auth();
  SA.db   = window.firebase.firestore();
})();

/* ---------------------------------------------------------
 * DOM SHORTCUTS
 * ------------------------------------------------------- */
const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const on  = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

/* Tab panels + buttons */
const tabPanels = {
  setup:   qs("#setupTab"),
  connect: qs("#connectTab"),
  chat:    qs("#chatTab"),
};
const tabBtns = {
  setup:   qs("#tabBtn-setup"),
  connect: qs("#tabBtn-connect"),
  chat:    qs("#tabBtn-chat"),
};

/* Auth UI */
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

/* Connect Tab (grab now; functions in Part 2) */
const myConnectKeyEl   = qs("#myConnectKey");
const regenKeyBtn      = qs("#regenKeyBtn");
const copyKeyBtn       = qs("#copyKeyBtn");
const partnerKeyInput  = qs("#partnerKeyInput");
const connectBtn       = qs("#connectBtn");
const connectStatusEl  = qs("#connectStatus");

/* Chat Tab */
const chatListEl    = qs("#chatList");
const noChatsMsgEl  = qs("#noChatsMsg");

/* Thread View */
const threadViewEl      = qs("#threadView");
const threadBackBtnEl   = qs("#threadBackBtn");
const threadUserNameEl  = qs("#threadUserName");
const threadMessagesEl  = qs("#threadMessages");
const typingIndicatorEl = qs("#typingIndicator");
const threadInputBarEl  = qs("#threadInputBar");
const threadInputEl     = qs("#threadInput");
const threadSendBtnEl   = qs("#threadSendBtn");

/* Toast container */
const toastContainerEl = qs("#toastContainer");

/* ---------------------------------------------------------
 * STATE
 * ------------------------------------------------------- */
SA.currentUser   = null;       // firebase.User
SA.currentUserDoc= null;       // user profile doc data
SA.contacts      = {};         // uid -> {username,...}
SA.activeThread  = null;       // {otherUid, threadId, unsubMsgs, unsubTyping}
SA.cachedKeys    = null;       // last generated connect key (string)

/* ---------------------------------------------------------
 * TOAST / ALERT
 * ------------------------------------------------------- */
SA.toast = function toast(msg, tone="info", timeout=4000) {
  if (!toastContainerEl) return alert(msg);
  const id = "toast-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const div = document.createElement("div");
  div.className = `toast toast-${tone}`;
  div.id = id;
  div.textContent = msg;
  toastContainerEl.appendChild(div);
  setTimeout(()=>div.classList.add("show"),10);
  setTimeout(()=>{
    div.classList.remove("show");
    setTimeout(()=>div.remove(),250);
  }, timeout);
};

/* ---------------------------------------------------------
 * COPY TO CLIPBOARD
 * ------------------------------------------------------- */
SA.copyText = async function copyText(str) {
  try {
    await navigator.clipboard.writeText(str);
    SA.toast("Copied!", "success");
    return true;
  } catch (err) {
    console.warn("Clipboard failed, fallback", err);
    try {
      const tmp = document.createElement("textarea");
      tmp.style.position="fixed"; tmp.style.opacity="0";
      tmp.value=str;
      document.body.appendChild(tmp);
      tmp.focus(); tmp.select();
      document.execCommand("copy");
      tmp.remove();
      SA.toast("Copied.", "success");
      return true;
    } catch (err2) {
      console.error("Copy fallback failed", err2);
      SA.toast("Copy failed", "error");
      return false;
    }
  }
};

/* ---------------------------------------------------------
 * UTIL: SORTED THREAD ID (uidA_uidB alphabetical)
 * ------------------------------------------------------- */
SA.threadIdFor = function threadIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
};

/* ---------------------------------------------------------
 * TAB SWITCH
 * ------------------------------------------------------- */
SA.switchTab = function switchTab(name) {
  Object.entries(tabPanels).forEach(([k,el])=>{
    if (!el) return;
    el.classList.toggle("active", k===name);
  });
  Object.entries(tabBtns).forEach(([k,btn])=>{
    if (!btn) return;
    const sel = (k===name);
    btn.setAttribute("aria-selected", sel ? "true" : "false");
  });
  // Hide thread overlay if leaving chat tab
  if (name!=="chat") {
    SA.hideThread();
  }
};
on(tabBtns.setup,   "click", ()=>SA.switchTab("setup"));
on(tabBtns.connect, "click", ()=>SA.switchTab("connect"));
on(tabBtns.chat,    "click", ()=>SA.switchTab("chat"));

/* ---------------------------------------------------------
 * AUTH MODE TOGGLE (Login vs Register)
 * ------------------------------------------------------- */
function setAuthMode(mode) {
  const isLogin = mode==="login";
  authModeLoginBtn.classList.toggle("is-active", isLogin);
  authModeRegisterBtn.classList.toggle("is-active", !isLogin);
  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);
  authStatusEl.textContent="";
}
on(authModeLoginBtn,    "click", ()=>setAuthMode("login"));
on(authModeRegisterBtn, "click", ()=>setAuthMode("register"));

/* ---------------------------------------------------------
 * AUTH: REGISTER
 * Creates Firebase user, then user profile doc in Firestore:
 *   users/{uid} = { username, email, createdAt, updatedAt }
 * ------------------------------------------------------- */
async function handleRegister(e) {
  e.preventDefault();
  authStatusEl.textContent = "Creating account...";
  const email    = regEmailEl.value.trim();
  const password = regPasswordEl.value;
  const username = regUsernameEl.value.trim();

  if (!email || !password || !username) {
    authStatusEl.textContent = "All fields required.";
    return;
  }
  try {
    const cred = await SA.auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    await SA.db.collection("users").doc(uid).set({
      username,
      email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge:true });
    authStatusEl.textContent = "Account created. Signed in.";
    SA.toast("Welcome "+username+"!", "success");
    setAuthMode("login"); // visually collapse to login layout (optional)
  } catch (err) {
    console.error("Register error", err);
    authStatusEl.textContent = err.message || "Register failed.";
    SA.toast("Register failed", "error");
  }
}
on(registerForm, "submit", handleRegister);

/* ---------------------------------------------------------
 * AUTH: LOGIN
 * ------------------------------------------------------- */
async function handleLogin(e) {
  e.preventDefault();
  authStatusEl.textContent = "Signing in...";
  const email    = loginEmailEl.value.trim();
  const password = loginPasswordEl.value;
  if (!email || !password) {
    authStatusEl.textContent = "Email & password required.";
    return;
  }
  try {
    await SA.auth.signInWithEmailAndPassword(email, password);
    authStatusEl.textContent = "Signed in.";
  } catch (err) {
    console.error("Login error", err);
    authStatusEl.textContent = err.message || "Login failed.";
    SA.toast("Login failed", "error");
  }
}
on(loginForm, "submit", handleLogin);

/* ---------------------------------------------------------
 * AUTH STATE LISTENER
 * On sign-in: load user doc; go to Connect or Chat tab depending.
 * ------------------------------------------------------- */
SA.unsubscribeAuth = SA.auth.onAuthStateChanged(async (user)=>{
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
    if (!snap.exists) {
      // Create minimal doc in case missing (shouldn't happen after register)
      await SA.db.collection("users").doc(uid).set({
        email: user.email || null,
        username: user.email ? user.email.split("@")[0] : "user",
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge:true });
      SA.currentUserDoc = { username: user.email.split("@")[0], email:user.email };
    } else {
      SA.currentUserDoc = snap.data();
    }
    // Prefill login UI with username info
    authStatusEl.textContent = `Signed in as ${SA.currentUserDoc.username || "(no username)"}.`;
    SA.toast("Signed in", "success");

    // Load contacts & update UI (implemented in PART 3, stub for now)
    if (SA.loadContacts) SA.loadContacts();

    // Decide which tab: if no username, force Setup; else Chat
    const hasName = !!SA.currentUserDoc.username;
    SA.switchTab(hasName ? "chat" : "setup");
  } catch (err) {
    console.error("Load user doc error", err);
    SA.toast("Profile load failed", "error");
  }
});

/* ---------------------------------------------------------
 * THREAD VIEW STUBS (real impl in Part 4)
 * ------------------------------------------------------- */
SA.showThread = function showThreadStub() {
  threadViewEl.classList.remove("hidden");
  threadViewEl.classList.add("active");
};
SA.hideThread = function hideThreadStub() {
  threadViewEl.classList.add("hidden");
  threadViewEl.classList.remove("active");
  // Clean up active listeners if any
  if (SA.activeThread && SA.activeThread.unsubMsgs) SA.activeThread.unsubMsgs();
  if (SA.activeThread && SA.activeThread.unsubTyping) SA.activeThread.unsubTyping();
  SA.activeThread = null;
};
on(threadBackBtnEl, "click", SA.hideThread);

/* ---------------------------------------------------------
 * KEYBOARD / TEXTAREA AUTO-RESIZE (basic)
 * ------------------------------------------------------- */
function autoResizeThreadInput() {
  threadInputEl.style.height = "auto";
  const max = 120;
  const newH = Math.min(threadInputEl.scrollHeight, max);
  threadInputEl.style.height = newH + "px";
}
on(threadInputEl, "input", autoResizeThreadInput);

/* ---------------------------------------------------------
 * EXPORT SOME SHORTCUTS TO WINDOW FOR DEBUG
 * ------------------------------------------------------- */
window.SA_switchTab = SA.switchTab;
window.SA_user      = ()=>SA.currentUser;
window.SA_userDoc   = ()=>SA.currentUserDoc;

/* ---------------------------------------------------------
 * END PART 1
 * Request PART 2 when ready: Connect-Key generation + linking.
 * ------------------------------------------------------- */

/* =========================================================
 * StringAlgebra v0.1 Terminal Chat MVP
 * ---------------------------------------------------------
 * PART 2 of 4 — Connect-Key Generation & Linking Contacts
 * ---------------------------------------------------------
 * Paste THIS *after* PART 1 code in app.js.
 *
 * Contents:
 *   - Random 34-char key generator
 *   - Generate + display + store one-time connect key
 *   - Copy key to clipboard
 *   - Consume partner key to create 2-way contacts
 *   - Basic connect status UI feedback
 *
 * Firestore structure used here:
 *   connectCodes/{key} = {
 *     owner: <uid>,
 *     ownerUsername: <string>,
 *     used: false|true,
 *     consumedBy: <uid|null>,
 *     createdAt: serverTimestamp,
 *     consumedAt: serverTimestamp|null
 *   }
 *
 * Contacts are stored symmetrically:
 *   users/{uid}/contacts/{otherUid} = {
 *     username: <other user's username>,
 *     addedAt: serverTimestamp
 *   }
 *
 * PART 3 will live-update chat list from these contacts.
 * ======================================================= */

/* ---------------------------------------------------------
 * RANDOM CONNECT KEY
 * Safe chars (no slash '/'; avoid confusing 0/O, 1/l/I).
 * Includes some symbols for “geek/terminal” feel.
 * ------------------------------------------------------- */
SA.randKey = function randKey(len = 34) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_*#@";
  const arr = new Uint32Array(len);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[arr[i] % chars.length];
  }
  return out;
};

/* ---------------------------------------------------------
 * UI: SHOW MY KEY
 * ------------------------------------------------------- */
SA.showMyConnectKey = function showMyConnectKey(str) {
  if (myConnectKeyEl) myConnectKeyEl.textContent = str || "--";
};

/* ---------------------------------------------------------
 * GENERATE KEY HANDLER
 * Creates doc connectCodes/{key}. Overwrites if re-generated.
 * Previous unused keys remain in DB (garbage is fine for MVP).
 * ------------------------------------------------------- */
SA.generateConnectKey = async function generateConnectKey() {
  if (!SA.currentUser) {
    SA.toast("Sign in first.", "warn");
    return;
  }
  const uid = SA.currentUser.uid;
  const username = (SA.currentUserDoc && SA.currentUserDoc.username) || "User";
  const key = SA.randKey(34);

  // optimistic UI
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

/* ---------------------------------------------------------
 * COPY CURRENT KEY
 * ------------------------------------------------------- */
SA.copyMyConnectKey = function copyMyConnectKey() {
  if (!SA.cachedKeys) {
    SA.toast("No key. Generate one.", "warn");
    return;
  }
  SA.copyText(SA.cachedKeys);
};

/* ---------------------------------------------------------
 * CONNECT WITH PARTNER KEY
 * Steps:
 *   1. Read user input
 *   2. Fetch connectCodes/{key}
 *   3. Validate: exists, not used, not mine
 *   4. Create symmetric contact docs in a batch
 *   5. Mark key used
 *   6. Clear input + message
 * PART 3 snapshot will pull new contact into chat list.
 * ------------------------------------------------------- */
SA.connectWithKey = async function connectWithKey() {
  if (!SA.currentUser) {
    SA.toast("Sign in first.", "warn");
    connectStatusEl.textContent = "Sign in required.";
    return;
  }
  const uid = SA.currentUser.uid;
  const myUsername = (SA.currentUserDoc && SA.currentUserDoc.username) || "User";

  const entered = (partnerKeyInput.value || "").trim();
  if (!entered) {
    connectStatusEl.textContent = "Enter a key.";
    return;
  }
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
  if (!codeSnap.exists) {
    connectStatusEl.textContent = "Invalid key.";
    SA.toast("Key not found", "error");
    return;
  }
  const codeData = codeSnap.data();

  if (codeData.used) {
    connectStatusEl.textContent = "Key already used.";
    SA.toast("Key used", "warn");
    return;
  }
  if (codeData.owner === uid) {
    connectStatusEl.textContent = "That's your own key.";
    SA.toast("Cannot connect to self", "warn");
    return;
  }

  // Fetch owner user doc for username
  let ownerUsername = codeData.ownerUsername;
  try {
    const ownerSnap = await SA.db.collection("users").doc(codeData.owner).get();
    if (ownerSnap.exists) {
      const d = ownerSnap.data();
      ownerUsername = d.username || ownerUsername || "User";
    }
  } catch (err) {
    console.warn("Failed to fetch owner user doc; using cached username.", err);
  }

  // Check if already contacts to avoid duplicate writes
  const myContactRef = SA.db.collection("users").doc(uid)
    .collection("contacts").doc(codeData.owner);
  try {
    const myContactSnap = await myContactRef.get();
    if (myContactSnap.exists) {
      connectStatusEl.textContent = "Already connected.";
      SA.toast("Already contacts", "info");
      // Mark key used anyway? Let's mark consumed but harmless.
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

  // Symmetric contact writes
  const otherUid = codeData.owner;
  const otherContactRef = SA.db.collection("users").doc(otherUid)
    .collection("contacts").doc(uid);
  const batch = SA.db.batch();
  const ts = window.firebase.firestore.FieldValue.serverTimestamp();
  batch.set(myContactRef, {
    username: ownerUsername,
    addedAt: ts,
  }, { merge: true });
  batch.set(otherContactRef, {
    username: myUsername,
    addedAt: ts,
  }, { merge: true });
  batch.update(codeRef, {
    used: true,
    consumedBy: uid,
    consumedAt: ts,
  });

  connectStatusEl.textContent = "Connecting...";
  try {
    await batch.commit();
    connectStatusEl.textContent = "Connected!";
    SA.toast("Users connected", "success");
    partnerKeyInput.value = "";
    // refresh contacts if loader present (implemented in PART 3)
    if (SA.loadContacts) SA.loadContacts();
  } catch (err) {
    console.error("Contact connect batch failed", err);
    connectStatusEl.textContent = "Connect failed.";
    SA.toast("Connect failed", "error");
  }
};

/* ---------------------------------------------------------
 * EVENT LISTENERS (Connect Tab)
 * ------------------------------------------------------- */
on(regenKeyBtn, "click", SA.generateConnectKey);
on(copyKeyBtn,  "click", SA.copyMyConnectKey);
on(connectBtn,  "click", SA.connectWithKey);

/* Also fire connect on Enter in input field */
on(partnerKeyInput, "keydown", (e)=>{
  if (e.key === "Enter") {
    e.preventDefault();
    SA.connectWithKey();
  }
});

/* ---------------------------------------------------------
 * OPTIONAL: Auto-generate key when switching to Connect tab
 * (comment out to disable auto generation)
 * ------------------------------------------------------- */
SA.autoKeyOnTab = true;
(function setupTabObserver(){
  const btn = tabBtns.connect;
  if (!btn) return;
  on(btn, "click", ()=>{
    if (!SA.autoKeyOnTab) return;
    // generate only if signed in & we don't already have a cached key
    if (SA.currentUser && !SA.cachedKeys) {
      SA.generateConnectKey();
    }
  });
})();

/* ---------------------------------------------------------
 * END PART 2
 * Request PART 3 when ready: Contacts snapshot + Chat List.
 * ------------------------------------------------------- */

/* =========================================================
 * StringAlgebra v0.1 Terminal Chat MVP
 * ---------------------------------------------------------
 * PART 3 of 4 — Contact List + Chat List Logic
 * ---------------------------------------------------------
 * Paste THIS *after* PART 2 code in app.js.
 *
 * Contents:
 *   - Live snapshot of user's contacts
 *   - Renders chat list
 *   - Opens thread on click (delegated to PART 4)
 * ======================================================= */

/* ---------------------------------------------------------
 * LOAD CONTACTS (real-time)
 * ------------------------------------------------------- */
SA.contactsUnsub = null;
SA.loadContacts = function loadContacts() {
  if (!SA.currentUser) return;
  if (SA.contactsUnsub) {
    SA.contactsUnsub(); // detach previous listener
  }
  const uid = SA.currentUser.uid;
  const contactsRef = SA.db.collection("users").doc(uid).collection("contacts").orderBy("addedAt", "desc");

  SA.contactsUnsub = contactsRef.onSnapshot((snap)=>{
    SA.contacts = {};
    snap.forEach(doc=>{
      SA.contacts[doc.id] = doc.data();
    });
    SA.renderChatList();
  }, (err)=>{
    console.error("Contacts snapshot error", err);
    SA.toast("Failed to load contacts", "error");
  });
};

/* ---------------------------------------------------------
 * RENDER CHAT LIST
 * ------------------------------------------------------- */
SA.renderChatList = function renderChatList() {
  chatListEl.innerHTML = "";
  const keys = Object.keys(SA.contacts);
  if (keys.length === 0) {
    noChatsMsgEl.style.display = "block";
    return;
  }
  noChatsMsgEl.style.display = "none";
  keys.forEach(uid=>{
    const data = SA.contacts[uid];
    const li = document.createElement("li");
    li.className = "chat-item";
    li.dataset.uid = uid;
    li.textContent = data.username || "User";
    chatListEl.appendChild(li);
  });
};

/* ---------------------------------------------------------
 * OPEN THREAD (click on chat)
 * Will call SA.openThread(uid)
 * ------------------------------------------------------- */
SA.openThread = function openThread(uid) {
  if (!uid || !SA.currentUser) return;
  const data = SA.contacts[uid];
  const name = (data && data.username) || "User";
  threadUserNameEl.textContent = name;
  SA.showThread();
  // Load thread messages + typing (Part 4)
  if (SA.loadThread) {
    SA.loadThread(uid);
  }
};

/* ---------------------------------------------------------
 * CHAT LIST CLICK HANDLER
 * ------------------------------------------------------- */
on(chatListEl, "click", (e)=>{
  const li = e.target.closest(".chat-item");
  if (!li) return;
  const uid = li.dataset.uid;
  SA.openThread(uid);
});

/* ---------------------------------------------------------
 * REFRESH CONTACTS AFTER LOGIN
 * (PART 1 calls SA.loadContacts() if defined)
 * ------------------------------------------------------- */

/* ---------------------------------------------------------
 * END PART 3
 * Request PART 4 when ready: Thread messages & sending.
 * ------------------------------------------------------- */

/* =========================================================
 * StringAlgebra v0.1 Terminal Chat MVP
 * ---------------------------------------------------------
 * PART 4 of 4 — Thread Messages & Sending
 * ---------------------------------------------------------
 * Paste THIS *after* PART 3 code in app.js.
 *
 * Contents:
 *   - Thread loader (messages snapshot)
 *   - Message renderer (left/right bubbles)
 *   - Sending messages
 *   - Typing indicator (basic)
 * ======================================================= */

/* ---------------------------------------------------------
 * LOAD THREAD
 * Thread = messages between currentUser and otherUid.
 * Path: threads/{threadId}/messages/{msgId}
 * threadId = sorted UIDs (uidA_uidB)
 * ------------------------------------------------------- */
SA.loadThread = function loadThread(otherUid) {
  SA.hideThread(); // ensure any previous thread is closed/unsubscribed
  SA.activeThread = { otherUid, threadId: SA.threadIdFor(SA.currentUser.uid, otherUid) };
  const threadId = SA.activeThread.threadId;

  // Show UI
  SA.showThread();
  threadMessagesEl.innerHTML = "<div class='loading'>Loading...</div>";

  // Unsubscribe old listeners if any
  if (SA.activeThread.unsubMsgs) SA.activeThread.unsubMsgs();

  // Listen to messages
  const msgsRef = SA.db.collection("threads").doc(threadId).collection("messages")
    .orderBy("createdAt", "asc");

  SA.activeThread.unsubMsgs = msgsRef.onSnapshot((snap)=>{
    threadMessagesEl.innerHTML = "";
    snap.forEach(doc=>{
      SA.renderMessage(doc.data(), doc.id);
    });
    threadMessagesEl.scrollTop = threadMessagesEl.scrollHeight;
  }, (err)=>{
    console.error("Thread msgs error", err);
    SA.toast("Failed to load messages", "error");
  });
};

/* ---------------------------------------------------------
 * RENDER MESSAGE
 * ------------------------------------------------------- */
SA.renderMessage = function renderMessage(data, msgId) {
  const isOwn = (data.from === SA.currentUser.uid);
  const wrap = document.createElement("div");
  wrap.className = "msg-row " + (isOwn ? "own" : "other");
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  const textSpan = document.createElement("span");
  textSpan.className = "msg-text";
  textSpan.textContent = data.text || "";
  const timeSpan = document.createElement("span");
  timeSpan.className = "msg-time";
  if (data.createdAt && data.createdAt.toDate) {
    const d = data.createdAt.toDate();
    timeSpan.textContent = d.getHours().toString().padStart(2,"0") + ":" + d.getMinutes().toString().padStart(2,"0");
  } else {
    timeSpan.textContent = "--:--";
  }
  bubble.appendChild(textSpan);
  bubble.appendChild(timeSpan);
  wrap.appendChild(bubble);
  threadMessagesEl.appendChild(wrap);
};

/* ---------------------------------------------------------
 * SEND MESSAGE
 * ------------------------------------------------------- */
SA.sendThreadMessage = async function sendThreadMessage(e) {
  e.preventDefault();
  if (!SA.activeThread || !SA.activeThread.otherUid) return;
  const txt = threadInputEl.value.trim();
  if (!txt) return;
  threadInputEl.value = "";
  threadInputEl.focus();
  autoResizeThreadInput();

  const threadId = SA.activeThread.threadId;
  try {
    await SA.db.collection("threads").doc(threadId)
      .collection("messages").add({
        from: SA.currentUser.uid,
        text: txt,
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    console.error("Send message failed", err);
    SA.toast("Send failed", "error");
  }
};
on(threadInputBarEl, "submit", SA.sendThreadMessage);

/* ---------------------------------------------------------
 * TYPING INDICATOR (Basic)
 * We just show/hide a 3-dot indicator on input events.
 * ------------------------------------------------------- */
let typingTimeout = null;
function showTyping() {
  typingIndicatorEl.classList.remove("hidden");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(()=>{
    typingIndicatorEl.classList.add("hidden");
  }, 1500);
}
on(threadInputEl, "input", showTyping);

/* ---------------------------------------------------------
 * FINAL EXPORTS
 * ------------------------------------------------------- */
SA.debug = { SA }; // for console debugging

/* =========================================================
 * END PART 4 — app.js complete!
 * You now have:
 *   - Auth (Part 1)
 *   - Connect Keys (Part 2)
 *   - Chat List (Part 3)
 *   - Thread Messaging (Part 4)
 *
 * Next steps:
 *   - Add CSS styles in style.css (terminal look).
 *   - Test Firestore rules & structure.
 * ======================================================= */
