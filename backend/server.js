require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./src/routes/api');
const geminiRoutes = require('./src/routes/gemini');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', apiRoutes);
app.use('/api/gemini', geminiRoutes);

app.listen(PORT, () => {
  console.log(`[CODAIX intelligence] Backend running on http://localhost:${PORT}`);
});
