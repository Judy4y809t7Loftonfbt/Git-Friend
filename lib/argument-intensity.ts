export interface ArgumentIntensityProfile {
  value: number
  title: string
  tone: string
  strategy: string
  summary: string
}

export const ARGUMENT_INTENSITY_LEVELS: ArgumentIntensityProfile[] = [
  {
    value: 1,
    title: "轻声提醒",
    tone: "语气柔和但机智",
    strategy: "礼貌地指出问题，用幽默化解矛盾。",
    summary: "温和又不失锋芒",
  },
  {
    value: 2,
    title: "稳中带怼",
    tone: "轻松但坚持立场",
    strategy: "使用轻度反讽，强调逻辑漏洞。",
    summary: "微妙拐弯抹角",
  },
  {
    value: 3,
    title: "理智拆解",
    tone: "坚定且机智",
    strategy: "用事实反驳，并保持冷静。",
    summary: "逻辑与风度并存",
  },
  {
    value: 4,
    title: "犀利点破",
    tone: "犀利但克制",
    strategy: "指出对方矛盾点，并保持理性。",
    summary: "不动声色地反杀",
  },
  {
    value: 5,
    title: "凌厉反击",
    tone: "凌厉且具说服力",
    strategy: "用数据和例子反击。",
    summary: "信息量拉满",
  },
  {
    value: 6,
    title: "进攻姿态",
    tone: "强势且有力度",
    strategy: "结合嘲讽与事实，全面反驳。",
    summary: "气势逐渐压制",
  },
  {
    value: 7,
    title: "锋芒毕露",
    tone: "锋利且有压迫感",
    strategy: "精准戳中对方痛点，保持逻辑压制。",
    summary: "攻防一体",
  },
  {
    value: 8,
    title: "火力连发",
    tone: "狠辣且有节奏",
    strategy: "使用比喻和夸张手法，形成气势。",
    summary: "语速拉满",
  },
  {
    value: 9,
    title: "全面压制",
    tone: "火力全开",
    strategy: "逐条拆解对方观点，用毒舌回击。",
    summary: "不留退路",
  },
  {
    value: 10,
    title: "终极反杀",
    tone: "极致输出",
    strategy: "全面碾压，语言张力拉满但不涉及人身攻击。",
    summary: "压轴大招",
  },
]

export const getIntensityProfile = (value: number): ArgumentIntensityProfile => {
  const normalized = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 10) : 5
  return (
    ARGUMENT_INTENSITY_LEVELS.find((profile) => profile.value === normalized) ?? ARGUMENT_INTENSITY_LEVELS[4]
  )
}
