const fs = require('fs');

const mdContent = fs.readFileSync('set_id_mappings.md', 'utf8');
const mapping = {};

// Regex to extract the Pokedata Set ID and the matched set name
const regex = /## Pokedata Set ID: (\d+)\n\*\*Matched Set:\*\* (.*?)(?: \(sets\.json ID: \d+\))?\n/g;
let match;

while ((match = regex.exec(mdContent)) !== null) {
    const pokedataSetId = parseInt(match[1], 10);
    const setName = match[2].trim();
    if (setName !== 'UNKNOWN') {
        mapping[pokedataSetId] = setName;
    }
}

console.log(`Loaded ${Object.keys(mapping).length} mappings from markdown.`);

const productsFilePath = 'r2_backup/data/pokedata-english-pokemon-products.json';
const productsData = JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));

let updatedCount = 0;

for (const product of productsData.products) {
    if (product.set_id !== null && mapping[product.set_id]) {
        product.set_name = mapping[product.set_id];
        updatedCount++;
    } else {
        product.set_name = null;
    }
}

// Write the updated JSON back to the file
fs.writeFileSync(productsFilePath, JSON.stringify(productsData, null, 2));

console.log(`Updated ${updatedCount} products with a set_name.`);
