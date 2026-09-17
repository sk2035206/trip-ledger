import { extractBillClockTime, extractBillDate } from "./bill-time";

export type LedgerImportDraft = {
  id: string;
  title: string;
  rawType: string;
  category: string;
  amount: number;
  billTime: string;
  note: string;
  selected: boolean;
};

const fallbackCategory = "其他";
const screenshotTypeLabels = ["酒店住宿", "饮食玩乐", "美食特产", "景点门票", "旅行交通", "打车出行"];
const categoryAliases: Array<{ category: string; keywords: string[] }> = [
  { category: "酒店", keywords: ["酒店", "住宿", "宾馆", "民宿", "客栈"] },
  { category: "吃玩", keywords: ["饮食", "玩乐", "美食", "特产", "餐饮", "饭店", "餐厅", "小吃", "奶茶"] },
  { category: "交通", keywords: ["交通", "打车", "出行", "滴滴", "铁路", "火车", "高铁", "机票", "车票"] },
  { category: "门票", keywords: ["门票", "景点", "索道", "缆车", "扶梯", "栈道"] },
];

export function parseLedgerImportText(text: string, categories: string[], fallbackYear = new Date().getFullYear()) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeImportLine)
    .filter(Boolean);
  const drafts: LedgerImportDraft[] = [];
  let currentDate = "";
  let leadingLines: string[] = [];
  let pendingBlock: { lines: string[]; amount: number } | null = null;

  function commitPendingBlock() {
    if (!pendingBlock) return;
    const draft = parseExpenseBlock(pendingBlock.lines, pendingBlock.amount, currentDate, categories);
    if (draft) drafts.push({ ...draft, id: `import-${drafts.length + 1}` });
    pendingBlock = null;
  }

  lines.forEach((line) => {
    const date = extractBillDate(line, fallbackYear);
    if (date) {
      commitPendingBlock();
      currentDate = date;
      leadingLines = [];
      return;
    }
    if (isNoiseLine(line)) return;

    const amount = extractExpenseAmount(line);
    if (amount) {
      commitPendingBlock();
      pendingBlock = { lines: [...leadingLines, line], amount };
      leadingLines = [];
      return;
    }

    if (pendingBlock) {
      if (isExpenseDetailLine(line)) {
        pendingBlock.lines.push(line);
      } else {
        commitPendingBlock();
        leadingLines = [line];
      }
      return;
    }

    leadingLines.push(line);
  });

  commitPendingBlock();

  return drafts;
}

export function resolveLedgerImportCategory(rawType: string, title: string, categories: string[]) {
  const available = normalizeCategoryOptions(categories);
  const raw = normalizeComparable(rawType);
  const searchable = normalizeComparable(`${rawType} ${title}`);
  const exactCategory = available.find(
    (category) => raw === normalizeComparable(category) || raw.includes(normalizeComparable(category)),
  );
  if (exactCategory) return exactCategory;

  const looseCategory = available.find((category) => {
    const normalized = normalizeComparable(category);
    return normalized.length > 1 && searchable.includes(normalized);
  });
  if (looseCategory) return looseCategory;

  for (const alias of categoryAliases) {
    const matched = alias.keywords.some((keyword) => searchable.includes(normalizeComparable(keyword)));
    if (!matched) continue;
    const category = available.find((item) => normalizeComparable(item) === normalizeComparable(alias.category));
    if (category) return category;
  }

  return available.find((category) => normalizeComparable(category) === normalizeComparable(fallbackCategory)) ?? fallbackCategory;
}

function parseExpenseBlock(lines: string[], amount: number, currentDate: string, categories: string[]) {
  const content = lines.map(stripExpenseAmount).join(" ");
  const rawTypeCandidate = extractRawType(content);
  const time = extractBillClockTime(content);
  const detail = extractDetail(content, rawTypeCandidate, time);
  const rawType = inferScreenshotType(rawTypeCandidate, detail);
  const title = detail || rawType || "未命名事项";
  const billTime = currentDate;
  const note = "";

  return {
    title,
    rawType: rawType || fallbackCategory,
    category: resolveLedgerImportCategory(rawType, title, categories),
    amount,
    billTime,
    note,
    selected: true,
  };
}

