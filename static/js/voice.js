// Browser speech: synthesis (all modern browsers, offline) and recognition (Chrome/Edge).
let voice = null;
function pickVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const prefs = [/Google UK English Female/i, /Samantha/i, /Serena/i, /Microsoft (Aria|Jenny|Libby)/i, /en-GB/i, /en-US/i, /en/i];
  for (const p of prefs) { const v = vs.find(x => p.test(x.name) || p.test(x.lang)); if (v) return v; }
  return vs[0] || null;
}
if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); }; voice = pickVoice(); }

export function voiceAvailable() {
  return { speak: !!window.speechSynthesis, listen: !!(window.SpeechRecognition || window.webkitSpeechRecognition) };
}
export function speak(text, onEnd) {
  if (!window.speechSynthesis) { onEnd && onEnd(); return; }
  speechSynthesis.cancel();
  const clean = text.replace(/ppCO₂/g, "C O 2").replace(/CO₂/g, "C O 2").replace(/SpO₂/g, "S P O 2").replace(/VO₂/g, "V O 2")
    .replace(/µSv\/h/g, "microsieverts per hour").replace(/mSv/g, "millisieverts").replace(/°C/g, " degrees").replace(/mmHg/g, "millimetres of mercury")
    .replace(/≥/g, "at least").replace(/±/g, "plus or minus").replace(/(\d)\s?%/g, "$1 percent").replace(/ONSD/g, "optic nerve sheath");
  const u = new SpeechSynthesisUtterance(clean);
  if (!voice) voice = pickVoice();
  if (voice) u.voice = voice;
  u.rate = 1.02; u.pitch = 0.95;
  u.onend = () => onEnd && onEnd(); u.onerror = () => onEnd && onEnd();
  speechSynthesis.speak(u);
}
export function stopSpeaking() { if (window.speechSynthesis) speechSynthesis.cancel(); }
export function listen(cb) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return cb(null);
  const r = new R(); r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
  let done = false;
  r.onresult = e => { done = true; cb(e.results[0][0].transcript); };
  r.onerror = () => { if (!done) cb(null); done = true; };
  r.onend = () => { if (!done) cb(null); };
  r.start();
}
