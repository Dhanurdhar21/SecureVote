-- Migration: Add storage policies for candidate-photos bucket
-- This allows authenticated admins to upload photos and everyone to view them.

-- Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public) 
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view candidate photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload candidate photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update candidate photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete candidate photos" ON storage.objects;

-- Allow anyone to view/download candidate photos (public bucket)
CREATE POLICY "Anyone can view candidate photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'candidate-photos');

-- Allow authenticated users to upload candidate photos
CREATE POLICY "Authenticated users can upload candidate photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'candidate-photos'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update candidate photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'candidate-photos'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete candidate photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'candidate-photos'
  AND auth.role() = 'authenticated'
);
