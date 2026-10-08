import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RemoteEmbeddingAuthorizationManager,
  RemoteEmbeddingAuthorizationStore,
  planRemoteIndexAuthorization,
  planRemoteSearchAuthorization,
  withRemoteEmbeddingOperationPermit,
} from "../dist/authorization/index.js";
import { createEmbeddingModelForIdentity } from "../dist/engine/service/zvec-grep.js";

test("Google planning and service enforce consent, target binding and revocation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zg-google-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const signingKeyPath = join(root, "signing.key");
  const store = new RemoteEmbeddingAuthorizationStore({ signingKeyPath });
  const manager = new RemoteEmbeddingAuthorizationManager(store);
  const model = createEmbeddingModelForIdentity(
    { provider: "google", name: "gemini-embedding-2" },
    {
      apiKey: "fake",
      endpoint: "https://example.test/embed",
      authorizationSigningKeyPath: signingKeyPath,
    },
  );
  const info = { root, indexed: false };
  const plan = await planRemoteIndexAuthorization({
    info,
    model: model.info,
    store,
  });
  assert.equal(plan.target.provider, "google");
  assert.equal(plan.disclosure.workspaceContent, "full");
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches++;
    return Response.json({ embedding: { values: Array(3072).fill(0.1) } });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const embed = () => model.embed([{ kind: "text", text: "synthetic input" }]);
  await assert.rejects(embed, /authorization is required/i);
  assert.equal(fetches, 0);
  const once = await manager.grant(plan, "once");
  await withRemoteEmbeddingOperationPermit(once, embed);
  assert.equal(fetches, 1);
  const mismatched = {
    ...once,
    target: { ...once.target, endpoint: "https://other.test" },
  };
  await assert.rejects(
    withRemoteEmbeddingOperationPermit(mismatched, embed),
    /authorization is required/i,
  );
  const workspace = await manager.grant(plan, "workspace");
  await withRemoteEmbeddingOperationPermit(workspace, embed);
  await store.revoke(plan.target);
  await assert.rejects(
    withRemoteEmbeddingOperationPermit(workspace, embed),
    /authorization is required/i,
  );
  assert.equal(fetches, 2);
  const indexed = {
    root,
    indexed: true,
    workspaceIndex: {
      embedding: { provider: "google", model: "gemini-embedding-2" },
      rootPaths: [{ absolutePath: root }],
    },
    status: {
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesPending: 0,
      filesFailed: 0,
    },
  };
  const search = {
    queries: ["find"],
    routes: [],
    autoUpdate: false,
    freshness: "eventual",
  };
  const queryPlan = await planRemoteSearchAuthorization({
    info: indexed,
    model: model.info,
    search,
    store,
  });
  assert.equal(queryPlan.operation, "query");
  assert.equal(queryPlan.disclosure.workspaceContent, "none");
  assert.equal(
    await planRemoteSearchAuthorization({
      info: indexed,
      model: model.info,
      search: {
        ...search,
        queries: [],
        routes: [{ mode: "fts", query: "find" }],
      },
      store,
    }),
    undefined,
  );
});
