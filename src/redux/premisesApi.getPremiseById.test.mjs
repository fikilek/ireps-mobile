import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiSource = await readFile(
  new URL("./premisesApi.js", import.meta.url),
  "utf8",
);

function endpointSource(name, nextName) {
  const start = apiSource.indexOf(`${name}: builder.`);
  const end = apiSource.indexOf(`${nextName}: builder.`, start);
  assert.notEqual(start, -1, `Missing endpoint ${name}`);
  assert.notEqual(end, -1, `Missing endpoint boundary ${nextName}`);
  return apiSource.slice(start, end);
}

test("resolves a Premise through an explicit server read", () => {
  const endpoint = endpointSource("getPremiseById", "addPremise");

  assert.match(apiSource, /\bgetDocFromServer\b/);
  assert.match(
    endpoint,
    /getDocFromServer\(\s*doc\(db, "premises", premiseId\),\s*\)/,
  );
  assert.doesNotMatch(endpoint, /\bgetDoc\(/);
  assert.doesNotMatch(endpoint, /onSnapshot\(/);
});

test("returns found with authoritative Firestore identity", () => {
  const endpoint = endpointSource("getPremiseById", "addPremise");

  assert.match(
    endpoint,
    /status: "found",\s*premise: \{\s*\.\.\.snapshot\.data\(\),\s*id: snapshot\.id,/,
  );
});

test("classifies only a successful non-existent snapshot as missing", () => {
  const endpoint = endpointSource("getPremiseById", "addPremise");
  const missingIndex = endpoint.indexOf('status: "missing"');
  const existenceIndex = endpoint.indexOf("if (!snapshot.exists())");
  const catchIndex = endpoint.indexOf("} catch (error) {");
  const errorIndex = endpoint.indexOf("error: {", catchIndex);

  assert.ok(existenceIndex >= 0 && existenceIndex < missingIndex);
  assert.ok(catchIndex > missingIndex);
  assert.ok(errorIndex > catchIndex);
  assert.equal(endpoint.slice(catchIndex).includes('status: "missing"'), false);
});

test("enforces resolver freshness and exports explicit refetch-capable hook", () => {
  const endpoint = endpointSource("getPremiseById", "addPremise");

  assert.match(endpoint, /keepUnusedDataFor: 0/);
  assert.match(apiSource, /useGetPremiseByIdQuery/);
});

test("ward operational stream makes Firestore document identity authoritative", () => {
  const wardEndpoint = endpointSource(
    "getPremisesByLmPcodeWardPcode",
    "getPremiseById",
  );

  assert.match(
    wardEndpoint,
    /snapshot\.docs\.map\(\(snap\) => \(\{\s*\.\.\.snap\.data\(\),\s*id: snap\.id,/,
  );
  assert.match(
    wardEndpoint,
    /const premise = \{\s*\.\.\.change\.doc\.data\(\),\s*id: change\.doc\.id,/,
  );
});
