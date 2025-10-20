import { NextResponse } from "next/server"
import OpenAI from "openai"

import { getIntensityProfile } from "@/lib/argument-intensity"

interface ArgueRequestBody {
  opponentText?: unknown
  intensity?: unknown
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

function normalizeContent(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
  }
  return trimmed
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ArgueRequestBody
  const opponentText = typeof body.opponentText === "string" ? body.opponentText.trim() : ""
  const intensityValue = Number(body.intensity)
  const intensity = Number.isFinite(intensityValue) ? Math.min(Math.max(Math.round(intensityValue), 1), 10) : 5

  if (!opponentText) {
    return NextResponse.json(
      { error: "请先告诉我对方说了什么，我们才能帮你回击。" },
      { status: 400 }
    )
  }

  const profile = getIntensityProfile(intensity)
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: "服务器未正确配置 OpenRouter API Key。" },
      { status: 500 }
    )
  }

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
  })

  try {
    const completion = await client.chat.completions.create({
      model: "deepseek/deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "你是一名舌战高手，能够根据强度调整语气，输出中文吵架台词。请保持机智、犀利但不进行人身攻击或辱骂。",
        },
        {
          role: "user",
          content: [
            `对方说：${opponentText}`,
            `当前语气强烈程度：${intensity}（${profile.tone}，${profile.strategy}）`,
            "请给出 3 条不重复的回击，每条长度 25 到 80 个汉字。",
            "输出 JSON 数组格式，例如:[\"回击1\", \"回击2\", \"回击3\"]，不要添加额外文字或注释。",
          ].join("\n"),
        },
      ],
      temperature: 0.8,
      max_tokens: 600,
    })

    const content = completion.choices[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: "大模型没有返回内容，请稍后再试。" },
        { status: 502 }
      )
    }

    const normalized = normalizeContent(content)
    let replies: string[] | null = null

    try {
      const parsed = JSON.parse(normalized)
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        replies = parsed.slice(0, 3)
      }
    } catch (error) {
      replies = null
    }

    if (!replies) {
      const fallback = normalized
        .split(/\n+/)
        .map((line) => line.replace(/^[-\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 3)

      if (fallback.length === 0) {
        return NextResponse.json(
          { error: "解析大模型回复失败，请重试。" },
          { status: 502 }
        )
      }

      replies = fallback
    }

    return NextResponse.json({
      replies,
      meta: {
        intensity,
        tone: profile.tone,
        strategy: profile.strategy,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "调用大模型失败，请稍后再试。" },
      { status: 502 }
    )
  }
}
