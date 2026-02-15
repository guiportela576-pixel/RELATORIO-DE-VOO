// Relatório de Voo (PWA) - armazenamento local
const APP_VERSION = "1.1.4";
const VERSION_HISTORY = [
  "1.2.3 - Códigos de operação pré-carregados (não sobrescreve dados existentes)",
  "1.2.2 - Correção: botões/tabs voltaram a funcionar (erro JS) + VOO decimal no teclado",
  "1.2.0 - Códigos de operação + total de minutos do dia + export PDF corrigido (Android/iOS) + teclado numérico (Voo/Cargas)",
  "1.1.0 - Campos automáticos (início/tempo) + seletores (bat/ciclos/carga) + remoção de pousos + novo ícone",
  "1.0.0 - App inicial (novo + histórico + UA + cronômetro)"
];

// URL do Apps Script (Planilha) para sincronização
const SYNC_URL = "https://script.google.com/macros/s/AKfycbzvavI93pQGiyX5hWhOSdPfHgQcIQxLJQXrjkht4gw0ax_6ZtPn1NUsNs24pIcE9i32/exec";


let entries = JSON.parse(localStorage.getItem("flightReports")) || [];
let uas = JSON.parse(localStorage.getItem("uas")) || [];
let defaultUA = localStorage.getItem("defaultUA") || "";
let opCodes = JSON.parse(localStorage.getItem("opCodes")) || [];
let codesCollapsed = localStorage.getItem("codesCollapsed") === "1";

const DEFAULT_OP_CODES = [
  "1 - PLANEJAMENTO OPERACIONAL",
  "2 - INTELIGÊNCIA",
  "3 - MONITORAMENTO DE MANIFESTAÇÕES",
  "4 - POLICIAMENTO EM EVENTOS",
  "5 - APOIO E OPERAÇÕES EM ÁREAS DE RISCO",
  "6 - OPERAÇÃO DE REINTEGRAÇÃO DE POSSE",
  "7 - APOIO EM BLOQUEIOS",
  "8 - TRÂNSITO EM RODOVIAS",
  "9 - TRÂNSITO DE ÁREA URBANA",
  "10 - PATRULHAMENTO AQUÁTICO",
  "11 - FISCALIZAÇÃO AMBIENTAL",
  "12 - FISCALIZAÇÃO DE FAUNA",
  "13 - FISCALIZAÇÃO DE FLORA",
  "14 - FISCALIZAÇÃO DE PESCA",
  "15 - AVALIAÇÃO DE RISCO",
  "16 - AVALIAÇÃO DE OBRA OU CONSTRUÇÃO",
  "17 - VÍDEOS INSTITUCIONAIS",
  "18 - SOLENIDADE",
  "19 - DEMOSTRAÇÃO",
  "20 - INSTRUÇÃO / TREINAMENTO",
  "21 - VOO DE MANUTENÇÃO",
  "22 - DISTÚRBIOS CIVIS",
  "23 - REBELIÃO / FUGA DE PRESOS",
  "24 - OCORRÊNCIA DE CAIXA ELETRONICO /",
  "25 - OCORRÊNCIA COM REFÉM",
  "26 - OCORRENCIA COM ARTEFATO EXPLOSIVO",
  "27 - INCÊNDIO EM EDIFICAÇÃO",
  "28 - INCÊNDIO EM MATA",
  "29 - ACIDENTE DE TRÂNSITO",
  "30 - ACIDENTE / DESASTRES",
  "31 - BUSCA A INDIVIDUO(S) HOMIZIADO(S)",
  "32 - BUSCA",
  "33 - BREC (Busca e Resgate em Estruturas Colapsada)",
  "34 - PESQUISA",
  "35 - SALVAMENTO AQUÁTICO",
  "36 - VIDEOPATRULHAMENTO",
  "37 - APOIO AO POLICIAMENTO URBANO"
];

// Pré-carrega códigos apenas se ainda não houver nenhum salvo (não sobrescreve)
if (!Array.isArray(opCodes) || opCodes.length === 0){
  opCodes = [...DEFAULT_OP_CODES];
  localStorage.setItem("opCodes", JSON.stringify(opCodes));
}

let runStartMs = null; // cronômetro
let lastStartedAt = null; // string HH:MM

