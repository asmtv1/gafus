import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("local tracing Compose binds ports to loopback and persists Tempo blocks", () => {
  const compose = fileURLToPath(new URL("./compose.yaml", import.meta.url));
  const rendered = execFileSync("docker", ["compose", "-f", compose, "config", "--format", "json"], {
    encoding: "utf8",
  });
  const { services, volumes } = JSON.parse(rendered);
  assert.deepEqual(Object.keys(services).sort(), ["grafana", "otel-collector", "tempo"]);
  for (const [serviceName, service] of Object.entries(services)) {
    assert.match(service.image, /:[0-9]/, `${serviceName} must pin image version`);
    for (const port of service.ports ?? []) {
      assert.equal(port.host_ip, "127.0.0.1", `${serviceName} port exposed outside localhost`);
    }
  }
  const tempoVolumes = services.tempo.volumes;
  assert(tempoVolumes.some((v) => v.target === "/var/tempo" && v.type === "volume"));
  assert(Object.keys(volumes).some((name) => name.includes("tempo-data")));
});
