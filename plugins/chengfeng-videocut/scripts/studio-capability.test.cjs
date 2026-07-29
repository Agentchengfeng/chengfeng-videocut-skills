"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const {
  inspectManifest,
  inspectStudio,
  resolveStudioUrl,
} = require("./ensure-studio.cjs");

async function withServer(routes, test) {
  const server = http.createServer((request, response) => {
    const route = routes[request.url];
    if (!route) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
      return;
    }
    response.writeHead(route.status || 200, { "content-type": route.type || "text/plain" });
    response.end(route.body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await test(origin);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function run() {
  const rewritten = resolveStudioUrl(
    "http://127.0.0.1:5190/#project/example?v=1",
    "http://127.0.0.1:5400",
    "koubo",
  );
  assert.equal(rewritten.origin, "http://127.0.0.1:5400");
  assert.equal(rewritten.searchParams.get("view"), "koubo");
  assert.equal(rewritten.hash, "#project/example?v=1");
  assert.equal(resolveStudioUrl("http://localhost:5190/", null, "koubo").hostname, "localhost");
  assert.equal(resolveStudioUrl("http://[::1]:5190/", null, "koubo").hostname, "[::1]");
  assert.throws(() => resolveStudioUrl("https://example.com/", null, "koubo"), /loopback/);
  assert.throws(() => resolveStudioUrl("http://user:pass@127.0.0.1:5190/", null, "koubo"), /凭据/);
  assert.throws(() => resolveStudioUrl("http://127.0.0.1:5190/legacy", null, "koubo"), /根路径/);
  assert.equal(inspectManifest({ product: "chengfeng-videocut", features: { topLevelViews: ["koubo"] } }, "koubo"), null);
  assert.equal(inspectManifest({
    schemaVersion: 1,
    product: "chengfeng-videocut",
    studioVersion: "0.2.1",
    features: {
      topLevelViews: ["storyboard", "preview", "koubo"],
      legacyWorkbenchPanel: false,
      managedTimelineEditing: true,
      managedTimelineOperations: ["move", "trim", "split", "delete"],
    },
    studio: { legacyWorkbenchPanel: true },
  }, "koubo").ok, false);
  const unmanaged = inspectManifest({
    schemaVersion: 1,
    product: "chengfeng-videocut",
    studioVersion: "0.2.1",
    features: {
      topLevelViews: ["storyboard", "preview", "koubo"],
      legacyWorkbenchPanel: false,
    },
  }, "koubo");
  assert.equal(unmanaged.ok, false);
  assert.equal(unmanaged.reason, "managed_timeline_editing_missing");
  const missingOperations = inspectManifest({
    schemaVersion: 1,
    product: "chengfeng-videocut",
    studioVersion: "0.2.1",
    features: {
      topLevelViews: ["storyboard", "preview", "koubo"],
      legacyWorkbenchPanel: false,
      managedTimelineEditing: true,
    },
  }, "koubo");
  assert.equal(missingOperations.ok, false);
  assert.equal(missingOperations.reason, "managed_timeline_operations_missing");
  const incompleteViews = inspectManifest({
    schemaVersion: 1,
    product: "chengfeng-videocut",
    studioVersion: "0.2.1",
    features: {
      topLevelViews: ["koubo"],
      legacyWorkbenchPanel: false,
      managedTimelineEditing: true,
      managedTimelineOperations: ["move", "trim", "split", "delete"],
    },
  }, "koubo");
  assert.equal(incompleteViews.ok, false);
  assert.equal(incompleteViews.reason, "required_view_set_missing");

  await withServer({
    "/": { type: "text/html", body: '<script type="module" src="/assets/app.js"></script>' },
    "/assets/app.js": { type: "text/javascript", body: 'const view="koubo"; const old="WorkbenchTaskPanel";' },
  }, async (origin) => {
    const strict = await inspectStudio(origin, "koubo");
    assert.equal(strict.ok, false);
    assert.equal(strict.reason, "capability_manifest_missing");
    const result = await inspectStudio(origin, "koubo", { allowBundleMarker: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "top_level_koubo_view_missing");
  });

  await withServer({
    "/": { type: "text/html", body: '<script type="module" src="/assets/app.js"></script>' },
    "/assets/app.js": {
      type: "text/javascript",
      body: '"data-studio-extension-view";"data-koubo-cut-timeline";"data-managed-timeline-editing";const view="koubo";',
    },
  }, async (origin) => {
    const result = await inspectStudio(origin, "koubo", { allowBundleMarker: true });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "bundle-marker");
    const storyboard = await inspectStudio(origin, "storyboard", { allowBundleMarker: true });
    assert.equal(storyboard.ok, false, "koubo-only markers must not claim other top-level views");
  });

  await withServer({
    "/": { type: "text/html", body: "<main>studio</main>" },
    "/chengfeng-videocut-capabilities.json": {
      type: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        product: "chengfeng-videocut",
        studioVersion: "0.2.1",
        features: {
          topLevelViews: ["storyboard", "preview", "koubo"],
          legacyWorkbenchPanel: false,
          managedTimelineEditing: true,
          managedTimelineOperations: ["move", "trim", "split", "delete"],
        },
      }),
    },
  }, async (origin) => {
    const result = await inspectStudio(origin, "koubo");
    assert.equal(result.ok, true);
    assert.equal(result.mode, "manifest");
    assert.equal(result.studioVersion, "0.2.1");
    assert.equal(result.managedTimelineEditing, true);
  });

  await withServer({
    "/chengfeng-videocut-capabilities.json": {
      type: "application/json",
      body: JSON.stringify({
        product: "chengfeng-videocut",
        features: { topLevelViews: ["koubo"], legacyWorkbenchPanel: false },
      }),
    },
  }, async (origin) => {
    const result = await inspectStudio(origin, "koubo");
    assert.equal(result.ok, false, "the exact Studio page must exist before trusting its origin manifest");
    assert.equal(result.reason, "studio_http_404");
  });

  console.log(JSON.stringify({
    oldStudioBlocked: true,
    unmanagedTimelineBlocked: true,
    missingTimelineOperationsBlocked: true,
    incompleteViewSetBlocked: true,
    newStudioAccepted: true,
    manifestAccepted: true,
    exactPageChecked: true,
  }));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
