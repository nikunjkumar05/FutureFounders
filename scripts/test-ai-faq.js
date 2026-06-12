const https = require('https');

const NORTH_MINI_API_KEY = 'xREuLwql7RtsagsI1uXIDdGk6rES7J04mcV12LGm';

async function testAIFaq() {
  const payload = {
    model: "north-mini",
    messages: [
      {
        role: "system",
        content: "You are a customer support assistant for AquaClean Services. We offer water tank cleaning, sofa cleaning, and car seats cleaning. You can ONLY answer questions about: 1) Tank cleaning pricing (500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800), 2) Sofa cleaning pricing (per seat: Rs.500, full sofa set: Rs.1500), 3) Car seats cleaning pricing (per seat: Rs.300, full car interior: Rs.2000), 4) Working hours (Mon-Sat, 8AM-6PM), 5) Tank capacity calculation (approximate: length x width x height in meters x 1000 = liters). For ANY other question, respond with exactly: ESCALATE. Do not add any other text if escalating. Keep answers under 50 words. Be friendly and professional.",
      },
      { role: "user", content: "What are the water tank cleaning prices?" },
    ],
    max_tokens: 150,
    temperature: 0.7,
  };

  const options = {
    hostname: 'api.northmini.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NORTH_MINI_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': JSON.stringify(payload).length
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    res.on('data', (chunk) => {
      try {
        const data = JSON.parse(chunk);
        console.log('Response:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('Raw response:', chunk.toString());
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(JSON.stringify(payload));
  req.end();
}

if (require.main === module) {
  testAIFaq();
}

module.exports = { testAIFaq };