/**
 * Format number to Korean currency units (억/만원/원)
 * Examples:
 * - 120000000 -> "1억 2,000만원"
 * - 8230000 -> "823만원"
 * - 532000 -> "53만원" or "532,000원"
 */
export function formatKoreanMoney(amount: number): string {
  if (amount === 0) return "0원"

  const absAmount = Math.abs(amount)
  const sign = amount < 0 ? "-" : ""

  const eok = Math.floor(absAmount / 100000000) // 억 (100,000,000)
  const man = Math.floor((absAmount % 100000000) / 10000) // 만 (10,000)
  const won = absAmount % 10000 // 원

  const parts: string[] = []

  if (eok > 0) {
    parts.push(`${eok.toLocaleString()}억`)
  }

  if (man > 0) {
    parts.push(`${man.toLocaleString()}만원`)
  } else if (eok > 0) {
    // If we have 억 but no 만, still add 원 suffix
    if (won > 0) {
      parts.push(`${won.toLocaleString()}원`)
    } else {
      // Replace 만원 with nothing, just show 억
      if (parts.length > 0 && !parts[parts.length - 1].includes("원")) {
        parts[parts.length - 1] = parts[parts.length - 1]
      }
    }
  }

  if (eok === 0 && man === 0 && won > 0) {
    parts.push(`${won.toLocaleString()}원`)
  }

  // Clean up: if only 억, add 원 at the end
  if (parts.length === 1 && parts[0].endsWith("억")) {
    parts[0] = parts[0] + "원"
  }

  // Handle case where we have 억 and 만
  if (parts.length > 0) {
    const result = parts.join(" ")
    // Ensure we end with 원
    if (!result.endsWith("원")) {
      return sign + result + "원"
    }
    return sign + result
  }

  return sign + "0원"
}

/**
 * Format phone number with masking
 * Example: 01012345678 -> 010-****-5678
 */
export function formatPhoneMasked(phone: string): string {
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-****-${cleaned.slice(7)}`
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-***-${cleaned.slice(6)}`
  }
  return phone
}

/**
 * Format phone number without masking (full number)
 * Example: 01012345678 -> 010-1234-5678
 */
export function formatPhone(phone: string | null | undefined): string {
  // null/undefined/빈 문자열 방어
  if (!phone) return "-"

  const cleaned = String(phone).replace(/\D/g, "")

  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }

  // 숫자만 남긴 게 비었으면 '-' 처리
  return cleaned.length ? cleaned : "-"
}

/**
 * Format date to Korean format
 */
export function formatKoreanDate(date: Date | string | null | undefined): string {
  // null/undefined/빈문자열 방어
  if (!date) return "-"

  const d = typeof date === "string" ? new Date(date) : date

  // Invalid Date 방어
  if (!(d instanceof Date) || isNaN(d.getTime())) return "-"

  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Format date range
 */
export function formatDateRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): string {
  const s = formatKoreanDate(start)
  const e = formatKoreanDate(end)

  if (s === "-" && e === "-") return "-"
  return `${s} - ${e}`
}
