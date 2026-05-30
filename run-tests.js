const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

// We configure JSDOM to run scripts so that our inline tests execute.
const dom = new JSDOM(htmlContent, {
    runScripts: "dangerously",
    url: "http://localhost/", // some features require a valid URL
    resources: "usable"
});

// Since the assertions write to the console, we can capture the output.
dom.window.console.assert = (condition, message) => {
    if (!condition) {
        console.error("Assertion failed:", message);
        process.exitCode = 1;
    }
};

dom.window.console.log = (message) => {
    if (message === 'utils.decodeHtml tests passed') {
        console.log(message);
    }
}

// Just wait a short moment for scripts to execute and DOM to fully load
setTimeout(() => {
    if (process.exitCode === 1) {
        console.error("Tests failed!");
    } else {
        console.log("All tests completed successfully.");
    }
}, 500);