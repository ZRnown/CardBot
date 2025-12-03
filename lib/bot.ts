import { Buffer } from 'node:buffer'
import { Telegraf, Markup } from 'telegraf'
import type { Context } from 'telegraf'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { env, assertEnv } from '@/lib/env'
import { getSetting } from '@/lib/services/settings'
import { getOrCreateUser, updateBalance } from '@/lib/services/user'
import { listActiveProducts, getProductById, countAvailableKeys } from '@/lib/services/product'
import { buyProductKey } from '@/lib/services/order'
import { createEpusdtTransactionForUser, getEpusdtPaymentUrl, getTradeStatus } from '@/lib/services/epusdt'
import { getCidPricingForUser } from '@/lib/services/pricing'

// removed external API token (getcid/checkkey removed)

let botInstance: Telegraf<BotContext> | null = null

type BotContext = Context

// removed ParsedIid and IID helpers

function getTelegramIdentity(ctx: BotContext) {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : ''
  if (!telegramId) throw new Error('Cannot identify your Telegram ID, please try again.')
  const username = ctx.from?.username ? `@${ctx.from.username}` : null
  return { telegramId, username }
}

function buildStartInlineButtons() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛒 购买商品', 'menu:buykey')],
    [
      Markup.button.callback('📜 我的订单', 'menu:myorders'),
      Markup.button.callback('💬 联系客服', 'menu:support'),
    ],
  ])
}

async function ensureUser(ctx: BotContext) {
  const { telegramId, username } = getTelegramIdentity(ctx)
  return getOrCreateUser(telegramId, username)
}

// removed getCommandArgs (unused)

// removed getCommandPayload (unused)

function formatUsdt(amount: number) {
  return Number(amount.toFixed(3)).toString()
}

function getErrorMessage(err: unknown, fallback = 'Unknown error') {
  if (!err) return fallback
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'string') return err || fallback
  try {
    return JSON.stringify(err)
  } catch (_) {
    return fallback
  }
}

async function replyWithError(ctx: BotContext, message: string, err?: unknown) {
  const detail = err ? `${message}: ${getErrorMessage(err)}` : message
  await ctx.reply(`❌ ${detail}`)
}

// removed checkkey related helpers and handlers