function saveAll(){
  localStorage.setItem("flightReports", JSON.stringify(Array.isArray(entries) ? entries : []));
  localStorage.setItem("uas", JSON.stringify(Array.isArray(uas) ? uas : []));
  localStorage.setItem("defaultUA", String(defaultUA || ""));
  localStorage.setItem("opCodes", JSON.stringify(Array.isArray(opCodes) ? opCodes : []));
}

function pad2(n){ return String(n).padStart(2, "0"); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
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

// Permite decimal com ponto (aceita vírgula e converte)
function normalizeDecimalDots(s){
  return normalizeStr(s).replace(/,/g, '.').replace(/[^0-9.]/g, '');
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
  if (key === "new") { ensureCodeSelects(); updateAutoNum(); }
  if (key === "uas") renderUAs();
}

/* ===== Selects (roleta nativa no celular) ===== */
function fillSelect(id, placeholder, options){
  const sel = document.getElementById(id);
  if (!sel) return;
  if (String(sel.tagName||"").toUpperCase() !== "SELECT") return;
  if (String(sel.tagName || "").toUpperCase() !== "SELECT") return; // não mexe em inputs

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

function ensureCodeSelects(){
  const elNew = document.getElementById("f_codigo"); // agora é input readonly
  const selEdit = document.getElementById("e_codigo"); // mantém select no modal de edição

  // atualiza input (novo)
  if (elNew){
    const cur = normalizeStr(elNew.value);
    const list = (Array.isArray(opCodes) ? opCodes : []).map(c => normalizeStr(c)).filter(Boolean);

    // se o valor atual não existe mais, limpa
    if (cur && !list.includes(cur)) elNew.value = "";

    // placeholder simples
    if (!elNew.value) elNew.placeholder = "Toque para selecionar";
  }

  const buildSelect = (sel, placeholder) => {
    if (!sel) return;
    if (String(sel.tagName || "").toUpperCase() !== "SELECT") return;
    const prev = sel.value;
    sel.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    sel.appendChild(opt0);

    (Array.isArray(opCodes) ? opCodes : []).forEach(c => {
      const code = normalizeStr(c);
      if (!code) return;
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      sel.appendChild(opt);
    });

    if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  };

  buildSelect(selEdit, "Código (opcional)");
}


/* ===== Code Picker (Tela cheia) ===== */
let codePickerOpen = false;

function renderCodePicker(){
  const ul = document.getElementById("codePickerList");
  if (!ul) return;
  ul.innerHTML = "";

  const list = (Array.isArray(opCodes) ? opCodes : []).map(c => normalizeStr(c)).filter(Boolean);
  if (!list.length){
    const li = document.createElement("li");
    li.textContent = "Nenhum código cadastrado ainda (cadastre na aba UA).";
    ul.appendChild(li);
    return;
  }

  list.forEach(code => {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="picker-item" onclick="selectCode('${code.replace(/'/g, "\'")}')">${code}</button>`;
    ul.appendChild(li);
  });
}

function openCodePicker(){
  const modal = document.getElementById("codePickerModal");
  if (!modal) return;
  codePickerOpen = true;
  renderCodePicker();
  modal.style.display = "flex";
}

function closeCodePicker(){
  const modal = document.getElementById("codePickerModal");
  if (!modal) return;
  codePickerOpen = false;
  modal.style.display = "none";
}

function codePickerBackdrop(ev){
  // fecha ao tocar no fundo
  if (!ev) return;
  const modal = document.getElementById("codePickerModal");
  if (!modal) return;
  if (ev.target === modal) closeCodePicker();
}

function selectCode(code){
  const input = document.getElementById("f_codigo");
  if (input) input.value = normalizeStr(code);
  closeCodePicker();
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

  // Força separador decimal com ponto no campo VOO (aceita também vírgula e converte)
  function bindDotDecimal(id){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      let v = String(el.value || "");
      v = v.replace(/,/g, ".");
      v = v.replace(/[^0-9.]/g, "");
      const parts = v.split(".");
      if (parts.length > 2){
        v = parts[0] + "." + parts.slice(1).join("");
      }
      el.value = v;
    });
  }
  bindDotDecimal("f_voo");
  bindDotDecimal("e_voo");

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
  const codigo = normalizeStr(getFieldValue("f_codigo"));
  const voo = normalizeDecimalDots(getFieldValue("f_voo"));
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
    fields: { num, missao, codigo, voo, inicio, tempo, ua, ciclos, nbat, cargaIni, cargaFim, obs }
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
}

