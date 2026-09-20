-- Add signature columns to candidacy_applications if they don't already exist
ALTER TABLE public.candidacy_applications
  ADD COLUMN IF NOT EXISTS signature_file TEXT;

ALTER TABLE public.candidacy_applications
  ADD COLUMN IF NOT EXISTS signature_filename TEXT DEFAULT '';

ALTER TABLE public.candidacy_applications
  ADD COLUMN IF NOT EXISTS signature_mimetype TEXT DEFAULT 'application/octet-stream';