function isAdmin(telegramId: string) {
  return env.ADMIN_TELEGRAM_IDS.includes(telegramId)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function buildStartHtml(ctx: BotContext) {
  const { telegramId, username } = getTelegramIdentity(ctx)
  const startTemplate = (await getSetting('START_TEMPLATE_HTML')) || ''
  // Use internal balance (USDT)
  const user = await getOrCreateUser(telegramId, username)
  const balance = Number(user.balance)
  const balanceText = Number.isFinite(balance) ? balance.toFixed(2) : String(user.balance)
  const pricing = await getCidPricingForUser(user.id)
  const currentRateText = pricing.price.toFixed(3)
  if (startTemplate && startTemplate.trim()) {
    // Placeholder replacement with forced spoiler for telegramId
    const spoilerId = `<span class="tg-spoiler"><code>${escapeHtml(telegramId)}</code></span>`
    // Escape the entire template first to prevent XSS, then restore placeholders
    let filled = startTemplate
    // Replace placeholders with escaped values
    filled = filled
      .replaceAll('{username}', escapeHtml(username ?? telegramId))
      .replaceAll('{telegramId}', spoilerId)
      .replaceAll('{balance}', escapeHtml(balanceText))
      .replaceAll('{level}', escapeHtml(pricing.levelLabel))
      .replaceAll('{cidPrice}', escapeHtml(currentRateText))
      .replaceAll('{maxSingleTopup}', escapeHtml(pricing.maxSingleTopup.toFixed(2)))
      .replaceAll('{contact}', '')
      .replaceAll('{welcomeTitle}', '')
    return filled
  }
  const hello = `👋 欢迎，${escapeHtml(username ?? telegramId)}!`
  const idLine = `👤 用户ID：${escapeHtml(telegramId)}`
  const balanceLine = `💰 余额：<code>${escapeHtml(balanceText)} USDT</code>`
  const levelLine = `🏷️ 等级：${escapeHtml(pricing.levelLabel)}`
  const lines = [
    hello,
    idLine,
    balanceLine,
    levelLine,
    '🧭 菜单：',
    '🛒 点击下方"购买"按钮选择商品',
    '💳 充值：使用指令 /pay &lt;USDT&gt;（例：/pay 10）',
  ]
  return lines.join('\n')
}

async function sendStart(ctx: BotContext) {
  const html = await buildStartHtml(ctx)
  await ctx.replyWithHTML(html, buildStartInlineButtons())
}

async function sendStartEdit(ctx: BotContext) {
  const html = await buildStartHtml(ctx)
  await ctx.editMessageText(html, { parse_mode: 'HTML', ...buildStartInlineButtons() })
}

// deprecated legacy main menu removed

// Category mapping cache to avoid callback_data length issues
const categoryCache = new Map<number, string>()
const subCategoryCache = new Map<string, string>() // key: "catIdx:subIdx"

function getCategoryIndex(categories: string[], cat: string): number {
  return categories.indexOf(cat)
}

function getSubCategoryIndex(subcategories: string[], sub: string): number {
  return subcategories.indexOf(sub)
}

async function buildCategoryMenu() {
  const products = await listActiveProducts()
  if (!products.length) return Markup.inlineKeyboard([[Markup.button.callback('暂无商品', 'noop')], [Markup.button.callback('返回', 'menu:back')]])
  const cats = Array.from(new Set(products.map(p => String(p.category || 'Uncategorized'))))
  
  // Store in cache
  categoryCache.clear()
  cats.forEach((c, idx) => categoryCache.set(idx, c))
  
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < cats.length; i++) {
    rows.push([Markup.button.callback(`${cats[i]}`, `cat:${i}`)])
  }
  rows.push([Markup.button.callback('返回', 'menu:back')])
  return Markup.inlineKeyboard(rows)
}

async function buildSubCategoryMenu(categoryIdx: number) {
  const products = await listActiveProducts()
  const cat = categoryCache.get(categoryIdx) || 'Uncategorized'
  const list = products.filter(p => String(p.category || 'Uncategorized') === cat)
  if (!list.length) {
    return Markup.inlineKeyboard([[Markup.button.callback('暂无子分类', 'noop')], [Markup.button.callback('⬅️ 返回分类', 'menu:shop')]])
  }
  const subs = Array.from(new Set(list.map(p => String((p as any).sub_category || 'Uncategorized'))))
  
  // Store in cache
  subs.forEach((s, idx) => subCategoryCache.set(`${categoryIdx}:${idx}`, s))
  
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < subs.length; i++) {
    rows.push([Markup.button.callback(`${subs[i]}`, `sub:${categoryIdx}:${i}`)])
  }
  rows.push([Markup.button.callback('⬅️ 返回分类', 'menu:shop')])
  return Markup.inlineKeyboard(rows)
}

async function buildProductMenuBySubCategory(categoryIdx: number, subCategoryIdx: number) {
  const products = await listActiveProducts()
  const cat = categoryCache.get(categoryIdx) || 'Uncategorized'
  const sub = subCategoryCache.get(`${categoryIdx}:${subCategoryIdx}`) || 'Uncategorized'
  const list = products.filter(p => String(p.category || 'Uncategorized') === cat && String((p as any).sub_category || 'Uncategorized') === sub)
  if (!list.length) return Markup.inlineKeyboard([[Markup.button.callback('该子分类下暂无商品', 'noop')], [Markup.button.callback('⬅️ 返回子分类', `cat:${categoryIdx}`)]])
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (const p of list) {
    const price = Number.isFinite(Number(p.price)) ? Number(p.price).toFixed(2) : String(p.price)
    rows.push([Markup.button.callback(`${p.name} — ${price} USDT`, `prod:${p.id}`)])
  }
  rows.push([Markup.button.callback('⬅️ 返回子分类', `cat:${categoryIdx}`)])
  return Markup.inlineKeyboard(rows)
}

