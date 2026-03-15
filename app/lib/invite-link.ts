type LinkCandidate = {
  href: string
  text: string
  context: string
  score: number
}

const POSITIVE_TEXT_PATTERNS = [
  /join workspace/i,
  /accept invitation/i,
  /accept invite/i,
  /join team/i,
  /view invitation/i,
]

const POSITIVE_CONTEXT_PATTERNS = [
  /accept your invitation/i,
  /join the workspace/i,
  /invited you to collaborate/i,
  /join the team/i,
  /join using the email address/i,
]

const NEGATIVE_TEXT_PATTERNS = [
  /contact us/i,
  /help/i,
  /support/i,
  /privacy/i,
  /terms/i,
  /unsubscribe/i,
]

const NEGATIVE_HREF_PATTERNS = [
  /\/collections\//i,
  /help/i,
  /support/i,
  /privacy/i,
  /terms/i,
  /unsubscribe/i,
]

const POSITIVE_HREF_PATTERNS = [
  /accept_wid=/i,
  /[?&]wId=/i,
  /[?&]inv_email=/i,
  /chatgpt\.com\/auth\/login/i,
]

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeText(value: string): string {
  return stripHtml(value).toLowerCase()
}

function isBlockedHref(href: string): boolean {
  if (!href || href.startsWith("mailto:") || href.startsWith("javascript:")) {
    return true
  }

  return NEGATIVE_HREF_PATTERNS.some(pattern => pattern.test(href))
}

function scoreCandidate(href: string, text: string, context: string): number {
  if (isBlockedHref(href)) {
    return Number.NEGATIVE_INFINITY
  }

  if (NEGATIVE_TEXT_PATTERNS.some(pattern => pattern.test(text))) {
    return Number.NEGATIVE_INFINITY
  }

  let score = 0

  for (const pattern of POSITIVE_TEXT_PATTERNS) {
    if (pattern.test(text)) {
      score += 100
    }
  }

  for (const pattern of POSITIVE_CONTEXT_PATTERNS) {
    if (pattern.test(context)) {
      score += 40
    }
  }

  for (const pattern of POSITIVE_HREF_PATTERNS) {
    if (pattern.test(href)) {
      score += 80
    }
  }

  if (/invite|invitation/i.test(text)) {
    score += 30
  }

  if (/join/i.test(text)) {
    score += 20
  }

  if (/workspace|team/i.test(text)) {
    score += 20
  }

  return score
}

function extractAnchorCandidates(html: string): LinkCandidate[] {
  const candidates: LinkCandidate[] = []
  const anchorRegex = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi

  for (const match of html.matchAll(anchorRegex)) {
    const [, , rawHref, rawText] = match
    const href = decodeHtmlEntities(rawHref).trim()
    const text = normalizeText(rawText)
    const index = match.index ?? 0
    const contextStart = Math.max(0, index - 240)
    const contextEnd = Math.min(html.length, index + match[0].length + 240)
    const context = normalizeText(html.slice(contextStart, contextEnd))
    const score = scoreCandidate(href, text, context)

    if (score > 0) {
      candidates.push({ href, text, context, score })
    }
  }

  return candidates
}

function extractPlainTextCandidates(content: string): LinkCandidate[] {
  const candidates: LinkCandidate[] = []
  const urlRegex = /https?:\/\/[^\s<>()]+/gi

  for (const match of content.matchAll(urlRegex)) {
    const href = match[0]
    const index = match.index ?? 0
    const contextStart = Math.max(0, index - 160)
    const contextEnd = Math.min(content.length, index + href.length + 160)
    const context = content.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim().toLowerCase()
    const score = scoreCandidate(href, "", context)

    if (score > 0) {
      candidates.push({ href, text: "", context, score })
    }
  }

  return candidates
}

export function extractInviteLinks(html?: string | null, content?: string | null): string[] {
  const candidates = [
    ...extractAnchorCandidates(html ?? ""),
    ...extractPlainTextCandidates(content ?? ""),
  ]

  const seen = new Set<string>()

  return candidates
    .sort((left, right) => right.score - left.score)
    .filter(candidate => {
      if (seen.has(candidate.href)) {
        return false
      }
      seen.add(candidate.href)
      return true
    })
    .map(candidate => candidate.href)
}

export function extractPrimaryInviteLink(html?: string | null, content?: string | null): string | null {
  return extractInviteLinks(html, content)[0] ?? null
}
