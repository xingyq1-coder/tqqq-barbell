/* 参数实验室的浏览器端实现 —— 与 Python 版规则逐条对应
   50/25/25 + 65%再平衡 + 日度200日线(或月度10月线)趋势闸门 + 年度再锚定 + TQQQ回撤补仓
   TQQQ = 3×QQQ日回报 − 5.25%/年; JEPQ = 0.8×QQQ + 10%/年; JAAA = 5.5%/年
*/
const BT = { JEPQ_B: 0.80, JEPQ_Y: 0.10/252, JAAA_Y: 0.055/252 };

function bt_sma(arr, win) {
  const out = new Float64Array(arr.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= win) sum -= arr[i - win];
    if (i >= win - 1) out[i] = sum / win;
  }
  return out;
}

function bt_run(opt) {
  const D = window.TQQQ_DATA;
  const rq = D.daily.qqq, rt = D.daily.tqqq, dates = D.daily.dates;
  const gate = opt.gate || 'daily';
  const btd = (opt.btd === null || opt.btd === undefined || opt.btd === 0) ? null : Number(opt.btd);
  const frac = (opt.frac === null || opt.frac === undefined) ? 1/3 : Number(opt.frac);
  const rb = opt.rb || 0.65;
  const n = rq.length;

  const qpx = new Float64Array(n), tpx = new Float64Array(n), nav = new Float64Array(n);
  let a = 1, b = 1;
  for (let i = 0; i < n; i++) { a *= (1 + rq[i]); b *= (1 + rt[i]); qpx[i] = a; tpx[i] = b; }

  let sig;
  if (gate === 'daily') {
    const ma = bt_sma(qpx, 200);
    sig = new Uint8Array(n);
    for (let i = 0; i < n; i++) sig[i] = (!isNaN(ma[i]) && qpx[i] < ma[i]) ? 1 : 0;
  } else if (gate === 'monthly') {
    const ma = bt_sma(qpx, 210);
    sig = new Uint8Array(n);
    let cur = 0;
    for (let i = 0; i < n; i++) {
      if (i % 21 === 0 && !isNaN(ma[i])) cur = (qpx[i] < ma[i]) ? 1 : 0;
      sig[i] = cur;
    }
  } else {
    sig = new Uint8Array(n);
  }

  let v = [0.50, 0.25, 0.25];
  let pkQ = qpx[0], pkT = tpx[0], fired = false, last = -999, gated = false;
  let reb = 0, nBtd = 0, nGate = 0;
  nav[0] = 1;
  const years = dates.map(d => Number(d.slice(0, 4)));

  for (let i = 1; i < n; i++) {
    v[0] *= (1 + rt[i]);
    v[1] *= (1 + BT.JEPQ_B * rq[i] + BT.JEPQ_Y);
    v[2] *= (1 + BT.JAAA_Y);
    const q = qpx[i], t = tpx[i];
    if (q >= pkQ) pkQ = q;
    if (t >= pkT) { pkT = t; fired = false; }
    if (btd !== null && !fired && (t / pkT - 1) <= btd && (i - last) >= 10) {
      const amt = v[2] * frac; v[2] -= amt; v[0] += amt; fired = true; last = i; nBtd++;
    }
    let tot = v[0] + v[1] + v[2];
    if (v[0] / tot >= rb && (q / pkQ - 1) > -0.02) { v = [0.50*tot, 0.25*tot, 0.25*tot]; reb++; }
    if (gate !== 'off') {
      const want = sig[i] === 1;
      if (want && !gated) { const h = v[0]*0.5; v[0] -= h; v[2] += h; gated = true; nGate++; }
      else if (gated && !want) { const t2 = v[0]+v[1]+v[2]; v = [0.50*t2, 0.25*t2, 0.25*t2]; gated = false; nGate++; }
    }
    if (i > 1 && years[i] !== years[i-1]) {
      const t3 = v[0]+v[1]+v[2];
      v = gated ? [0.25*t3, 0.25*t3, 0.50*t3] : [0.50*t3, 0.25*t3, 0.25*t3];
    }
    nav[i] = v[0] + v[1] + v[2];
  }

  // 指标
  let peak = nav[0], mdd = 0;
  for (let i = 1; i < n; i++) { if (nav[i] > peak) peak = nav[i]; const dd = nav[i]/peak - 1; if (dd < mdd) mdd = dd; }
  const cagr = Math.pow(nav[n-1], 252/n) - 1;
  let sr = 0, sr2 = 0, m = 0;
  for (let i = 1; i < n; i++) { const r = nav[i]/nav[i-1] - 1; sr += r; sr2 += r*r; m++; }
  const mean = sr/m, vol = Math.sqrt(Math.max(sr2/m - mean*mean, 0)) * Math.sqrt(252);
  const qcagr = Math.pow(qpx[n-1], 252/n) - 1;

  const step = Math.max(1, Math.floor(n / 700));
  const dsl = [], nsl = [], qsl = [], tsl = [];
  for (let i = 0; i < n; i += step) {
    dsl.push(dates[i]); nsl.push(+nav[i].toFixed(4));
    qsl.push(+qpx[i].toFixed(4)); tsl.push(+tpx[i].toFixed(4));
  }
  return {
    dates: dsl, nav: nsl, qqq: qsl, tqqq: tsl, n: n,
    events: { reb: reb, btd: nBtd, gate: nGate },
    metrics: { cagr: cagr*100, mdd: mdd*100, vol: vol*100, sharpe: vol ? (cagr-0.04)/vol : 0,
               calmar: mdd ? cagr/Math.abs(mdd) : 0, qqq: qcagr*100, mult: qcagr ? cagr/qcagr : 0 }
  };
}
