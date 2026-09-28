const $ = s => document.querySelector(s);
const fmt = (x, d = 1) => (x == null || isNaN(x)) ? '–' : Number(x).toFixed(d);
const pct = (x, d = 1) => fmt(x, d) + '%';
const sgn = x => x >= 0 ? '+' : '';
const cls = x => x >= 0 ? 'v-good' : 'v-bad';
const money = x => '$' + Math.round(x).toLocaleString('en-US');

Chart.defaults.color = '#9aa7b4';
Chart.defaults.borderColor = '#242c38';
Chart.defaults.font.family = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
Chart.defaults.font.size = 11;

let DATA = null, labChart = null;
const charts = {};

function card(k, v, x, c) {
  return `<div class="card"><div class="k">${k}</div><div class="v ${c || ''}">${v}</div>${x ? `<div class="x">${x}</div>` : ''}</div>`;
}

// ---------- 标签页 ----------
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $('#' + b.dataset.t).classList.add('active');
  Object.values(charts).forEach(c => c && c.resize());
});

// ---------- 表格工具 ----------
function table(el, head, rows) {
  let h = '<div class="tblwrap"><table><thead><tr>' +
    head.map(x => `<th>${x}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r => { h += `<tr class="${r._cls || ''}">` + r._cells.map(c => `<td>${c}</td>`).join('') + '</tr>'; });
  $(el).innerHTML = h + '</tbody></table></div>';
}

async function boot() {
  DATA = window.TQQQ_DATA || await (await fetch('/api/data')).json();
  $('#meta').textContent = `数据截至 ${DATA.meta.last_trade} · QQQ ${DATA.meta.qqq_last.toFixed(2)} · TQQQ ${DATA.meta.tqqq_last.toFixed(2)} · 生成 ${DATA.meta.generated}`;

  const V = DATA.verdict, K = V.key;
  $('#v-head').textContent = V.headline;
  $('#v-cards').innerHTML =
    card('策略复合年化 CAGR（2010-2026 真实数据）', pct(K.real_cagr, 2), 'QQQ 同期 ' + pct(K.qqq_cagr, 2) + ' · 倍数 ' + fmt(K.real_mult, 2) + 'x', 'v-acc') +
    card('最大回撤', pct(K.real_dd), 'QQQ -35.1%', 'v-warn') +
    card('Calmar（年化÷回撤）', fmt(K.real_calmar, 2), 'QQQ 0.56', 'v-good') +
    card('全样本 1999-2026 年化', pct(K.full_cagr, 1), 'QQQ ' + pct(K.full_qqq, 1), '') +
    card('科网顶建仓，回本用时', K.dotcom_years + ' 年', '$20,000 → ' + money(20000 * K.dotcom_s), 'v-warn') +
    card('分段倍数（2010→2026 四段）', K.segs.join(' → '), '无单调趋势：优势随时代波动', '');
  if (V.config) $('#v-cfg').textContent = V.config;
  $('#v-prem').innerHTML = V.premises.map(p => `<li>${p}</li>`).join('');
  $('#v-red').innerHTML = V.redlines.map(p => `<li>${p}</li>`).join('');

  renderTonight(); renderEntry(); renderHold(); renderAmmo();
  renderYearly(); renderWindows(); renderScenarios(); renderDotcom(); renderPlan(); renderMethod();
  initLab();
}

// ---------- 逐年 ----------
function renderYearly() {
  const rows = DATA.yearly;
  new Chart($('#yearChart'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.y),
      datasets: [
        { label: '策略', data: rows.map(r => r.s), backgroundColor: '#4ea1f9aa', borderRadius: 3 },
        { label: 'QQQ', data: rows.map(r => r.q), backgroundColor: '#8b949e88', borderRadius: 3 },
        { label: 'TQQQ', data: rows.map(r => r.t), backgroundColor: '#a371f755', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${sgn(c.raw)}${fmt(c.raw)}%` } } },
      scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: '#1e2530' } }, x: { grid: { display: false } } }
    }
  });
  const S = DATA.yearly_stat;
  $('#y-stat').innerHTML =
    card('QQQ 中位年 / 平均年', pct(S.q_med) + ' / ' + pct(S.q_mean), `${S.n} 个正常年份`, '') +
    card('策略 中位年 / 平均年', pct(S.s_med) + ' / ' + pct(S.s_mean), '', 'v-acc') +
    card('TQQQ 中位年', pct(S.t_med), '', '') +
    card('策略跑赢 QQQ 的年份', fmt(S.win_rate, 0) + '%', '含黑天鹅 ' + fmt(S.win_rate_all, 0) + '%', 'v-good');
  table('#y-table', ['年份', 'QQQ', '策略', '超额', 'TQQQ', '备注'],
    rows.map(r => ({
      _cells: [r.y, pct(r.q), pct(r.s), sgn(r.ex) + fmt(r.ex) + 'pp', pct(r.t), r.bs ? '黑天鹅' : ''],
      _cls: r.bs ? 'bs' : ''
    })));
}

