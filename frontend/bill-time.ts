export function normalizeBillTime(value: string, fallbackYear = new Date().getFullYear()) {
  return extractBillDate(value, fallbackYear);
}

export function toBillTimeInputValue(value: string, fallbackYear = new Date().getFullYear()) {
  return normalizeBillTime(value, fallbackYear);
}

export function extractBillDate(value: string, fallbackYear = new Date().getFullYear()) {
  const chineseDate = value.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (chineseDate) {
    return formatDateParts(
      chineseDate[1] ? Number(chineseDate[1]) : fallbackYear,
      Number(chineseDate[2]),
      Number(chineseDate[3]),
    );
  }

  const standardDate = value.match(/(?:^|\D)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?=\D|$)/);
  if (!standardDate) return "";
  return formatDateParts(Number(standardDate[1]), Number(standardDate[2]), Number(standardDate[3]));
}

export function extractBillClockTime(value: string) {
  const match = value.match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?=\D|$)/);
  if (!match) return "";
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

function formatDateParts(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
