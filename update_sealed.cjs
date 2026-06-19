const fs = require('fs');
const path = require('path');
const https = require('https');

const dataPath = path.join(__dirname, 'r2_backup/data/pokedata-english-pokemon-products.json');
const imgDir = path.join(__dirname, 'r2_backup/sealed-products/pokedata/images');

if (!fs.existsSync(imgDir)) {
  fs.mkdirSync(imgDir, { recursive: true });
}

const imgUrl = 'https://pokemonproductimages.pokedata.io/Products/First+Partner+Illustration+Collection+%28Series+2%29.webp';
const imgDest = path.join(imgDir, '8881.webp');

https.get(imgUrl, (res) => {
  const fileStream = fs.createWriteStream(imgDest);
  res.pipe(fileStream);
  fileStream.on('finish', () => {
    fileStream.close();
    console.log('Downloaded image 8881.webp');
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Check if it already exists
    const exists = data.products.find(p => p.id === 8881);
    if (!exists) {
      data.products.push({
        id: 8881,
        name: "First Partner Illustration Collection (Series 2)",
        tcg: "Pokemon",
        language: "ENGLISH",
        type: "SPECIALPACK",
        release_date: "Fri, 19 Jun 2026 00:00:00 GMT",
        year: 2026,
        series: null,
        set_id: null,
        image: {
          r2_key: "sealed-products/pokedata/images/8881.webp",
          public_url: "https://pub-041bf18f03164be388647b4363f87908.r2.dev/sealed-products/pokedata/images/8881.webp"
        },
        set_name: null
      });
      data.count = data.products.length;
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      console.log('Added product to JSON');
    } else {
      console.log('Product already exists in JSON');
    }
  });
}).on('error', (err) => {
  console.error('Failed to download image:', err);
});
