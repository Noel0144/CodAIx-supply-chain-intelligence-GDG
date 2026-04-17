require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const result = await genAI.getGenerativeModel({ model: "gemini-pro" }).listModels();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("ListModels failed, trying manual fetch...");
    // Alternative via fetch
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (e2) {
      console.error("Manual fetch failed", e2);
    }
  }
}

listModels();
