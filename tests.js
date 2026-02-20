// Testes simples (opcional). Abra o console e rode RV_TESTS.run()
window.RV_TESTS = {
  run(){
    const ok = (name, cond) => console.log((cond ? "✅" : "❌") + " " + name);
    ok("RV_UTILS existe", !!window.RV_UTILS);
    ok("RV_IDB existe", !!window.RV_IDB);
  }
};
