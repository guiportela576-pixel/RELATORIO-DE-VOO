// Relatório de Voo (PWA) - armazenamento local
const APP_VERSION = "1.5.1";
const VERSION_HISTORY = [
  "1.1.0 - Campos automáticos (início/tempo) + seletores (bat/ciclos/carga) + remoção de pousos + novo ícone",
  "1.0.0 - App inicial (novo + histórico + UA + cronômetro)"
];

let entries = JSON.parse(localStorage.getItem("flightReports")) || [];
let uas = JSON.parse(localStorage.getItem("uas")) || [];
let defaultUA = localStorage.getItem("defaultUA") || "";



/* =========================================================
   GOOGLE DRIVE SYNC (Login Google + merge seguro)
   ========================================================= */
const GOOGLE_CLIENT_ID = "128740673498-o5pmlhng1m8680fsa5nqre07t7kk7seu.apps.googleusercontent.com";
const DRIVE_SYNC_FILENAME = "drone_log_sync.json";
const DRIVE_SYNC_MIME = "application/json";

let googleAccessToken = "";
let googleTokenClient = null;
let syncInProgress = false;
let syncQueued = false;

function setGoogleStatus(text){
  const el = document.getElementById("googleStatus");
  if (el) el.textContent = text;
}

function initGoogleAuth(){
  try{
    if (!window.google || !google.accounts || !google.accounts.oauth2){
      setTimeout(initGoogleAuth, 700);
      return;
    }
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (resp) => {
        if (resp && resp.access_token){
          googleAccessToken = resp.access_token;
          localStorage.setItem("googleAccessToken", googleAccessToken);
          setGoogleStatus("Google: conectado ✅");
          startAutoSyncWatcher();
          if (syncQueued && !syncInProgress){
            syncQueued = false;
            syncNow(false);
          }
        }else{
          setGoogleStatus("Google: não conectado");
        }
      }
    });

    const saved = localStorage.getItem("googleAccessToken") || "";
    if (saved){
      googleAccessToken = saved;
      setGoogleStatus("Google: conectado ✅");
    }else{
      setGoogleStatus("Google: não conectado");
    }
  }catch(e){
    setGoogleStatus("Google: não conectado");
  }
}

function connectGoogle(){
  if (!googleTokenClient){
    alert("O Google ainda está carregando. Tente novamente em alguns segundos.");
    return;
  }
  googleTokenClient.requestAccessToken({ prompt: "consent" });
}

function ensureGoogleToken(interactive){
  return new Promise((resolve, reject) => {
    if (googleAccessToken){
      resolve(googleAccessToken);
      return;
    }
    if (!googleTokenClient){
      if (interactive) alert("O Google ainda está carregando. Tente novamente em alguns segundos.");
      reject(new Error("no_token_client"));
      return;
    }
    googleTokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });

    const t0 = Date.now();
    const timer = setInterval(() => {
      if (googleAccessToken){
        clearInterval(timer);
        resolve(googleAccessToken);
      }else if (Date.now() - t0 > 8000){
        clearInterval(timer);
        reject(new Error("token_timeout"));
      }
    }, 200);
  });
}

async function driveFetch(url, opts={}){
  const headers = Object.assign({}, opts.headers || {}, {
    "Authorization": "Bearer " + googleAccessToken
  });
  return fetch(url, Object.assign({}, opts, { headers }));
}

async function findSyncFileId(){
  const q = encodeURIComponent(`name='${DRIVE_SYNC_FILENAME}' and mimeType='${DRIVE_SYNC_MIME}' and trashed=false`);
  const fields = encodeURIComponent("files(id,name,modifiedTime)");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&spaces=drive&pageSize=10`;
  const res = await driveFetch(url);
  if (!res.ok) return "";
  const data = await res.json();
  const f = (data.files || [])[0];
  return f ? String(f.id || "") : "";
}

async function createSyncFile(initialJson){
  const boundary = "-------droneLogBoundary" + Math.random().toString(16).slice(2);
  const metadata = { name: DRIVE_SYNC_FILENAME, mimeType: DRIVE_SYNC_MIME };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${DRIVE_SYNC_MIME}; charset=UTF-8\r\n\r\n` +
    `${initialJson}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "Content-Type": "multipart/related; boundary=" + boundary },
    body
  });
  if (!res.ok) throw new Error("create_failed");
  const data = await res.json();
  return String(data.id || "");
}

async function downloadSyncFile(fileId){
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await driveFetch(url);
  if (!res.ok) throw new Error("download_failed");
  return await res.text();
}

async function uploadSyncFile(fileId, jsonText){
  const url = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`;
  const res = await driveFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": DRIVE_SYNC_MIME },
    body: jsonText
  });
  if (!res.ok) throw new Error("upload_failed");
  return true;
}

