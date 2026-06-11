exports.handler = async function(event, context) {
  const dbUrl = process.env.GOOGLE_SHEET_DB_URL;
  if (!dbUrl) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Database configuration (GOOGLE_SHEET_DB_URL) is missing.' })
    };
  }

  const method = event.httpMethod;

  if (method === 'GET') {
    const username = event.queryStringParameters?.username;
    if (!username) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Username is required.' })
      };
    }

    try {
      const response = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getNotes', username })
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          statusCode: response.status || 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Database API error: ${errText}` })
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
        body: JSON.stringify({ success: true, notes: data.notes || [] })
      };
    } catch (error) {
      console.error('Error in GET notes Netlify function:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server Error: ' + error.message })
      };
    }
  }

  if (method === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const { action, username, noteId } = payload;
      
      if (!username || !noteId || !action) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Action, username, and noteId are required.' })
        };
      }

      let reqBody = { username, noteId };
      if (action === 'save') {
        reqBody.action = 'saveNote';
        reqBody.title = payload.title || '';
        reqBody.content = payload.content || '';
        reqBody.created = payload.created;
      } else if (action === 'delete') {
        reqBody.action = 'deleteNote';
      } else {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid action.' })
        };
      }

      const response = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          statusCode: response.status || 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Database API error: ${errText}` })
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
        body: JSON.stringify({ success: true })
      };
    } catch (error) {
      console.error('Error in POST notes Netlify function:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server Error: ' + error.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Method Not Allowed' })
  };
};
