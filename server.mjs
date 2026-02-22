import 'dotenv/config';
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
console.log("API key loaded?", !!process.env.GEMINI_API_KEY);

app.post("/analyze", async (req, res) => {
  const { restaurantName, address } = req.body;
    const prompt = `
You are an expert food critic. Gather reviews from various sites and analyze the restaurant "${restaurantName}" located at "${address}" and provide:
1. Overall sentiment (Positive, Negative, Mixed, Neutral)
2. Key themes or typical reviews
3. Any important notes or events (like discounts)
Give your response in short, clear sentences.
`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { temperature: 0.7 }
    });
    res.json({ analysis: response.text });
  } catch (err) {
    console.error("[ERROR] Gemini API call failed:", err);
    res.status(500).json({ analysis: "Error: Could not analyze restaurant." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).send("Route not found");
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
