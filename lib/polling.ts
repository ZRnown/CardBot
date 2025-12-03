import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
async function main() {
  const { getBot } = await import('@/lib/bot')
  const bot = getBot()
  await bot.launch()
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
