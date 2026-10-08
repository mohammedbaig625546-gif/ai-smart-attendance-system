/**
 * Vercel Serverless Function Entrypoint
 * Bridges incoming Vercel serverless HTTP requests to the Express application.
 */

const { app } = require('../server/index');

module.exports = app;