function clearForm(){
  const ids = ["f_missao","f_codigo","f_voo","f_inicio","f_tempo","f_obs"];
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
    `CÓDIGO: ${f.codigo || "-"}`,
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
        <div class="cardline"><strong>CÓDIGO:</strong> ${f.codigo || "-"}</div>
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

  openPdfPreview(html, title);
}

function openPdfPreview(html, title){
  const overlay = document.getElementById("pdfOverlay");
  const frame = document.getElementById("pdfFrame");
  const t = document.getElementById("pdfTitle");
  if (!overlay || !frame) {
    // fallback (caso o HTML não tenha o modal)
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
    return;
  }

  if (t) t.textContent = title || "Prévia";
  // srcdoc funciona bem em iOS/Android e mantém o app aberto com botão de fechar
  frame.srcdoc = html;
  overlay.style.display = "flex";
}

function closePdfPreview(){
  const overlay = document.getElementById("pdfOverlay");
  const frame = document.getElementById("pdfFrame");
  if (frame) frame.srcdoc = "";
  if (overlay) overlay.style.display = "none";
}

function printPdfPreview(){
  const frame = document.getElementById("pdfFrame");
  if (!frame) return;
  try{
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }catch(e){
    alert("Não consegui abrir a impressão aqui. Tente novamente.");
  }
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

  // total do dia (minutos + baterias únicas)
  const dayTotalEl = document.getElementById("dayTotal");
  if (dayTotalEl){
    const day = normalizeStr(document.getElementById("filterDate")?.value) || todayISO();

    const listDay = entries.filter(e => e?.date === day);

    const totalMin = listDay.reduce((acc, e) => acc + (Number(e?.fields?.tempo) || 0), 0);

    const batSet = new Set();
    listDay.forEach(e => {
      const b = normalizeStr(e?.fields?.nbat);
      if (b) batSet.add(b);
    });
    const batCount = batSet.size;

    const batText = (batCount === 1) ? "1 bateria" : `${batCount} baterias`;
    const flights = listDay.length;
const vooText = (flights === 1) ? "1 voo" : `${flights} voos`;
const label = (day === todayISO()) ? "Total voado hoje" : `Total voado em ${day}`;
dayTotalEl.textContent = `${label}: ${totalMin}min - ${vooText} - ${batText}`;
    dayTotalEl.style.display = "block";
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
      <div class="cardline"><strong>CÓDIGO:</strong> ${f.codigo || "-"}</div>
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
        <button type="button" class="danger" onclick="deleteOne('${e.id}')">Excluir</button>
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

function deleteOne(id){
  const i = entries.findIndex(x => x.id === id);
  if (i < 0) return;
  if (!confirm("Excluir este voo do histórico?")) return;

  entries.splice(i, 1);
  saveAll();
  renderHistory();
  showMsg("Voo excluído!");

  // dica rápida para sincronização
  setSyncStatus("Voo excluído localmente. Clique em 'Enviar para planilha' para sincronizar.");
}



/* ===== UA ===== */
function renderUAs(){
  ensureUASelects();
  ensureCodeSelects();

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
    renderCodes();

    VERSION_HISTORY.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      vh.appendChild(li);
    });
  }
}



/* ===== SINCRONIZAÇÃO (PLANILHA) ===== */
function setSyncStatus(msg){
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = msg || "";
}

function getAppState(){
  return {
    entries: Array.isArray(entries) ? entries : [],
    uas: Array.isArray(uas) ? uas : [],
    defaultUA: String(defaultUA || ""),
    opCodes: Array.isArray(opCodes) ? opCodes : []
  };
}

function applyAppState(state){
  if (!state || typeof state !== "object") return;
  entries = Array.isArray(state.entries) ? state.entries : [];
  uas = Array.isArray(state.uas) ? state.uas : [];
  defaultUA = String(state.defaultUA || "");
  opCodes = Array.isArray(state.opCodes) ? state.opCodes : [];
  saveAll();
  ensureUASelects();
  ensureCodeSelects();
  updateAutoNum();
  renderHistory();
  renderUAs();
}


/* ===== SINCRONIZAÇÃO (PLANILHA) — sem CORS =====
   - Pull: JSONP (script tag) => precisa do Apps Script retornar callback(...)
   - Push: sendBeacon (não precisa ler resposta)
*/