function buildSyncPayload(){
  return JSON.stringify({
    app: "drone_log",
    updatedAt: new Date().toISOString(),
    entries: Array.isArray(entries) ? entries : [],
    uas: Array.isArray(uas) ? uas : [],
    defaultUA: String(defaultUA || ""),
    opCodes: Array.isArray(opCodes) ? opCodes : []
  });
}

function mergeRemoteIntoLocal(remote){
  const localById = new Map((Array.isArray(entries) ? entries : []).map(e => [e.id, e]));
  (Array.isArray(remote.entries) ? remote.entries : []).forEach(e => {
    if (e && e.id && !localById.has(e.id)){
      localById.set(e.id, e);
    }
  });
  entries = Array.from(localById.values());

  const uaSet = new Set((Array.isArray(uas) ? uas : []).map(normalizeStr).filter(Boolean));
  (Array.isArray(remote.uas) ? remote.uas : []).forEach(u => { const x = normalizeStr(u); if (x) uaSet.add(x); });
  uas = Array.from(uaSet.values());

  const cSet = new Set((Array.isArray(opCodes) ? opCodes : []).map(normalizeStr).filter(Boolean));
  (Array.isArray(remote.opCodes) ? remote.opCodes : []).forEach(c => { const x = normalizeStr(c); if (x) cSet.add(x); });
  opCodes = Array.from(cSet.values());
  opCodes.sort((a,b) => a.localeCompare(b, "pt-BR", {numeric:true, sensitivity:"base"}));

  if (!defaultUA && remote.defaultUA) defaultUA = String(remote.defaultUA);

  saveAll();
  ensureUASelects();
  ensureCodeSelects();
}

async function syncNow(interactive){
  if (syncInProgress){
    syncQueued = true;
    return;
  }
  try{
    await ensureGoogleToken(!!interactive);
  }catch(e){
    if (interactive) alert("Você precisa conectar o Google para sincronizar.");
    return;
  }

  syncInProgress = true;
  setGoogleStatus("Google: sincronizando…");

  try{
    let fileId = localStorage.getItem("driveSyncFileId") || "";
    if (!fileId){
      fileId = await findSyncFileId();
    }
    if (!fileId){
      fileId = await createSyncFile(buildSyncPayload());
      localStorage.setItem("driveSyncFileId", fileId);
      setGoogleStatus("Google: sincronizado ✅");
      try{ lastRemoteModifiedTime = await getRemoteModifiedTime(); }catch(e){}
      return;
    }

    localStorage.setItem("driveSyncFileId", fileId);

    let remoteText = "";
    try{
      remoteText = await downloadSyncFile(fileId);
    }catch(e){
      await uploadSyncFile(fileId, buildSyncPayload());
      setGoogleStatus("Google: sincronizado ✅");
      try{ lastRemoteModifiedTime = await getRemoteModifiedTime(); }catch(e){}
      return;
    }

    let remote = {};
    try{ remote = JSON.parse(remoteText || "{}"); }catch{ remote = {}; }

    mergeRemoteIntoLocal(remote);

    await uploadSyncFile(fileId, buildSyncPayload());
    setGoogleStatus("Google: sincronizado ✅");
    try{ lastRemoteModifiedTime = await getRemoteModifiedTime(); }catch(e){}
  }catch(e){
    setGoogleStatus("Google: erro de sync (salvo local)");
  }finally{
    syncInProgress = false;
  }
}
let runStartMs = null; // cronômetro
let lastStartedAt = null; // string HH:MM

function saveAll(){
  localStorage.setItem("flightReports", JSON.stringify(Array.isArray(entries) ? entries : []));
  localStorage.setItem("uas", JSON.stringify(Array.isArray(uas) ? uas : []));
  localStorage.setItem("defaultUA", String(defaultUA || ""));
}

