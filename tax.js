// 手取りシミュレーター — 税計算ロジック(純粋関数)
// 入力オブジェクト → 計算結果オブジェクト。DOMには一切触れない。
//
// ============================================================
// 税率・料率の定数(令和8年分/令和8年度ベース)
// 確認日: 2026-07-03 (Web検索により一次情報で確認)
// 毎年の更新はこの TAX_CONSTANTS だけ差し替えれば済む設計。
// ============================================================
const TAX_CONSTANTS = {
  verifiedOn: "2026-07-03",

  // ---- 所得税 ----
  incomeTax: {
    // 速算表(令和8年分。令和7年度改正で税率表自体の変更なし)
    // 出典: 国税庁 タックスアンサー No.2260 所得税の税率
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
    brackets: [
      { upTo: 1949000, rate: 0.05, deduction: 0 },
      { upTo: 3299000, rate: 0.10, deduction: 97500 },
      { upTo: 6949000, rate: 0.20, deduction: 427500 },
      { upTo: 8999000, rate: 0.23, deduction: 636000 },
      { upTo: 17999000, rate: 0.33, deduction: 1536000 },
      { upTo: 39999000, rate: 0.40, deduction: 2796000 },
      { upTo: Infinity, rate: 0.45, deduction: 4796000 },
    ],
    // 復興特別所得税: 基準所得税額×2.1%(平成25年分〜令和19年分)
    // 出典: 国税庁 復興特別所得税のあらまし
    // https://www.nta.go.jp/publication/pamph/shotoku/fukko_tokubetsu/index.htm
    reconstructionSurtaxRate: 0.021,
    // 基礎控除(令和8年分): 令和7年度改正で58万円ベース+所得帯上乗せ。
    // 132万超〜655万以下の上乗せ(88万/68万/63万)は令和7・8年分限定の時限措置。
    // 令和9年分以降はこの帯がすべて58万円に下がる点に注意して毎年見直すこと。
    // 出典: 国税庁 タックスアンサー No.1199 基礎控除
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm
    // https://www.nta.go.jp/users/gensen/2025kiso/index.htm
    basicDeductionBrackets: [
      { incomeUpTo: 1320000, deduction: 950000 },   // 合計所得132万以下: 恒久(58万+37万)
      { incomeUpTo: 3360000, deduction: 880000 },   // 336万以下: R7・R8限定
      { incomeUpTo: 4890000, deduction: 680000 },   // 489万以下: R7・R8限定
      { incomeUpTo: 6550000, deduction: 630000 },   // 655万以下: R7・R8限定
      { incomeUpTo: 23500000, deduction: 580000 },  // 2,350万以下: 恒久
      { incomeUpTo: 24000000, deduction: 480000 },
      { incomeUpTo: 24500000, deduction: 320000 },
      { incomeUpTo: 25000000, deduction: 160000 },
      { incomeUpTo: Infinity, deduction: 0 },
    ],
  },

  // ---- 住民税(兵庫県尼崎市) ----
  residentTax: {
    // 所得割: 市民税6%+県民税4%=10%
    // 均等割: 市民税3,000円+県民税1,800円(県民緑税800円含む・令和8〜12年度に延長済)
    //         +森林環境税(国税)1,000円 = 年5,800円
    // 出典: 尼崎市 均等割額及び所得割額並びに森林環境税額について
    // https://www.city.amagasaki.hyogo.jp/kurashi/zei/siminzei/siminzei_kojin/1003443/1003444.html
    // 兵庫県 県民緑税 https://web.pref.hyogo.lg.jp/kk22/pa04_000000001.html
    incomeRate: 0.10,
    uniformYen: 5800,
    // 住民税の基礎控除は43万円のまま(所得税の令和7年度改正は住民税に波及していない)
    // 合計所得2,400万円超は逓減するが本アプリの想定所得では43万固定で扱う
    basicDeductionYen: 430000,
    // 調整控除: 基礎控除の人的控除差5万円。
    // 課税所得200万以下: min(人的控除差, 課税所得)×5%
    // 200万超: max({人的控除差−(課税所得−200万)}×5%, 2,500円)
    // 出典: 神戸市 調整控除 https://www.city.kobe.lg.jp/a83576/kurashi/tax/shikenminze/syotoku/cyouseikoujyo.html
    personalDeductionDiff: 50000,
    adjustmentCreditMin: 2500,
    // 非課税限度額(尼崎市は1級地)。16歳未満の扶養親族も人数に含める。
    // 均等割非課税: 合計所得 ≤ 35万×(本人+扶養)+10万+21万(扶養ありのみ加算)
    // 所得割非課税: 総所得   ≤ 35万×(本人+扶養)+10万+32万
    // 出典: 東京都主税局 個人住民税 https://www.tax.metro.tokyo.lg.jp/kazei/life/kojin_ju
    nonTaxable: {
      perPersonYen: 350000,
      uniformAddYen: 100000,
      uniformDependentAddYen: 210000,
      incomeLevyAddYen: 100000,
      incomeLevyDependentAddYen: 320000,
    },
  },

  // ---- 個人事業税(兵庫県) ----
  businessTax: {
    // マルチヘルパー(店舗の販売支援・運営サポートを業務委託で請け負う業務)は
    // 第1種事業「請負業」として5%と判定。
    // 根拠: 兵庫県の法定業種一覧で請負業は第1種(5%)。業務委託契約に基づき
    // 特定店舗に出向いて業務を遂行し対価を得る形態は請負業として認定されるのが
    // 実務上の標準的な取扱い(神奈川県の請負業判定4要件とも整合)。
    // 最終的な業種認定は県税事務所が契約実態に基づいて行う。
    // 出典: 兵庫県 個人事業税 https://web.pref.hyogo.lg.jp/kk22/pa04_000000007.html
    //       神奈川県 個人事業税の請負業 https://www.pref.kanagawa.jp/zei/kenzei/a001/b004/002.html
    rate: 0.05,
    // 事業主控除: 年290万円(通年営業前提)
    ownerDeductionYen: 2900000,
    // 青色申告特別控除は個人事業税には適用されない(計算時に加算し戻す)
  },
};