// ---------- 窗口 ----------
function renderWindows() {
  table('#w-table', ['窗口', '年数', '策略年化', '策略回撤', 'Calmar', 'QQQ 年化', '倍数', '裸结构年化', '仅加闸门'],
    DATA.windows.map(w => ({
      _cells: [w.label, fmt(w.years, 1), pct(w.cagr, 2), pct(w.mdd), fmt(w.calmar, 2),
      pct(w.qqq, 2), fmt(w.mult, 2) + 'x', pct(w.raw.cagr, 1), pct(w.gateonly.cagr, 1)],
      _cls: /2022-01|2000-03/.test(w.label) ? 'bs' : ''
    })));
  const S = DATA.segments;
  new Chart($('#segChart'), {
    type: 'bar',
    data: {
      labels: S.map(x => x.label),
      datasets: [
        { label: '策略年化', data: S.map(x => x.cagr), backgroundColor: '#4ea1f9aa', borderRadius: 4 },
        { label: 'QQQ 年化', data: S.map(x => x.qqq), backgroundColor: '#8b949e88', borderRadius: 4 },
        { label: '倍数（右轴）', data: S.map(x => x.mult), type: 'line', borderColor: '#d29922',
          backgroundColor: '#d29922', yAxisID: 'y1', tension: .2, pointRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: '#1e2530' } },
                y1: { position: 'right', grid: { display: false }, ticks: { callback: v => v + 'x' } },
                x: { grid: { display: false } } }
    }
  });
}