function pad2(n){ return String(n).padStart(2, "0"); }
function todayISO(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function nowHHMM(){
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function minutesBetween(startMs, endMs){
  const ms = Math.max(0, (endMs - startMs));
  return Math.max(1, Math.ceil(ms / 60000));
}
function normalizeStr(s){
  return String(s || "").trim().replace(/\s+/g, " ");
}
function showMsg(text){
  const el = document.getElementById("runMsg");
  if (!el) return;
  el.style.display = "block";
  el.textContent = text;
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

function showTab(key){
  const tabs = ["new","history","uas"];
  tabs.forEach(k => {
    const el = document.getElementById(`tab-${k}`);
    if (el) el.style.display = (k === key) ? "block" : "none";
  });

  const btns = { new:"tabBtnNew", history:"tabBtnHistory", uas:"tabBtnUAs" };
  Object.entries(btns).forEach(([k, id]) => {
    const b = document.getElementById(id);
    if (!b) return;
    if (k === key) b.classList.add("active");
    else b.classList.remove("active");
  });

  if (key === "history") renderHistory();
  if (key === "new") updateAutoNum();
  if (key === "uas") renderUAs();
}

/* ===== Selects (roleta nativa no celular) ===== */
function fillSelect(id, placeholder, options){
  const sel = document.getElementById(id);
  if (!sel) return;

  const prev = sel.value;
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  sel.appendChild(opt0);

  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = String(o.value);
    opt.textContent = String(o.label);
    sel.appendChild(opt);
  });

  // tenta restaurar valor anterior (se existir na lista)
  if (prev && Array.from(sel.options).some(x => x.value === prev)) sel.value = prev;
  else sel.value = "";
}

function buildPickers(){
  // ciclos 0..400
  const ciclos = [];
  for (let i=0; i<=400; i++) ciclos.push({ value: String(i), label: String(i) });

  // bat 1..6
  const bat = [];
  for (let i=1; i<=6; i++) bat.push({ value: String(i), label: String(i) });

  // carga inicial 100..0 (desc)
  const cIni = [];
  for (let i=100; i>=0; i--) cIni.push({ value: String(i), label: `${i}%` });

  // carga final 0..100 (asc)
  const cFim = [];
  for (let i=0; i<=100; i++) cFim.push({ value: String(i), label: `${i}%` });

  fillSelect("f_ciclos", "", ciclos);
  fillSelect("e_ciclos", "", ciclos);

  fillSelect("f_nbat", "", bat);
  fillSelect("e_nbat", "", bat);

  fillSelect("f_carga_ini", "", cIni);
  fillSelect("e_carga_ini", "", cIni);

  fillSelect("f_carga_fim", "", cFim);
  fillSelect("e_carga_fim", "", cFim);
}

function ensureUASelects(){
  const selectNew = document.getElementById("f_ua");
  const selectEdit = document.getElementById("e_ua");
  const filterUA = document.getElementById("filterUA");

  const build = (sel, placeholder) => {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    sel.appendChild(opt0);

    uas.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      sel.appendChild(opt);
    });

    if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  };

  build(selectNew, "UA (opcional)");
  build(selectEdit, "UA (opcional)");

  if (filterUA){
    const prev = filterUA.value;
    filterUA.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "Todas UAs";
    filterUA.appendChild(optAll);
    uas.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      filterUA.appendChild(opt);
    });
    if (prev && Array.from(filterUA.options).some(o => o.value === prev)) filterUA.value = prev;
  }

  if (selectNew && defaultUA && uas.includes(defaultUA)) selectNew.value = defaultUA;
}

function startFlight(){
  const inicio = document.getElementById("f_inicio");
  const tempo = document.getElementById("f_tempo");

  const hhmm = nowHHMM();
  if (inicio) inicio.value = hhmm;
  if (tempo) tempo.value = "";

  runStartMs = Date.now();
  lastStartedAt = hhmm;

  const btnStart = document.getElementById("btnStart");
  const btnEnd = document.getElementById("btnEnd");
  if (btnStart) btnStart.disabled = true;
  if (btnEnd) btnEnd.disabled = false;

  showMsg(`Voo iniciado às ${hhmm}`);
}

