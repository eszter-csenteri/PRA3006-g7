//test
async function runSparqlQuery() {
  const endpoint = 'https://query.wikidata.org/sparql'; // Example: Wikidata
  const sparqlQuery = `
    SELECT ?item ?itemLabel WHERE {
      ?item wdt:P31 wd:Q146 .  # Instance of: domestic cat
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 10
  `;

  const url = new URL(endpoint);
  url.searchParams.append('query', sparqlQuery);
  url.searchParams.append('format', 'json');

  const headers = {
    'Accept': 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const data = await response.json();
    console.log('SPARQL Results:', data);

    // Process results
    data.results.bindings.forEach(binding => {
      console.log(binding.itemLabel.value);
    });

  } catch (error) {
    console.error('Error executing SPARQL query:', error);
  }
}

// Run the query
runSparqlQuery();