// ---------- 黑天鹅 ----------
function renderScenarios() {
  const S = DATA.scenarios;
  new Chart($('#scChart'), {
    type: 'bar',
    data: {
      labels: S.map(x => x.name),
      datasets: [
        { label: '策略年化', data: S.map(x => x.sC), backgroundColor: S.map(x => x.sC >= 0 ? '#3fb95099' : '#f8514999'), borderRadius: 4 },
        { label: 'QQQ 年化', data: S.map(x => x.qC), backgroundColor: '#8b949e77', borderRadius: 4 },
        { label: '跑输 QQQ 的路径比例（右轴）', data: S.map(x => x.beat), type: 'line', borderColor: '#d29922',
          backgroundColor: '#d29922', yAxisID: 'y1', tension: .2, pointRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw)}${c.dataset.yAxisID === 'y1' ? '%' : '%'}` } } },
      scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: '#1e2530' } },
                y1: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: v => v + '%' } },
                x: { grid: { display: false }, ticks: { maxRotation: 30, minRotation: 0 } } }
    }
  });
  table('#sc-table',
    ['场景', '设定', '策略年化', 'QQQ 年化', '策略回撤', 'QQQ 回撤', '最长水下', 'QQQ 水下', '输QQQ', '输现金', '回撤>80%', '$20,000 →'],
    S.map(x => ({
      _cells: [x.name, x.desc, pct(x.sC), pct(x.qC), pct(x.sDD), pct(x.qDD),
      fmt(x.L, 1) + 'y', fmt(x.Lq, 1) + 'y', fmt(x.beat, 0) + '%', fmt(x.cash, 0) + '%',
      fmt(x.deep, 0) + '%', money(x.v20)],
      _cls: x.sC < 0 ? 'bs' : ''
    })));
}

// ---------- 科网 ----------
function renderDotcom() {
  const D = DATA.dotcom;
  $('#d-sub').textContent = `${D.start} 顶部建仓 → QQQ 回到该点位 ${D.recover}（${D.years} 年）。纵轴为对数刻度，以建仓日 = 1.00。`;
  new Chart($('#dChart'), {
    type: 'line',
    data: {
      labels: D.dates,
      datasets: [
        { label: '策略（闸门+补仓）', data: D.s, borderColor: '#4ea1ff', borderWidth: 2, pointRadius: 0, tension: .1 },
        { label: 'QQQ', data: D.qqq, borderColor: '#8b949e', borderWidth: 2, pointRadius: 0, tension: .1 },
        { label: 'TQQQ（合成）', data: D.t, borderColor: '#a371f7', borderWidth: 1.5, pointRadius: 0, tension: .1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw, 2)}x` } } },
      scales: {
        y: { type: 'logarithmic', ticks: { callback: v => v + 'x' }, grid: { color: '#1e2530' } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12, autoSkip: true } }
      }
    }
  });
  const N = DATA.dotcom_notes;
  $('#d-notes').innerHTML = [
    `策略在这 ${D.years} 年里 <b>${fmt(N.s_fin, 2)} 倍</b>，QQQ <b>${fmt(N.q_fin, 2)} 倍</b>，TQQQ 合成 <b>${fmt(N.t_fin, 4)} 倍</b>（永远回不来）。$20,000 对应 ${money(N.v_s)} / ${money(N.v_q)}。`,
    `但策略花了 <b>${fmt(N.back_years, 1)} 年</b>（${N.back_date}）才回到起点以上，中途最深 <b>-87%</b>。`,
    `同一段 ${D.years} 年，什么都不做买 13 周国库券是 <b>${fmt(N.bill_fin, 2)} 倍</b> —— 策略直到第 <b>${fmt(N.bill_years, 1)} 年</b>（${N.bill_date}）才超过它。`,
    `把补仓从 1/3 改回原文的一半：终值从 ${fmt(N.s_fin, 2)}x 掉到 1.49x —— 这就是"补仓在结构性熊市里吃掉弹药"的直接证据。`,
    `全程 ${N.ahead_pct.toFixed(0)}% 的交易日里策略领先 QQQ；最后一次从落后转为领先是 ${N.last_cross}。`
  ].map(x => `<li>${x}</li>`).join('');
  table('#d-table', ['持有年数', '日期', 'QQQ', '策略', 'TQQQ 合成', '$20,000 → 策略', '$20,000 → QQQ'],
    DATA.dotcom_mark.map(m => ({
      _cells: [fmt(m.yr, 1) + ' 年', m.date, fmt(m.q, 3) + 'x', fmt(m.s, 3) + 'x', fmt(m.t, 4) + 'x',
      money(m.v_s), money(m.v_q)]
    })));
}

