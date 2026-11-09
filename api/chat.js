// api/chat.js — Vercel Serverless Function for UR AI (ApexCalc AI)
// The secret key is read from the Vercel Environment Variable GEMINI_API_KEY.
// It is never sent to the browser.

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const SYSTEM_PROMPT = `You are UR AI, a friendly math and science tutor inside the ApexCalc AI calculator app.
Reply in clear, simple language. If the user writes in Roman Urdu or Hinglish, reply in the same style.
Show step-by-step working for calculations and solve problems accurately.
Keep answers concise and well formatted with plain text math.
If the user asks for a quiz and asks for JSON, reply with only the JSON, nothing else.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not set. Add it in Vercel Settings > Environment Variables, then redeploy.'
    });
  }

  // Vercel parses JSON bodies automatically; handle a raw string just in case
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const message = typeof body.message === 'string' ? body.message.slice(0, 4000) : '';
  const image = typeof body.image === 'string' ? body.image : null;
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  if (!message && !image) {
    return res.status(400).json({ error: 'Empty message' });
  }

  // Build conversation history for Gemini (roles must be "user" or "model")
  const contents = [];
  for (const h of history) {
    if (!h || typeof h.text !== 'string' || !h.text.trim()) continue;
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text.slice(0, 2000) }]
    });
  }

  // Current turn: optional photo (data URL) + text
  const parts = [];
  if (image) {
    const m = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  parts.push({ text: message || 'Solve the problem in this photo step by step.' });
  contents.push({ role: 'user', parts });

  // Gemini expects the conversation to start with a user turn
  while (contents.length && contents[0].role !== 'user') contents.shift();

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024
          }
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({
        error: (data && data.error && data.error.message) || 'Gemini API error'
      });
    }

    const reply = ((data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts) || [])
      .map(p => p.text || '')
      .join('')
      .trim();

    if (!reply) {
      return res.status(502).json({ error: 'Empty response from Gemini' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

