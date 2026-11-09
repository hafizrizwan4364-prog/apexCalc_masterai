// api/chat.js — Vercel Serverless Function for UR AI (ApexCalc AI)
// Enterprise Professional Master Edition with Full Voice & Image Support

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const SYSTEM_PROMPT = `You are UR AI, a friendly math and science tutor inside the ApexCalc AI calculator app.
Reply in clear, simple language. If the user writes in Roman Urdu or Hinglish, reply in the same style.
Show step-by-step working for calculations and solve problems accurately.
Keep answers concise and well formatted with plain text math.
If the user asks for a quiz and asks for JSON, reply with only the JSON, nothing else.`;

module.exports = async function handler(req, res) {
  // 1. Strict Method Security Validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 2. Verify API Key Presence
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not set. Add it in Vercel Settings > Environment Variables, then redeploy.'
    });
  }

  // 3. Safe Body Parsing (Handles JSON or raw strings)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const message = typeof body.message === 'string' ? body.message.slice(0, 4000) : '';
  const media = typeof body.image === 'string' ? body.image : (typeof body.audio === 'string' ? body.audio : null);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  if (!message && !media) {
    return res.status(400).json({ error: 'Empty message or attachment' });
  }

  // 4. Build Conversation History Array for Gemini
  const contents = [];
  for (const h of history) {
    if (!h || typeof h.text !== 'string' || !h.text.trim()) continue;
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text.slice(0, 2000) }]
    });
  }

  // 5. Current Turn: Handle Optional Media (Images or Voice/Audio Data URLs) + Text
  const parts = [];
  if (media) {
    // Supports data URIs for images (image/png, image/jpeg, etc.) and audio (audio/wav, audio/mp3, audio/webm, etc.)
    const mediaMatch = media.match(/^data:((?:image|audio)\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (mediaMatch) {
      parts.push({
        inline_data: {
          mime_type: mediaMatch[1],
          data: mediaMatch[2]
        }
      });
    }
  }
  
  parts.push({ text: message || 'Analyze the attached voice or image input step by step.' });
  contents.push({ role: 'user', parts });

  // Ensure conversation starts strictly with a user role turn
  while (contents.length && contents[0].role !== 'user') contents.shift();

  // 6. Execute Secure Upstream Fetch to Google Gemini API
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
            maxOutputTokens: 1024
          }
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({
        error: (data && data.error && data.error.message) || 'Gemini API upstream error'
      });
    }

    const reply = ((data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts) || [])
      .map(p => p.text || '')
      .join('')
      .trim();

    if (!reply) {
      return res.status(502).json({ error: 'Empty response text received from Gemini' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'Server runtime execution error: ' + err.message });
  }
};