// ---------- 执行单 ----------
function renderPlan() {
  $('#p-alloc').innerHTML = `<thead><tr><th>用途</th><th>金额</th><th>占比</th></tr></thead><tbody>
    <tr><td>JEPQ（现金收益腿）</td><td>$5,000</td><td>25%</td></tr>
    <tr><td>JAAA（防御腿 + 补仓弹药）</td><td>$5,000</td><td>25%</td></tr>
    <tr><td>TQQQ put 现金担保（行权价 68）</td><td>$6,800</td><td>34%</td></tr>
    <tr><td>备用现金</td><td>$3,200</td><td>16%</td></tr>
    <tr><td><b>合计</b></td><td><b>$20,000</b></td><td><b>100%</b></td></tr></tbody>`;
  const P = DATA.puts;
  $('#p-put').innerHTML = `<thead><tr><th>行权价</th><th>OTM</th><th>权利金(估)</th><th>被行权概率</th><th>被行权成本</th><th>现金担保</th></tr></thead><tbody>` +
    P.rows.map(r => `<tr${r.K === 68 ? ' class="bs"' : ''}><td>${r.K}</td><td>${fmt(r.otm)}%</td>
      <td>$${r.prem}–${r.prem_hi}</td><td>${fmt(r.prob, 0)}%</td>
      <td>${fmt(r.cost, 2)}（${fmt(r.cost_pct)}%）</td><td>${money(r.coll)}</td></tr>`).join('') +
    `</tbody><tfoot><tr><td colspan="6" style="text-align:left;color:#9aa7b4;font-size:12px">
      现价 ${P.spot}，20 日已实现波动 ${fmt(P.rv, 0)}%；权利金为 Black-Scholes 估算（IV 45–55%），非实盘报价。
      选中行 = 本单采用（-15% OTM / 45 天）。</td></tr></tfoot>`;
  $('#p-ma').textContent = (DATA.entry && DATA.entry.today ? DATA.entry.today.qqq_ma200 : (DATA.meta.qqq_ma200 || 0)).toFixed(2);
  const W = DATA.windows.find(w => w.label.indexOf('2018-01') === 0);
  const W2 = DATA.windows.find(w => w.label.indexOf('2022-01') === 0);
  $('#p-plan').innerHTML =
    card('悲观（2022 起）', pct(W2.cagr) + ' / ' + fmt(W2.mult, 2) + 'x', 'Calmar ' + fmt(W2.calmar, 2) + ' · 回撤 ' + pct(W2.mdd), 'v-warn') +
    card('中性（2018 起）', pct(W.cagr) + ' / ' + fmt(W.mult, 2) + 'x', 'Calmar ' + fmt(W.calmar, 2) + ' · 回撤 ' + pct(W.mdd), 'v-acc') +
    card('乐观（2010–2021 零利率段，仅对照）', pct(DATA.windows.find(w => w.label.indexOf('2021-12') > 0).cagr), '不能当预期', '');
  $('#p-red').innerHTML = DATA.verdict.redlines.map(x => `<li>${x}</li>`).join('');
}

// ---------- 方法 ----------
function renderMethod() {
  $('#m-cal').innerHTML = [
    '价格：Yahoo Finance 日线，auto_adjust=True（含股息），截至 ' + DATA.meta.last_trade,
    'TQQQ：2010-02 起为真实数据；1999–2010 为合成（日回报 = 3×QQQ − 5.25%/年，单日下限 -99.9%，用真实段反解校准 43.40% vs 实际 43.23%）',
    'JEPQ 代理 = 0.8×QQQ 日回报 + 10%/年（JEPQ 2022 年才成立）；JAAA 代理 = 5.5%/年、零波动',
    '无交易成本；期权权利金用 Black-Scholes 估算'
  ].map(x => `<li>${x}</li>`).join('');
  $('#m-lim').innerHTML = [
    '<b>1999–2010 是合成模型，不是真实基金历史。</b>2000–2002 那一段的所有数字都带模型风险。',
    'JAAA 不是无风险资产：AAA 级 CLO 是信用利差产品，极端流动性事件中可跌 5–10%（此处按零波动处理，对策略偏乐观）。',
    '有效独立熊市样本只有 4 次（2000-02、2008、2020、2022），统计上很薄。',
    '补仓门槛的具体数值落在噪声带内（-20% 优于 -25% 的概率仅 61%），-40% 在 16 年窗口最优、在 27 年窗口掉到中游 —— 典型的过拟合痕迹。',
    '所有窗口都不包含「通道风险」：内地投资者持有美股 ETF 的跨境、券商、汇率可及性，任何回测都算不出来。'
  ].map(x => `<li>${x}</li>`).join('');
  $('#m-files').innerHTML = [
    'backtest_full.py — 2010-2026 全历史 + beta 对照', 'stress_1999.py — 1999 合成压力测试',
    'entry_timing.py — 高位建仓的历史分布', 'btd_grid.py / btd_tqqq_levels.py / btd_final.py — 补仓条款的 12 变体与噪声检验',
    'size_feasibility.py — $20K 规模下对冲腿的可行性', 'sell_put_test.py — 卖 put vs 直接买的 189 期对照',
    'trim_blackswan.py / trim_matrix.py — 剔除黑天鹅年份的 2×2 矩阵', 'dotcom_path.py — 2000 顶部持有 15 年的路径',
    'window_scan.py — 窗口扫描与分段稳定性', 'future_blackswans.py — 8 场景 × 200 路径仿真',
    'webapp/precompute.py — 本页全部数据的预计算'
  ].map(x => `<li>${x}</li>`).join('');
}

