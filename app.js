// 手取りシミュレーター — UIロジック(状態管理・localStorage・描画)

const STORAGE_KEY = "taxSim.v1";

// デフォルト値(利用者プロフィール由来)
const DEFAULTS = {
  detailMode: false,
  salesMan: 700,          // 年間売上(万円)
  expensesMan: 100,       // 年間経費(万円)
  blueDeductionYen: 650000,
  idecoYen: 276000,       // 月23,000円×12
  kyosaiYen: 12000,       // 月1,000円×12
  shahoMonthlyYen: 15000, // 本人負担分の月額(設定で変更可)
  shahoExtraYen: 0,       // 特別枠: 国保切替前の保険料・年金未納の一括納付など(年額)
  lifeInsYen: 0,
  quakeInsYen: 0,
  otherDeductionYen: 0,
  dependentsUnder16: 2,   // 子2人(11歳・3歳)
};

let state = loadState();

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);

const modeSwitch = $("modeSwitch");
const modeLabel = $("modeLabel");
const detailFields = $("detailFields");

const inSales = $("inSales");
const inExpenses = $("inExpenses");
const inBlue = $("inBlue");
const inIdeco = $("inIdeco");
const inKyosai = $("inKyosai");
const inShaho = $("inShaho");
const inShahoExtra = $("inShahoExtra");
const inLifeIns = $("inLifeIns");
const inQuakeIns = $("inQuakeIns");
const inOther = $("inOther");

const outNet = $("outNet");
const outNetNote = $("outNetNote");
const outMonthlySave = $("outMonthlySave");
const outFurusato = $("outFurusato");
const outIncomeTax = $("outIncomeTax");
const outResidentTax = $("outResidentTax");
const outBusinessTax = $("outBusinessTax");
const outShaho = $("outShaho");
const rowShahoExtra = $("rowShahoExtra");
const outShahoExtra = $("outShahoExtra");
const outSavings = $("outSavings");
const outProcess = $("outProcess");

const settingsBtn = $("settingsBtn");
const settingsOverlay = $("settingsOverlay");
const settingsCloseBtn = $("settingsCloseBtn");
const setDependents = $("setDependents");
const resetBtn = $("resetBtn");

// ===== ユーティリティ =====
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return { ...DEFAULTS, ...saved };
  } catch (e) { /* 破損時はデフォルト */ }
  return { ...DEFAULTS };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* localStorage不可でも動作は継続 */ }
}

function fmt(yen) {
  return yen.toLocaleString("ja-JP") + "円";
}

