/*
========================================================
APP JS
========================================================
*/

require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");

const OpenAI = require("openai");

const {
  Client,
} = require("@modelcontextprotocol/sdk/client/index.js");

/*
========================================================
CHART JS
========================================================
*/

if (
  req.method === "GET" &&
  pathname === "/chart.js"
) {

  const filePath =
    path.join(
      __dirname,
      "public",
      "chart.js"
    );


  return serveFile(
    res,
    filePath,
    "application/javascript; charset=utf-8"
  );

}


/*
========================================================
404
========================================================
*/
