const { Client } = require('@elastic/elasticsearch');

let client = null;

// ES_URL is the Elastic Cloud Serverless project endpoint and ES_API_KEY the
// encoded API key for it (see the "API keys" section of README.md — they live
// in a Kubernetes Secret, never in this repo). When either is unset the app
// still runs: the search endpoints answer 503 and the UI falls back to its
// client-side substring filter.
function esClient() {
  if (!process.env.ES_URL || !process.env.ES_API_KEY) return null;
  if (!client) {
    client = new Client({
      node: process.env.ES_URL,
      auth: { apiKey: process.env.ES_API_KEY },
    });
  }
  return client;
}

module.exports = { esClient };
