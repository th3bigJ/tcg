const fs = require('fs');

const data = JSON.parse(fs.readFileSync('knip-report.json', 'utf8'));

let count = 0;
if (data.issues && Array.isArray(data.issues)) {
  for (const issue of data.issues) {
    if (issue.files && Array.isArray(issue.files)) {
      for (const fileObj of issue.files) {
        if (fileObj.name && fs.existsSync(fileObj.name) && !fileObj.name.includes('delete-unused-files.cjs')) {
          console.log(`Deleting ${fileObj.name}...`);
          fs.unlinkSync(fileObj.name);
          count++;
        }
      }
    }
  }
}
console.log(`Deleted ${count} unused files.`);