function endFlight(){
  const tempo = document.getElementById("f_tempo");
  const inicio = document.getElementById("f_inicio");

  if (!runStartMs){
    const cur = normalizeStr(inicio?.value);
    if (!cur){
      alert("Toque em INICIAR VOO para preencher o início automaticamente.");
      return;
    }
    alert("Você não iniciou o cronômetro. Vou preencher o tempo como 1 minuto (mínimo).");
    if (tempo) tempo.value = "1";
    return;
  }

  const mins = minutesBetween(runStartMs, Date.now());
  if (tempo) tempo.value = String(mins);

  runStartMs = null;

  const btnStart = document.getElementById("btnStart");
  const btnEnd = document.getElementById("btnEnd");
  if (btnStart) btnStart.disabled = false;
  if (btnEnd) btnEnd.disabled = true;

  const h = normalizeStr(inicio?.value) || (lastStartedAt || "—");
  showMsg(`Voo encerrado - ${mins} min (início ${h})`);
}

function getFieldValue(id){
  const el = document.getElementById(id);
  return el ? el.value : "";
}
function clampPercent(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Math.max(0, Math.min(100, Math.round(n))));
}

function buildEntryFromForm(){
  const selectedDate = normalizeStr(getFieldValue("f_date")) || todayISO();

  const num = normalizeStr(getFieldValue("f_num"));
  const missao = normalizeStr(getFieldValue("f_missao"));
  const voo = normalizeStr(getFieldValue("f_voo"));
  const inicio = normalizeStr(getFieldValue("f_inicio")); // automático
  const tempo = normalizeStr(getFieldValue("f_tempo"));   // automático
  const ua = normalizeStr(getFieldValue("f_ua"));

  const ciclos = normalizeStr(getFieldValue("f_ciclos"));
  const nbat = normalizeStr(getFieldValue("f_nbat"));
  const cargaIni = clampPercent(getFieldValue("f_carga_ini"));
  const cargaFim = clampPercent(getFieldValue("f_carga_fim"));
  const obs = normalizeStr(getFieldValue("f_obs"));

  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    date: selectedDate,
    createdAt: new Date().toISOString(),
    fields: { num, missao, voo, inicio, tempo, ua, ciclos, nbat, cargaIni, cargaFim, obs }
  };
}

function getSelectedDate(){
  return normalizeStr(document.getElementById("f_date")?.value) || todayISO();
}

function nextNumForDate(dateStr){
  let maxNum = 0;
  entries.forEach(e => {
    if (e?.date !== dateStr) return;
    const n = Number(String(e?.fields?.num || "").replace(/[^0-9]/g, ""));
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  });
  return String(maxNum + 1);
}

function updateAutoNum(){
  const dateStr = getSelectedDate();
  const numEl = document.getElementById("f_num");
  if (!numEl) return;
  numEl.value = nextNumForDate(dateStr);
}

function saveEntry(){
  const inicio = normalizeStr(getFieldValue("f_inicio"));
  const tempo = normalizeStr(getFieldValue("f_tempo"));

  if (!inicio){
    alert("Use INICIAR VOO para preencher o início automaticamente.");
    return;
  }
  if (!tempo){
    alert("Use ENCERRAR VOO para preencher o tempo automaticamente.");
    return;
  }
  if (tempo && Number(tempo) < 1){
    alert("Tempo de voo deve ser no mínimo 1 minuto.");
    return;
  }

  if (runStartMs){
    // se salvou sem encerrar, fecha automaticamente
    const mins = minutesBetween(runStartMs, Date.now());
    document.getElementById("f_tempo").value = String(mins);
    runStartMs = null;
    const btnStart = document.getElementById("btnStart");
    const btnEnd = document.getElementById("btnEnd");
    if (btnStart) btnStart.disabled = false;
    if (btnEnd) btnEnd.disabled = true;
  }

  updateAutoNum();

  const entry = buildEntryFromForm();
  entry.fields.num = normalizeStr(document.getElementById("f_num")?.value) || entry.fields.num;

  const ua = entry.fields.ua;
  if (ua && !uas.includes(ua)){
    uas.push(ua);
    if (!defaultUA) defaultUA = ua;
  }

  entries.push(entry);
  saveAll();
  ensureUASelects();
  clearForm();
  showMsg("Registro salvo!");
  syncNow(false);
}

