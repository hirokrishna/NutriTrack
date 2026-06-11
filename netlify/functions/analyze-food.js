const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const SYSTEM_PROMPT = `You are a nutrition expert for an Indian diet tracker app. When the user describes food intake, respond ONLY with this exact JSON (no markdown, no extra text, no backticks):
{"items":[{"food":"Name","amount":"qty","calories":0,"protein":0,"carbs":0,"fat":0,"fibre":0}],"totals":{"calories":0,"protein":0,"carbs":0,"fat":0,"fibre":0},"message":"Short helpful tip"}
Accurate Indian food values per unit:
1 medium roti(30g)=90cal,2.8p,17c,0.4f,2fi | 100g cooked rice=130cal,2.7p,28c,0.3f,0.4fi | 100g toor dal cooked=116cal,7p,20c,0.4f,4fi | 1 banana=89cal,1.1p,23c,0.3f,2.6fi | 100g paneer=265cal,18p,3c,21f,0fi | 1 egg=74cal,6p,0.4c,5f,0fi | 1 glass milk 240ml=149cal,8p,12c,8f,0fi | 100g chicken breast=165cal,31p,0c,3.6f,0fi | 30g sattu=118cal,5.6p,20c,1.4f,4fi | 1 medium apple=95cal,0.5p,25c,0.3f,4fi | 100g curd=98cal,11p,3.4c,4.3f,0fi | 1 tbsp ghee=112cal,0p,0c,13f,0fi | 100g chana dal=164cal,9p,27c,2.6f,8fi
All macros in grams. Make sensible assumptions for unspecified quantities.`;

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed. Please use POST.' })
    };
  }

  try {
    const { text } = JSON.parse(event.body || '{}');
    if (!text) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Food description (text) is required.' })
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Gemini API key is not configured in the server environment.' })
      };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson = {};
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {
        // Not JSON
      }
      const apiMessage = errorJson.error?.message || errorText || 'Unknown Gemini API error';
      return {
        statusCode: response.status || 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Gemini API reported: ${apiMessage}` })
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Helper for cross-origin local testing if needed
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error in analyze-food Netlify function:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error: ' + error.message })
    };
  }
};
