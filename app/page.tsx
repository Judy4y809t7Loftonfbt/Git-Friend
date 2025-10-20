"use client"

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"
import { CheckCircle2, Copy, Loader2, MessageCircle, ShieldCheck, Sparkles, Zap } from "lucide-react"

import {
  ARGUMENT_INTENSITY_LEVELS,
  ArgumentIntensityProfile,
  getIntensityProfile,
} from "@/lib/argument-intensity"

interface ArgueResponseMeta {
  intensity: number
  tone: string
  strategy: string
}

interface ArgueResponsePayload {
  replies: string[]
  meta?: ArgueResponseMeta
}

const STORAGE_KEY = "argument-master-session-v1"

const getSliderBackground = (intensity: number): string => {
  const percent = ((Math.min(Math.max(intensity, 1), 10) - 1) / 9) * 100
  return `linear-gradient(90deg, #07C160 0%, #07C160 ${percent}%, #E5E7EB ${percent}%, #E5E7EB 100%)`
}

const intensityToAccent = (intensity: number): string => {
  if (intensity >= 8) return "from-emerald-500 via-emerald-600 to-emerald-700"
  if (intensity >= 5) return "from-emerald-400 via-emerald-500 to-emerald-600"
  return "from-emerald-300 via-emerald-400 to-emerald-500"
}

const formatErrorMessage = (message: unknown): string => {
  if (typeof message === "string" && message.trim().length > 0) {
    return message
  }
  if (message instanceof Error && message.message) {
    return message.message
  }
  return "发生未知错误，请稍后重试。"
}