// ============================================================
// 計算ヘルパー
// ============================================================

// 千円未満切捨て(課税所得の端数処理)
function floorThousand(yen) {
  return Math.floor(yen / 1000) * 1000;
}

// 100円未満切捨て(税額の端数処理)
function floorHundred(yen) {
  return Math.floor(yen / 100) * 100;
}

// 所得税の基礎控除額(合計所得金額に応じて決まる)
function incomeTaxBasicDeduction(totalIncome) {
  for (const b of TAX_CONSTANTS.incomeTax.basicDeductionBrackets) {
    if (totalIncome <= b.incomeUpTo) return b.deduction;
  }
  return 0;
}

// 所得税の速算表適用(復興税抜きの基準所得税額)
function incomeTaxBase(taxableIncome) {
  for (const b of TAX_CONSTANTS.incomeTax.brackets) {
    if (taxableIncome <= b.upTo) {
      return Math.max(0, taxableIncome * b.rate - b.deduction);
    }
  }
  return 0;
}

// 所得税の限界税率(ふるさと納税の特例控除率の計算に使用)
function marginalIncomeTaxRate(taxableIncome) {
  for (const b of TAX_CONSTANTS.incomeTax.brackets) {
    if (taxableIncome <= b.upTo) return b.rate;
  }
  return 0.45;
}

