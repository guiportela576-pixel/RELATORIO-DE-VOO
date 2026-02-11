// Relatório de Voo (PWA) - armazenamento local
const APP_VERSION = "1.0.0";
const VERSION_HISTORY = [
  "1.0.0 - App inicial (novo + histórico + UA + cronômetro)"
];

let entries = JSON.parse(localStorage.getItem("flightReports")) || [];
let uas = JSON.parse(localStorage.getItem("uas")) || [];
let defaultUA = localStorage.getItem("defaultUA") || "";

let runStartMs = null; // cronômetro
let lastStartedAt = null; // string HH:MM

function saveAll(){
  localStorage.setItem("flightReports", JSON.stringify(Array.isArray(entries) ? entries : []));
  localStorage.setItem("uas", JSON.stringify(Array.isArray(uas) ? uas : []));
  localStorage.setItem("defaultUA", String(defaultUA || ""));
}

function pad2(n){ return String(n).padStart(2, "0"); }
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
  if (key === "uas") renderUAs();
}

function ensureUASelects(){
  const selectNew = document.getElementById("f_ua");
  const selectEdit = document.getElementById("e_ua");
  const filterUA = document.getElementById("filterUA");

  const build = (sel, placeholder) => {
    if (!sel) return;
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
  };

  build(selectNew, "UA (opcional)");
  build(selectEdit, "UA (opcional)");

  if (filterUA){
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
  }

  if (selectNew && defaultUA && uas.includes(defaultUA)) selectNew.value = defaultUA;
}

function startFlight(){
  const inicio = document.getElementById("f_inicio");
  const hhmm = nowHHMM();
  if (inicio) inicio.value = hhmm;

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
  showMsg(`Voo encerrado</div><div class="cardline">${mins} min`);
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
  const today = new Date().toISOString().slice(0,10);

  const num = normalizeStr(getFieldValue("f_num"));
  const missao = normalizeStr(getFieldValue("f_missao"));
  const voo = normalizeStr(getFieldValue("f_voo"));
  const inicio = normalizeStr(getFieldValue("f_inicio"));
  const tempo = normalizeStr(getFieldValue("f_tempo"));
  const ua = normalizeStr(getFieldValue("f_ua"));

  const pousos = normalizeStr(getFieldValue("f_pousos"));
  const ciclos = normalizeStr(getFieldValue("f_ciclos"));
  const nbat = normalizeStr(getFieldValue("f_nbat"));
  const cargaIni = clampPercent(getFieldValue("f_carga_ini"));
  const cargaFim = clampPercent(getFieldValue("f_carga_fim"));
  const obs = normalizeStr(getFieldValue("f_obs"));

  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    date: today,
    createdAt: new Date().toISOString(),
    fields: { num, missao, voo, inicio, tempo, ua, pousos, ciclos, nbat, cargaIni, cargaFim, obs }
  };
}

function saveEntry(){
  const tempo = normalizeStr(getFieldValue("f_tempo"));
  if (tempo && Number(tempo) < 1){
    alert("Tempo de voo deve ser no mínimo 1 minuto.");
    return;
  }

  if (runStartMs){
    const mins = minutesBetween(runStartMs, Date.now());
    document.getElementById("f_tempo").value = String(mins);
    runStartMs = null;
    const btnStart = document.getElementById("btnStart");
    const btnEnd = document.getElementById("btnEnd");
    if (btnStart) btnStart.disabled = false;
    if (btnEnd) btnEnd.disabled = true;
  }

  const entry = buildEntryFromForm();

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
}

function clearForm(){
  const ids = ["f_num","f_missao","f_voo","f_inicio","f_tempo","f_pousos","f_ciclos","f_nbat","f_carga_ini","f_carga_fim","f_obs"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

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
    `POUSOS: ${f.pousos || "-"}`,
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
      <div class="cardline"><strong>Nº:</strong> ${f.num || "-"}</div><div class="cardline"><strong>MISSÃO:</strong> ${f.missao || "-"}</div><div class="cardline"><strong>VOO:</strong> ${f.voo || "-"}</div>
      <div class="cardline"><strong>INÍCIO:</strong> ${f.inicio || "-"}</div><div class="cardline"><strong>TEMPO (min):</strong> ${f.tempo || "-"}</div>
      <div class="cardline"><strong>UA:</strong> ${f.ua || "-"}</div><div class="cardline"><strong>POUSOS:</strong> ${f.pousos || "-"}</div><div class="cardline"><strong>CICLOS:</strong> ${f.ciclos || "-"}</div>
      <div class="cardline"><strong>Nº BAT:</strong> ${f.nbat || "-"}</div><div class="cardline"><strong>CARGA INI:</strong> ${f.cargaIni || "-"}%</div><div class="cardline"><strong>CARGA FIM:</strong> ${f.cargaFim || "-"}%</div>
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

  const f = e.fields || {};
  document.getElementById("modalSub").textContent = `Data: ${e.date || "-"}</div><div class="cardline">Criado: ${(e.createdAt || "").slice(0,16).replace('T',' ')}`;

  document.getElementById("e_num").value = f.num || "";
  document.getElementById("e_missao").value = f.missao || "";
  document.getElementById("e_voo").value = f.voo || "";
  document.getElementById("e_inicio").value = f.inicio || "";
  document.getElementById("e_tempo").value = f.tempo || "";
  document.getElementById("e_ua").value = f.ua || "";
  document.getElementById("e_pousos").value = f.pousos || "";
  document.getElementById("e_ciclos").value = f.ciclos || "";
  document.getElementById("e_nbat").value = f.nbat || "";
  document.getElementById("e_carga_ini").value = f.cargaIni || "";
  document.getElementById("e_carga_fim").value = f.cargaFim || "";
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
    pousos: normalizeStr(document.getElementById("e_pousos").value),
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
}

/* ===== PWA: registrar SW ===== */
(function init(){
  ensureUASelects();
  renderHistory();
  renderUAs();

  const btnEnd = document.getElementById("btnEnd");
  if (btnEnd) btnEnd.disabled = true;

  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
})();
