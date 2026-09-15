const serverless = require('serverless-http');
const app = require('../../server');

// Wrap Express app as a Netlify serverless function
module.exports.handler = serverless(app);