// ---------- 参数实验室 ----------
function initLab() {
  const g = $('#l-gate'), b = $('#l-btd'), f = $('#l-frac'), r = $('#l-rb');
  const upd = () => {
    $('#l-gate-v').textContent = g.options[g.selectedIndex].text;
    $('#l-btd-v').textContent = b.value + '%';
    $('#l-frac-v').textContent = f.value == 0 ? '不补仓' : f.value + '%';
    $('#l-rb-v').textContent = r.value + '%';
  };
  [g, b, f, r].forEach(el => el.addEventListener('input', () => { upd(); runLab(); }));
  $('#l-reset').onclick = () => { g.value = 'daily'; b.value = -20; f.value = 33; r.value = 65; upd(); runLab(); };
  upd(); runLab();
}

async function runLab() {
  const fv = Number($('#l-frac').value);
  const p = {
    gate: $('#l-gate').value, btd: $('#l-btd').value / 100,
    frac: (fv === 33 ? 1 / 3 : fv / 100),   // 33% 即本单口径的 1/3，避免四舍五入造成口径漂移
    rb: $('#l-rb').value / 100
  };
  let res;
  if (typeof bt_run === 'function') {
    res = bt_run(p);                                     // 静态版：浏览器内计算
  } else {
    const r = await (await fetch('/api/backtest?' + new URLSearchParams(p))).json();
    res = { metrics: r.metrics, events: r.events, dates: r.dates, nav: r.nav, qqq: r.qqq, tqqq: r.tqqq, n: r.n };
  }
  const m = res.metrics, e = res.events;
  $('#l-cards').innerHTML =
    card('年化', pct(m.cagr, 2), 'QQQ ' + pct(m.qqq, 2), 'v-acc') +
    card('最大回撤', pct(m.mdd), 'QQQ ' + pct(DATA.windows.find(w => w.label.indexOf('2010-02') === 0).raw.mdd), 'v-warn') +
    card('Calmar', fmt(m.calmar, 2), '', 'v-good') +
    card('夏普', fmt(m.sharpe, 2), '波动 ' + pct(m.vol), '') +
    card('相对 QQQ 倍数', fmt(m.mult, 2) + 'x', '', '') +
    card('规则触发', `再平衡 ${e.reb} · 补仓 ${e.btd} · 闸门 ${e.gate}`, '2010-02 起 ' + res.n + ' 个交易日', '');
  const ds = [
    { label: '策略', data: res.nav, borderColor: '#4ea1ff', borderWidth: 2, pointRadius: 0, tension: .1, fill: false },
    { label: 'QQQ', data: res.qqq, borderColor: '#8b949e', borderWidth: 1.6, pointRadius: 0, tension: .1 },
    { label: 'TQQQ', data: res.tqqq, borderColor: '#a371f755', borderWidth: 1.4, pointRadius: 0, tension: .1 }
  ];
  if (labChart) { labChart.data.labels = res.dates; labChart.data.datasets = ds; labChart.update('none'); }
  else {
    labChart = new Chart($('#labChart'), {
      type: 'line', data: { labels: res.dates, datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw, 2)}x` } } },
        scales: { y: { type: 'logarithmic', ticks: { callback: v => v + 'x' }, grid: { color: '#1e2530' } },
                  x: { grid: { display: false }, ticks: { maxTicksLimit: 10, autoSkip: true } } }
      }
    });
    charts.lab = labChart;
  }
}

boot().then(() => {
  const h = location.hash.replace('#','');
  if (h) { const b = document.querySelector(`.tab[data-t="${h}"]`); if (b) b.click(); }
});

// ===== 新增四页的渲染（追加到 app.js 末尾） =====
function renderTonight() {
  const T = DATA.tonight;
  $('#t-steps').innerHTML = '<thead><tr><th>步骤</th><th>做什么</th><th>何时</th><th>为什么</th></tr></thead><tbody>' +
    T.steps.map(s => `<tr><td>${s.no}</td><td style="text-align:left">${s.what}</td><td>${s.when}</td><td style="text-align:left;color:#9aa7b4">${s.why}</td></tr>`).join('') +
    '</tbody>';
  $('#t-levels').innerHTML = '<thead><tr><th>QQQ 回撤</th><th>QQQ 价格</th><th>TQQQ 对应价</th><th>相对 TQQQ 现价</th><th>含义</th></tr></thead><tbody>' +
    T.levels.map(l => `<tr${l.thr === 5 ? ' class="bs"' : ''}><td>-${l.thr}%</td><td>${l.qqq.toFixed(2)}</td>
      <td><b>${l.tqqq.toFixed(2)}</b></td><td>${l.tqqq_pct}%</td>
      <td style="text-align:left;color:#9aa7b4">${l.thr === 5 ? 'put 行权价 68 大致对应这一档' : ''}</td></tr>`).join('') + '</tbody>';
  $('#t-forbid').innerHTML = T.forbidden.map(x => `<li>${x}</li>`).join('');
}

function renderEntry() {
  const E = DATA.entry, t = E.today;
  $('#e-today').innerHTML =
    card('QQQ 现价', t.qqq_px.toFixed(2), '全历史高点 ' + t.qqq_ath.toFixed(2) + '（距高点 ' + t.qqq_dath + '%）', '') +
    card('QQQ 200 日均线', t.qqq_ma200.toFixed(2), '现价在均线' + (t.qqq_px > t.qqq_ma200 ? '上方' : '下方'), '') +
    card('TQQQ 现价', t.tqqq_px.toFixed(2), '全历史高点 ' + t.tqqq_ath.toFixed(2) + '（距高点 ' + t.tqqq_dath + '%）', '') +
    card('今天的位置判定', '历史新高附近', '这一档的历史结果见下方', 'v-warn');

  const bt = (el, rows) => table(el,
    ['距高点区间', '样本', '中位年化', 'P10', 'P90', '亏损占比', '中位最深回撤'],
    rows.map(b => ({
      _cells: [b.label, b.n, pct(b.med), pct(b.p10), pct(b.p90), pct(b.loss), pct(b.mdd)],
      _cls: (b.label.indexOf('新高') >= 0 && b.n < 1000) ? 'bs' : ''
    })));
  bt('#e-ath', E.ath); bt('#e-m12q', E.m12q); bt('#e-m12t', E.m12t);
  table('#e-fwd', ['进场状态', '样本', '未来 1 年中位', '正收益概率'],
    E.fwd1y.map(f => ({ _cells: [f.label, f.n, pct(f.med), pct(f.win, 0)], _cls: f.win > 80 ? '' : 'bs' })));

  const S = E.sig;
  $('#e-sig').innerHTML =
    card('与今天签名相同的历史建仓日', S.n + ' 个', S.years.map(y => y.y + '：' + y.n).join(' / '), '') +
    card('10 年中位年化', pct(S.med), 'P10 ' + pct(S.p10) + ' · P90 ' + pct(S.p90), 'v-acc') +
    card('10 年仍亏钱的占比', pct(S.loss, 0), '最差 ' + pct(S.worst), 'v-bad') +
    card('期间最深回撤（最惨）', pct(S.mdd_worst), '中位 ' + pct(S.mdd_med), 'v-warn');
  $('#e-sig-note').innerHTML = '今天（QQQ 距高点 ' + t.qqq_dath + '%、站上 200 日线）与 2000-02-10 的状态签名相同。' +
    '历史上同签名的 ' + S.n + ' 个建仓日只分成两个阵营：<b>1999–2000 那批是灾难（最差十之一亏钱、中途最深 -88%）</b>，' +
    '2015–2016 那批很好（+30% 以上）。<b>两者在建仓当天的可观测特征完全一致 —— 没有任何技术指标能把它们分开。</b>' +
    '（限制：要观察满 10 年，起点必须在 2016-09 之前。）';
  table('#e-sig-tbl', ['同签名里最惨的建仓日', '10 年年化', 'QQQ 同期', '期间最深回撤'],
    S.worst_rows.map(r => ({ _cells: [r.date, pct(r.cagr), pct(r.qqq), pct(r.mdd)], _cls: 'bs' })));
}

function renderHold() {
  const H = DATA.horizon;
  const cv = H.convergence;
  new Chart($('#hConv'), {
    type: 'line',
    data: {
      labels: cv.map(c => c.years + ' 年'),
      datasets: [
        { label: 'P10（坏运气）', data: cv.map(c => c.p10), borderColor: '#f85149', tension: .25, pointRadius: 3 },
        { label: '中位', data: cv.map(c => c.med), borderColor: '#4ea1ff', borderWidth: 2.5, tension: .25, pointRadius: 4 },
        { label: 'P90（好运气）', data: cv.map(c => c.p90), borderColor: '#3fb950', tension: .25, pointRadius: 3 },
        { label: 'QQQ 中位', data: cv.map(c => c.qmed), borderColor: '#8b949e', borderDash: [5, 4], tension: .25, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw)}%` } } },
      scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: '#1e2530' } }, x: { grid: { display: false } } }
    }
  });
  table('#h-conv', ['持有期', '样本', 'P10', '中位', 'P90', '最差', '最好', 'QQQ 中位', '跑赢 QQQ'],
    cv.map(c => ({ _cells: [c.years + ' 年', c.n, pct(c.p10), '<b>' + pct(c.med) + '</b>', pct(c.p90), pct(c.worst), pct(c.best), pct(c.qmed), pct(c.win, 0)] })));

  const ep = H.endpoint;
  new Chart($('#hEnd'), {
    type: 'bar',
    data: {
      labels: ep.map(e => e.end + ' 为止'),
      datasets: [
        { label: '策略中位年化', data: ep.map(e => e.med), backgroundColor: ep.map(e => e.med >= 0 ? '#4ea1f9aa' : '#f8514999'), borderRadius: 4 },
        { label: 'QQQ 中位年化', data: ep.map(e => e.qmed), backgroundColor: '#8b949e77', borderRadius: 4 },
        { label: '达到 30% 的起点占比（右轴）', data: ep.map(e => e.share30), type: 'line', borderColor: '#d29922', backgroundColor: '#d29922', yAxisID: 'y1', tension: .2, pointRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: '#1e2530' } },
                y1: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: v => v + '%' } },
                x: { grid: { display: false } } }
    }
  });
  table('#h-end', ['终点', '实际日期', '起点数', '策略中位', 'P10', 'P90', 'QQQ 中位', '达到 30% 的起点占比'],
    ep.map(e => ({
      _cells: [e.end, e.actual, e.n, '<b>' + pct(e.med) + '</b>', pct(e.p10), pct(e.p90), pct(e.qmed), pct(e.share30, 0)],
      _cls: e.med < 0 ? 'bs' : ''
    })));

  table('#h-worst', ['持有期', '最差入场日', '策略年化', '倍率', '$20,000 →', 'QQQ 同期'],
    H.worst.map(w => ({ _cells: [w.years + ' 年', w.date, pct(w.cagr), fmt(w.mult, 2) + 'x', money(w.v20), pct(w.qqq)], _cls: 'bs' })));
  $('#h-wd').innerHTML =
    card('最惨入场日', H.worst_dd.date, '建仓后 10 年内', 'v-bad') +
    card('最深回撤', pct(H.worst_dd.mdd), '$20,000 最低见到 ' + money(H.worst_dd.low), 'v-bad');
  table('#h-switch', ['配置', '10 年中位年化', 'P10', '跑赢 QQQ 概率'],
    H.rule_switch.map((r, i) => ({
      _cells: [r.label, '<b>' + pct(r.med) + '</b>', pct(r.p10), pct(r.win, 1)],
      _cls: i === 0 ? '' : ''
    })));
}

