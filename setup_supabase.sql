-- 1. Create the Students Table
CREATE TABLE public.students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    has_voted BOOLEAN DEFAULT FALSE NOT NULL
);

-- 2. Create the Candidates Table
CREATE TABLE public.candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    manifesto TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    primary_vote_count INT DEFAULT 0 NOT NULL,
    secondary_vote_count INT DEFAULT 0 NOT NULL
);

-- 3. Enable Realtime functionality for candidates (essential for Live Results)
alter publication supabase_realtime add table public.candidates;

-- 4. Create the 'avatars' storage bucket for high-res candidate portraits
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- 5. Set up Storage Policies (Allows our app to upload and view images publicly)
CREATE POLICY "Public View Settings" ON storage.objects FOR SELECT USING ( bucket_id = 'avatars' );
CREATE POLICY "Public Upload Settings" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'avatars' );

-- 6. Turn off strict Row Level Security (RLS) to allow our app seamless communication
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates DISABLE ROW LEVEL SECURITY;
