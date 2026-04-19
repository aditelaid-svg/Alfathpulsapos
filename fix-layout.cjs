const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Soften padding for mobile
content = content.replace(/p-8/g, 'p-4 sm:p-8');
content = content.replace(/p-6/g, 'p-4 sm:p-6');
content = content.replace(/p-5/g, 'p-3 sm:p-5');

// For grids, make sure they stack on mobile if they are main UI cards
content = content.replace(/grid-cols-2 gap-8/g, 'grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8');
content = content.replace(/grid-cols-2 gap-4/g, 'grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4');
content = content.replace(/grid-cols-5 gap-3/g, 'grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3');
content = content.replace(/grid-cols-4 gap-4/g, 'grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4');

// Fix forms that might look weird stacked
// Actually, stacking them on mobile makes more space for numbers!

fs.writeFileSync('src/App.tsx', content);
