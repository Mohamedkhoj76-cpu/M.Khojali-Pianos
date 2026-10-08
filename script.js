// ---------- 1. Find things on the page ----------
const keyEls = document.querySelectorAll("[data-key]");
const lastNote = document.getElementById("last-note");
const statusEl = document.getElementById("status");
const scaleSelect = document.getElementById("scale-select");
const waveSelect = document.getElementById("wave-select");
const echoRange = document.getElementById("echo-range");
const recBtn = document.getElementById("rec-btn");
const playBtn = document.getElementById("play-btn");
const canvas = document.getElementById("sky");
const pen = canvas.getContext("2d");

// ---------- 2. Scales ----------
// Each number = semitones above the starting note (C).
// Hijaz is the "Arabian night" sound: it has a big jump between the 2nd and 3rd notes.
const SCALES = {
  hijaz:      [0, 1, 4, 5, 7, 8, 10, 12],
  major:      [0, 2, 4, 5, 7, 9, 11, 12],
  pentatonic: [0, 2, 4, 7, 9, 12, 14, 16],
};
const WHITE = ["a", "s", "d", "f", "g", "h", "j", "k"];
const BLACK = { w: 0, e: 1, t: 3, y: 4, u: 5 };   // sits between white key i and i+1
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const START = 261.63;                              // middle C in Hz

function semitonesFor(key) {
  const scale = SCALES[scaleSelect.value];
  if (key in BLACK) {
    const i = BLACK[key];
    return (scale[i] + scale[i + 1]) / 2;          // halfway between two neighbours
  }
  return scale[WHITE.indexOf(key)];
}

function noteName(semi) {
  const base = NAMES[Math.floor(semi) % 12];
  return semi % 1 ? base + "+" : base;             // "+" = quarter-tone
}

// Update the letters on the keys when the scale changes
function relabel() {
  keyEls.forEach((el) => {
    const key = el.dataset.key;
    const name = noteName(semitonesFor(key));
    if (key in BLACK) el.querySelector("span").textContent = name;
    else el.querySelector(".note-name").textContent = name;
  });
}
scaleSelect.addEventListener("change", relabel);

// ---------- 3. Sound ----------
let audio, master, echoSend;

function startAudio() {
  if (audio) { audio.resume(); return; }
  audio = new (window.AudioContext || window.webkitAudioContext)();
  master = audio.createGain();
  master.gain.value = 0.6;
  master.connect(audio.destination);

  // "Cave echo": a delay that feeds back into itself
  const delay = audio.createDelay();
  delay.delayTime.value = 0.28;
  const feedback = audio.createGain();
  feedback.gain.value = 0.4;
  echoSend = audio.createGain();
  echoSend.gain.value = Number(echoRange.value);
  echoSend.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(master);
}
echoRange.addEventListener("input", () => { if (echoSend) echoSend.gain.value = Number(echoRange.value); });

const playing = {};   // key -> { osc, gain } so we can fade it when released

function noteOn(key) {
  startAudio();
  if (playing[key]) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = waveSelect.value;
  osc.frequency.value = START * Math.pow(2, semitonesFor(key) / 12);
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.6);
  osc.connect(gain);
  gain.connect(master);
  gain.connect(echoSend);
  osc.start();
  playing[key] = { osc, gain };
}

function noteOff(key) {
  const n = playing[key];
  if (!n) return;
  const t = audio.currentTime;
  n.gain.gain.cancelScheduledValues(t);
  n.gain.gain.setValueAtTime(n.gain.gain.value, t);
  n.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  n.osc.stop(t + 0.4);
  delete playing[key];
}

// ---------- 4. The night sky ----------
let sparks = [];
const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6 }));

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resize);
resize();

// Launch a glowing star from the top of the pressed key
function launchStar(el) {
  const r = el.getBoundingClientRect();
  const hue = Number(el.style.getPropertyValue("--hue"));
  const x = r.left + r.width / 2;
  for (let i = 0; i < 14; i++) {
    sparks.push({
      x, y: r.top,
      vx: (Math.random() - 0.5) * 3,
      vy: -2 - Math.random() * 4,
      life: 1, hue,
      size: 2 + Math.random() * 3,
    });
  }
}

function draw(time) {
  pen.clearRect(0, 0, canvas.width, canvas.height);
  // twinkling background stars
  stars.forEach((s) => {
    pen.globalAlpha = 0.35 + 0.35 * Math.sin(time / 700 + s.p);
    pen.fillStyle = "#efe1bf";
    pen.fillRect(s.x * canvas.width, s.y * canvas.height, 2, 2);
  });
  // rising sparks that fade away
  sparks = sparks.filter((p) => p.life > 0);
  sparks.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life -= 0.012;
    pen.globalAlpha = Math.max(p.life, 0);
    pen.fillStyle = `hsl(${p.hue} 95% 70%)`;
    pen.shadowColor = `hsl(${p.hue} 95% 60%)`;
    pen.shadowBlur = 12;
    pen.beginPath();
    pen.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    pen.fill();
  });
  pen.shadowBlur = 0;
  pen.globalAlpha = 1;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---------- 5. Press and release ----------
let recording = false, recStart = 0, recorded = [];

function press(key, fromReplay = false) {
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el || el.classList.contains("active")) return;
  el.classList.add("active");
  noteOn(key);
  launchStar(el);

  const semi = semitonesFor(key);
  const solfege = el.querySelector(".solfege");
  lastNote.textContent = (solfege ? solfege.textContent + " · " : "") + noteName(semi);
  lastNote.style.setProperty("--note-hue", el.style.getPropertyValue("--hue"));
  if (!fromReplay) statusEl.textContent = recording ? "Recording… keep playing." : "A star rises into the sky.";

  if (recording && !fromReplay) recorded.push({ t: performance.now() - recStart, key, down: true });
}

function release(key, fromReplay = false) {
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  el.classList.remove("active");
  noteOff(key);
  if (recording && !fromReplay) recorded.push({ t: performance.now() - recStart, key, down: false });
}

document.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (["SELECT", "INPUT"].includes(document.activeElement.tagName)) return;
  press(e.key.toLowerCase());
});
document.addEventListener("keyup", (e) => release(e.key.toLowerCase()));

// Mouse and touch
keyEls.forEach((el) => {
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); press(el.dataset.key); });
  el.addEventListener("pointerup", () => release(el.dataset.key));
  el.addEventListener("pointerleave", () => release(el.dataset.key));
});

// ---------- 6. Record and play back ----------
recBtn.addEventListener("click", () => {
  recording = !recording;
  recBtn.classList.toggle("recording", recording);
  recBtn.textContent = recording ? "Stop" : "Record";
  if (recording) {
    recorded = [];
    recStart = performance.now();
    playBtn.disabled = true;
    statusEl.textContent = "Recording… play your melody.";
  } else {
    playBtn.disabled = recorded.length === 0;
    statusEl.textContent = recorded.length ? "Saved. Press Play back to hear it." : "Nothing was recorded.";
  }
});

playBtn.addEventListener("click", () => {
  playBtn.disabled = true;
  statusEl.textContent = "Playing your melody…";
  recorded.forEach((ev) => setTimeout(() => (ev.down ? press(ev.key, true) : release(ev.key, true)), ev.t));
  const end = recorded[recorded.length - 1].t + 500;
  setTimeout(() => { playBtn.disabled = false; statusEl.textContent = "Done. Play it again or record a new one."; }, end);
});

relabel();
