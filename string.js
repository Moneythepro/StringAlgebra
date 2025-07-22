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
