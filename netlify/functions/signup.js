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
    const { username, password, name } = JSON.parse(event.body || '{}');
    if (!username || !password || !name) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Username, password, and name are required.' })
      };
    }

    const dbUrl = process.env.GOOGLE_SHEET_DB_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Database configuration (GOOGLE_SHEET_DB_URL) is missing.' })
      };
    }

    const response = await fetch(dbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', username, password, name })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status || 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Database API error: ${errorText}` })
      };
    }

    const data = await response.json();
    if (data.error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: data.error })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, username: data.username, name: data.name })
    };
  } catch (error) {
    console.error('Error in signup Netlify function:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error: ' + error.message })
    };
  }
};
