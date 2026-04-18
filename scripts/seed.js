import { faker } from '@faker-js/faker';

const ELASTIC_URL = 'http://localhost:9200/products/_bulk';
const TOTAL_RECORDS = 50000;
const BATCH_SIZE = 5000;

const categories = ['drink', 'food', 'snack', 'dessert'];

function generateProduct(id) {
  return {
    name: faker.commerce.productName(),
    category: faker.helpers.arrayElement(categories),
    // random price between 15000 and 150000, rounded to nearest 1000
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

async function run() {
  console.log(`Starting bulk import of ${TOTAL_RECORDS} records to ${ELASTIC_URL}...`);
  console.log(`Batches of ${BATCH_SIZE} will be used to optimize memory and network.\n`);

  for (let i = 0; i < TOTAL_RECORDS; i += BATCH_SIZE) {
    const batch = [];
    const currentBatchSize = Math.min(BATCH_SIZE, TOTAL_RECORDS - i);

    for (let j = 0; j < currentBatchSize; j++) {
      // Create ID starting from 11 (assuming 1-10 are already there from products.ndjson)
      // or we can just let ES generate IDs by omitting _id, but to follow the data format, we'll assign one.
      const id = i + j + 11; 
      
      // Bulk API requires two lines per document: action and data
      batch.push(JSON.stringify({ index: { _index: 'products', _id: String(id) } }));
      batch.push(JSON.stringify(generateProduct(id)));
    }

    // Join with newline and add a trailing newline (required by ES Bulk API)
    const payload = batch.join('\n') + '\n';

    try {
      const response = await fetch(ELASTIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-ndjson'
        },
        body: payload
      });
      
      const body = await response.json();
      if (body.errors) {
        console.error('Batch had errors:', body.items.filter(item => item.index && item.index.error));
      } else {
        console.log(`Successfully imported batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1} to ${i + currentBatchSize})`);
      }
    } catch (e) {
      console.error('Network or fetch error during batch insertion:', e.message);
      console.error('Ensure Elasticsearch is running and accessible at localhost:9200');
      break;
    }
  }

  console.log('\nSeed script complete!');
}

run();