function renderAmmo() {
  const A = DATA.ammo;
  $('#a-cards').innerHTML =
    card('原文三枪门槛', A.ladder.map(l => l.thr + '%→' + l.frac + '%').join(' / '), 'TQQQ 自身回撤', '') +
    card('打光那一刻的权重', A.shots.length ? A.shots[A.shots.length - 1].w[0] + '% / ' + A.shots[A.shots.length - 1].w[1] + '% / ' + A.shots[A.shots.length - 1].w[2] + '%' : '-', 'TQQQ / JEPQ / JAAA', 'v-bad') +
    card('期间 TQQQ 权重最高', pct(A.max_w), '不是 100% —— JEPQ 不是弹药', 'v-warn') +
    card('本单口径只开一枪', A.single_shot.mult.toFixed(3) + 'x', '原文三档 ' + A.normal.end2015.mult.toFixed(3) + 'x（到 2015）', 'v-good');

  table('#a-shots', ['日期', '第几枪', 'TQQQ 回撤', '打完后的权重 T / J / A', '闸门'],
    A.shots.map(s => ({
      _cells: [s.date, '第' + s.shot + '枪', pct(s.dd), s.w[0] + '% / ' + s.w[1] + '% / ' + s.w[2] + '%', s.gated ? '激活' : '未激活'],
      _cls: s.shot === A.shots.length ? 'bs' : ''
    })));

  const af = A.after, ends = ['end0202', 'end2012', 'end2015'];
  const labs = { end0202: '2002-10-09（谷底）', end2012: '2012-12-31', end2015: '2015-02-20（QQQ 回本）' };
  new Chart($('#aAfter'), {
    type: 'bar',
    data: {
      labels: af.map(a => a.label.replace(/^[A-D] /, '')),
      datasets: ends.filter(e => af.some(a => a[e])).map((e, i) => ({
        label: labs[e], data: af.map(a => (a[e] ? a[e].mult : null)),
        backgroundColor: ['#f8514999', '#d2992299', '#4ea1f999'][i], borderRadius: 4
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } },
      scales: { y: { ticks: { callback: v => v + 'x' }, grid: { color: '#1e2530' } }, x: { grid: { display: false }, ticks: { maxRotation: 20 } } }
    }
  });
  table('#a-after', ['收尾方式', '2002-10-09 谷底', '2012-12-31', '2015-02-20（QQQ 回本）', '最深回撤', 'TQQQ 权重最高'],
    af.map(a => ({
      _cells: [a.label,
        a.end0202 ? a.end0202.mult.toFixed(3) + 'x' : '—',
        a.end2012 ? a.end2012.mult.toFixed(3) + 'x' : '—',
        a.end2015 ? '<b>' + a.end2015.mult.toFixed(3) + 'x</b>' : '—',
        a.end2015 ? pct(a.end2015.mdd) : '—',
        a.end2015 ? pct(a.end2015.max_w) : '—'],
      _cls: a.label.indexOf('C ') === 0 ? '' : (a.label.indexOf('D ') === 0 ? 'bs' : '')
    })));

  table('#a-full', ['口径', '到 2015 终值', '到 2002 谷底', '最深回撤', 'TQQQ 权重最高'],
    [
      { _cells: ['弹药只到 JAAA（原文）', A.normal.end2015.mult.toFixed(3) + 'x', A.normal.end0202.mult.toFixed(3) + 'x', pct(A.normal.end2015.mdd), pct(A.normal.end2015.max_w)] },
      { _cells: ['连 JEPQ 也当弹药（100% TQQQ）', A.full_tqqq.end2015.mult.toFixed(3) + 'x', A.full_tqqq.end0202.mult.toFixed(3) + 'x', pct(A.full_tqqq.end2015.mdd), pct(A.full_tqqq.end2015.max_w)], _cls: 'bs' }
    ]);
  const L = A.levers;
  $('#a-levers').innerHTML =
    card('年度再锚定', L.annual + ' 次', '每年 1 月，无条件', 'v-acc') +
    card('趋势闸门', L.gate + ' 次', '减半 + 恢复，来回打脸', 'v-warn') +
    card('65% 再平衡', L.rb65 + ' 次', '要求距高点 2% 内', '') +
    card('补仓', L.btd + ' 次', '原文三档', '');
  const s = A.single_shot;
  $('#a-single').innerHTML =
    card('到 2015 终值', s.mult.toFixed(3) + 'x', '原文三档 ' + A.normal.end2015.mult.toFixed(3) + 'x', 'v-good') +
    card('最深回撤', pct(s.mdd), '原文三档 ' + pct(A.normal.end2015.mdd), '') +
    card('开火记录', s.events.map(e => e.date).join(' / ') || '无', 'TQQQ 回撤 ' + (s.events.length ? pct(s.events[0].dd) : '—'), '') +
    card('TQQQ 权重最高', pct(s.max_w), '上涨途中漂上去的，由再平衡压回', '');
}

