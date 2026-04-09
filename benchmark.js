import { faker } from '@faker-js/faker';

const TOTAL_RECORDS = 50000;
const categories = ['drink', 'food', 'snack', 'dessert'];

function generateProduct(id) {
  return {
    name: faker.commerce.productName(),
    category: faker.helpers.arrayElement(categories),
    price: faker.number.int({ min: 15, max: 150 }) * 1000,
    stock: faker.number.int({ min: 0, max: 200 }),
    rating: faker.number.float({ min: 3, max: 5, fractionDigits: 1 }),
    tags: Array.from(
      { length: faker.number.int({ min: 1, max: 4 }) }, 
      () => faker.commerce.productAdjective().toLowerCase()
    ),
    created_at: faker.date.recent({ days: 30 }).toISOString()
  };
}

async function runBenchmark() {
  console.log(`Generating ${TOTAL_RECORDS.toLocaleString()} mock products in memory...`);
  const products = [];
  for (let i = 0; i < TOTAL_RECORDS; i++) {
    products.push(generateProduct(i + 1));
  }
  console.log('Data generation complete.\n');

  const keyword = 'coffee';

  // Benchmark Native JS Array Filter
  console.log(`Starting Native Array Search for keyword: "${keyword}"...`);
  const t0Native = performance.now();
  
  const nativeResults = products.filter(p => {
    const keywordLower = keyword.toLowerCase();
    const inName = p.name.toLowerCase().includes(keywordLower);
    const inCategory = p.category.toLowerCase().includes(keywordLower);
    const inTags = p.tags.some(tag => tag.toLowerCase().includes(keywordLower));
    
    return inName || inCategory || inTags;
  });

  const t1Native = performance.now();
  const nativeTimeMs = t1Native - t0Native;
  console.log(`Native Array Search found ${nativeResults.length} results.`);

  // Benchmark Elasticsearch
  console.log(`\nStarting Elasticsearch Query for keyword: "${keyword}"...`);
  const esUrl = 'http://localhost:9200/products/_search';
  const esQuery = {
    size: 7,
    query: {
      bool: {
        should: [
          { match_phrase_prefix: { name: { query: keyword, boost: 4 } } },
          { match: { tags: { query: keyword, boost: 1.5 } } },
          { match: { category: { query: keyword, boost: 0.5 } } }
        ],
        minimum_should_match: 1
      }
    }
  };

  let esTimeMs = 0;
  let esResultsCount = 0;

  try {
    const t0Es = performance.now();
    
    const response = await fetch(esUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(esQuery)
    });
    
    const data = await response.json();
    const t1Es = performance.now();
    esTimeMs = t1Es - t0Es;
    
    // Elastic returns hits.hits and hits.total
    esResultsCount = data.hits?.total?.value || data.hits?.hits?.length || 0;
    console.log(`Elasticsearch Query found ${esResultsCount} results (total value returned).`);
  } catch (err) {
    console.error('Error querying Elasticsearch:', err.message);
  }

  // Output Comparison
  console.log('\n========================================');
  console.log('             BENCHMARK RESULTS          ');
  console.log('========================================');
  console.log(`Native JS Array Filter : ${(nativeTimeMs).toFixed(2).padStart(8, ' ')} ms`);
  console.log(`Elasticsearch Query    : ${(esTimeMs).toFixed(2).padStart(8, ' ')} ms`);
  console.log('========================================');
}

runBenchmark();
