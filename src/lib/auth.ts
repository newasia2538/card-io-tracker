import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { AuthSession } from '../types'

type SessionUserLike = {
  id?: string
  is_anonymous?: boolean
}

type SessionLike = {
  access_token?: string
  user?: SessionUserLike | null
}

type AuthResultLike = {
  data: {
    session: SessionLike | null
  }
  error: Error | null
}

export interface SupabaseAuthClientLike {
  auth: {
    getSession: () => Promise<AuthResultLike>
    signInAnonymously: () => Promise<AuthResultLike>
  }
}

let cachedSupabaseClient: SupabaseClient | null = null
const anonymousSessionRequests = new WeakMap<
  SupabaseAuthClientLike,
  Promise<AuthSession>
>()

export function getSupabaseClient(): SupabaseClient {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient
  }

  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>
  }).env
  const url = env?.VITE_SUPABASE_URL
  const publishableKey = env?.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('Missing VITE_SUPABASE_URL')
  }

  if (!publishableKey) {
    throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY')
  }

  cachedSupabaseClient = createClient(url, publishableKey)
  return cachedSupabaseClient
}

export async function ensureAuthSession(
  client: SupabaseAuthClientLike = getSupabaseClient(),
): Promise<AuthSession> {
  const sessionResult = await client.auth.getSession()
  if (sessionResult.error) {
    throw sessionResult.error
  }

  const existingSession = toAuthSession(sessionResult.data.session)
  if (existingSession) {
    return existingSession
  }

  const inFlightRequest = anonymousSessionRequests.get(client)
  if (inFlightRequest) {
    return inFlightRequest
  }

  const anonymousSessionRequest = client.auth
    .signInAnonymously()
    .then((anonymousResult) => {
      if (anonymousResult.error) {
        throw anonymousResult.error
      }

      const anonymousSession = toAuthSession(anonymousResult.data.session)
      if (!anonymousSession) {
        throw new Error('Supabase anonymous sign-in did not return a session')
      }

      return anonymousSession
    })
    .finally(() => {
      anonymousSessionRequests.delete(client)
    })

  anonymousSessionRequests.set(client, anonymousSessionRequest)
  return anonymousSessionRequest
}

function toAuthSession(session: SessionLike | null): AuthSession | null {
  if (!session?.access_token || !session.user?.id) {
    return null
  }

  return {
    accessToken: session.access_token,
    userId: session.user.id,
    isAnonymous: session.user.is_anonymous ?? false,
  }
}