// ふるさと納税の目安上限額(自己負担2,000円で済む寄付額)
// 上限 = 住民税所得割額×20% ÷ (90% − 所得税率×1.021) + 2,000円
// 所得税率は寄付金控除後の課税所得の限界税率が正式なため、1回だけ再判定して
// 低い方の税率を使う(低い税率ほど上限が小さく安全側になる)。千円未満切捨て。
function furusatoLimitYen(residentIncomeLevy, taxableIT) {
  if (residentIncomeLevy <= 0) return { limit: 0, ratePct: 0 };
  const surtax = 1 + TAX_CONSTANTS.incomeTax.reconstructionSurtaxRate; // 1.021
  let rate = marginalIncomeTaxRate(taxableIT);
  let limit = (residentIncomeLevy * 0.2) / (0.9 - rate * surtax) + 2000;
  // 寄付金控除で課税所得が下の税率帯に落ちる場合は安全側で再計算
  const rate2 = marginalIncomeTaxRate(Math.max(0, taxableIT - (limit - 2000)));
  if (rate2 < rate) {
    rate = rate2;
    limit = (residentIncomeLevy * 0.2) / (0.9 - rate * surtax) + 2000;
  }
  return { limit: Math.floor(limit / 1000) * 1000, ratePct: rate * 100 };
}

