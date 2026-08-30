// Configurazione della sincronizzazione.
//
// Finché questi valori restano vuoti l'app funziona perfettamente, ma solo in
// locale sul singolo dispositivo: niente utenti, niente scalette condivise.
//
// Per attivarli:
//   1. crea un progetto gratuito su https://supabase.com
//   2. esegui il contenuto di supabase/schema.sql nell'SQL Editor del progetto
//   3. da Project Settings > API copia qui sotto "Project URL" e la chiave "anon public"
//
// La chiave anon è pensata per stare nel client: la sicurezza è garantita dalle
// policy RLS definite in schema.sql, che richiedono un utente autenticato.

export const SUPABASE_URL = 'https://guvishdyqgpfclvvaakg.supabase.co';

// MANCA SOLO QUESTA. Supabase > Project Settings > API Keys > "anon public".
// È una stringa lunga che comincia con "eyJ..." (oppure "sb_publishable_...").
// Va bene che stia qui: è pensata per stare nei telefoni, e a proteggere i dati
// sono le policy RLS di supabase/schema.sql. Non mettere mai la "service_role".
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dmlzaGR5cWdwZmNsdnZhYWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMTE4NzMsImV4cCI6MjEwMzY4Nzg3M30.qNSOtsST6vTMyqZHjAoB9d8gRx_80NHJFrYq-uwNT4o';

// Nome mostrato nell'intestazione e sulla copertina del libretto stampato.
export const PARISH_NAME = 'Basilica Santuario Madre del Buon Consiglio';
