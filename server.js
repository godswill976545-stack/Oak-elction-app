import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import candidatesHandler from './api/candidates.js';
import partiesHandler from './api/parties.js';
import studentsSearchHandler from './api/students-search.js';
import verifyStudentHandler from './api/verify-student.js';
import votePrimaryHandler from './api/vote-primary.js';
import voteSecondaryHandler from './api/vote-secondary.js';
import verifyStaffHandler from './api/verify-staff.js';
import voteStaffHandler from './api/vote-staff.js';
import staffHandler from './api/staff.js';
import candidacyHandler from './api/candidacy.js';
import verifyPinHandler from './api/verify-pin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '12mb' }));

const route = (handler) => (req, res) => handler(req, res);

app.get('/api/candidates', route(candidatesHandler));
app.post('/api/candidates', route(candidatesHandler));
app.get('/api/parties', route(partiesHandler));
app.post('/api/parties', route(partiesHandler));
app.get('/api/students-search', route(studentsSearchHandler));
app.post('/api/verify-student', route(verifyStudentHandler));
app.post('/api/vote-primary', route(votePrimaryHandler));
app.post('/api/vote-secondary', route(voteSecondaryHandler));
app.post('/api/verify-staff', route(verifyStaffHandler));
app.post('/api/vote-staff', route(voteStaffHandler));
app.get('/api/staff', route(staffHandler));
app.post('/api/staff', route(staffHandler));
app.get('/api/candidacy', route(candidacyHandler));
app.post('/api/candidacy', route(candidacyHandler));
app.post('/api/verify-pin', route(verifyPinHandler));

// Serve the Vite build when present (after `npm run build`).
app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) res.status(404).end('Not built yet. Run `npm run build` first.');
  });
});

app.listen(PORT, () => {
  console.log(`API + static server on http://localhost:${PORT}`);
});
