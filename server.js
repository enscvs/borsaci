/*
========================================================
APP JS
========================================================
*/

if (
  req.method === "GET" &&
  pathname === "/app.js"
) {

  const filePath =
    path.join(
      __dirname,
      "public",
      "app.js"
    );


  return serveFile(
    res,
    filePath,
    "application/javascript; charset=utf-8"
  );

}


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