function formatAmount(value: string | number) {
  const num = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(num) ? num.toFixed(2) : String(value)
}

// removed formatCheckKeyReply

// removed IID extract helpers and handlers

// removed CID formatting helpers

// removed CID query flow

export function getBot() {
  if (botInstance) return botInstance
  assertEnv()
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN in environment')
  }
  const bot = new Telegraf<BotContext>(token)

  // 可选：为 Telegram API 配置代理（在受限网络下避免 ETIMEDOUT）
  // 优先级：TELEGRAM_PROXY > HTTPS_PROXY > HTTP_PROXY，设置 TELEGRAM_NO_PROXY=true 可禁用
  try {
    const disabled = String(process.env.TELEGRAM_NO_PROXY || '').toLowerCase() === 'true'
    const proxyUrl = disabled
      ? ''
      : (process.env.TELEGRAM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '')
    if (proxyUrl) {
      const agent = new HttpsProxyAgent(proxyUrl)
      const telegram = bot.telegram as any
      telegram.options = {
        ...(telegram.options ?? {}),
        agent,
      }
      // eslint-disable-next-line no-console
      console.info('[bot] Using Telegram proxy:', proxyUrl)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[bot] Proxy setup skipped:', e)
  }

  // ===== Global onboarding: ensure any inbound update with ctx.from is stored as a user =====
  bot.use(async (ctx, next) => {
    try {
      if (ctx.from) {
        await ensureUser(ctx)
      }
    } catch (_) {
      // swallow user creation errors to not break other handlers
    }
    return next()
  })

  // removed checkkey command

  // 移除 /pay 命令（仅保留内联菜单流程）

  // 自动识别产品密钥（非命令文本）并批量检测
  // removed text key-check interception

  // Back from product list to Start
  bot.action('menu:back', async (ctx) => {
    try {
      await ctx.answerCbQuery()
      await sendStartEdit(ctx)
    } catch (_) {
      await sendStart(ctx)
    }
  })

  // 取消订单并删除二维码消息
  bot.action(/cancel:(.*)/, async (ctx) => {
    try {
      await ctx.answerCbQuery('订单已取消')
      const qrMessageId = (ctx.match as any)[1]
      
      // 删除二维码消息
      if (qrMessageId && qrMessageId !== '') {
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, Number(qrMessageId))
        } catch (delErr) {
          console.error('Failed to delete QR code message:', delErr)
        }
      }
      
      // 返回主页
      await sendStartEdit(ctx)
    } catch (_) {
      await sendStart(ctx)
    }
  })

  // No-op handler to silence clicks
  bot.action('noop', async (ctx) => {
    try { await ctx.answerCbQuery() } catch (_) {}
  })

  // ===== Inline: BuyKey button removed; use /BuyKey command instead =====

  // 仅保留内联菜单触发

  // 设置命令菜单（Telegram 要求命令小写；我们同时兼容大小写输入）
  bot.telegram.setMyCommands([
    { command: 'start', description: '显示开始菜单' },
  ])

  bot.start(async (ctx) => {
    try {
      await ensureUser(ctx)
      await sendStart(ctx)
    } catch (err) {
      await replyWithError(ctx, 'Failed to initialize your account', err)
    }
  })

  
  // 我已支付按钮处理
  bot.action(/pay:confirm:([^:]+):([^:]+):?([^:]*):?([^:]*):?(.*)/, async (ctx) => {
    try {
      await ctx.answerCbQuery('已记录，系统将自动确认到账')
      const tradeId = String((ctx.match as any)[1])
      const amount = String((ctx.match as any)[2])
      const productId = (ctx.match as any)[3] || ''
      const qty = (ctx.match as any)[4] || ''
      const qrMessageId = (ctx.match as any)[5] || ''
      
      let orderInfo = ''
      if (productId && qty) {
        try {
          const product = await getProductById(Number(productId))
          if (product) {
            orderInfo = `\n📦 商品：${escapeHtml(product.name)}\n🔢 数量：${qty} 件\n`
          }
        } catch (e) {
          // 忽略商品信息获取失败
        }
      }
      
      const msg = [
        `✅ <b>已记录支付信息</b>`,
        ``,
        `📝 订单号：<code>${tradeId}</code>`,
        `💰 金额：<code>${amount} USDT</code>`,
        orderInfo,
        `⏳ 系统正在确认您的转账...`,
        ``,
        `💡 通常需要 1-3 分钟到账`,
        `📱 您可以点击下方"刷新状态"查看最新进度`,
        ``,
        `✨ 支付确认后将自动发送商品`,
      ].filter(Boolean).join('\n')
      
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 刷新状态', `pay:status:${tradeId}:${productId}:${qty}:${qrMessageId}`)],
        [Markup.button.callback('🏠 返回主页', 'menu:back')],
      ])
      
      try {
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
      } catch (_) {
        await ctx.replyWithHTML(msg, kb)
      }
    } catch (err) {
      await replyWithError(ctx, '处理失败', err)
    }
  })
  
  // 查询支付状态
  bot.action(/pay:status:([^:]+):?([^:]*):?([^:]*):?(.*)/, async (ctx) => {
    try {
      await ctx.answerCbQuery('正在查询...')
      const tradeId = String((ctx.match as any)[1])
      const productId = (ctx.match as any)[2] || ''
      const qty = Number((ctx.match as any)[3]) || 0
      const qrMessageId = (ctx.match as any)[4] || ''
      
      const status = await getTradeStatus(tradeId)
      
      if (!status) {
        await ctx.editMessageText(`❌ <b>订单不存在</b>\n\n订单号：<code>${tradeId}</code>`, { parse_mode: 'HTML' })
        return
      }
      
      if (status.status === 'paid') {
        // 删除二维码消息
        if (qrMessageId && qrMessageId !== '') {
          try {
            await ctx.telegram.deleteMessage(ctx.chat!.id, Number(qrMessageId))
          } catch (delErr) {
            console.error('Failed to delete QR code:', delErr)
          }
        }
        
        // 支付成功，如果有商品ID和数量，则发送密钥
        if (productId && qty > 0) {
          try {
            const user = await ensureUser(ctx)
            const product = await getProductById(Number(productId))
            
            if (!product) {
              try {
                await ctx.editMessageText(`❌ 商品不存在（ID：${productId}）`, { parse_mode: 'HTML' })
              } catch (_) {}
              return
            }
            
            // 购买商品密钥
            const results: Array<{ orderId: number; productName: string; productId: number; key: string; amount: number }> = []
            for (let i = 0; i < qty; i++) {
              const r = await buyProductKey({ userId: user.id, productId: Number(productId) })
              results.push(r)
            }
            
            const keys = results.map((r, idx) => `#${idx + 1}: <code>${escapeHtml(r.key)}</code>`).join('\n')
            const msg = [
              `✅ <b>购买成功！</b>`,
              ``,
              `📦 商品：<b>${escapeHtml(product.name)}</b>`,
              `🔢 数量：${qty} 件`,
              `💰 支付金额：<code>${status.actualAmount || status.amount} USDT</code>`,
              ``,
              `🔑 <b>密钥：</b>`,
              keys,
              ``,
              `📋 请妥善保管您的密钥`,
            ].join('\n')
            
            const kb = Markup.inlineKeyboard([
              [Markup.button.callback('🏠 返回主页', 'menu:back')],
            ])
            
            try {
              await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
            } catch (_) {
              await ctx.replyWithHTML(msg, kb)
            }
          } catch (purchaseErr) {
            await replyWithError(ctx, '发送商品失败', purchaseErr)
          }
        } else {
          // 普通支付成功（非商品订单）
          const msg = [
            `✅ <b>支付成功！</b>`,
            ``,
            `订单号：<code>${status.orderId || tradeId}</code>`,
            `支付金额：<code>${status.actualAmount || status.amount} USDT</code>`,
            ``,
            `💰 余额已到账，请使用 /start 查看最新余额。`,
          ].join('\n')
          
          const kb = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 返回主页', 'menu:back')],
          ])
          
          try {
            await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
          } catch (_) {
            await ctx.replyWithHTML(msg, kb)
          }
        }
      } else if (status.status === 'failed' || status.status === 'expired') {
        // 删除二维码消息
        if (qrMessageId && qrMessageId !== '') {
          try {
            await ctx.telegram.deleteMessage(ctx.chat!.id, Number(qrMessageId))
          } catch (delErr) {
            console.error('Failed to delete QR code:', delErr)
          }
        }
        
        const statusText = status.status === 'expired' ? '已过期' : '支付失败'
        const msg = [
          `❌ <b>订单${statusText}</b>`,
          ``,
          `订单号：<code>${status.orderId || tradeId}</code>`,
          `状态：${statusText}`,
          ``,
          `💡 请重新下单`,
        ].join('\n')
        
        const kb = Markup.inlineKeyboard([
          [Markup.button.callback('🛒 继续购物', 'menu:buykey')],
          [Markup.button.callback('🏠 返回主页', 'menu:back')],
        ])
        
        try {
          await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
        } catch (_) {
          await ctx.replyWithHTML(msg, kb)
        }
      } else {
        const paymentUrl = status.paymentUrl || ''
        const msg = [
          `⏳ <b>订单待支付</b>`,
          ``,
          `订单号：<code>${status.orderId || tradeId}</code>`,
          `支付金额：<code>${status.amount} USDT</code>`,
          `状态：等待支付`,
          ``,
          `📱 请完成支付后再次查询`,
        ].join('\n')
        
        const kb = Markup.inlineKeyboard([
          [Markup.button.url('💳 打开支付页面', paymentUrl)],
          [Markup.button.callback('🔄 刷新状态', `pay:status:${tradeId}:${productId}:${qty}:${qrMessageId}`)],
          [Markup.button.callback('❌ 取消订单', `cancel:${qrMessageId}`)],
        ])
        
        try {
          await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
        } catch (_) {
          // 如果编辑失败（内容相同），静默忽略
        }
      }
    } catch (err) {
      await replyWithError(ctx, '查询支付状态失败', err)
    }
  })

  // 移除 profile/token/transactions/shop/product/buy/myorders 等命令

  // 删除 token 命令

  // 删除 transactions 命令

  // 删除 balance 命令

  // removed getcid command

  // 移除 checkkey 指令（不再支持）

  // 已移除管理员调账命令

  // Start 内联按钮：打开分类
  bot.action('menu:buykey', async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const kb = await buildCategoryMenu()
      try {
        await ctx.editMessageText('请选择分类：', kb)
      } catch (_) {
        await ctx.reply('请选择分类：', kb)
      }
    } catch (err) {
      await replyWithError(ctx, '加载分类失败', err)
    }
  })

  // 内联按钮：联系客服
  bot.action('menu:support', async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const supportContact = (await getSetting('SUPPORT_CONTACT')) || ''
      
      const msg = [
        `💬 <b>联系客服</b>`,
        ``,
        supportContact ? supportContact : '📧 客服联系方式暂未设置\n\n请稍后再试或通过其他方式联系我们。',
        ``,
        `💡 如遇问题，请详细描述您的问题以便我们更好地帮助您。`,
      ].join('\n')
      
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ 返回', 'menu:back')],
      ])
      
      try {
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
      } catch (_) {
        await ctx.replyWithHTML(msg, kb)
      }
    } catch (err) {
      await replyWithError(ctx, '加载客服信息失败', err)
    }
  })

  // 内联按钮：我的订单
  bot.action('menu:myorders', async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const user = await ensureUser(ctx)
      
      // 查询用户最近的订单（从 orders 表，JOIN product_keys 和 products）
      const { query } = await import('@/lib/db')
      const orders = await query<Array<{
        id: number
        product_name: string
        amount: string
        created_at: string
      }>>(
        `SELECT o.id, p.name as product_name, o.amount, o.created_at
         FROM orders o
         LEFT JOIN product_keys pk ON o.product_key_id = pk.id
         LEFT JOIN products p ON pk.product_id = p.id
         WHERE o.user_id = ? 
         ORDER BY o.created_at DESC 
         LIMIT 10`,
        [user.id]
      )
      
      if (!orders || orders.length === 0) {
        const msg = [
          `📜 <b>我的订单</b>`,
          ``,
          `暂无订单记录`,
          ``,
          `💡 点击下方"购买商品"开始选购吧！`,
        ].join('\n')
        
        const kb = Markup.inlineKeyboard([
          [Markup.button.callback('🛒 购买商品', 'menu:buykey')],
          [Markup.button.callback('⬅️ 返回', 'menu:back')],
        ])
        
        try {
          await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
        } catch (_) {
          await ctx.replyWithHTML(msg, kb)
        }
        return
      }
      
      // 构建订单列表
      const orderList = orders.slice(0, 5).map((order, idx) => {
        const date = new Date(order.created_at).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
        const amount = Number(order.amount).toFixed(2)
        return `${idx + 1}. <b>${escapeHtml(order.product_name)}</b>\n   💰 ${amount} USDT | 📅 ${date}`
      }).join('\n\n')
      
      const msg = [
        `📜 <b>我的订单</b>`,
        ``,
        `最近购买记录（共 ${orders.length} 笔）：`,
        ``,
        orderList,
        ``,
        orders.length > 5 ? `📋 仅显示最近5笔订单` : '',
        ``,
        `💡 如需查看密钥，请联系客服`,
      ].filter(Boolean).join('\n')
      
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🛒 继续购物', 'menu:buykey')],
        [Markup.button.callback('⬅️ 返回', 'menu:back')],
      ])
      
      try {
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb })
      } catch (_) {
        await ctx.replyWithHTML(msg, kb)
      }
    } catch (err) {
      await replyWithError(ctx, '加载订单列表失败', err)
    }
  })

  // 打开分类列表（Back 按钮使用）
  bot.action('menu:shop', async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const kb = await buildCategoryMenu()
      try {
        await ctx.editMessageText('请选择分类：', kb)
      } catch (_) {
        await ctx.reply('请选择分类：', kb)
      }
    } catch (err) {
      await replyWithError(ctx, 'Failed to load products', err)
    }
  })

  // 选择分类后展示该分类下的子分类
  bot.action(/cat:(\d+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const categoryIdx = Number((ctx.match as any)[1])
      const category = categoryCache.get(categoryIdx) || 'Uncategorized'
      const kb = await buildSubCategoryMenu(categoryIdx)
      try { await ctx.editMessageText(`子分类：${category}`, kb) } catch (_) { await ctx.reply(`子分类：${category}`, kb) }
    } catch (err) {
      await replyWithError(ctx, 'Failed to load category products', err)
    }
  })

  // 选择子分类后展示该子分类下的商品
  bot.action(/sub:(\d+):(\d+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const categoryIdx = Number((ctx.match as any)[1])
      const subCategoryIdx = Number((ctx.match as any)[2])
      const category = categoryCache.get(categoryIdx) || 'Uncategorized'
      const subCategory = subCategoryCache.get(`${categoryIdx}:${subCategoryIdx}`) || 'Uncategorized'
      const kb = await buildProductMenuBySubCategory(categoryIdx, subCategoryIdx)
      try { await ctx.editMessageText(`商品列表：${category} / ${subCategory}`, kb) } catch (_) { await ctx.reply(`商品列表：${category} / ${subCategory}`, kb) }
    } catch (err) {
      await replyWithError(ctx, 'Failed to load subcategory products', err)
    }
  })

  // 商品详情（加入数量与结账按钮）
  bot.action(/prod:(\d+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const id = Number((ctx.match as any)[1])
      const p = await getProductById(id)
      if (!p || Number(p.is_active) !== 1) {
        await ctx.editMessageText('商品不存在或未上架。')
        return
      }
      const stock = await countAvailableKeys(p.id)
      const qty = 1
      const kb = Markup.inlineKeyboard([
        [
          Markup.button.callback('➖', `qty:${p.id}:${Math.max(1, qty - 1)}`),
          Markup.button.callback(`数量：${qty}`, 'noop'),
          Markup.button.callback('➕', `qty:${p.id}:${qty + 1}`),
        ],
        [Markup.button.callback('🧾 结账', `buy:${p.id}:${qty}`)],
        [Markup.button.callback('⬅️ 返回分类', 'menu:shop')],
      ])
      const description = p.description ? `\n说明：${p.description}` : ''
      try {
        await ctx.editMessageText(`商品 #${p.id}\n名称：${p.name}\n单价：${p.price} USDT\n分类：${p.category}${(p as any).sub_category ? ` / ${(p as any).sub_category}` : ''}${description}\n库存：${stock}`, kb)
      } catch (_) {
        await ctx.reply(`商品 #${p.id}\n名称：${p.name}\n单价：${p.price} USDT\n分类：${p.category}${(p as any).sub_category ? ` / ${(p as any).sub_category}` : ''}${description}\n库存：${stock}`, kb)
      }
    } catch (err) {
      await replyWithError(ctx, 'Query product failed', err)
    }
  })

  // 数量调整
  bot.action(/qty:(\d+):(\d+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const id = Number((ctx.match as any)[1])
      const qty = Math.max(1, Math.min(99, Number((ctx.match as any)[2])))
      const p = await getProductById(id)
      if (!p || Number(p.is_active) !== 1) {
        await ctx.editMessageText('商品不存在或未上架。')
        return
      }
      const stock = await countAvailableKeys(p.id)
      const kb = Markup.inlineKeyboard([
        [
          Markup.button.callback('➖', `qty:${p.id}:${Math.max(1, qty - 1)}`),
          Markup.button.callback(`数量：${qty}`, 'noop'),
          Markup.button.callback('➕', `qty:${p.id}:${qty + 1}`),
        ],
        [Markup.button.callback('🧾 结账', `buy:${p.id}:${qty}`)],
        [Markup.button.callback('⬅️ 返回分类', 'menu:shop')],
      ])
      const description = p.description ? `\n说明：${p.description}` : ''
      try {
        await ctx.editMessageText(`商品 #${p.id}\n名称：${p.name}\n单价：${p.price} USDT\n分类：${p.category}${(p as any).sub_category ? ` / ${(p as any).sub_category}` : ''}${description}\n库存：${stock}`, kb)
      } catch (_) {
        await ctx.reply(`商品 #${p.id}\n名称：${p.name}\n单价：${p.price} USDT\n分类：${p.category}${(p as any).sub_category ? ` / ${(p as any).sub_category}` : ''}${description}\n库存：${stock}`, kb)
      }
    } catch (err) {
      await replyWithError(ctx, '更新数量失败', err)
    }
  })

  // 结账（创建支付订单）
  bot.action(/buy:(\d+):(\d+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery()
      const id = Number((ctx.match as any)[1])
      const qty = Math.max(1, Math.min(99, Number((ctx.match as any)[2])))
      const user = await ensureUser(ctx)
      
      // 获取商品信息
      const product = await getProductById(id)
      if (!product || Number(product.is_active) !== 1) {
        await ctx.reply('商品不存在或未上架。')
        return
      }
      
      // 检查库存
      const stock = await countAvailableKeys(id)
      if (stock < qty) {
        await ctx.reply(`❌ 库存不足，当前库存：${stock}，需要：${qty}`)
        return
      }
      
      // 计算总价
      const unitPrice = Number(product.price)
      const totalAmount = Number((unitPrice * qty).toFixed(2))
      
      // 获取收款地址
      const paymentAddress = (await getSetting('PAYMENT_ADDRESS')) || ''
      if (!paymentAddress) {
        await ctx.reply('❌ 系统未配置收款地址，请联系管理员')
        return
      }
      
      // 创建支付订单
      const trade = await createEpusdtTransactionForUser({
        userId: user.id,
        amount: totalAmount,
        amountIsUsdt: true,
        orderId: `product-${id}-${Date.now()}`, // 自定义订单号，包含商品ID
      })
      
      const paymentUrl = getEpusdtPaymentUrl(trade)
      
      // 计算过期时间
      const expirationTime = trade.expiration_time
      let expirationText = ''
      if (expirationTime) {
        const expirationDate = new Date(expirationTime * 1000)
        expirationText = `⏰ 请在 ${expirationDate.toLocaleString('zh-CN')} 前完成支付`
      }
      
      // 生成二维码URL
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentAddress)}`
      
      const msg = [
        `🧾 <b>订单详情</b>`,
        ``,
        `📦 商品：<b>${escapeHtml(product.name)}</b>`,
        `🔢 数量：<code>${qty}</code> 件`,
        `💰 单价：<code>${unitPrice.toFixed(2)} USDT</code>`,
        `💵 总计：<code>${totalAmount.toFixed(2)} USDT</code>`,
        ``,
        `📮 <b>收款地址 (USDT TRC20)：</b>`,
        `<code>${paymentAddress}</code>`,
        ``,
        expirationTime ? expirationText : '',
        ``,
        `📱 <b>支付步骤：</b>`,
        `1️⃣ 复制上方收款地址或扫描下方二维码`,
        `2️⃣ 使用钱包转账 <code>${totalAmount.toFixed(2)} USDT</code>`,
        `3️⃣ 转账完成后点击"✅ 我已支付"按钮`,
        `4️⃣ 支付确认后将自动发送密钥`,
        ``,
        `⚠️ <b>注意：</b>请确保转账网络为 <b>TRC20</b>`,
      ].filter(Boolean).join('\n')
      
      // 先发送二维码图片
      let qrMessageId: number | undefined
      try {
        const qrMsg = await ctx.replyWithPhoto(
          { url: qrCodeUrl },
          { 
            caption: '📲 扫描此二维码获取收款地址',
          }
        )
        qrMessageId = qrMsg.message_id
      } catch (qrErr) {
        console.error('Failed to send QR code:', qrErr)
      }
      
      // 发送支付信息和按钮（在callback_data中包含二维码消息ID）
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('✅ 我已支付', `pay:confirm:${trade.trade_id}:${totalAmount}:${id}:${qty}:${qrMessageId || ''}`)],
        [Markup.button.url('🌐 打开支付页面', paymentUrl)],
        [Markup.button.callback('🔄 查询支付状态', `pay:status:${trade.trade_id}:${id}:${qty}:${qrMessageId || ''}`)],
        [Markup.button.callback('❌ 取消订单', `cancel:${qrMessageId || ''}`)],
      ])
      
      await ctx.replyWithHTML(msg, kb)
    } catch (err) {
      await replyWithError(ctx, '创建订单失败', err)
    }
  })

  // No more close/copy actions; back navigates to Start

  // ===== 自动监测聊天文本中的 IID 并查询 CID =====
  // removed IID auto-detection from text

  // ===== 图片 OCR -> 提取 IID -> 调用 CID =====
  // removed OCR flow

  botInstance = bot
  return bot
}

export async function handleUpdate(update: any) {
  const bot = getBot()
  await bot.handleUpdate(update)
}
