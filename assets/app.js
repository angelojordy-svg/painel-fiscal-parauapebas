(() => {
  "use strict";
  const state = { meta: null, panorama: null, despesas: null, conferencia: null, sobre: null, unidade: null, detalhes: {} };
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => {
    const n = Number(v || 0);
    return brl.format(Math.abs(n) < 0.005 ? 0 : n);
  };
  const percent = (v) => `${pct.format(Number(v || 0) * 100)}%`;

  async function json(name) {
    const v = state.meta?.versao ? `?v=${encodeURIComponent(state.meta.versao)}` : "";
    const r = await fetch(`dados/${name}.json${v}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${name}.json: HTTP ${r.status}`);
    return r.json();
  }

  function card(label, value, note = "", cls = "") {
    return `<div class="card ${cls}"><div class="label">${esc(label)}</div><div class="value">${value}</div>${note ? `<div class="note">${note}</div>` : ""}</div>`;
  }

  function bars(el, rows, valueKey, labelFn, format = money) {
    const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] || 0)));
    el.innerHTML = rows.map((r) => {
      const v = Number(r[valueKey] || 0);
      const w = Math.max(0, Math.min(100, (v / max) * 100));
      return `<div class="bar-row"><span class="bar-label" title="${esc(labelFn(r))}">${esc(labelFn(r))}</span><span class="bar-track"><span class="bar-fill" style="width:${w.toFixed(1)}%"></span></span><span class="bar-value">${format(v)}</span></div>`;
    }).join("");
  }

  const LEGENDA_EXEC = `<span><i class="sw-pago"></i>Pago</span><span><i class="sw-a-pagar"></i>Liquidado a pagar</span><span><i class="sw-a-liquidar"></i>Empenhado a liquidar</span><span><i class="sw-alerta"></i>Alerta de excesso</span>`;

  function stackedBars(el, rows, opts = {}) {
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = `<p class="nota">Sem dados para este recorte.</p>`;
      return;
    }
    const seg = (cls, v, total) => (total > 0 && v > 0.005)
      ? `<span class="stack-seg ${cls}" style="width:${((v / total) * 100).toFixed(3)}%"></span>`
      : "";
    el.innerHTML = rows.map((r) => {
      const total = Number(r.total || 0);
      const pago = Number(r.pago || 0);
      const aPagar = Number(r.a_pagar || 0);
      const aLiq = Number(r.a_liquidar || 0);
      const alertas = Array.isArray(r.alertas) ? r.alertas : [];
      const alerta = alertas.length ? ` <span class="stack-alerta" title="${esc(alertas.join("; "))}">!</span>` : "";
      const sub = opts.showDoc
        ? (r.doc ? fmtDoc(r.doc) : (r.folha ? "folha/encargo" : "sem CNPJ"))
        : (r.entidade || "");
      const title = `${r.nome}${r.doc ? ` · ${fmtDoc(r.doc)}` : ""}\nEmpenhado ${money(r.emp)} · Liquidado ${money(r.liq)} · Pago ${money(r.pago)}\nA liquidar ${money(aLiq)} · A pagar ${money(aPagar)}${alertas.length ? `\nAtenção: ${alertas.join("; ")}` : ""}`;
      const totalNote = total > Number(r.emp || 0) + 0.005 ? `<small>maior etapa ${money(total)}</small>` : "";
      return `<div class="stack-row" title="${esc(title)}">
        <span class="stack-label">${esc(r.nome)}${alerta}<small>${esc(sub)}</small></span>
        <span class="stack-track">${seg("pago", pago, total)}${seg("a-pagar", aPagar, total)}${seg("a-liquidar", aLiq, total)}</span>
        <span class="stack-total">${money(r.emp)}${totalNote}</span>
        <span class="stack-diffs">pago ${money(pago)} · a pagar ${money(aPagar)} · a liquidar ${money(aLiq)}</span>
      </div>`;
    }).join("");
  }

  function renderExecTabela(id, rows, showDoc) {
    const el = document.getElementById(id);
    if (!el) return;
    const head = showDoc
      ? "<th>Fornecedor</th><th>CNPJ</th>"
      : "<th>Órgão</th><th>Entidade</th>";
    el.innerHTML = `<div class="table-wrap"><table class="mini"><thead><tr>${head}<th class="num">Empenhado</th><th class="num">Liquidado</th><th class="num">Pago</th><th class="num">A liquidar</th><th class="num">A pagar</th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td>${esc(r.nome)}</td><td>${esc(showDoc ? (r.doc ? fmtDoc(r.doc) : "—") : (r.entidade || ""))}</td>
      <td class="num">${money(r.emp)}</td><td class="num">${money(r.liq)}</td><td class="num">${money(r.pago)}</td>
      <td class="num">${money(r.a_liquidar)}</td><td class="num">${money(r.a_pagar)}</td>
    </tr>`).join("")}</tbody></table></div>`;
  }

  function exportarExecCSV(rows, showDoc, nome) {
    const header = showDoc
      ? ["fornecedor", "cnpj", "empenhado", "liquidado", "pago", "a_liquidar", "a_pagar", "total"]
      : ["orgao", "entidade", "empenhado", "liquidado", "pago", "a_liquidar", "a_pagar", "total"];
    const lines = [header, ...rows.map((r) => showDoc
      ? [r.nome, r.doc || "", r.emp, r.liq, r.pago, r.a_liquidar, r.a_pagar, r.total]
      : [r.nome, r.entidade || "", r.emp, r.liq, r.pago, r.a_liquidar, r.a_pagar, r.total])];
    const csv = lines.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `painel_fiscal_${nome}_${state.meta.ano}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderExecucao() {
    const ex = state.panorama?.execucao || {};
    const incluir = document.getElementById("incluir-folha")?.checked;
    const unidades = ex.por_unidade || [];
    const credores = (incluir ? ex.por_credor_com_folha : ex.por_credor) || [];
    document.getElementById("legenda-execucao").innerHTML = LEGENDA_EXEC;
    document.getElementById("legenda-credores").innerHTML = LEGENDA_EXEC;
    stackedBars(document.getElementById("execucao-unidades"), unidades, { showDoc: false });
    stackedBars(document.getElementById("execucao-credores"), credores, { showDoc: true });

    const fonteEl = document.getElementById("fonte-execucao");
    if (fonteEl) {
      const fontes = (ex.fontes || []).map((f) => `${f.entidade}: ${f.ate || "—"}`).join(" · ");
      fonteEl.textContent = fontes ? `Fonte: empenhos · ${fontes}.` : "";
    }

    const exd = ex.excluidos || {};
    const nota = document.getElementById("execucao-nota");
    if (nota) {
      nota.textContent = incluir
        ? "Incluindo folha e encargos. Pessoas físicas aparecem agregadas, sem nome ou documento."
        : `Excluídos por padrão (${money(ex.excluidos_total)}): folha ${money(exd.folha)} · auxílio-alimentação ${money(exd.auxilio)} · INSS ${money(exd.inss)} · PASEP ${money(exd.pasep)}${exd.fgts ? ` · FGTS ${money(exd.fgts)}` : ""} · entes públicos ${money(exd.entes_publicos)}. Pessoas físicas aparecem agregadas, sem nome ou documento.`;
    }

    renderExecTabela("tabela-execucao-unidades", unidades, false);
    renderExecTabela("tabela-execucao-credores", credores, true);

    const toggle = document.getElementById("incluir-folha");
    if (toggle) toggle.onchange = renderExecucao;
    document.querySelectorAll("[data-export-exec]").forEach((b) => {
      b.onclick = () => {
        const showDoc = b.dataset.exportExec === "credores";
        exportarExecCSV(showDoc ? credores : unidades, showDoc, b.dataset.exportExec);
      };
    });
  }

  function renderPanorama() {
    const p = state.panorama;
    const t = p.totais;
    document.getElementById("panorama-kpis").innerHTML = [
      card("Dotação atualizada", money(t.dot_atu), `fixada ${money(t.dot_fix)}`, "hero"),
      card("Empenhado até out", money(t.emp_ytd), `${percent(t.exec)} da dotação`),
      card("Liquidado até out", money(t.liq_ytd), `movimento out ${money(t.liq_mes)}`),
      card("Pago até out", money(t.pago_ytd), `movimento out ${money(t.pago_mes)}`),
      card("Saldo a empenhar", money(t.saldo), "dotação − empenhado"),
      card("Projeção fechada Jan-Ago", money(t.proj_ago), `saldo ${money(t.saldo_ago)}`, "alert"),
      card("Projeção provisória Jan-Set", money(t.proj_set), `saldo ${money(t.saldo_set)}`, "alert"),
    ].join("");

    document.getElementById("fechamento").innerHTML = `<table><thead><tr><th>Bimestre</th><th>Status</th><th>Referência</th></tr></thead><tbody>${p.fechamento.bimestres.map((b) => `<tr><td>${esc(b.nome)}</td><td><span class="pill ${b.status === "fechado" ? "ok" : "warn"}">${esc(b.status)}</span></td><td>${esc(b.fechado_em || b.base_ate || b.previsao || "")}</td></tr>`).join("")}</tbody></table>`;
    document.getElementById("projecoes").innerHTML = `
      <div class="box"><span>Fechada Jan-Ago</span><b>${money(t.proj_ago)}</b><span class="nota">13º só 3.1.90 · saldo ${money(t.saldo_ago)}</span></div>
      <div class="box"><span>Provisória Jan-Set</span><b>${money(t.proj_set)}</b><span class="nota">13º só 3.1.90 · saldo ${money(t.saldo_set)}</span></div>
      <div class="box"><span>Conservadora (teto no empenhado)</span><b>${money(t.proj_cap)}</b><span class="nota">saldo ${money(t.saldo_cap)}</span></div>`;

    const alertas = p.alertas || [];
    document.getElementById("alertas").innerHTML = alertas.length
      ? `<p class="nota">${alertas.length} ponto(s) de atenção. Mostrando os 8 primeiros.</p><div class="alertas-list"><ul>${alertas.slice(0, 8).map((a) => `<li><b>${esc(a.nome)}</b> · ${esc(a.cod)} ${esc(a.natureza)}: ${esc(a.alertas.join("; "))}</li>`).join("")}</ul></div>`
      : `<p class="pill ok">Nenhum ponto de atenção.</p>`;

    bars(document.getElementById("top-unidades"), p.top_unidades || [], "emp", (r) => r.entidade === "Prefeitura" ? r.nome : `${r.entidade || ""} - ${r.nome}`);
    bars(document.getElementById("top-naturezas"), p.top_naturezas || [], "liq", (r) => `${r.cod} · ${r.nome}`);

    const max = Math.max(1, ...(p.mensal || []).flatMap((m) => [m.emp, m.liq]));
    const ent = p.entidades || [];
    document.getElementById("entidades").innerHTML = `<table class="mini"><thead><tr><th>Entidade</th><th class="num">Unid.</th><th class="num">Dotação</th><th class="num">Empenhado</th><th class="num">Liquidado</th><th class="num">Pago</th><th class="num">Proj. fechada</th><th class="num">Proj. provisória</th></tr></thead><tbody>${ent.map((e) => `<tr><td>${esc(e.nome)}</td><td class="num">${e.unidades}</td><td class="num">${money(e.totais.dot_atu)}</td><td class="num">${money(e.totais.emp_ytd)}</td><td class="num">${money(e.totais.liq_ytd)}</td><td class="num">${money(e.totais.pago_ytd)}</td><td class="num">${money(e.totais.proj_ago)}</td><td class="num">${money(e.totais.proj_set)}</td></tr>`).join("")}</tbody></table>`;
    document.getElementById("mensal").innerHTML = (p.mensal || []).map((m) => {
      const he = Math.max(1, (m.emp / max) * 100);
      const hl = Math.max(1, (m.liq / max) * 100);
      return `<div class="mes" title="${esc(m.nome)} · empenhado ${money(m.emp)} · liquidado ${money(m.liq)}"><div class="col"><span class="b1" style="height:${he}%"></span><span class="b2" style="height:${hl}%"></span></div><span>${esc(m.nome)}</span></div>`;
    }).join("");
    renderExecucao();
  }

  function renderDespesas() {
    const d = state.despesas;
    const sel = document.getElementById("filtro-unidade");
    const grupos = {};
    for (const u of d.unidades) (grupos[u.entidade] ||= []).push(u);
    sel.innerHTML = Object.entries(grupos).map(([nome, us]) => `<optgroup label="${esc(nome)}">${us.map((u) => `<option value="${u.unid}">${esc(u.nome)}</option>`).join("")}</optgroup>`).join("");
    const preferida = d.unidades.find((u) => u.unid === 3 && u.slug === "prefeitura")?.unid ?? d.unidades[0]?.unid;
    state.unidade = preferida;
    sel.value = String(preferida);
    sel.onchange = () => { state.unidade = Number(sel.value); renderDespesasUnit(); };
    document.getElementById("filtro-busca").oninput = () => renderDespesasUnit();
    document.getElementById("exportar-csv").onclick = exportarCSV;
    renderDespesasUnit();
    document.querySelector("#tabela-despesas tbody").onclick = (e) => {
      const tr = e.target.closest("tr[data-cod]");
      if (tr) abrirDetalhe(tr.dataset.cod);
    };
  }

  function renderDespesasUnit() {
    const d = state.despesas;
    const u = d.unidades.find((x) => x.unid === state.unidade);
    if (!u) return;
    const t = u.totais;
    document.getElementById("despesas-kpis").innerHTML = [
      card("Dotação atualizada", money(t.dot_atu), `fixada ${money(t.dot_fix)}`, "hero"),
      card("Empenhado", money(t.emp_ytd), `${percent(t.exec)} da dotação`),
      card("Liquidado", money(t.liq_ytd), `movimento out ${money(t.liq_mes)}`),
      card("Pago", money(t.pago_ytd), `movimento out ${money(t.pago_mes)}`),
      card("Saldo a empenhar", money(t.saldo), "dotação − empenhado"),
      card("Projeção fechada", money(t.proj_ago), `saldo ${money(t.saldo_ago)}`, "alert"),
      card("Projeção provisória", money(t.proj_set), `saldo ${money(t.saldo_set)}`, "alert"),
    ].join("");
    document.getElementById("despesas-nota").textContent = `${u.nome} · ${u.naturezas.length} naturezas · códigos ${u.codigos.join(", ")}`;

    const q = (document.getElementById("filtro-busca").value || "").trim().toLowerCase();
    const rows = u.naturezas.filter((n) => !q || n.cod.toLowerCase().includes(q) || (n.nome || "").toLowerCase().includes(q));
    const tbody = document.querySelector("#tabela-despesas tbody");
    tbody.innerHTML = rows.map((n) => {
      const alerta = (n.alertas || []).join("; ");
      return `<tr class="clickable" data-cod="${esc(n.cod)}" title="Clique para ver programas e credores">
        <td class="cod" title="${esc(alerta)}">${esc(n.cod)}${alerta ? ` <span class="dot" title="${esc(alerta)}">!</span>` : ""}</td><td>${esc(n.nome)}</td>
        <td class="num">${money(n.dot_atu)}</td><td class="num">${money(n.emp_ytd)}</td>
        <td class="num">${money(n.liq_ytd)}</td><td class="num">${money(n.pago_ytd)}</td>
        <td class="num">${percent(n.exec)}</td><td class="num">${money(n.saldo)}</td>
        <td class="num"><span class="proj">F ${money(n.proj_ago)}</span><span class="proj">P ${money(n.proj_set)}</span></td>
        <td class="num ${n.saldo_est_ago < -0.005 ? "neg" : ""}">${money(n.saldo_est_ago)}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="10" class="nota">Nenhuma natureza com esse filtro.</td></tr>`;
  }

  function exportarCSV() {
    const d = state.despesas;
    const u = d.unidades.find((x) => x.unid === state.unidade);
    if (!u) return;
    const q = (document.getElementById("filtro-busca").value || "").trim().toLowerCase();
    const rows = u.naturezas.filter((n) => !q || n.cod.toLowerCase().includes(q) || (n.nome || "").toLowerCase().includes(q));
    const header = ["unidade", "codigo", "especificacao", "dotacao_atualizada", "empenhado", "liquidado", "pago", "execucao", "saldo_a_empenhar", "projecao_fechada", "projecao_provisoria", "saldo_estimado_fechada", "alertas"];
    const lines = [header, ...rows.map((n) => [u.nome, n.cod, n.nome, n.dot_atu, n.emp_ytd, n.liq_ytd, n.pago_ytd, n.exec, n.saldo, n.proj_ago, n.proj_set, n.saldo_est_ago, (n.alertas || []).join("; ")])];
    const csv = lines.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `painel_fiscal_${u.unid}_${d.meta.ano}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderConferencia() {
    const c = state.conferencia.conferencia;
    const ts = c.totais["09/2026"], to = c.totais["10/2026"];
    document.getElementById("conferencia-kpis").innerHTML = [
      card("Set/2026 — diferença", money(ts.diff), `${ts.falhas} unidade(s) divergente(s)`, Math.abs(ts.diff) <= 0.01 ? "ok" : "alert"),
      card("Out/2026 — diferença", money(to.diff), `${to.falhas} unidade(s) divergente(s)`, Math.abs(to.diff) <= 0.01 ? "ok" : "alert"),
      card("Liquidações", money(ts.portal), `base ${c.raw || "—"} · cortes ${c.cortes?.["09/2026"] || "—"} e ${c.cortes?.["10/2026"] || "—"}`),
      card("Portais", "2 competências", "set e out/2026; out é parcial"),
    ].join("");
    const rows = (c.linhas || []).slice().sort((a, b) => (a.entidade || "").localeCompare(b.entidade || "") || a.unid - b.unid || a.competencia.localeCompare(b.competencia));
    document.querySelector("#tabela-conferencia tbody").innerHTML = rows.map((r) => `<tr>
      <td>${esc(r.entidade || "")}</td><td>${esc(r.nome)}</td><td>${esc(r.competencia)}</td>
      <td class="num">${money(r.calc)}</td><td class="num">${money(r.portal)}</td>
      <td class="num ${Math.abs(r.diff) > 0.01 ? "bad" : "ok"}">${money(r.diff)}</td>
      <td><span class="pill ${r.status === "ok" ? "ok" : "bad"}">${esc(r.status)}</span></td>
    </tr>`).join("");
  }

  function renderSobre() {
    const s = state.sobre.sobre;
    const m = state.meta;
    document.getElementById("sobre-conteudo").innerHTML = `
      <h2>Sobre os dados</h2>
      <p class="nota">${esc(m.municipio)}/${esc(m.uf)} · ${esc(m.entidade)} · gerado em ${esc(m.gerado_em)} · versão ${esc(m.versao)}.</p>
      <h3>Metodologia</h3><ul>${s.metodologia.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Limitações</h3><ul>${s.limitacoes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Fontes</h3><p>${esc(m.fontes)}. Base de liquidações: <code>${esc(m.raw || "—")}</code> até ${esc(m.raw_ate || "—")}.</p>
      <h3>Cobertura</h3><p>${esc(JSON.stringify(m.cobertura))}</p>`;
  }

  const fmtDoc = (d) => (d && d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : "—");

  async function abrirDetalhe(cod) {
    const u = state.despesas.unidades.find((x) => x.unid === state.unidade);
    if (!u) return;
    const key = `${u.slug}_${String(u.unid).padStart(2, "0")}`;
    let dados = state.detalhes[key];
    if (!dados) {
      try {
        dados = await json(`detalhes_${key}`);
        state.detalhes[key] = dados;
      } catch (e) {
        dados = null;
      }
    }
    const nat = dados?.naturezas?.[cod];
    const nomeNat = u.naturezas.find((n) => n.cod === cod)?.nome || "";
    document.getElementById("modal-title").textContent = `${u.entidade} · ${u.nome} · ${cod}`;
    const body = document.getElementById("modal-body");
    if (!nat) {
      body.innerHTML = `<p class="nota">Sem detalhamento de programas/credores para <b>${esc(cod)} ${esc(nomeNat)}</b>.<br>Fonte: ${esc(dados?.fonte || "liquidações")}${dados?.ate ? ` até ${esc(dados.ate)}` : ""}.</p>`;
    } else {
      const progs = nat.programas || [];
      const creds = nat.credores || [];
      const progsHtml = progs.length
        ? `<table class="mini"><thead><tr><th>Programa</th><th>Ação</th><th class="num">Liquidado</th></tr></thead><tbody>${progs.map((p) => `<tr><td>${esc(p.programa)}</td><td>${esc(p.acao)}</td><td class="num">${money(p.liq)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="nota">Sem programas.</p>`;
      const credsHtml = creds.length
        ? `<table class="mini"><thead><tr><th>Credor</th><th>CNPJ</th><th class="num">Liquidado</th></tr></thead><tbody>${creds.map((c) => `<tr><td>${esc(c.nome)}</td><td>${esc(fmtDoc(c.doc))}</td><td class="num">${money(c.liq)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="nota">Sem credores.</p>`;
      body.innerHTML = `<p class="nota">${esc(cod)} · ${esc(nomeNat)} · liquidado até ${esc(dados.ate || "—")} · fonte ${esc(dados.fonte || "—")} · sem CPF.</p><div class="grid2"><div><h3>Programas / ações</h3>${progsHtml}</div><div><h3>Credores</h3>${credsHtml}</div></div>`;
    }
    document.getElementById("modal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function fecharModal() {
    const modal = document.getElementById("modal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
  }

  function showTab() {
    fecharModal();
    const id = (location.hash || "#panorama").replace("#", "");
    document.querySelectorAll(".tab").forEach((el) => { el.hidden = el.id !== id; });
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === id));
  }

  async function init() {
    try {
      state.meta = await json("meta");
      const [panorama, despesas, conferencia, sobre] = await Promise.all([
        json("panorama"), json("despesas"), json("conferencia"), json("sobre"),
      ]);
      Object.assign(state, { panorama, despesas, conferencia, sobre });
      renderPanorama();
      renderDespesas();
      const params = new URLSearchParams(location.search);
      const unidParam = Number(params.get("unid"));
      if (unidParam && state.despesas.unidades.some((u) => u.unid === unidParam)) {
        state.unidade = unidParam;
        document.getElementById("filtro-unidade").value = String(unidParam);
        renderDespesasUnit();
      }
      const codParam = params.get("cod");
      if (codParam) {
        if (!location.hash) location.hash = "#despesas";
        setTimeout(() => abrirDetalhe(codParam), 200);
      }
      renderConferencia();
      renderSobre();
      document.getElementById("rodape").textContent = `Fonte: Portal da Transparência (despesaclassificacao + liquidações) · ${state.meta.municipio}/${state.meta.uf} · gerado em ${state.meta.gerado_em}. Dados públicos (LAI); sem CPF, folha individual ou nota interna.`;
      showTab();
      window.addEventListener("hashchange", showTab);
      document.getElementById("modal-close").onclick = fecharModal;
      document.querySelector("#modal .modal-backdrop").onclick = fecharModal;
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
    } catch (e) {
      const el = document.getElementById("erro");
      el.hidden = false;
      el.innerHTML = `<b>Não foi possível carregar os dados.</b><br>${esc(e.message)}<br>Para abrir localmente, use <code>painel_fiscal_local.bat</code> (servidor HTTP).`;
    }
  }

  init();
})();
