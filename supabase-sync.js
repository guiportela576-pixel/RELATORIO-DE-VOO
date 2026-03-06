(function(){
  function normalizeStr(s){
    return String(s || "").trim().replace(/\s+/g, " ");
  }

  function isConfigured(){
    return !!(window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
  }

  function getClient(){
    if (!isConfigured()) return null;
    if (!window.__rvSupabaseClient){
      window.__rvSupabaseClient = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          }
        }
      );
    }
    return window.__rvSupabaseClient;
  }

  function rowFromEntry(entry){
    const f = (entry && entry.fields) || {};
    return {
      id: String(entry.id || ""),
      flight_date: normalizeStr(entry.date),
      num: normalizeStr(f.num),
      nome: normalizeStr(f.nome),
      missao: normalizeStr(f.missao),
      codigo: normalizeStr(f.codigo),
      voo: normalizeStr(f.voo),
      inicio: normalizeStr(f.inicio),
      tempo: normalizeStr(f.tempo),
      ua: normalizeStr(f.ua),
      ciclos: normalizeStr(f.ciclos),
      nbat: normalizeStr(f.nbat),
      carga_ini: normalizeStr(f.cargaIni),
      carga_fim: normalizeStr(f.cargaFim),
      obs: normalizeStr(f.obs),
      deleted: !!entry.deleted,
      created_at_client: entry.createdAt || new Date().toISOString(),
      updated_at_client: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      deleted_at_client: entry.deletedAt || null,
    };
  }

  function entryFromRow(row){
    return {
      id: row.id,
      date: row.flight_date || "",
      createdAt: row.created_at_client || row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at_client || row.updated_at || row.created_at || new Date().toISOString(),
      deletedAt: row.deleted_at_client || null,
      deleted: !!row.deleted,
      fields: {
        num: row.num || "",
        nome: row.nome || "",
        missao: row.missao || "",
        codigo: row.codigo || "",
        voo: row.voo || "",
        inicio: row.inicio || "",
        tempo: row.tempo || "",
        ua: row.ua || "",
        ciclos: row.ciclos || "",
        nbat: row.nbat || "",
        cargaIni: row.carga_ini || "",
        cargaFim: row.carga_fim || "",
        obs: row.obs || "",
      }
    };
  }

  async function pull(){
    const client = getClient();
    if (!client) throw new Error("Supabase não configurado.");

    const { data, error } = await client
      .from('flight_entries')
      .select('*')
      .order('flight_date', { ascending: false })
      .order('updated_at_client', { ascending: false });

    if (error) throw error;
    return Array.isArray(data) ? data.map(entryFromRow) : [];
  }

  async function upsertEntry(entry){
    const client = getClient();
    if (!client) return false;
    const row = rowFromEntry(entry);
    const { error } = await client
      .from('flight_entries')
      .upsert(row, { onConflict: 'id' });
    return !error;
  }

  async function pushAll(entries){
    const client = getClient();
    if (!client) return false;
    const rows = (Array.isArray(entries) ? entries : [])
      .filter(e => e && e.id)
      .map(rowFromEntry);

    if (!rows.length) return true;

    const { error } = await client
      .from('flight_entries')
      .upsert(rows, { onConflict: 'id' });
    return !error;
  }

  window.RV_SYNC = {
    isConfigured,
    pull,
    upsertEntry,
    pushAll,
  };
})();
