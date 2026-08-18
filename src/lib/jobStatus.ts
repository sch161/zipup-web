import { supabase } from './supabase'

export interface BatchJobStatus {
  job_name: string
  last_run_at: string | null
  last_success_at: string | null
  last_error: string | null
}

export async function fetchBatchJobStatus(): Promise<BatchJobStatus[]> {
  const { data, error } = await supabase
    .from('batch_job_status')
    .select('job_name, last_run_at, last_success_at, last_error')

  if (error) throw new Error(error.message)
  return data ?? []
}
