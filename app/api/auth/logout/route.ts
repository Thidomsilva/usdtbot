import { NextRequest, NextResponse } from 'next/server'
import { readSessionFromRequest, SESSION_COOKIE } from '@/lib/session'
import { listUsers } from '@/lib/user-store'
import { setTelegramUserSettings } from '@/lib/telegram-user-settings'
import { sendTelegramMessage } from '@/lib/telegram'

function disabledTracks() {
  return { a: false, b: false, c: false }
}

export async function POST(request: NextRequest) {
  const session = await readSessionFromRequest(request)

  if (session?.username) {
    try {
      const users = await listUsers()
      const user = users.find((entry) => entry.username === session.username)

      if (user?.telegramChatId) {
        await setTelegramUserSettings(user.telegramChatId, {
          alertsEnabled: false,
          autoSignalsMode: 'off',
          alertTracks: disabledTracks(),
          pausedUntil: null,
        })

        await sendTelegramMessage(user.telegramChatId, '🔕 Monitoramento pausado. Faca login novamente para reativar.')
      }
    } catch (error) {
      console.error('[LOGOUT] Falha ao pausar monitoramento Telegram:', error)
    }
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  })

  return response
}
