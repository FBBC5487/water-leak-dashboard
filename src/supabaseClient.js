import { createClient } from '@supabase/supabase-js'

// You will replace these with your actual keys later!
const supabaseUrl = 'https://ytkstndwghsteunbntje.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0a3N0bmR3Z2hzdGV1bmJudGplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzODEwMTgsImV4cCI6MjA3OTk1NzAxOH0.jZNu_FROQ7QsCFQ0GPmr5kJWowhUV4PIoksqe1KPf1Y'

export const supabase = createClient(supabaseUrl, supabaseKey)