// Psychomotor vigilance test (short form, 5 trials). Anyone can take it — results appear
// on the console as "guest crew"; choosing a crew member updates their reaction-time measure.
export function openPVT({ modal, close, crew, onDone }) {
  const trials = []; let state = "idle", t0 = 0, timer = null; const N = 5;
  const html = `<div class="muted" style="font-size:12.5px;margin-bottom:10px">Tap the panel as soon as it lights up. ${N} trials, about 30 seconds. Part of NASA's Cognition battery uses this test.</div>
    <div style="display:flex;gap:8px;margin-bottom:12px"><input id="pvtName" class="btn" placeholder="Your name (or nickname)" style="flex:1">
    <select id="pvtCrew" class="btn"><option value="">Guest</option><option value="vasquez">as Vasquez</option><option value="mori">as Mori</option><option value="haddad">as Haddad</option><option value="novak">as Novak</option></select></div>
    <div class="pvt-pad" id="pvtPad">Tap to start</div>
    <div class="exam-prog" id="pvtProg">${Array.from({ length: N }, () => "<span></span>").join("")}</div>
    <div class="muted mono" id="pvtRes" style="font-size:12px"></div>`;
  modal("Reaction-time test", html);
  const pad = document.getElementById("pvtPad");
  const prog = () => [...document.querySelectorAll("#pvtProg span")].forEach((s, i) => s.classList.toggle("on", i < trials.length));
  const arm = () => {
    state = "wait"; pad.className = "pvt-pad"; pad.innerHTML = "Wait for it…";
    timer = setTimeout(() => { state = "go"; t0 = performance.now(); pad.className = "pvt-pad go"; pad.innerHTML = "TAP"; }, 1500 + Math.random() * 2500);
  };
  pad.onpointerdown = async () => {
    if (state === "idle") return arm();
    if (state === "wait") { clearTimeout(timer); pad.innerHTML = "Too early — wait for the light"; setTimeout(arm, 900); return; }
    if (state === "go") {
      const rt = performance.now() - t0; trials.push(rt); prog();
      pad.className = "pvt-pad"; pad.innerHTML = `<div><div class="ms">${Math.round(rt)}</div>ms</div>`;
      if (trials.length < N) { state = "pause"; setTimeout(arm, 900); return; }
      state = "done";
      const med = [...trials].sort((a, b) => a - b)[Math.floor(N / 2)];
      const name = document.getElementById("pvtName").value || "Guest";
      const c = document.getElementById("pvtCrew").value || null;
      try { await fetch("/api/pvt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, crew: c, trials }) }); } catch (e) {}
      document.getElementById("pvtRes").innerHTML = `Median ${Math.round(med)} ms. Rested adults are typically about 250 ms; sleep loss adds tens of milliseconds and more lapses.`;
      pad.innerHTML = `<div><div class="ms">${Math.round(med)}</div>median ms · tap to close</div>`;
      pad.onpointerdown = () => { close(); onDone && onDone(); };
    }
  };
}
