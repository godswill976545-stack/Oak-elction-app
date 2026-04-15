import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = 'https://jxcyrdznfllixjvkvafm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4Y3lyZHpuZmxsaXhqdmt2YWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTM5NzgsImV4cCI6MjA5MTU2OTk3OH0.IY81tbSCJLRLqAlfCSrYzKpzZdNT3lriifM8bcO-6DA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Student roster ──────────────────────────────────────────────
const STUDENTS = [
  { id: "OIS/22/00457", name: "Chima Okoro", has_voted: false },
  { id: "OIS/22/00458", name: "Sarah Mensah", has_voted: false },
  { id: "OIS/22/00459", name: "David Adjovi", has_voted: false },
  { id: "OIS/22/00460", name: "Amara Diop", has_voted: false },
  { id: "OIS/22/00461", name: "Emmanuel Tunde", has_voted: false },
  { id: "OIS/22/00462", name: "Blessings Kouassi", has_voted: false },
  { id: "OIS/22/00463", name: "Michael Sowah", has_voted: false },
  { id: "OIS/22/00464", name: "Fatima Bio", has_voted: false },
  { id: "OIS/22/00465", name: "Joshua Gbede", has_voted: false },
  { id: "OIS/22/00466", name: "Grace Zinsou", has_voted: false },
];

async function reset() {
  console.log("Wiping all existing candidates...");
  await supabase.from('candidates').delete().neq('id', 'N/A');
  
  console.log("Wiping all existing students...");
  await supabase.from('students').delete().neq('id', 'N/A');

  console.log("Seeding student roster...");
  const { error } = await supabase.from('students').insert(STUDENTS);
  
  if (error) {
    console.error("Error inserting students:", error);
    process.exit(1);
  }
  
  console.log(`✅ Seeded ${STUDENTS.length} students.`);
  console.log("✅ Database is clean and ready for the election!");
  process.exit(0);
}

reset().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
