import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline";

if (process.platform !== "win32" || process.arch !== "x64")
  throw Error(
    "此分享启动器仅适用于 Windows x64；其他系统请单独配置 HTTPS 主机。",
  );
const root = path.resolve(import.meta.dirname, "..");
const toolsDir = path.join(root, ".tools");
const runtimeDir = path.join(root, ".runtime");
await mkdir(toolsDir, { recursive: true });
await mkdir(runtimeDir, { recursive: true });
const executable = path.join(toolsDir, "cloudflared.exe");
const expected =
  "f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2";
let binary;
try {
  binary = await readFile(executable);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.log("下载官方临时分享工具…");
  const response = await fetch(
    "https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-windows-amd64.exe",
  );
  if (!response.ok) throw Error(`下载失败：HTTP ${response.status}`);
  binary = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(binary).digest("hex") !== expected)
    throw Error("分享工具校验失败，未写入或执行。");
  await writeFile(executable, binary);
}
if (createHash("sha256").update(binary).digest("hex") !== expected)
  throw Error("分享工具校验失败，拒绝执行。");

const port = Number(process.env.PORT || 3174);
const service = spawn(process.execPath, ["src/server.mjs"], {
  cwd: root,
  windowsHide: true,
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let tunnel,
  stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  tunnel?.kill();
  service.kill();
  process.exitCode = code;
}
service.stderr.on("data", (data) => process.stderr.write(data));
service.on("error", (error) => {
  console.error(error.message);
  stop(1);
});
service.on("exit", (code) => {
  if (!stopping) {
    console.error(`游戏服务已停止 (${code})，分享同时关闭。`);
    stop(code || 1);
  }
});
createInterface({ input: service.stdout }).on("line", (line) => {
  console.log(line);
  if (tunnel || !line.includes("最后一班已启动")) return;
  tunnel = spawn(
    executable,
    [
      "tunnel",
      "--url",
      `http://127.0.0.1:${port}`,
      "--no-autoupdate",
      "--protocol",
      "http2",
    ],
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let buffer = "",
    published = false;
  const output = (data) => {
    process.stdout.write(data);
    buffer = (buffer + data.toString()).slice(-12000);
    const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (url && !published) {
      published = true;
      writeFile(
        path.join(runtimeDir, "share.json"),
        JSON.stringify(
          { url, port, pid: process.pid, createdAt: new Date().toISOString() },
          null,
          2,
        ),
      ).catch((error) => {
        console.error(error.message);
        stop(1);
      });
      console.log(
        `\n分享地址：${url}\n保持此程序和电脑运行；关闭后地址与房间失效。\n`,
      );
    }
  };
  tunnel.stdout.on("data", output);
  tunnel.stderr.on("data", output);
  tunnel.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  tunnel.on("exit", (code) => {
    if (!stopping) {
      console.error(`分享连接已停止 (${code})。`);
      stop(code || 1);
    }
  });
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
