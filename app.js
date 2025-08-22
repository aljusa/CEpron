// ---------- utilidades ----------
const DEFAULT_WORDS = [
  "apple","banana","orange","table","chair","window","computer","phone","water","family",
  "school","teacher","student","music","movie","paper","pencil","bottle","coffee","chocolate",
  "morning","evening","night","summer","winter","spring","autumn","travel","friend","people",
  "beautiful","interesting","difficult","easy","quick","slow","strong","weak","happy","angry",
  "country","city","village","ocean","river","mountain","forest","desert","animal","garden",
  "read","write","listen","speak","watch","play","learn","work","sleep","dream",
  "yesterday","today","tomorrow","always","never","sometimes","often","rarely","before","after",
  "because","however","although","between","among","without","inside","outside","above","below"
];

const $ = s => document.querySelector(s);
const normalize = (str="") =>
  str.toLowerCase()
     .normalize("NFD")
     .replace(/\p{Diacritic}/gu,"")
     .replace(/[^a-z\s']/g,"")
     .trim();

function levenshtein(a,b){
  a = normalize(a); b = normalize(b);
  const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  const dp = Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

const pickRandom = arr => arr[Math.floor(Math.random()*arr.length)];

// ---------- estado ----------
let wordBank = [...DEFAULT_WORDS];
let target = "";
let listening = false;
let stats = { correct:0, total:0 };
let difficulty = "tolerante"; // o "estricto"

let recognition = null;

// ---------- elementos ----------
const elTarget = $("#targetWord");
const elBtnNew = $("#btnNew");
const elBtnSpeak = $("#btnSpeak");
const elBtnListen = $("#btnListen");
const elInterim = $("#interim");
const elFinal = $("#finalText");
const elResult = $("#result");
const elStats = $("#stats");
const elMeter = $("#meterFill");
const elModeTol = $("#modeTol");
const elModeStr = $("#modeStr");
const elCustomInput = $("#customInput");
const elBtnAdd = $("#btnAdd");
const elSupportWarn = $("#supportWarn");

// ---------- soporte ----------
function setupRecognition(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return null;
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  return rec;
}

// ---------- UI helpers ----------
function updateStats(){
  const acc = stats.total ? Math.round((stats.correct/stats.total)*100) : 0;
  elStats.textContent = `${stats.correct}/${stats.total} correctas (${acc}%)`;
  elMeter.style.width = `${acc}%`;
}
function setBadge(ok,note){
  elResult.innerHTML = ok
    ? `<div class="badge ok">✅ ¡Bien pronunciado! — ${note}</div>`
    : `<div class="badge bad">❌ Inténtalo de nuevo — ${note}</div>`;
}
function nextWord(){
  target = pickRandom(wordBank);
  elTarget.textContent = target;
  elFinal.textContent = "";
  elInterim.textContent = "";
  elResult.innerHTML = "";
}
function speak(text){
  if(!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  const v = speechSynthesis.getVoices().find(v => v.lang?.startsWith("en"));
  if (v) u.voice = v;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// ---------- evaluación ----------
function evaluate(heard){
  const expected = normalize(target);
  const heardNorm = normalize(heard);
  const tokens = heardNorm.split(/\s+/g).filter(Boolean);
  const directHit = tokens.includes(expected);
  const distances = tokens.map(t => ({ t, d: levenshtein(t, expected) }));
  const best = distances.length
    ? distances.reduce((a,b)=>a.d<=b.d?a:b)
    : { t: heardNorm, d: levenshtein(heardNorm, expected) };

  const len = expected.length;
  const threshold = (difficulty==="estricto") ? 0 : (len<=4?1:len<=7?2:3);
  const ok = directHit || best.d <= threshold;
  const note = ok
    ? (directHit ? "¡Exacto!" : `Casi idéntico (distancia ${best.d}).`)
    : `Se reconoció como "${heard}". Intenta enfatizar las vocales/sílabas.`;

  setBadge(ok, note);
  stats.total += 1;
  if (ok) stats.correct += 1;
  updateStats();
}

// ---------- eventos ----------
window.addEventListener("DOMContentLoaded", () => {
  // Soporte
  recognition = setupRecognition();
  if(!recognition){ elSupportWarn.hidden = false; }
  nextWord();
  updateStats();

  // botones
  elBtnNew.onclick = nextWord;
  elBtnSpeak.onclick = () => speak(target);

  elModeTol.onclick = () => { difficulty="tolerante"; elModeTol.classList.add("active"); elModeStr.classList.remove("active"); };
  elModeStr.onclick = () => { difficulty="estricto"; elModeStr.classList.add("active"); elModeTol.classList.remove("active"); };

  elBtnAdd.onclick = () => {
    const w = normalize(elCustomInput.value);
    if(!w) return;
    if(!wordBank.includes(w)) wordBank.unshift(w);
    elCustomInput.value = "";
    target = w;
    elTarget.textContent = target;
    elResult.innerHTML = "";
    elFinal.textContent = "";
    elInterim.textContent = "";
  };

  // reconocimiento
  elBtnListen.onclick = () => {
    if(!recognition) return;
    if(listening){ recognition.stop(); listening=false; elBtnListen.textContent="🎙️ Hablar"; return; }
    elFinal.textContent = ""; elInterim.textContent="";
    elResult.innerHTML = "";
    elBtnListen.textContent = "■ Detener";
    listening = true;

    recognition.onresult = ev => {
      let finalText="", interimText="";
      for(let i=ev.resultIndex;i<ev.results.length;i++){
        const piece = ev.results[i][0].transcript;
        if(ev.results[i].isFinal) finalText += piece; else interimText += piece;
      }
      if (interimText) elInterim.textContent = `Reconociendo… ${interimText}`;
      if (finalText){
        elFinal.textContent = `Reconocido: ${finalText}`;
        elInterim.textContent = "";
        evaluate(finalText);
      }
    };

    recognition.onerror = e => {
      elResult.innerHTML = `<div class="badge bad">⚠️ ${({
        "no-speech":"No se detectó voz.",
        "audio-capture":"No hay micrófono.",
        "not-allowed":"Permiso denegado. Permite micrófono en el candado.",
        "network":"Error de red."
      })[e.error] || ("Error: "+(e.error||"desconocido"))}</div>`;
      listening=false; elBtnListen.textContent="🎙️ Hablar";
    };

    recognition.onnomatch = () => {
      elResult.innerHTML = `<div class="badge bad">🤔 No se detectó una frase clara. Intenta de nuevo.</div>`;
    };

    recognition.onend = () => {
      listening=false; elBtnListen.textContent="🎙️ Hablar";
    };

    try { recognition.start(); } catch {}
  };
});
