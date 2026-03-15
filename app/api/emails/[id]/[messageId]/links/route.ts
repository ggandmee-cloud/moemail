import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { getUserId } from "@/lib/apiKey"
import { createDb } from "@/lib/db"
import { emails, messages } from "@/lib/schema"
import { extractInviteLinks, extractPrimaryInviteLink } from "@/lib/invite-link"

export const runtime = "edge"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id, messageId } = await params
    const db = createDb()
    const userId = await getUserId()

    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "无权限查看" },
        { status: 403 }
      )
    }

    const message = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.emailId, id)
      )
    })

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      )
    }

    const links = extractInviteLinks(message.html, message.content)

    return NextResponse.json({
      inviteLink: extractPrimaryInviteLink(message.html, message.content),
      links,
      total: links.length
    })
  } catch (error) {
    console.error("Failed to extract message links:", error)
    return NextResponse.json(
      { error: "Failed to extract links" },
      { status: 500 }
    )
  }
}