// ============================================================
// メイン計算関数
// input: {
//   salesYen, expensesYen,           // 年間売上・経費(円)
//   blueDeductionYen,                // 青色申告特別控除(650000/550000/100000/0)
//   idecoYen, kyosaiYen,             // iDeCo・小規模企業共済の年額(円)
//   shahoMonthlyYen,                 // 社会保険料の月額(円・本人負担分)
//   shahoExtraYen,                   // 社会保険料控除の特別枠(年額円)。
//                                    // 国保→社保切替前に払った国民健康保険料や
//                                    // 国民年金の未納分の一括納付など、月額×12に
//                                    // 含まれない今年支払った社会保険料。
//   lifeInsYen, quakeInsYen,         // 生命保険料控除・地震保険料控除(円)
//   otherDeductionYen,               // その他の所得控除(円)
//   dependentsUnder16,               // 16歳未満の扶養親族の人数
// }
// ============================================================
function calcTax(input) {
  const C = TAX_CONSTANTS;

  const sales = Math.max(0, input.salesYen || 0);
  const expenses = Math.max(0, input.expensesYen || 0);
  const ideco = Math.max(0, input.idecoYen || 0);
  const kyosai = Math.max(0, input.kyosaiYen || 0);
  const shahoAnnual = Math.max(0, (input.shahoMonthlyYen || 0) * 12);
  const shahoExtra = Math.max(0, input.shahoExtraYen || 0);
  const lifeIns = Math.max(0, input.lifeInsYen || 0);
  const quakeIns = Math.max(0, input.quakeInsYen || 0);
  const other = Math.max(0, input.otherDeductionYen || 0);
  const dependents = Math.max(0, input.dependentsUnder16 || 0);

  // ---- 1. 事業所得 ----
  const incomeBeforeBlue = Math.max(0, sales - expenses);
  // 青色申告特別控除は控除前所得が上限(赤字に控除は使えない)
  const blueApplied = Math.min(Math.max(0, input.blueDeductionYen || 0), incomeBeforeBlue);
  const businessIncome = incomeBeforeBlue - blueApplied; // = 合計所得金額

  // ---- 2. 所得控除(共通部分) ----
  // 社会保険料控除 = 月額×12 + 特別枠(国保切替前の保険料・年金未納の一括納付など)
  const socialInsDeduction = shahoAnnual + shahoExtra;
  const kyosaiDeduction = ideco + kyosai; // 小規模企業共済等掛金控除(全額)
  const commonDeductions = socialInsDeduction + kyosaiDeduction + lifeIns + quakeIns + other;

  // ---- 3. 所得税 ----
  const basicDeductionIT = incomeTaxBasicDeduction(businessIncome);
  const deductionsIT = commonDeductions + basicDeductionIT;
  const taxableIT = floorThousand(Math.max(0, businessIncome - deductionsIT));
  const baseIT = incomeTaxBase(taxableIT);
  const reconstructionTax = baseIT * C.incomeTax.reconstructionSurtaxRate;
  const incomeTax = floorHundred(baseIT + reconstructionTax);

  // ---- 4. 住民税 ----
  // 非課税判定(尼崎市=1級地・16歳未満の扶養親族も人数に含める)
  const NT = C.residentTax.nonTaxable;
  const familySize = 1 + dependents;
  const uniformNonTaxableLimit =
    NT.perPersonYen * familySize + NT.uniformAddYen + (dependents > 0 ? NT.uniformDependentAddYen : 0);
  const incomeLevyNonTaxableLimit =
    NT.perPersonYen * familySize + NT.incomeLevyAddYen + (dependents > 0 ? NT.incomeLevyDependentAddYen : 0);

  const basicDeductionRT = C.residentTax.basicDeductionYen;
  const deductionsRT = commonDeductions + basicDeductionRT;
  const taxableRT = floorThousand(Math.max(0, businessIncome - deductionsRT));

  // 調整控除
  const diff = C.residentTax.personalDeductionDiff;
  let adjustmentCredit;
  if (taxableRT <= 2000000) {
    adjustmentCredit = Math.min(diff, taxableRT) * 0.05;
  } else {
    adjustmentCredit = Math.max((diff - (taxableRT - 2000000)) * 0.05, C.residentTax.adjustmentCreditMin);
  }
  adjustmentCredit = Math.floor(adjustmentCredit);

  let residentIncomeLevy = 0;
  let residentUniform = 0;
  let residentExemptNote = "";
  if (businessIncome <= uniformNonTaxableLimit) {
    residentExemptNote = "合計所得が非課税限度額以下のため住民税は非課税";
  } else if (businessIncome <= incomeLevyNonTaxableLimit) {
    residentUniform = C.residentTax.uniformYen;
    residentExemptNote = "所得割は非課税(均等割のみ課税)";
  } else {
    residentIncomeLevy = floorHundred(Math.max(0, taxableRT * C.residentTax.incomeRate - adjustmentCredit));
    residentUniform = C.residentTax.uniformYen;
  }
  const residentTax = residentIncomeLevy + residentUniform;

  // ---- 5. 個人事業税 ----
  // 青色申告特別控除は適用されないため加算し戻す。他の所得控除も適用なし。
  const businessTaxBase = Math.max(0, businessIncome + blueApplied - C.businessTax.ownerDeductionYen);
  const businessTax = floorHundred(businessTaxBase * C.businessTax.rate);

  // ---- 6. ふるさと納税の目安上限額 ----
  const furusato = furusatoLimitYen(residentIncomeLevy, taxableIT);

  // ---- 7. 積立額・手取り ----
  const annualTaxForSavings = incomeTax + residentTax + businessTax;
  // 千円単位切上げ
  const monthlySavings = Math.ceil(annualTaxForSavings / 12 / 1000) * 1000;

  const savingsAnnual = ideco + kyosai; // 将来受け取れる積立
  // 特別枠(国保・年金追納など)も今年の実支出として手取りから差し引く
  const netIncome = sales - expenses - annualTaxForSavings - shahoAnnual - shahoExtra - savingsAnnual;

  return {
    // 入力の正規化値
    sales, expenses, shahoAnnual, shahoExtra, ideco, kyosai, dependents,
    // 事業所得
    incomeBeforeBlue, blueApplied, businessIncome,
    // 所得控除
    socialInsDeduction, kyosaiDeduction, lifeIns, quakeIns, other,
    basicDeductionIT, deductionsIT,
    basicDeductionRT, deductionsRT,
    // 所得税
    taxableIT, baseIT: Math.floor(baseIT), reconstructionTax: Math.floor(reconstructionTax), incomeTax,
    // 住民税
    taxableRT, adjustmentCredit, residentIncomeLevy, residentUniform, residentTax, residentExemptNote,
    uniformNonTaxableLimit, incomeLevyNonTaxableLimit,
    // 個人事業税
    businessTaxBase, businessTax,
    // ふるさと納税
    furusatoLimit: furusato.limit, furusatoRatePct: furusato.ratePct,
    // まとめ
    annualTaxForSavings, monthlySavings, savingsAnnual, netIncome,
  };
}

// Node.jsテスト用(ブラウザでは無視される)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { TAX_CONSTANTS, calcTax };
}
