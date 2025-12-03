export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || "",
  BASE_URL: process.env.BASE_URL || "",
  // Database (fallbacks to provided local creds if not set)
  DB_HOST: process.env.DB_HOST || "127.0.0.1",
  DB_PORT: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  DB_USER: process.env.DB_USER || "root",
  DB_PASSWORD: process.env.DB_PASSWORD || "qq1383766",
  DB_NAME: process.env.DB_NAME || "card_bot",
  ADMIN_TELEGRAM_IDS: (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
  // USDT payments (NowPayments)
  NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY || "",
  NOWPAYMENTS_IPN_SECRET: process.env.NOWPAYMENTS_IPN_SECRET || "",
  // Epusdt payment
  EPUSDT_BASE_URL: process.env.EPUSDT_BASE_URL || "http://154.201.76.200:8000",
  EPUSDT_TOKEN: process.env.EPUSDT_TOKEN || "",
  EPUSDT_NOTIFY_URL: process.env.EPUSDT_NOTIFY_URL || "",
  EPUSDT_REDIRECT_URL: process.env.EPUSDT_REDIRECT_URL || "",
  // If you want /pay <amount> to mean <amount> USDT, set a forced rate
  EPUSDT_FORCED_RATE: process.env.EPUSDT_FORCED_RATE ? Number(process.env.EPUSDT_FORCED_RATE) : undefined,
} as const

export function assertEnv() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN in environment.")
  }
}
