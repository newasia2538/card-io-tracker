import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { AuthSession } from '../types'

export type SessionUserLike = {
  id?: string
  email?: string | null
  is_anonymous?: boolean
}

export type SessionLike = {
  access_token?: string
  user?: SessionUserLike | null
}

export type AuthResponseLike = {
  data: {
    session: SessionLike | null
  }
  error: Error | null
}

export interface AccountAuthClient {
  getSession: () => Promise<AuthResponseLike>
  updateUser: (attributes: { email?: string; password?: string }) => Promise<{
    error: Error | null
  }>
  signInWithPassword: (credentials: {
    email: string
    password: string
  }) => Promise<AuthResponseLike>
  signOut: () => Promise<{
    error: Error | null
  }>
}

export interface SupabaseAuthClientLike {
  auth: AccountAuthClient & {
    signInAnonymously: () => Promise<AuthResponseLike>
  }
}

let cachedSupabaseClient: SupabaseClient | null = null
const authSessionRequests = new WeakMap<
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
  const inFlightRequest = authSessionRequests.get(client)
  if (inFlightRequest) {
    return inFlightRequest
  }

  const authSessionRequest = client.auth
    .getSession()
    .then((sessionResult) => {
      if (sessionResult.error) {
        throw sessionResult.error
      }

      const existingSession = toAuthSession(sessionResult.data.session)
      if (existingSession) {
        return existingSession
      }

      return client.auth.signInAnonymously().then((anonymousResult) => {
        if (anonymousResult.error) {
          throw anonymousResult.error
        }

        const anonymousSession = toAuthSession(anonymousResult.data.session)
        if (!anonymousSession) {
          throw new Error('Supabase anonymous sign-in did not return a session')
        }

        return anonymousSession
      })
    })
    .finally(() => {
      authSessionRequests.delete(client)
    })

  authSessionRequests.set(client, authSessionRequest)
  return authSessionRequest
}

export function toAuthSession(session: SessionLike | null): AuthSession | null {
  if (!session?.access_token || !session.user?.id) {
    return null
  }

  return {
    accessToken: session.access_token,
    userId: session.user.id,
    email: session.user.email ?? null,
    isAnonymous: session.user.is_anonymous ?? false,
  }
}