function fmtMan(yen) {
  // 手取りなど大きい金額用: ○○○万円(小数1桁) + 円表記
  return (yen / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
}

// 入力文字列 → 数値(カンマ・全角対応)
function parseNum(str) {
  if (typeof str !== "string") return 0;
  const half = str.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const n = parseFloat(half.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

// 数値入力欄にカンマ区切りを適用しつつカーソル崩れを避ける(blur時のみ整形)
function attachNumericInput(el, getVal, setVal) {
  el.value = getVal().toLocaleString("ja-JP");
  el.addEventListener("input", () => {
    setVal(parseNum(el.value));
    saveState();
    render();
  });
  el.addEventListener("blur", () => {
    el.value = getVal().toLocaleString("ja-JP");
  });
}

// ===== 入力のバインド =====
attachNumericInput(inSales, () => state.salesMan, (v) => { state.salesMan = v; });
attachNumericInput(inExpenses, () => state.expensesMan, (v) => { state.expensesMan = v; });
attachNumericInput(inIdeco, () => state.idecoYen, (v) => { state.idecoYen = v; });
attachNumericInput(inKyosai, () => state.kyosaiYen, (v) => { state.kyosaiYen = v; });
attachNumericInput(inShaho, () => state.shahoMonthlyYen, (v) => { state.shahoMonthlyYen = v; });
attachNumericInput(inShahoExtra, () => state.shahoExtraYen, (v) => { state.shahoExtraYen = v; });
attachNumericInput(inLifeIns, () => state.lifeInsYen, (v) => { state.lifeInsYen = v; });
attachNumericInput(inQuakeIns, () => state.quakeInsYen, (v) => { state.quakeInsYen = v; });
attachNumericInput(inOther, () => state.otherDeductionYen, (v) => { state.otherDeductionYen = v; });

inBlue.value = String(state.blueDeductionYen);
inBlue.addEventListener("change", () => {
  state.blueDeductionYen = parseInt(inBlue.value, 10) || 0;
  saveState();
  render();
});

// ===== モード切替 =====
function applyMode() {
  modeSwitch.checked = state.detailMode;
  modeLabel.textContent = state.detailMode ? "詳細" : "簡易";
  detailFields.hidden = !state.detailMode;
}

modeSwitch.addEventListener("change", () => {
  state.detailMode = modeSwitch.checked;
  saveState();
  applyMode();
  // 詳細モードで入力した値は簡易モードに戻しても保持(stateを消さない)
});

// ===== 設定モーダル =====
settingsBtn.addEventListener("click", () => {
  setDependents.value = String(state.dependentsUnder16);
  settingsOverlay.hidden = false;
});
settingsCloseBtn.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});
setDependents.addEventListener("input", () => {
  state.dependentsUnder16 = Math.max(0, Math.floor(parseNum(setDependents.value)));
  saveState();
  render();
});

function closeSettings() {
  settingsOverlay.hidden = true;
}

// ===== リセット =====
resetBtn.addEventListener("click", () => {
  if (!confirm("すべての入力値をデフォルトに戻します。よろしいですか？")) return;
  state = { ...DEFAULTS };
  saveState();
  syncInputs();
  applyMode();
  render();
});

function syncInputs() {
  inSales.value = state.salesMan.toLocaleString("ja-JP");
  inExpenses.value = state.expensesMan.toLocaleString("ja-JP");
  inBlue.value = String(state.blueDeductionYen);
  inIdeco.value = state.idecoYen.toLocaleString("ja-JP");
  inKyosai.value = state.kyosaiYen.toLocaleString("ja-JP");
  inShaho.value = state.shahoMonthlyYen.toLocaleString("ja-JP");
  inShahoExtra.value = state.shahoExtraYen.toLocaleString("ja-JP");
  inLifeIns.value = state.lifeInsYen.toLocaleString("ja-JP");
  inQuakeIns.value = state.quakeInsYen.toLocaleString("ja-JP");
  inOther.value = state.otherDeductionYen.toLocaleString("ja-JP");
}

// ===== 計算・描画 =====
function render() {
  const r = calcTax({
    salesYen: state.salesMan * 10000,
    expensesYen: state.expensesMan * 10000,
    blueDeductionYen: state.blueDeductionYen,
    idecoYen: state.idecoYen,
    kyosaiYen: state.kyosaiYen,
    shahoMonthlyYen: state.shahoMonthlyYen,
    shahoExtraYen: state.shahoExtraYen,
    lifeInsYen: state.lifeInsYen,
    quakeInsYen: state.quakeInsYen,
    otherDeductionYen: state.otherDeductionYen,
    dependentsUnder16: state.dependentsUnder16,
  });

  outNet.textContent = fmt(r.netIncome);
  outNetNote.textContent = `売上${fmtMan(r.sales)} − 経費${fmtMan(r.expenses)} − 税金・社保・積立の合計`;

  outMonthlySave.textContent = "月 " + fmt(r.monthlySavings);

  outFurusato.textContent = r.furusatoLimit > 0 ? "〜" + fmt(r.furusatoLimit) : "—(住民税非課税)";

  outIncomeTax.textContent = fmt(r.incomeTax);
  outResidentTax.textContent = fmt(r.residentTax) + (r.residentExemptNote ? " ※" : "");
  outBusinessTax.textContent = fmt(r.businessTax);
  outShaho.textContent = fmt(r.shahoAnnual) + `(月${fmt(state.shahoMonthlyYen)})`;
  rowShahoExtra.hidden = r.shahoExtra <= 0;
  outShahoExtra.textContent = fmt(r.shahoExtra);
  outSavings.textContent = fmt(r.savingsAnnual);

  outProcess.innerHTML = buildProcessHtml(r);
}

function row(label, value, formula) {
  return `<tr><td>${label}${formula ? `<br><span class="formula">${formula}</span>` : ""}</td><td>${value}</td></tr>`;
}

function buildProcessHtml(r) {
  let html = "";

  html += `<h3>1. 事業所得(合計所得金額)</h3><table>`;
  html += row("売上 − 経費", fmt(r.incomeBeforeBlue));
  html += row("青色申告特別控除", "−" + fmt(r.blueApplied));
  html += row("<b>合計所得金額</b>", "<b>" + fmt(r.businessIncome) + "</b>");
  html += `</table>`;

  html += `<h3>2. 所得税(令和8年分)</h3><table>`;
  html += row("社会保険料控除", fmt(r.socialInsDeduction), r.shahoExtra > 0 ? `健保+厚年 月額×12(${fmt(r.shahoAnnual)}) + 特別枠(${fmt(r.shahoExtra)})` : "健保+厚年 月額×12");
  html += row("小規模企業共済等掛金控除", fmt(r.kyosaiDeduction), "iDeCo+共済");
  if (r.lifeIns) html += row("生命保険料控除", fmt(r.lifeIns));
  if (r.quakeIns) html += row("地震保険料控除", fmt(r.quakeIns));
  if (r.other) html += row("その他の控除", fmt(r.other));
  html += row("基礎控除", fmt(r.basicDeductionIT), "合計所得に応じ最大95万(令和8年分)");
  html += row("課税所得", fmt(r.taxableIT), "千円未満切捨て");
  html += row("基準所得税額", fmt(r.baseIT), "速算表(5〜45%)");
  html += row("復興特別所得税", fmt(r.reconstructionTax), "基準税額×2.1%");
  html += row("<b>所得税合計</b>", "<b>" + fmt(r.incomeTax) + "</b>", "100円未満切捨て");
  html += `</table>`;

  html += `<h3>3. 住民税(尼崎市)</h3><table>`;
  html += row("基礎控除", fmt(r.basicDeductionRT), "住民税は43万円(所得税と異なる)");
  html += row("課税所得", fmt(r.taxableRT));
  if (r.residentExemptNote) {
    html += row("非課税判定", r.residentExemptNote, `均等割の限度額: ${fmt(r.uniformNonTaxableLimit)}(扶養${r.dependents}人)`);
  }
  html += row("所得割", fmt(r.residentIncomeLevy), "課税所得×10% − 調整控除" + fmt(r.adjustmentCredit));
  html += row("均等割", fmt(r.residentUniform), "市3,000+県1,800(緑税込)+森林環境税1,000");
  html += row("<b>住民税合計</b>", "<b>" + fmt(r.residentTax) + "</b>");
  html += `</table>`;

  html += `<h3>4. 個人事業税(兵庫県・請負業5%)</h3><table>`;
  html += row("課税標準", fmt(r.businessTaxBase), "合計所得+青色控除の加算戻し−事業主控除290万");
  html += row("<b>個人事業税</b>", "<b>" + fmt(r.businessTax) + "</b>", "×5%(翌年の経費に算入可)");
  html += `</table>`;

  html += `<h3>5. ふるさと納税の目安上限</h3><table>`;
  if (r.furusatoLimit > 0) {
    html += row("住民税所得割×20%", fmt(Math.floor(r.residentIncomeLevy * 0.2)), "特例控除の上限");
    html += row("÷ (90% − 所得税率" + r.furusatoRatePct + "%×1.021) + 2,000円", "", "特例控除率で割り戻し");
    html += row("<b>目安上限額</b>", "<b>〜" + fmt(r.furusatoLimit) + "</b>", "千円未満切捨て(安全側)");
  } else {
    html += row("住民税所得割が0のため", "メリットなし");
  }
  html += `</table>`;

  html += `<h3>6. 手取り</h3><table>`;
  html += row("売上 − 経費", fmt(r.sales - r.expenses));
  html += row("税金合計(積立対象)", "−" + fmt(r.annualTaxForSavings));
  html += row("社会保険料", "−" + fmt(r.shahoAnnual));
  if (r.shahoExtra > 0) html += row("社会保険料(特別枠)", "−" + fmt(r.shahoExtra), "国保切替前・年金未納の一括納付など");
  html += row("iDeCo+共済", "−" + fmt(r.savingsAnnual), "将来自分が受け取る積立");
  html += row("<b>年間手取り</b>", "<b>" + fmt(r.netIncome) + "</b>");
  html += `</table>`;

  html += `<p class="formula" style="margin-top:10px">税率・料率の確認日: ${TAX_CONSTANTS.verifiedOn}(出典はtax.js内に記載)</p>`;
  return html;
}

// ===== 初期化 =====
syncInputs();
applyMode();
render();
