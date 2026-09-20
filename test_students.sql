-- Test student records for the Oak International School election platform.
-- Run in the Neon SQL editor. Inserts into BOTH portal rolls so the mock
-- IDs work in primary (name search) and secondary (ID login).

INSERT INTO public.primary_students (id, name, has_voted)
VALUES
  ('OIS/STU/00001', 'Adaobi Okonkwo',       false),
  ('OIS/STU/00002', 'Chinedu Adeyemi',      false),
  ('OIS/STU/00003', 'Fatima Bello',         false),
  ('OIS/STU/00004', 'Emmanuel Okafor',      false),
  ('OIS/STU/00005', 'Grace Nwosu',          false),
  ('OIS/STU/00006', 'Hassan Yusuf',         false),
  ('OIS/STU/00007', 'Ifeoma Eze',           false),
  ('OIS/STU/00008', 'Jabari Mensah',        false),
  ('OIS/STU/00009', 'Kwame Asante',         false),
  ('OIS/STU/00010', 'Lola Adesina',         false),
  ('OIS/STU/00011', 'Mohammed Ibrahim',     false),
  ('OIS/STU/00012', 'Ngozi Ogbonna',        false),
  ('OIS/STU/00013', 'Olumide Bakare',       false),
  ('OIS/STU/00014', 'Precious Ojo',         false),
  ('OIS/STU/00015', 'Quadri Salisu',        false),
  ('OIS/STU/00016', 'Rachael Adeleke',      false),
  ('OIS/STU/00017', 'Samuel Akpan',         false),
  ('OIS/STU/00018', 'Temitope Balogun',     false),
  ('OIS/STU/00019', 'Ugochi Nnamani',       false),
  ('OIS/STU/00020', 'Victor Onyeka',        false),
  ('OIS/STU/00021', 'Yewande Sowande',      false),
  ('OIS/STU/00022', 'Zubairu Garba',        false),
  ('OIS/STU/00023', 'Amina Suleiman',       false),
  ('OIS/STU/00024', 'Bolaji Fashola',       false),
  ('OIS/STU/00025', 'Chioma Ihekire',       false)
ON CONFLICT (id) DO NOTHING;

-- Mirror into the secondary roll (same IDs, independent voted flags).
INSERT INTO public.secondary_students (id, name, has_voted)
SELECT id, name, has_voted FROM public.primary_students
WHERE id LIKE 'OIS/STU/%'
ON CONFLICT (id) DO NOTHING;
