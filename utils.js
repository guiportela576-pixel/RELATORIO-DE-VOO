// Utils extras (mantém compatibilidade com app atual)
window.RV_UTILS = {
  safeJsonParse(str, fallback){
    try { return JSON.parse(str); } catch { return fallback; }
  }
};