function syncExtractStateFromResponse(resp){
  if (!resp || !resp.ok) return null;

  // Formato novo: { ok:true, payload:{...} }
  if (resp.payload && typeof resp.payload === "object") return resp.payload;

  // Formato alternativo: { ok:true, data:[[...],[...]] } (linhas da planilha)
  if (Array.isArray(resp.data)){
    // Procura de trás pra frente uma coluna 2 que pareça JSON do estado
    for (let i = resp.data.length - 1; i >= 0; i--){
      const row = resp.data[i];
      if (!row || row.length < 2) continue;
      const cell = row[1];
      if (typeof cell !== "string") continue;
      const s = cell.trim();
      if (!s) continue;
      // ignora cabeçalho comum
      const upper = s.toUpperCase();
      if (upper === "PAYLOAD" || upper === "DADOS" || upper === "DATA") continue;

      try{
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === "object") return parsed;
      }catch(e){}
    }
  }

  return null;
}

function syncPullViaJSONP(timeoutMs = 20000){
  return new Promise((resolve, reject) => {
    const cbName = "__droneLogSyncCb_" + Math.random().toString(36).slice(2);
    const url = SYNC_URL + "?callback=" + encodeURIComponent(cbName) + "&_=" + Date.now();

    const s = document.createElement("script");
    let done = false;

    const cleanup = () => {
      if (s && s.parentNode) s.parentNode.removeChild(s);
      try{ delete window[cbName]; }catch(e){ window[cbName] = undefined; }
    };

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Timeout ao puxar da planilha."));
    }, timeoutMs);

    window[cbName] = (resp) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      cleanup();
      // resp pode vir em formatos diferentes (payload ou data)
      const extracted = syncExtractStateFromResponse(resp);
      resolve(extracted);
};

    s.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      cleanup();
      reject(new Error("Falha ao carregar JSONP."));
    };

    s.src = url;
    document.head.appendChild(s);
  });
}

function syncPushViaBeacon(){
  return new Promise((resolve) => {
    const dataStr = JSON.stringify(getAppState());
    // sendBeacon: melhor para cross-domain sem CORS (não lê resposta)
    if (navigator && typeof navigator.sendBeacon === "function"){
      const blob = new Blob([dataStr], { type: "text/plain;charset=UTF-8" });
      const ok = navigator.sendBeacon(SYNC_URL, blob);
      resolve(!!ok);
      return;
    }

    // Fallback: fetch no-cors (não dá pra ler resposta, mas envia)
    fetch(SYNC_URL, { method:"POST", mode:"no-cors", body:dataStr })
      .then(() => resolve(true))
      .catch(() => resolve(false));
  });
}
async function syncPull(){
  try{
    setSyncStatus("Atualizando da planilha...");
    const payload = await syncPullViaJSONP();
    if (!payload){
      setSyncStatus("Planilha vazia (sem dados ainda).");
      return;
    }
    applyAppState(payload);
    setSyncStatus("Dados atualizados da planilha ✅");
    showMsg("Sincronizado!");
  }catch(err){
    console.error(err);
    setSyncStatus("Erro ao atualizar: " + (err && err.message ? err.message : "falha desconhecida") + ".");
    showMsg("Falha ao sincronizar.");
  }
}

async function syncPush(){
  try{
    setSyncStatus("Enviando para a planilha...");
    const ok = await syncPushViaBeacon();
    if (!ok) throw new Error("Falha ao enviar (beacon).");
    setSyncStatus("Enviado para a planilha ✅");
    showMsg("Enviado!");
  }catch(err){
    console.error(err);
    setSyncStatus("Erro ao enviar: " + (err && err.message ? err.message : "falha desconhecida") + ".");
    showMsg("Falha ao enviar.");
  }
}

/* ===== RECOLHER LISTA DE CÓDIGOS ===== */
function syncCodesToggleUI(){
  const ul = document.getElementById("codeList");
  const btn = document.getElementById("btnToggleCodes");
  if (!ul || !btn) return;
  if (codesCollapsed){
    ul.style.display = "none";
    btn.textContent = "Mostrar códigos";
  }else{
    ul.style.display = "block";
    btn.textContent = "Recolher códigos";
  }
}
function toggleCodes(){
  codesCollapsed = !codesCollapsed;
  localStorage.setItem("codesCollapsed", codesCollapsed ? "1" : "0");
  syncCodesToggleUI();
}

