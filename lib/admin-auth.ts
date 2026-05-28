import { NextRequest } from 'next/server'
import { readSessionFromRequest } from './session'

export async function ensureAdminSession(request: NextRequest) {
  const session = await readSessionFromRequest(request)
  
  if (!session || session.role !== 'admin') {
    return null
  }
  
  return session
}
