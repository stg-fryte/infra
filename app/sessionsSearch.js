// Server-side search over the `sessions` alias in Elasticsearch.
// The client talks to aliases only; the index behind the alias (sessions_v1)
// can be reindexed without touching this code.
const { esClient } = require('./esClient');

const ALIAS = 'sessions';

class SearchUnavailable extends Error {
  constructor(message = 'search unavailable') {
    super(message);
    this.name = 'SearchUnavailable';
    this.unavailable = true;
  }
}

// The 9.x client returns the body at the top level; 8.x wrapped it in .body.
const bodyOf = (res) => (res && res.body ? res.body : res);

function toUnavailable(error) {
  const detail = JSON.stringify((error && error.meta && error.meta.body) || {});
  if (/index_not_found|alias_not_found|no such index|unauthorized/i.test(`${error && error.message} ${detail}`)) {
    return new SearchUnavailable(`${error.message} ${detail}`);
  }
  return null;
}

async function searchSessions({ q = '', day, track, level, from = 0, size = 50 } = {}) {
  const client = esClient();
  if (!client) throw new SearchUnavailable('Elasticsearch is not configured');
  const must = q
    ? [
        {
          multi_match: {
            query: q,
            fields: ['title^3', 'speakers^2', 'room', 'venue', 'notes'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        },
      ]
    : [{ match_all: {} }];
  const filter = [];
  if (day) filter.push({ term: { day } });
  if (track) filter.push({ term: { track } });
  if (level) filter.push({ term: { level } });
  const request = {
    index: ALIAS,
    from,
    size,
    query: { bool: { must, filter } },
    aggs: { tracks: { terms: { field: 'track', size: 50 } } },
  };
  if (q) {
    request.highlight = {
      fields: {
        title: { number_of_fragments: 1 },
        notes: { number_of_fragments: 1 },
      },
    };
  }
  let res;
  try {
    res = bodyOf(await client.search(request));
  } catch (error) {
    const unavailable = toUnavailable(error);
    if (unavailable) throw unavailable;
    throw error;
  }
  const first = (fragments) => (fragments && fragments.length ? fragments[0] : null);
  return {
    total: res.hits.total.value,
    results: res.hits.hits.map((hit) => ({
      id: String(hit._source.id),
      score: hit._score,
      title: first(hit.highlight && hit.highlight.title),
      notes: first(hit.highlight && hit.highlight.notes),
    })),
    facets: {
      track: Object.fromEntries((res.aggregations.tracks.buckets || []).map((b) => [b.key, b.doc_count])),
    },
  };
}

async function suggestTitles(prefix) {
  const client = esClient();
  if (!client) throw new SearchUnavailable('Elasticsearch is not configured');
  let res;
  try {
    res = bodyOf(
      await client.search({
        index: ALIAS,
        suggest: {
          titles: {
            prefix,
            completion: { field: 'title_suggest', size: 8, skip_duplicates: true },
          },
        },
      }),
    );
  } catch (error) {
    const unavailable = toUnavailable(error);
    if (unavailable) throw unavailable;
    throw error;
  }
  return (res.suggest.titles || []).flatMap((group) => (group.options || []).map((option) => option.text));
}

module.exports = { searchSessions, suggestTitles, SearchUnavailable, ALIAS };