function clearForm(){
  const ids = ["f_missao","f_voo","f_inicio","f_tempo","f_obs"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // selects
  ["f_ciclos","f_nbat","f_carga_ini","f_carga_fim"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const dEl = document.getElementById("f_date");
  if (dEl) dEl.value = todayISO();
  updateAutoNum();

  const uaSel = document.getElementById("f_ua");
  if (uaSel && defaultUA && uas.includes(defaultUA)) uaSel.value = defaultUA;
  else if (uaSel) uaSel.value = "";

  runStartMs = null;
  const btnStart = document.getElementById("btnStart");
  const btnEnd = document.getElementById("btnEnd");
  if (btnStart) btnStart.disabled = false;
  if (btnEnd) btnEnd.disabled = true;
}

function formatForCopy(e){
  const f = e.fields || {};
  const lines = [
    `DATA: ${e.date || "-"}`,
    `Nº: ${f.num || "-"}`,
    `MISSÃO: ${f.missao || "-"}`,
    `VOO: ${f.voo || "-"}`,
    `HORÁRIO - INÍCIO: ${f.inicio || "-"}`,
    `TEMPO DE VOO (MIN): ${f.tempo || "-"}`,
    `UA: ${f.ua || "-"}`,
    `CICLOS: ${f.ciclos || "-"}`,
    `Nº BAT: ${f.nbat || "-"}`,
    `CARGA INICIAL (%): ${f.cargaIni || "-"}`,
    `CARGA FINAL (%): ${f.cargaFim || "-"}`,
    `OBS: ${f.obs || "-"}`
  ];
  return lines.join("\n");
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    alert("Copiado!");
  }catch{
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    alert("Copiado!");
  }
}

function exportTextAll(){
  const list = getFilteredEntries();
  if (!list.length){
    alert("Sem itens para copiar.");
    return;
  }
  const text = list.map(e => formatForCopy(e)).join("\n\n----------------\n\n");
  copyText(text);
}


function exportPdfDay(){
  // Exporta PDF (via impressão do navegador) com TODOS os voos do dia selecionado.
  // Se não houver data no filtro, usa a data de hoje.
  const date = normalizeStr(document.getElementById("filterDate")?.value) || todayISO();

  // Exporta tudo do dia (ignora filtro de UA)
  const list = [...entries]
    .filter(e => e?.date === date)
    .sort((a,b) => String(a.createdAt||"").localeCompare(String(b.createdAt||"")));

  if (!list.length){
    alert("Não há voos para exportar nessa data.");
    return;
  }

  const rows = list.map(e => {
    const f = e.fields || {};
    return `
      <div class="item">
        <div class="cardline"><strong>DATA:</strong> ${e.date || "-"}</div>
        <div class="cardline"><strong>Nº:</strong> ${f.num || "-"}</div>
        <div class="cardline"><strong>MISSÃO:</strong> ${f.missao || "-"}</div>
        <div class="cardline"><strong>VOO:</strong> ${f.voo || "-"}</div>
        <div class="cardline"><strong>INÍCIO:</strong> ${f.inicio || "-"}</div>
        <div class="cardline"><strong>TEMPO (min):</strong> ${f.tempo || "-"}</div>
        <div class="cardline"><strong>UA:</strong> ${f.ua || "-"}</div>
        <div class="cardline"><strong>CICLOS:</strong> ${f.ciclos || "-"}</div>
        <div class="cardline"><strong>Nº BAT:</strong> ${f.nbat || "-"}</div>
        <div class="cardline"><strong>CARGA INI:</strong> ${f.cargaIni || "-"}%</div>
        <div class="cardline"><strong>CARGA FIM:</strong> ${f.cargaFim || "-"}%</div>
        <div class="cardline"><strong>OBS:</strong> ${f.obs || "-"}</div>
      </div>
    `;
  }).join("\n");

  const title = `Relatório de Voo - ${date}`;
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    body{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 20px; color:#111; }
    h1{ font-size: 18px; margin: 0 0 10px 0; }
    .sub{ font-size: 12px; margin-bottom: 16px; color:#333; }
    .item{ padding: 10px 0; border-bottom: 1px solid #ddd; }
    .item:last-child{ border-bottom:none; }
    .cardline{ font-size: 14px; font-weight: 600; margin: 4px 0; }
    .cardline strong{ font-weight: 800; }
    @media print{
      body{ margin: 10mm; }
      .item{ page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="sub">Voos do dia no mesmo formato do histórico.</div>
  ${rows}
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w){
    alert("Não consegui abrir a janela de impressão. Verifique se o navegador bloqueou pop-up.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function getFilteredEntries(){
  const d = normalizeStr(document.getElementById("filterDate")?.value);
  const ua = normalizeStr(document.getElementById("filterUA")?.value);

  const sorted = [...entries].sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  return sorted.filter(e => {
    if (d && e.date !== d) return false;
    if (ua && normalizeStr(e.fields?.ua) !== ua) return false;
    return true;
  });
}

function applyFilters(){ renderHistory(); }

function clearFilters(){
  const fd = document.getElementById("filterDate");
  const fu = document.getElementById("filterUA");
  if (fd) fd.value = "";
  if (fu) fu.value = "";
  renderHistory();
}

function renderHistory(){
  ensureUASelects();
  const ul = document.getElementById("historyList");
  const empty = document.getElementById("emptyHistory");
  if (!ul) return;

  ul.innerHTML = "";
  const list = getFilteredEntries();

  // v31 - resumo do dia (minutos / voos / baterias únicas)
  const dayTotalEl = document.getElementById("dayTotal");
  const filterDate = normalizeStr(document.getElementById("filterDate")?.value);
  const targetDate = filterDate || todayISO();
  const dayList = [...entries].filter(e => e.date === targetDate);
  const totalMin = dayList.reduce((s,e)=> s + (Number(e.fields?.tempo)||0), 0);
  const totalVoos = dayList.length;
  const bats = new Set(dayList.map(e => normalizeStr(e.fields?.nbat)).filter(Boolean));
  const totalBats = bats.size;
  const vooText = `${totalVoos} voo${totalVoos===1?"":"s"}`;
  const batText = `${totalBats} bateria${totalBats===1?"":"s"}`;
  if (dayTotalEl){
    dayTotalEl.style.display = "block";
    dayTotalEl.textContent = `Total voado hoje: ${totalMin}min - ${vooText} - ${batText}`;
  }

  if (!list.length){
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  list.forEach(e => {
    const f = e.fields || {};
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="cardline"><strong>DATA:</strong> ${e.date || "-"}</div>
      <div class="cardline"><strong>Nº:</strong> ${f.num || "-"}</div>
      <div class="cardline"><strong>MISSÃO:</strong> ${f.missao || "-"}</div>
      <div class="cardline"><strong>VOO:</strong> ${f.voo || "-"}</div>
      <div class="cardline"><strong>INÍCIO:</strong> ${f.inicio || "-"}</div>
      <div class="cardline"><strong>TEMPO (min):</strong> ${f.tempo || "-"}</div>
      <div class="cardline"><strong>UA:</strong> ${f.ua || "-"}</div>
      <div class="cardline"><strong>CICLOS:</strong> ${f.ciclos || "-"}</div>
      <div class="cardline"><strong>Nº BAT:</strong> ${f.nbat || "-"}</div>
      <div class="cardline"><strong>CARGA INI:</strong> ${f.cargaIni || "-"}%</div>
      <div class="cardline"><strong>CARGA FIM:</strong> ${f.cargaFim || "-"}%</div>
      <div class="cardline"><strong>OBS:</strong> ${f.obs || "-"}</div>

      <div class="actions">
        <button type="button" class="ghost" onclick="openEditModal('${e.id}')">Editar</button>
        <button type="button" onclick="copyOne('${e.id}')">Copiar</button>
      </div>
    `;
    ul.appendChild(li);
  });
}

function copyOne(id){
  const e = entries.find(x => x.id === id);
  if (!e) return;
  copyText(formatForCopy(e));
}

/* ===== UA ===== */
function renderUAs(){
  ensureUASelects();

  const ul = document.getElementById("uaList");
  if (ul){
    ul.innerHTML = "";
    const list = [...uas];
    if (!list.length){
      const li = document.createElement("li");
      li.textContent = "Nenhuma UA cadastrada ainda.";
      ul.appendChild(li);
    }else{
      list.forEach((u, i) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="cardline">${u}${(defaultUA && u === defaultUA) ? ' <strong>(padrão)</strong>' : ''}</div>
          <div class="actions">
            <button class="ghost" type="button" onclick="makeDefaultUA('${u}')">Definir padrão</button>
            <button type="button" onclick="deleteUA(${i})">Excluir</button>
          </div>
        `;
        ul.appendChild(li);
      });
    }
  }

  const v = document.getElementById("appVersion");
  if (v) v.textContent = APP_VERSION;

  const vh = document.getElementById("versionHistory");
  if (vh){
    vh.innerHTML = "";
    VERSION_HISTORY.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      vh.appendChild(li);
    });
  }
}

function addUA(){
  const input = document.getElementById("uaNew");
  const v = normalizeStr(input?.value);
  if (!v){
    alert("Digite uma UA.");
    return;
  }
  if (!uas.includes(v)) uas.push(v);
  if (!defaultUA) defaultUA = v;
  if (input) input.value = "";
  saveAll();
  ensureUASelects();
  renderUAs();
  showMsg("UA adicionada!");
}

function setDefaultUA(){
  const sel = document.getElementById("f_ua");
  const v = normalizeStr(sel?.value);
  if (!v){
    alert("Selecione uma UA no formulário (aba Novo) para definir como padrão.");
    return;
  }
  defaultUA = v;
  saveAll();
  ensureUASelects();
  renderUAs();
}

function makeDefaultUA(v){
  defaultUA = normalizeStr(v);
  saveAll();
  ensureUASelects();
  renderUAs();
}

function deleteUA(i){
  const u = uas[i];
  if (!confirm(`Excluir a UA "${u}"?`)) return;
  uas.splice(i, 1);
  if (defaultUA === u) defaultUA = "";
  saveAll();
  ensureUASelects();
  renderUAs();
}

/* ===== Modal Edit ===== */
let editId = null;

function openEditModal(id){
  const e = entries.find(x => x.id === id);
  if (!e) return;

  editId = id;
  ensureUASelects();
  buildPickers();

  const f = e.fields || {};
  document.getElementById("modalSub").textContent =
    `Data: ${e.date || "-"} | Criado: ${(e.createdAt || "").slice(0,16).replace('T',' ')}`;

  document.getElementById("e_num").value = f.num || "";
  document.getElementById("e_missao").value = f.missao || "";
  document.getElementById("e_voo").value = f.voo || "";
  document.getElementById("e_inicio").value = f.inicio || "";
  document.getElementById("e_tempo").value = f.tempo || "";
  document.getElementById("e_ua").value = f.ua || "";

  document.getElementById("e_ciclos").value = f.ciclos || "";
  document.getElementById("e_nbat").value = f.nbat || "";
  document.getElementById("e_carga_ini").value = (f.cargaIni ?? "") === "" ? "" : String(f.cargaIni);
  document.getElementById("e_carga_fim").value = (f.cargaFim ?? "") === "" ? "" : String(f.cargaFim);
  document.getElementById("e_obs").value = f.obs || "";

  const ov = document.getElementById("modalOverlay");
  if (ov) ov.style.display = "flex";
}

function closeModal(){
  const ov = document.getElementById("modalOverlay");
  if (ov) ov.style.display = "none";
  editId = null;
}

function saveEdit(){
  if (!editId) return;
  const idx = entries.findIndex(x => x.id === editId);
  if (idx < 0) return;

  const e = entries[idx];
  const nf = {
    num: normalizeStr(document.getElementById("e_num").value),
    missao: normalizeStr(document.getElementById("e_missao").value),
    voo: normalizeStr(document.getElementById("e_voo").value),
    inicio: normalizeStr(document.getElementById("e_inicio").value),
    tempo: normalizeStr(document.getElementById("e_tempo").value),
    ua: normalizeStr(document.getElementById("e_ua").value),
    ciclos: normalizeStr(document.getElementById("e_ciclos").value),
    nbat: normalizeStr(document.getElementById("e_nbat").value),
    cargaIni: clampPercent(document.getElementById("e_carga_ini").value),
    cargaFim: clampPercent(document.getElementById("e_carga_fim").value),
    obs: normalizeStr(document.getElementById("e_obs").value),
  };

  e.fields = nf;
  entries[idx] = e;

  if (nf.ua && !uas.includes(nf.ua)) uas.push(nf.ua);

  saveAll();
  ensureUASelects();
  closeModal();
  renderHistory();
  showMsg("Registro atualizado!");
  syncNow(false);
}

function deleteEdit(){
  if (!editId) return;
  const idx = entries.findIndex(x => x.id === editId);
  if (idx < 0) return;
  if (!confirm("Excluir este registro?")) return;

  entries.splice(idx, 1);
  saveAll();
  closeModal();
  renderHistory();
  showMsg("Registro excluído.");
  syncNow(false);
}

/* ===== PWA: registrar SW ===== */
(function init(){
  initGoogleAuth();
  startAutoSyncWatcher();

  ensureUASelects();
  buildPickers();

  const dEl = document.getElementById("f_date");
  if (dEl){
    dEl.value = todayISO();
    dEl.addEventListener("change", () => updateAutoNum());
  }
  updateAutoNum();
  renderHistory();
  renderUAs();

  const btnEnd = document.getElementById("btnEnd");
  if (btnEnd) btnEnd.disabled = true;

  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
})();


// v31 - recolher/mostrar lista de códigos (aba UA)
function toggleCodeList(){
  const list = document.getElementById("codeList");
  const btn = document.getElementById("btnToggleCodes");
  if (!list) return;
  const isHidden = (list.style.display === "none");
  list.style.display = isHidden ? "" : "none";
  if (btn) btn.textContent = isHidden ? "Recolher lista" : "Mostrar lista";
}


// v31 - auto sync watcher (modo operação profissional)
// - 3s quando o app está visível
// - 12s quando está em segundo plano
// - sync imediato ao voltar (focus/visibility)
let autoSyncTimer = null;
let lastRemoteModifiedTime = "";
let autoSyncIntervalMs = 8000;
let autoSyncFailCount = 0;

function computeAutoSyncInterval(){
  const hidden = document.hidden;
  autoSyncIntervalMs = hidden ? 12000 : 3000;
  if (autoSyncFailCount >= 3) autoSyncIntervalMs = Math.max(autoSyncIntervalMs, 15000);
}

async function getRemoteModifiedTime(){
  if(!googleAccessToken) return "";
  const fileId = localStorage.getItem("driveSyncFileId") || "";
  if(!fileId) return "";
  try{
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=modifiedTime`);
    if(!res.ok) return "";
    const data = await res.json();
    return String(data.modifiedTime || "");
  }catch(e){ return ""; }
}

async function autoSyncTick(){
  if(syncInProgress) return;
  if(!googleAccessToken) return;
  try{
    const mt = await getRemoteModifiedTime();
    if(!mt) return;
    if(!lastRemoteModifiedTime){ lastRemoteModifiedTime = mt; return; }
    if(mt !== lastRemoteModifiedTime){
      lastRemoteModifiedTime = mt;
      await syncNow(false);
      try{ applyFilters(); }catch(e){}
    }
    autoSyncFailCount = 0;
  }catch(e){
    autoSyncFailCount++;
  }finally{
    restartAutoSyncTimer();
  }
}

function restartAutoSyncTimer(){
  computeAutoSyncInterval();
  if(autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(autoSyncTick, autoSyncIntervalMs);
}

function startAutoSyncWatcher(){
  if(!window.__autoSyncListenersInstalled){
    window.__autoSyncListenersInstalled = true;

    document.addEventListener("visibilitychange", () => {
      restartAutoSyncTimer();
      if(!document.hidden) setTimeout(autoSyncTick, 250);
    });

    window.addEventListener("focus", () => {
      restartAutoSyncTimer();
      setTimeout(autoSyncTick, 250);
    });

    window.addEventListener("online", () => {
      restartAutoSyncTimer();
      setTimeout(autoSyncTick, 250);
    });
  }
  restartAutoSyncTimer();
}
