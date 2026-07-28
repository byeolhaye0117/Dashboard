import type { DataSource } from './api'
import { demoSource } from './demo'
import { supabase, supabaseSource } from './supabase'

/**
 * Supabase 접속 정보가 있으면 실제 DB, 없으면 데모 데이터를 쓴다.
 * 설정 전에도 화면을 그대로 볼 수 있게 하려는 것이다.
 */
export const db: DataSource = supabase ? supabaseSource : demoSource

export const isDemo = db.mode === 'demo'
export type { DataSource }