function normalizeImportLine(value: string) {
  return value
    .replace(/[－−–—]/g, "-")
    .replace(/[：]/g, ":")
    .replace(/[｜丨]/g, "|")
    .replace(/[“”‘’]/g, " ")
    .replace(/(\d{1,2}:\d{2})\s*[1Il]\s+(?=[\p{L}\p{N}])/gu, "$1 | ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function normalizeCategoryOptions(categories: string[]) {
  return Array.from(new Set([...categories.filter(Boolean), fallbackCategory]));
}

function extractExpenseAmount(line: string) {
  if (/^支\s*[0-9]/.test(line)) return 0;
  const match = line.match(/(?:^|\s)([-_]?)\s*([0-9]{1,8})(?:(?:[,.]\s*|\s+)([0-9]{1,2}))?\s*$/);
  if (!match) return 0;

  const marker = match[1];
  const whole = match[2];
  const decimal = match[3];
  if (decimal) return Math.abs(Number(`${whole}.${decimal.padEnd(2, "0")}`));
  if (marker && whole.length >= 4) return Math.abs(Number(`${whole.slice(0, -2)}.${whole.slice(-2)}`));
  return Math.abs(Number(whole));
}

function stripExpenseAmount(value: string) {
  return value
    .replace(/(?:^|\s)[-_]?\s*[0-9]{1,8}(?:(?:[,.]\s*|\s+)[0-9]{1,2})?\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRawType(value: string) {
  const normalized = normalizeComparable(value);
  const knownType = screenshotTypeLabels.find((label) => normalized.includes(normalizeComparable(label)));
  if (knownType) return knownType;

  const leading = value
    .split(/(?:微信|支付宝|自动记账|已自动记账|\d{1,2}:\d{2})/)[0]
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
  return leading.length > 12 ? leading.slice(0, 12) : leading;
}

function extractDetail(value: string, rawType: string, time: string) {
  const pipeDetail = value.split("|").map((part) => part.trim()).filter(Boolean).at(-1) ?? value;
  return pipeDetail
    .replace(rawType, " ")
    .replace(/(?:微信|支付宝)?自动记账/g, " ")
    .replace(/微信|支付宝/g, " ")
    .replace(time, " ")
    .replace(/^[,，.。:：\-|/\s]+|[,，.。:：\-|/\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function inferScreenshotType(rawType: string, detail: string) {
  if (screenshotTypeLabels.some((label) => normalizeComparable(rawType).includes(normalizeComparable(label)))) {
    return rawType;
  }

  const normalizedDetail = normalizeComparable(detail);
  if (/滴滴|网约车|出租车/.test(normalizedDetail)) return "打车出行";
  if (/铁路|火车|高铁|机场|航空/.test(normalizedDetail)) return "旅行交通";
  if (/索道|缆车|栈道|景点|门票/.test(normalizedDetail)) return "景点门票";
  if (/酒店|华住|全季|民宿|客栈|宾馆/.test(normalizedDetail)) return "酒店住宿";
  if (/餐厅|餐饮|美食|特产|小吃|奶茶/.test(normalizedDetail)) return "饮食玩乐";
  return rawType;
}

function isExpenseDetailLine(line: string) {
  return Boolean(extractBillClockTime(line)) || line.includes("|");
}

function isNoiseLine(line: string) {
  if (/^(总览|总支出|单笔均值|共计|编辑|旅行)$/.test(line)) return true;
  if (/^支\s*[0-9]/.test(line)) return true;
  const typeCount = screenshotTypeLabels.filter((label) => line.includes(label)).length;
  return typeCount >= 3 && !line.includes("-");
}