/* ===== CÓDIGOS DE OPERAÇÃO ===== */
function renderCodes(){
  const ul = document.getElementById("codeList");
  if (!ul) return;
  ul.innerHTML = "";

  const list = [...opCodes];
  if (!list.length){
    const li = document.createElement("li");
    li.textContent = "Nenhum código cadastrado ainda.";
    ul.appendChild(li);
    return;
  }

  list.forEach((c, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="cardline">${c}</div>
      <div class="actions">
        <button type="button" class="ghost" onclick="editCode(${i})">Editar</button>
        <button type="button" onclick="deleteCode(${i})">Excluir</button>
      </div>
    `;
    ul.appendChild(li);
  });
  syncCodesToggleUI();
}

function addCode(){
  const input = document.getElementById("codeNew");
  const val = normalizeStr(input?.value);
  if (!val) return;
  if (!opCodes.includes(val)) opCodes.push(val);
  opCodes.sort((a,b) => a.localeCompare(b, "pt-BR", {numeric:true, sensitivity:"base"}));
  if (input) input.value = "";
  saveAll();
  ensureCodeSelects();
  renderCodes();
  showMsg("Código cadastrado!");
}

function editCode(i){
  const cur = normalizeStr(opCodes?.[i]);
  if (!cur){ alert("Código inválido."); return; }
  const nv = normalizeStr(prompt("Editar código:", cur));
  if (!nv) return;
  if (nv !== cur && opCodes.includes(nv)){
    alert("Esse código já existe.");
    return;
  }
  opCodes[i] = nv;
  saveAll();
  ensureCodeSelects();
  renderCodes();
  showMsg("Código atualizado!");
}

function deleteCode(i){
  if (!Number.isFinite(i) || i < 0 || i >= opCodes.length) return;
  if (!confirm("Excluir este código?")) return;
  opCodes.splice(i,1);
  saveAll();
  ensureCodeSelects();
  renderCodes();
  showMsg("Código excluído!");
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
    ensureCodeSelects();
    const ec = document.getElementById("e_codigo");
    if (ec) ec.value = f.codigo || "";
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
    codigo: normalizeStr(document.getElementById("e_codigo")?.value),
    voo: normalizeDecimalDots(document.getElementById("e_voo").value),
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
  ensureCodeSelects();
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

  // Força separador decimal com ponto no campo VOO (aceita também vírgula e converte)
  function bindDotDecimal(id){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = String(el.value || '');
      // troca vírgula por ponto e remove caracteres não permitidos
      let out = v.replace(/,/g, '.').replace(/[^0-9.]/g, '');
      // evita mais de um ponto
      const parts = out.split('.');
      if (parts.length > 2){
        out = parts[0] + '.' + parts.slice(1).join('');
      }
      if (out !== v) el.value = out;
    });
  }
  bindDotDecimal('f_voo');
  bindDotDecimal('e_voo');

  // Força separador decimal com ponto no campo VOO (aceita também vírgula e converte)
  function bindDotDecimal(id){
    const el = document.getElementById(id);
    if (!el) return;
    const fix = () => {
      let v = String(el.value || '');
      v = v.replace(/,/g, '.');
      v = v.replace(/[^0-9.]/g, '');
      // evita mais de um ponto
      const parts = v.split('.');
      if (parts.length > 2){
        v = parts[0] + '.' + parts.slice(1).join('');
      }
      el.value = v;
    };
    el.addEventListener('input', fix);
    el.addEventListener('blur', fix);
  }
  bindDotDecimal('f_voo');
  bindDotDecimal('e_voo');

  // Força separador decimal com ponto no campo VOO (aceita também vírgula e converte)
  function bindDotDecimal(id){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = String(el.value || '');
      // mantém só dígitos e separadores, troca vírgula por ponto
      let out = v.replace(/,/g, '.').replace(/[^0-9.]/g, '');
      // evita múltiplos pontos
      const parts = out.split('.');
      if (parts.length > 2){
        out = parts[0] + '.' + parts.slice(1).join('');
      }
      if (out !== v) el.value = out;
    });
  }
  bindDotDecimal('f_voo');
  bindDotDecimal('e_voo');


  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
})();