export default function FightClubPage() {
  const [opponentText, setOpponentText] = useState("")
  const [intensity, setIntensity] = useState<number>(5)
  const [replies, setReplies] = useState<string[]>([])
  const [meta, setMeta] = useState<ArgueResponseMeta | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentProfile = useMemo<ArgumentIntensityProfile>(
    () => getIntensityProfile(intensity),
    [intensity]
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        return
      }

      const parsed = JSON.parse(stored) as {
        opponentText?: unknown
        intensity?: unknown
        replies?: unknown
        meta?: unknown
      }

      if (typeof parsed.opponentText === "string") {
        setOpponentText(parsed.opponentText)
      }
      if (typeof parsed.intensity === "number") {
        setIntensity(getIntensityProfile(parsed.intensity).value)
      }
      if (Array.isArray(parsed.replies) && parsed.replies.every((item) => typeof item === "string")) {
        setReplies(parsed.replies)
      }
      if (
        parsed.meta &&
        typeof parsed.meta === "object" &&
        parsed.meta !== null &&
        "intensity" in parsed.meta &&
        "tone" in parsed.meta &&
        "strategy" in parsed.meta
      ) {
        const rawMeta = parsed.meta as ArgueResponseMeta
        setMeta({
          intensity: getIntensityProfile(rawMeta.intensity).value,
          tone: rawMeta.tone,
          strategy: rawMeta.strategy,
        })
      }
    } catch (storageError) {
      console.error("Failed to load session from localStorage", storageError)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    try {
      const payload = JSON.stringify({ opponentText, intensity, replies, meta })
      window.localStorage.setItem(STORAGE_KEY, payload)
    } catch (storageError) {
      console.error("Failed to persist session", storageError)
    }
  }, [opponentText, intensity, replies, meta])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!opponentText.trim()) {
        setError("请输入对方说的话，我们才能帮你怼回去。")
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/argue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ opponentText, intensity }),
        })

        const payload = (await response.json()) as ArgueResponsePayload | { error?: string }

        if (!response.ok) {
          const message = "error" in payload ? payload.error : "吵架小助手开小差了，请稍后再试。"
          throw new Error(message ?? undefined)
        }

        if (!Array.isArray(payload.replies) || payload.replies.length === 0) {
          throw new Error("大模型没有给出有效的回击，请再试一次。")
        }

        setReplies(payload.replies)
        if (payload.meta) {
          setMeta(payload.meta)
        } else {
          setMeta({ intensity, tone: currentProfile.tone, strategy: currentProfile.strategy })
        }
      } catch (requestError) {
        setError(formatErrorMessage(requestError))
      } finally {
        setIsLoading(false)
      }
    },
    [currentProfile.strategy, currentProfile.tone, intensity, opponentText]
  )

  const handleCopy = useCallback((reply: string, index: number) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setError("当前环境不支持复制功能，请手动选择文本。")
      return
    }

    navigator.clipboard
      .writeText(reply)
      .then(() => {
        setCopiedIndex(index)
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current)
        }
        copyTimeoutRef.current = setTimeout(() => {
          setCopiedIndex(null)
        }, 2000)
      })
      .catch((clipboardError) => {
        setError(formatErrorMessage(clipboardError))
      })
  }, [])

  const accentGradient = intensityToAccent(intensity)

  return (
    <main className="relative min-h-screen bg-[#F4F8F6] pb-16 text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-160px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-200/60 blur-3xl" />
        <div className="absolute right-[-120px] top-[220px] h-[320px] w-[320px] rounded-full bg-emerald-100/70 blur-3xl" />
        <div className="absolute bottom-[-140px] left-[-80px] h-[300px] w-[300px] rounded-full bg-emerald-300/50 blur-3xl" />
      </div>

      <header className="px-6 pt-16 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/60 px-4 py-1 text-sm font-medium text-emerald-600 shadow-sm backdrop-blur">
            <Sparkles className="h-4 w-4" /> 吵架包赢 · 微信同款配色
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            对方张嘴，我们秒回。
            <span className="block text-emerald-500">吵架包赢，一键反击。</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
            输入对方的话，拖动强度条，点击「开始吵架」，立刻生成 3 条高能回击。
            手机和电脑都能完美使用，随时随地气势拉满。
          </p>
          <div className="mt-8 grid gap-4 rounded-2xl bg-white/70 p-6 shadow-lg backdrop-blur-sm sm:grid-cols-3">
            <div className="flex flex-col items-center gap-2">
              <MessageCircle className="h-6 w-6 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-900">一键生成回击</p>
              <p className="text-xs text-slate-500">大模型深度定制，逻辑反杀。</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-900">10 档语气控制</p>
              <p className="text-xs text-slate-500">从温柔内涵到火力全开。</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Zap className="h-6 w-6 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-900">支持随身携带</p>
              <p className="text-xs text-slate-500">轻量设计，移动端体验友好。</p>
            </div>
          </div>
        </div>
      </header>

      <section className="px-6">
        <div className="mx-auto mt-12 grid max-w-5xl gap-8 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6 rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="opponent-text" className="text-sm font-medium text-slate-700">
                  对方的话
                </label>
                <textarea
                  id="opponent-text"
                  name="opponent-text"
                  placeholder="例：你又在瞎忙，工作一点价值都没有。"
                  className="h-40 w-full resize-none rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-200"
                  value={opponentText}
                  onChange={(event) => setOpponentText(event.target.value)}
                  maxLength={400}
                  required
                />
                <p className="text-right text-xs text-slate-400">最多 400 字</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">语气强烈程度</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {intensity} / 10 · {currentProfile.title}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={intensity}
                    onChange={(event) => setIntensity(Number(event.target.value))}
                    className="h-2 w-full appearance-none rounded-full"
                    style={{ background: getSliderBackground(intensity) }}
                  />
                  <div className="mt-3 flex justify-between text-[11px] text-slate-400">
                    <span>佛系</span>
                    <span>有理有据</span>
                    <span>说服力</span>
                    <span>火力全开</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-emerald-700">当前策略</p>
                  <p className="mt-1 text-slate-600">{currentProfile.tone}</p>
                  <p className="mt-1 text-slate-500">{currentProfile.strategy}</p>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                className={clsx(
                  "group relative inline-flex w-full items-center justify-center overflow-hidden rounded-2xl px-6 py-3 text-base font-semibold text-white shadow-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2",
                  "focus:ring-emerald-200 focus:ring-offset-emerald-50",
                  `bg-gradient-to-r ${accentGradient}`
                )}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    正在召唤金句...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    开始吵架
                  </span>
                )}
              </button>
            </form>

            <div className="rounded-2xl border border-emerald-100 bg-white/70 p-4 text-sm text-slate-600">
              <p className="flex items-center gap-2 font-semibold text-emerald-700">
                <ShieldCheck className="h-4 w-4" /> 使用提示
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-500">
                <li>合理描述对方的话，生成结果更精准。</li>
                <li>调整强度，确保语气符合你的场景。</li>
                <li>支持复制粘贴到聊天窗口，一键发射。</li>
              </ul>
            </div>
          </div>

          <aside className="space-y-4">
            <div className={clsx("rounded-3xl p-6 text-white shadow-xl", `bg-gradient-to-br ${accentGradient}`)}>
              <p className="text-sm uppercase tracking-[0.2em] text-white/80">当前状态</p>
              <h2 className="mt-3 text-2xl font-semibold">{currentProfile.title}</h2>
              <p className="mt-2 text-sm text-white/80">{currentProfile.summary}</p>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/20 p-3">
                  <p className="text-xs text-white/70">语气风格</p>
                  <p className="mt-1 font-semibold leading-snug">{meta?.tone ?? currentProfile.tone}</p>
                </div>
                <div className="rounded-2xl bg-white/20 p-3">
                  <p className="text-xs text-white/70">进攻策略</p>
                  <p className="mt-1 font-semibold leading-snug">{meta?.strategy ?? currentProfile.strategy}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <MessageCircle className="h-5 w-5 text-emerald-500" /> 回击成果
              </h3>
              {replies.length === 0 ? (
                <p className="mt-4 text-sm leading-relaxed text-slate-500">
                  还没有生成内容。填写上方信息，点击「开始吵架」即可解锁 3 条高能回复。
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {replies.map((reply, index) => (
                    <li
                      key={`reply-${index}`}
                      className="group rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm transition hover:border-emerald-200 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-emerald-700">招式 {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => handleCopy(reply, index)}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-600 transition hover:border-emerald-300 hover:text-emerald-700"
                        >
                          {copiedIndex === index ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" /> 已复制
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> 复制
                            </>
                          )}
                        </button>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-700">{reply}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl bg-white/60 p-6 text-xs text-slate-500 shadow-lg backdrop-blur">
              <p className="font-semibold text-slate-700">历史记录小提示</p>
              <p className="mt-2 leading-relaxed">
                你的最新输入和回击会自动保存在浏览器本地。换设备请重新输入，隐私无需担心。
              </p>
              <p className="mt-2 leading-relaxed">想换套路？随时调节强度或修改对方话术即可重新生成。</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="px-6">
        <div className="mx-auto mt-14 max-w-5xl rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg backdrop-blur">
          <h3 className="text-lg font-semibold text-slate-900">所有语气档位一览</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ARGUMENT_INTENSITY_LEVELS.map((level) => (
              <div
                key={level.value}
                className={clsx(
                  "flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-slate-600 transition hover:border-emerald-200 hover:bg-white",
                  level.value === currentProfile.value && "border-emerald-300 shadow-md"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-600">
                  {level.value}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{level.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{level.summary}</p>
                  <p className="mt-2 text-xs text-slate-500">{level.tone}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
